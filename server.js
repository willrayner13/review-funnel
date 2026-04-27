require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const { Store } = require("express-session");
const twilio = require("twilio");
const OpenAI = require("openai");
const Stripe = require("stripe");
const rateLimit = require("express-rate-limit");

const smsLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

let stripe;
if (process.env.STRIPE_SECRET) {
  stripe = new Stripe(process.env.STRIPE_SECRET);
} else {
  console.log("Stripe key missing - skipping Stripe init");
}

const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function isTrialActive(business) {
  if (!business.trial_ends_at) return false;
  return new Date() < new Date(business.trial_ends_at);
}

// Pro access: subscription must be active AND on pro plan
function hasProAccess(business) {
  return business.subscription_active && (business.plan_type === "pro");
}

// Normalise UK phone numbers — handles 07..., 7..., +44..., 00...
function normalisePhone(phone) {
  const digits = phone.replace(/[\s\-\(\)]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("07") && digits.length === 11) return "+44" + digits.slice(1);
  if (digits.startsWith("7") && digits.length === 10) return "+44" + digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  return digits;
}

// ─── STRIPE WEBHOOK — must come before bodyParser.json() ──────────────────────
// ─── STRIPE WEBHOOK — must come before bodyParser.json() ──────────────────────
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log("Webhook error:", err.message);
    return res.status(400).send("Webhook error");
  }
 
if (event.type === "checkout.session.completed") {
    const sess = event.data.object;
    const slug = sess.metadata.slug;
    const plan = sess.metadata.plan;
    const customer = sess.customer;

    try {
      const mrr = plan === "pro" ? 24.99 : 9.99;
      await supabase
        .from("businesses")
        .update({ subscription_active: true, plan_type: plan, stripe_customer: customer, subscribed_at: new Date().toISOString(), mrr })
        .eq("slug", slug);
      console.log(`Checkout complete for ${slug}, plan: ${plan}`);

      // ✅ Now log the referral conversion (moved inside try, after the update)
      const { data: biz } = await supabase.from("businesses").select("referred_by").eq("slug", slug).single();
      if (biz && biz.referred_by) {
        await supabase.from("referral_conversions").insert({
          referral_code: biz.referred_by,
          business_slug: slug,
          plan: plan,
          converted_at: new Date().toISOString()
        });
      }
    } catch (err) {
      console.log("Supabase update error:", err.message);
    }
  }
 
  if (event.type === "customer.subscription.trial_will_end") {
    console.log(`Trial ending soon: ${event.data.object.customer}`);
  }
 
  if (event.type === "customer.subscription.deleted") {
    const customer = event.data.object.customer;
    await supabase
      .from("businesses")
      .update({ subscription_active: false, plan_type: "starter", cancelled_at: new Date().toISOString(), mrr: 0 })
      .eq("stripe_customer", customer);
    console.log(`Subscription deleted: ${customer}`);
  }
 
  if (event.type === "invoice.payment_failed") {
    const customer = event.data.object.customer;
    await supabase
      .from("businesses")
      .update({ subscription_active: false })
      .eq("stripe_customer", customer);
    console.log(`Payment failed: ${customer}`);
  }
 
  res.json({ received: true });
});
 

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────

// Trust Vercel's reverse proxy so secure cookies work correctly on HTTPS
app.set("trust proxy", 1);

app.use(cors());
app.use(bodyParser.json());
// index:false prevents express.static auto-serving index.html at /
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// ─── SUPABASE SESSION STORE ───────────────────────────────────────────────────
// express-session's default MemoryStore is wiped on every Vercel cold start.
// This custom store persists sessions in a Supabase `sessions` table so they
// survive across serverless instances and restarts.
// Run this SQL once in Supabase: 
//   CREATE TABLE IF NOT EXISTS sessions (
//     sid TEXT PRIMARY KEY,
//     sess JSONB NOT NULL,
//     expire TIMESTAMPTZ NOT NULL
//   );
//   CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions (expire);
class SupabaseSessionStore extends Store {
  async get(sid, cb) {
    try {
      const { data } = await supabase
        .from("sessions")
        .select("sess, expire")
        .eq("sid", sid)
        .single();
      if (!data) return cb(null, null);
      if (new Date(data.expire) < new Date()) {
        await supabase.from("sessions").delete().eq("sid", sid);
        return cb(null, null);
      }
      cb(null, data.sess);
    } catch (e) { cb(null, null); }
  }
  async set(sid, sess, cb) {
    try {
      const expire = sess.cookie?.expires
        ? new Date(sess.cookie.expires)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await supabase.from("sessions").upsert({ sid, sess, expire: expire.toISOString() });
      cb(null);
    } catch (e) { cb(null); }
  }
  async destroy(sid, cb) {
    try {
      await supabase.from("sessions").delete().eq("sid", sid);
      cb(null);
    } catch (e) { cb(null); }
  }
}

app.use(
  session({
    store: new SupabaseSessionStore(),
    secret: process.env.SESSION_SECRET || "supersecretkey-change-this",
    resave: false,
    saveUninitialized: false,
    name: "rl_sid",
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// ─── HTML ROUTES ──────────────────────────────────────────────────────────────
const htmlPages = ["admin", "login", "for-business", "lapsed", "success", "cancel", "thanks", "bad", "landing", "demo", "billing", "settings", "about", "contact", "blog", "partner"];
htmlPages.forEach((page) => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.resolve("public", `${page}.html`));
  });
});

app.get("/", (req, res) => res.sendFile(path.resolve("public", "landing.html")));
app.get("/demo/:slug", (req, res) => res.sendFile(path.resolve("public", "demo.html")));

// ─── DYNAMIC BLOG POST ROUTE ─────────────────────────────────────────────────
app.get('/blog/:slug', (req, res) => {
  const slug = req.params.slug;
  // Prevent directory traversal attacks
  if (slug.includes('..') || slug.includes('/')) {
    return res.status(400).send('Invalid slug');
  }
  const filePath = path.join(__dirname, 'public', `${slug}.html`);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).send('Post not found');
  });
});

// ─── PUBLIC: subscription status ──────────────────────────────────────────────
app.get("/subscription-status/:slug", async (req, res) => {
  const { data, error } = await supabase
    .from("businesses")
    .select("name, subscription_active, plan_type, trial_ends_at, review_link, stripe_customer")
    .eq("slug", req.params.slug)
    .single();
  if (error || !data) return res.status(404).json({ error: "Not found" });

  // Check if subscription has cancel_at_period_end set on Stripe
  let cancel_pending = false;
  if (stripe && data.stripe_customer && data.subscription_active) {
    try {
      const [activeSubs, trialSubs] = await Promise.all([
        stripe.subscriptions.list({ customer: data.stripe_customer, status: "active", limit: 1 }),
        stripe.subscriptions.list({ customer: data.stripe_customer, status: "trialing", limit: 1 }),
      ]);
      const sub = activeSubs.data[0] || trialSubs.data[0];
      if (sub && sub.cancel_at_period_end) cancel_pending = true;
    } catch(e) {
      // Non-fatal — just don't set cancel_pending
    }
  }

  res.json({
    subscription_active: data.subscription_active,
    plan_type: data.plan_type,
    trial_ends_at: data.trial_ends_at,
    cancel_pending,
  });
});

// ─── SESSION RESTORE after Stripe redirect ────────────────────────────────────
app.post("/restore-session/:slug", async (req, res) => {
  const { slug } = req.params;
  const { data, error } = await supabase
    .from("businesses")
    .select("slug, subscription_active")
    .eq("slug", slug)
    .single();
  if (error || !data) return res.status(404).json({ error: "Not found" });
  if (data.subscription_active) {
    req.session.slug = slug;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "Session save failed" });
      res.json({ success: true });
    });
  } else {
    res.json({ success: false, reason: "Not yet active" });
  }
});

// ─── BUSINESS FUNNEL PAGE ─────────────────────────────────────────────────────
app.get("/r/:business", async (req, res) => {
  const slug = req.params.business;
  const { data, error } = await supabase.from("businesses").select("*").eq("slug", slug).single();
  if (error || !data) return res.status(404).send("Business not found");

  await supabase.from("events").insert({ business_slug: slug, event_type: "visit" });

  const pagePath = path.join(__dirname, "public", "index.html");
  const page = fs.readFileSync(pagePath, "utf8");
  const isLapsed = !data.subscription_active;

  res.send(`
    <html>
      <script>
        window.businessName   = "${data.name.replace(/"/g, '\\"')}";
        window.slug           = "${slug}";
        window.reviewLink     = "${(data.review_link || "").replace(/"/g, '\\"')}";
        window.accountLapsed  = ${isLapsed};
      </script>
      ${page}
    </html>
  `);
});

// ─── EVENTS ───────────────────────────────────────────────────────────────────
app.post("/positive", async (req, res) => {
  const { slug } = req.body;
  const { error } = await supabase.from("events").insert({ business_slug: slug, event_type: "positive" });
  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

app.post("/rating", async (req, res) => {
  const { slug, rating } = req.body;
  const { error } = await supabase.from("events").insert({ business_slug: slug, event_type: "rating", rating });
  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

app.post("/review-click", async (req, res) => {
  const { slug } = req.body;
  const { error } = await supabase.from("events").insert({ business_slug: slug, event_type: "review_click" });
  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

app.post("/feedback", async (req, res) => {
  const { business, message } = req.body;
  const { error } = await supabase.from("events").insert({ business_slug: business, event_type: "negative", message });
  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

// ─── STATS ────────────────────────────────────────────────────────────────────
app.get("/stats/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });

  const { data: businessData } = await supabase
    .from("businesses")
    .select("name, subscription_active, plan_type, trial_ends_at, review_link")
    .eq("slug", req.params.slug)
    .single();
  if (!businessData) return res.status(404).json({ error: "Business not found" });

  const { data } = await supabase
    .from("events")
    .select("event_type, rating, message")
    .eq("business_slug", req.params.slug);

  const stats = {
    visits: 0, positive: 0, negative: 0, reviews: 0,
    rating_avg: 0, rating_count: 0, rating_distribution: {}, feedback: [],
    subscription_active: businessData.subscription_active,
    plan_type: businessData.plan_type,
    trial_ends_at: businessData.trial_ends_at,
    business_name: businessData.name,
    review_link: businessData.review_link,
    account_lapsed: !businessData.subscription_active,
  };

  let ratingTotal = 0;
  const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  (data || []).forEach((e) => {
    if (e.event_type === "visit") stats.visits++;
    if (e.event_type === "positive") stats.positive++;
    if (e.event_type === "negative") stats.negative++;
    if (e.event_type === "review_click") stats.reviews++;
    if (e.event_type === "rating" && e.rating) {
      ratingTotal += e.rating;
      stats.rating_count++;
      ratingDist[e.rating] = (ratingDist[e.rating] || 0) + 1;
    }
    if (e.event_type === "negative" && e.message) stats.feedback.push(e.message);
  });

  stats.rating_avg = stats.rating_count ? (ratingTotal / stats.rating_count).toFixed(2) : 0;
  stats.rating_distribution = ratingDist;
  stats.conversion_rate = stats.visits ? ((stats.positive / stats.visits) * 100).toFixed(1) : 0;
  stats.negative_rate = stats.visits ? ((stats.negative / stats.visits) * 100).toFixed(1) : 0;
  res.json(stats);
});

// ─── CREATE BUSINESS ──────────────────────────────────────────────────────────
app.post("/create-business", async (req, res) => {
  try {
    const { name, email, review, password } = req.body;
    const { referral } = req.body; 
    if (!password) return res.status(400).json({ error: "Password is required." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
 
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.floor(Math.random() * 10000);
    const hashedPassword = await bcrypt.hash(password, 10);
  
 
    const { data: existing } = await supabase.from("businesses").select("email").eq("email", email).maybeSingle();
    if (existing) return res.status(400).json({ error: "Email already exists" });
 
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
 
  const { error } = await supabase.from("businesses").insert({
  name,
  email,
  review_link: review,
  slug,
  password: hashedPassword,
  plan_type: "starter",
  subscription_active: false,
  trial_ends_at: trialEnd.toISOString(),
  referred_by: referral || null,   // ✅ ADD THIS
});
 
    if (error) {
      console.error("Supabase insert error /create-business:", JSON.stringify(error));
      if (error.code === "42501" || (error.message && error.message.includes("row-level"))) {
        return res.status(500).json({ error: "Database permission error. Please contact support." });
      }
      return res.status(500).json({ error: error.message || "Could not create account. Please try again." });
    }

    // ✅ FIX: Wait for session to save before responding
    req.session.slug = slug;
    req.session.save(async (err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Session save failed. Please try again." });
      }

      // Send welcome email (non‑blocking—don't await it)
      try {
        const funnelUrl = `${process.env.BASE_URL}/r/${slug}`;
        const dashboardUrl = `${process.env.BASE_URL}/for-business`;
        await resend.emails.send({
          from: `ReviewLift <reviews@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
          to: email,
          subject: `Welcome to ReviewLift, ${name}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
            <body style="margin:0;padding:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:32px 16px;">
                <tr><td align="center">
                  <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:540px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
                    <tr><td style="background:#1E1E1C;padding:22px 32px;">
                      <p style="margin:0;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;color:#EAE7DC;">⭐ ReviewLift</p>
                    </td></tr>
                    <tr><td style="padding:36px 32px 28px;">
                      <h2 style="margin:0 0 14px;font-size:21px;color:#1E1E1C;font-family:Arial,sans-serif;font-weight:700;line-height:1.3;">You're in, ${name}.</h2>
                      <p style="margin:0 0 12px;font-size:15px;color:#555;line-height:1.65;">Your review funnel for <strong style="color:#1E1E1C;">${name}</strong> is live. Customers can already use it — share the link below to start collecting reviews.</p>
                      <p style="margin:0 0 6px;font-size:13px;color:#888;">Your dashboard link:</p>
                      <p style="margin:0 0 24px;font-size:14px;font-family:'Courier New',monospace;background:#f5f5f3;padding:10px 14px;border-radius:6px;color:#333;word-break:break-all;">${dashboardUrl}</p>
                      <p style="margin:0 0 10px;font-size:15px;color:#555;line-height:1.65;">Your next step: choose a plan so your account stays active after the 14-day trial.</p>
                      <table cellpadding="0" cellspacing="0" style="margin-top:4px;">
                        <tr><td>
                          <a href="${dashboardUrl}" style="display:inline-block;background:#C8A96E;color:#1A1A18;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 32px;border-radius:8px;font-family:Arial,sans-serif;">Go to your dashboard →</a>
                        </td></tr>
                      </table>
                    </td></tr>
                    <tr><td style="padding:16px 32px 24px;border-top:1px solid #eee;">
                      <p style="margin:0;font-size:12px;color:#aaa;font-family:Arial,sans-serif;">Questions? Reply to this email or contact <a href="mailto:billy@reviewlift.app" style="color:#C8A96E;text-decoration:none;">billy@reviewlift.app</a></p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
            </html>
          `,
        });
      } catch (emailErr) {
        console.error("Welcome email failed (non-fatal):", emailErr.message);
      }

      // ✅ Now respond — session is saved
      res.json({ success: true, slug });
    });
  } catch (err) {
    console.error("Server error on /create-business:", err);
    res.status(500).json({ error: err.message || "Something went wrong. Please try again." });
  }
});

// ─── VERIFY LOGIN ─────────────────────────────────────────────────────────────
app.post("/verify-login", async (req, res) => {
  const { email, password } = req.body;
  const { data } = await supabase.from("businesses").select("*").eq("email", email).single();
  if (!data) return res.json({ success: false });

  const valid = await bcrypt.compare(password, data.password);
  if (!valid) return res.json({ success: false });

  req.session.slug = data.slug;
  req.session.save();

  res.json({ success: true, slug: data.slug, subscription_active: data.subscription_active });
});

app.get("/session", (req, res) => {
  if (!req.session.slug) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, slug: req.session.slug });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => { res.redirect("/login"); });
});

// ─── QR DOWNLOAD ──────────────────────────────────────────────────────────────
app.get("/qr-download/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });
  const url = `${process.env.BASE_URL}/r/${req.params.slug}`;
  const qr = await QRCode.toBuffer(url);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", "attachment; filename=review-qr.png");
  res.send(qr);
});

// ─── SEND SMS (Pro only, with usage cap) ──────────────────────────────────────
// SMS limits (hidden from users — enforced server-side):
//   Trial (Pro trial): 50 SMS total during trial period
//   Pro paid:          300 SMS per calendar month
// These are fair-use soft caps. If genuinely exceeded we contact the user.
const SMS_TRIAL_LIMIT = 50;
const SMS_MONTHLY_LIMIT = 300;

app.post("/send-sms", smsLimiter, async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });
  const { phone } = req.body;
  const slug = req.session.slug;
  try {
    const { data } = await supabase.from("businesses").select("*").eq("slug", slug).single();

    if (!hasProAccess(data)) {
      return res.status(403).json({ error: "Pro plan required to send SMS." });
    }

    // Count SMS sent this period
    const now = new Date();
    const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
    const inTrial = trialEnd && now < trialEnd;

    let smsCount = 0;
    if(inTrial){
      const { count } = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("business_slug", slug)
        .eq("event_type", "sms_sent");
      smsCount = count || 0;
      if(smsCount >= SMS_TRIAL_LIMIT){
        return res.status(429).json({
          error: `You've reached the SMS limit for your trial. Upgrade to a paid Pro plan to continue sending review requests.`,
          limit_reached: true
        });
      }
    } else {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count } = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("business_slug", slug)
        .eq("event_type", "sms_sent")
        .gte("created_at", monthStart);
      smsCount = count || 0;
      if(smsCount >= SMS_MONTHLY_LIMIT){
        return res.status(429).json({
          error: `You've sent a lot of review requests this month — get in touch at billy@reviewlift.app to discuss higher volume options.`,
          limit_reached: true
        });
      }
    }

    const normalisedPhone = normalisePhone(phone);

    // 🚨 BLOCK NON‑UK NUMBERS
    if (!normalisedPhone.startsWith('+44')) {
      return res.status(400).json({ 
        error: "SMS is currently available for UK numbers only. We're working on international support." 
      });
    }

    const message = `Hi! Thanks for visiting ${data.name} today. We'd love to know how it went - takes 30 seconds: ${process.env.BASE_URL}/r/${slug}`;
    await twilioClient.messages.create({ from: process.env.TWILIO_PHONE, to: normalisedPhone, body: message });

    await supabase.from("events").insert({ business_slug: slug, event_type: "sms_sent" });

    res.json({ success: true });
  } catch (err) {
    console.log("Twilio error:", err.code, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── STRIPE CHECKOUT ──────────────────────────────────────────────────────────
// Env vars: Starter_subscription and Pro_subscription (set in Vercel)
app.post("/create-checkout", async (req, res) => {
  const { slug, plan } = req.body;
  const priceId = plan === "pro"
    ? process.env.Pro_subscription
    : process.env.Starter_subscription;

  if (!priceId) {
    console.error("Missing price ID. Check Starter_subscription and Pro_subscription env vars.");
    return res.status(500).json({ error: "Pricing configuration error. Please contact support." });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      subscription_data: { trial_period_days: 14 },
      success_url: `${process.env.BASE_URL}/success?slug=${slug}`,
      cancel_url: `${process.env.BASE_URL}/admin`,
      metadata: { slug, plan },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err.message);
    res.status(500).json({ error: "Could not create checkout. Please try again." });
  }
});

app.post("/upgrade-plan", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not logged in" });
  const { plan } = req.body;
  try {
    const { data } = await supabase.from("businesses").select("stripe_customer, plan_type").eq("slug", req.session.slug).single();
    if (!data || !data.stripe_customer) return res.status(400).json({ error: "No active subscription found." });
    const newPriceId = plan === "pro" ? process.env.Pro_subscription : process.env.Starter_subscription;
    if (!newPriceId) return res.status(500).json({ error: "Price configuration error." });
    const subs = await stripe.subscriptions.list({ customer: data.stripe_customer, status: "trialing", limit: 1 });
    const sub = subs.data[0];
    if (!sub) return res.status(400).json({ error: "No active trial found." });
    await stripe.subscriptions.update(sub.id, { items: [{ id: sub.items.data[0].id, price: newPriceId }], proration_behavior: "none" });
    const newMrr = plan === "pro" ? 24.99 : 9.99;
    await supabase.from("businesses").update({ plan_type: plan, mrr: newMrr }).eq("slug", req.session.slug);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── REACTIVATE SUBSCRIPTION ─────────────────────────────────────────────────
// Removes cancel_at_period_end so the subscription continues normally.
app.post("/reactivate-subscription", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not logged in" });
  try {
    const { data } = await supabase.from("businesses").select("stripe_customer").eq("slug", req.session.slug).single();
    if (!data || !data.stripe_customer) return res.status(400).json({ error: "No subscription found." });

    const [activeSubs, trialSubs] = await Promise.all([
      stripe.subscriptions.list({ customer: data.stripe_customer, status: "active", limit: 1 }),
      stripe.subscriptions.list({ customer: data.stripe_customer, status: "trialing", limit: 1 }),
    ]);
    const sub = activeSubs.data[0] || trialSubs.data[0];
    if (!sub) return res.status(400).json({ error: "No active subscription found." });

    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
    res.json({ success: true });
  } catch (err) {
    console.log("Reactivate error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── CANCEL SUBSCRIPTION ──────────────────────────────────────────────────────
// IMPORTANT: Do NOT set subscription_active: false here.
// User keeps access until period end. The customer.subscription.deleted webhook handles revocation.
app.post("/cancel-subscription", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not logged in" });
  try {
    const { data } = await supabase.from("businesses").select("stripe_customer").eq("slug", req.session.slug).single();
    if (!data || !data.stripe_customer) return res.status(400).json({ error: "No active subscription found." });
 
    const [activeSubs, trialSubs] = await Promise.all([
      stripe.subscriptions.list({ customer: data.stripe_customer, status: "active", limit: 1 }),
      stripe.subscriptions.list({ customer: data.stripe_customer, status: "trialing", limit: 1 }),
    ]);
    const sub = activeSubs.data[0] || trialSubs.data[0];
    if (!sub) return res.status(400).json({ error: "No active subscription found." });
 
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    // Record when cancellation was requested (but keep subscription_active: true — access continues until period end)
    // The customer.subscription.deleted webhook handles the actual revocation
    await supabase.from("businesses").update({ cancel_requested_at: new Date().toISOString() }).eq("slug", req.session.slug);
    res.json({ success: true, message: "Subscription cancelled. You'll keep access until your billing period ends." });
  } catch (err) {
    console.log("Cancel error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
 

// ─── SEND EMAIL (Pro only) ────────────────────────────────────────────────────
app.post("/send-email", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });
  const { email } = req.body;
  const slug = req.session.slug;
  try {
    const { data: business, error } = await supabase.from("businesses").select("*").eq("slug", slug).single();
    if (error || !business) return res.status(404).json({ error: "Business not found" });
    if (!hasProAccess(business)) return res.status(403).json({ error: "Pro plan required" });

    const reviewUrl = `${process.env.BASE_URL}/r/${slug}`;
    await resend.emails.send({
      from: `Reviews <reviews@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
      to: email,
      subject: `How was your visit to ${business.name}?`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
        <body style="margin:0;padding:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:32px 16px;">
            <tr><td align="center">
              <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:540px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
                <tr><td style="background:#1E1E1C;padding:22px 32px;">
                  <p style="margin:0;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;color:#EAE7DC;">⭐ ${business.name}</p>
                </td></tr>
                <tr><td style="padding:36px 32px 28px;">
                  <h2 style="margin:0 0 14px;font-size:20px;color:#1E1E1C;font-family:Arial,sans-serif;font-weight:700;line-height:1.3;">How was your recent visit?</h2>
                  <p style="margin:0 0 10px;font-size:15px;color:#555;line-height:1.65;">Thanks for coming in — we hope you had a great experience.</p>
                  <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.65;">Your feedback, whether good or not, genuinely helps us improve. It only takes <strong>30 seconds</strong> and there's just one question.</p>
                  <table cellpadding="0" cellspacing="0">
                    <tr><td>
                      <a href="${reviewUrl}" style="display:inline-block;background:#C8A96E;color:#1E1E1C;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 32px;border-radius:8px;font-family:Arial,sans-serif;">Share how it went →</a>
                    </td></tr>
                  </table>
                </td></tr>
                <tr><td style="padding:16px 32px 24px;border-top:1px solid #eee;">
                  <p style="margin:0;font-size:12px;color:#aaa;font-family:Arial,sans-serif;">Sent by ${business.name} · Powered by <a href="https://www.reviewlift.app" style="color:#C8A96E;text-decoration:none;">ReviewLift</a></p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
    res.json({ success: true });
  } catch (err) {
    console.log("Email error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── CONTACT FORM ─────────────────────────────────────────────────────────────
// Receives enquiries from the landing page and forwards to billy@reviewlift.app.
// Resend sends the notification. Titan (billy@reviewlift.app) receives and handles replies.
app.post("/contact", async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: "All fields required" });
  try {
    await resend.emails.send({
      from: `ReviewLift Contact <reviews@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
      to: "billy@reviewlift.app",
      reply_to: email,
      subject: `New enquiry from ${name} — ReviewLift`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;">
          <h3 style="margin:0 0 16px;color:#1E1E1C;">New contact form message</h3>
          <p style="margin:0 0 8px;"><strong>Name:</strong> ${name}</p>
          <p style="margin:0 0 8px;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p style="margin:0 0 16px;"><strong>Message:</strong></p>
          <div style="background:#f5f5f3;padding:16px;border-radius:8px;font-size:14px;line-height:1.7;color:#333;">${message.replace(/\n/g, "<br>")}</div>
          <p style="margin:16px 0 0;font-size:12px;color:#999;">Hit reply to respond directly to ${name}.</p>
        </div>
      `,
    });
    res.json({ success: true });
  } catch (err) {
    console.log("Contact error:", err.message);
    res.status(500).json({ error: "Could not send. Please email billy@reviewlift.app directly." });
  }
});

// ─── AI REVIEW REPLY (Pro only) ───────────────────────────────────────────────
app.post("/generate-reply", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });
  const { review } = req.body;
  const slug = req.session.slug;
  try {
    const { data: business, error } = await supabase.from("businesses").select("plan_type, trial_ends_at, subscription_active").eq("slug", slug).single();
    if (error || !business) return res.status(404).json({ error: "Business not found" });
    if (!hasProAccess(business)) return res.status(403).json({ error: "Pro plan required" });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a friendly professional business owner replying to customer reviews. Write a polite, warm, and helpful reply. Keep it concise — 2-4 sentences. Do not start with 'Thank you for your review'." },
        { role: "user", content: `Write a reply to this customer review:\n\n${review}` },
      ],
    });
    res.json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.log("OpenAI error:", err.status, err.message);
    if (err.status === 429 || (err.message && err.message.includes("quota"))) {
      return res.status(503).json({ error: "AI temporarily unavailable. Try again in a few minutes." });
    }
    res.status(500).json({ error: "AI temporarily unavailable. Please try again." });
  }
});

// ─── BILLING PORTAL ───────────────────────────────────────────────────────────
app.post("/billing-portal", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not logged in" });
  try {
    const { data } = await supabase.from("businesses").select("stripe_customer").eq("slug", req.session.slug).single();
    if (!data || !data.stripe_customer) return res.status(400).json({ error: "No billing account found. Please subscribe first." });
    const portal = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer,
      return_url: process.env.BASE_URL + "/billing",
    });
    res.json({ url: portal.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE BUSINESS DETAILS ──────────────────────────────────────────────────
app.post("/update-business", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });
  const { name, review_link } = req.body;
  if (!name || name.trim().length < 1) return res.status(400).json({ error: "Business name required" });
  const { error } = await supabase
    .from("businesses")
    .update({ name: name.trim(), review_link: review_link || "" })
    .eq("slug", req.session.slug);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
app.post("/change-password", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: "Both fields required" });
  if (new_password.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters" });
  try {
    const { data } = await supabase.from("businesses").select("password").eq("slug", req.session.slug).single();
    if (!data) return res.status(404).json({ error: "Account not found" });
    const valid = await bcrypt.compare(current_password, data.password);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });
    const hashed = await bcrypt.hash(new_password, 10);
    const { error } = await supabase.from("businesses").update({ password: hashed }).eq("slug", req.session.slug);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REVIEW GROWTH ────────────────────────────────────────────────────────────
app.get("/review-growth/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });
  const { data } = await supabase.from("events").select("created_at").eq("business_slug", req.params.slug).eq("event_type", "review_click");
  const months = {};
  (data || []).forEach((e) => {
    const month = new Date(e.created_at).toISOString().slice(0, 7);
    months[month] = (months[month] || 0) + 1;
  });
  res.json(months);
});

// ─── FEEDBACK SUMMARY ─────────────────────────────────────────────────────────
app.post("/feedback-summary", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });
  const slug = req.session.slug;
  const { data } = await supabase.from("events").select("message").eq("business_slug", slug).eq("event_type", "negative");
  const feedback = (data || []).map((f) => f.message).join("\n");
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Summarize the most common complaints from this customer feedback in 2-3 concise bullet points." },
        { role: "user", content: feedback },
      ],
    });
    res.json({ summary: completion.choices[0].message.content });
  } catch (err) {
    res.status(503).json({ error: "AI temporarily unavailable. Please try again." });
  }
});

// ─── AUTO REVIEW SMS ──────────────────────────────────────────────────────────
app.post("/auto-review", async (req, res) => {
  const { phone, slug } = req.body;
  const { data } = await supabase.from("businesses").select("*").eq("slug", slug).single();
  if (!data) return res.status(404).json({ error: "Business not found" });
  const message = `Thanks for visiting ${data.name}! We'd love to hear how it went — takes 30 seconds: ${process.env.BASE_URL}/r/${slug}`;
  await twilioClient.messages.create({ from: process.env.TWILIO_PHONE, to: normalisePhone(phone), body: message });
  res.json({ success: true });
});

// ─── LAPSED STATS ─────────────────────────────────────────────────────────────
// ─── LAPSED STATS — counts only, for the FOMO wall on lapsed.html ─────────────
app.get("/lapsed-stats/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });
  const { data, error } = await supabase
    .from("businesses")
    .select("subscription_active")
    .eq("slug", req.params.slug)
    .single();
  if (error || !data) return res.status(404).json({ error: "Not found" });
  if (data.subscription_active) return res.json({ active: true });
  const { data: events } = await supabase
    .from("events")
    .select("event_type")
    .eq("business_slug", req.params.slug);
  const counts = { visits: 0, feedback: 0, reviews: 0 };
  (events || []).forEach(e => {
    if (e.event_type === "visit")        counts.visits++;
    if (e.event_type === "negative")     counts.feedback++;
    if (e.event_type === "review_click") counts.reviews++;
  });
  res.json(counts);
});

// ─── AFFILIATE STATS ──────────────────────────────────────────────────────────
app.get("/affiliate-stats/:code", async (req, res) => {
  const code = req.params.code;
  
  // Get all businesses referred by this code
  const { data: businesses } = await supabase
    .from("businesses")
    .select("name, slug, subscription_active, plan_type, created_at, trial_ends_at")
    .eq("referred_by", code)
    .order("created_at", { ascending: false });
  
  if (!businesses || businesses.length === 0) {
    return res.json({
      partner_name: code,
      referral_link: `https://www.reviewlift.app?ref=${code}`,
      total_signups: 0,
      active_customers: 0,
      monthly_earnings: 0,
      referrals: []
    });
  }
  
  const now = new Date();
  
  // Only count paying customers (subscription active AND trial has ended)
  const paying = businesses.filter(b => {
    if (!b.subscription_active) return false;
    // If they have a trial_ends_at and it's in the future, they're still on trial
    if (b.trial_ends_at && new Date(b.trial_ends_at) > now) return false;
    return true;
  });
  
  const trialCustomers = businesses.filter(b => {
    return b.subscription_active && b.trial_ends_at && new Date(b.trial_ends_at) > now;
  });
  
  const monthlyEarnings = paying.reduce((sum, b) => {
    return sum + (b.plan_type === 'pro' ? 24.99 * 0.3 : 9.99 * 0.3);
  }, 0);
  
  const referrals = businesses.map(b => {
    let status = 'cancelled';
    if (b.subscription_active && b.trial_ends_at && new Date(b.trial_ends_at) > now) {
      status = 'trial';
    } else if (b.subscription_active) {
      status = 'active';
    }
    
    const commission = status === 'active' 
      ? (b.plan_type === 'pro' ? 24.99 * 0.3 : 9.99 * 0.3) 
      : 0;
    
    return {
      business_name: b.name,
      slug: b.slug,
      plan: b.plan_type || 'starter',
      created_at: b.created_at,
      status: status,
      commission: commission
    };
  });
  
  res.json({
    partner_name: code,
    referral_link: `https://www.reviewlift.app?ref=${code}`,
    total_signups: businesses.length,
    active_customers: paying.length,
    trial_customers: trialCustomers.length,
    monthly_earnings: monthlyEarnings,
    referrals
  });
});

// ─── PARTNER INFO (for co-branded landing page) ───────────────────────────────
app.get("/partner-info/:code", async (req, res) => {
  const code = req.params.code;
  
  // For now, return the code as the display name. 
  // Later you can add a partners table with bios, headshots, etc.
  // This endpoint exists so you can enrich it without changing the frontend.
  
  // Check if this code has actually referred anyone (validates it's a real partner)
  const { count } = await supabase
    .from("businesses")
    .select("*", { count: "exact", head: true })
    .eq("referred_by", code);
  
  res.json({
    code: code,
    name: code.charAt(0).toUpperCase() + code.slice(1).replace(/-/g, ' '), // "toddnorwich" → "Toddnorwich"
    has_referrals: count > 0,
    // Future: pull from a partners table
    // display_name: "Todd at Semibold",
    // quote: "I recommend ReviewLift to all my clients...",
    // logo_url: "..."
  });
});
// ─── EXPORT ───────────────────────────────────────────────────────────────────
const serverless = require("serverless-http");
module.exports = app;
module.exports.handler = serverless(app);