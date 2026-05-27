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


const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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
// Pro/Agency access: subscription must be active AND on pro or agency plan
function hasProAccess(business) {
  return business.subscription_active && (business.plan_type === "pro" || business.plan_type === "agency");
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
      const mrr = plan === "pro" ? 24.99 : plan === "agency" ? 79 : 9.99;
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
// ─── BUSINESS FUNNEL PAGE (with customisation) ─────────────────────────────
app.get("/r/:business", async (req, res) => {
  let slug = req.params.business;
  
  // Check if this is a custom domain request
  const host = req.get('host');
  if (host && host !== process.env.BASE_URL?.replace('https://', '')) {
    // Look up business by custom domain
    const { data: domainMatch } = await supabase
      .from("businesses")
      .select("slug")
      .eq("funnel_custom_domain", host)
      .single();
      
    if (domainMatch) {
      slug = domainMatch.slug;
    }
  }
  
  const { data, error } = await supabase.from("businesses").select("*").eq("slug", slug).single();
  if (error || !data) return res.status(404).send("Business not found");

  await supabase.from("events").insert({ business_slug: slug, event_type: "visit" });

  const pagePath = path.join(__dirname, "public", "index.html");
  let page = fs.readFileSync(pagePath, "utf8");
  const isLapsed = !data.subscription_active;
  
  // Get translated content if language is set
  let headline = data.funnel_headline || `How was your experience at ${data.name}?`;
  let happyLabel = data.funnel_happy_label || 'Great experience!';
  let unhappyLabel = data.funnel_unhappy_label || 'Could be better';
  let thankyouMessage = data.funnel_thankyou_message || 'Thank you for your feedback — it means a lot to us.';
  
  // Use translations if available and language not English
  if (data.funnel_language && data.funnel_language !== 'en') {
    headline = data.funnel_translated_headline || headline;
    happyLabel = data.funnel_translated_happy_label || happyLabel;
    unhappyLabel = data.funnel_translated_unhappy_label || unhappyLabel;
    thankyouMessage = data.funnel_translated_thankyou_message || thankyouMessage;
  }
  
  // Escape for JavaScript injection
  const escapeJS = (str) => str ? str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') : '';

  res.send(`
    <html>
      <script>
window.businessName        = "${data.name.replace(/"/g, '\\"')}";
window.slug                = "${slug}";
window.reviewLink          = "${(data.review_link || "").replace(/"/g, '\\"')}";
window.accountLapsed       = ${isLapsed};
window.industry            = "${(data.industry || 'local business').replace(/"/g, '\\"')}";
window.service             = "${(req.query.service || '').replace(/"/g, '\\"')}";
// Funnel customisation variables
window.funnelTemplate      = "${data.funnel_template || 'classic'}";
window.funnelLogoUrl       = "${(data.funnel_logo_url || '').replace(/"/g, '\\"')}";
window.funnelAccentColor   = "${data.funnel_accent_color || '#C8A96E'}";
window.funnelHeadline      = "${escapeJS(headline)}";
window.funnelHappyLabel    = "${escapeJS(happyLabel)}";
window.funnelUnhappyLabel  = "${escapeJS(unhappyLabel)}";
window.funnelThankyouMessage = "${escapeJS(thankyouMessage)}";
window.funnelLanguage      = "${data.funnel_language || 'en'}";
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
  
  // ─── MILESTONE CHECK ──────────────────────────────────────────────
  try {
    // Count total positive events
    const { count, error: countError } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("business_slug", slug)
      .eq("event_type", "positive");
    
    if (!countError && count) {
      const milestones = [10, 25, 50, 100, 250, 500];
      const matchedMilestone = milestones.find(m => m === count);
      
      if (matchedMilestone) {
        // Get business data
        const { data: business } = await supabase
          .from("businesses")
          .select("name, email, last_milestone_sent, review_link, plan_type")
          .eq("slug", slug)
          .single();
        
        if (business && matchedMilestone > (business.last_milestone_sent || 0)) {
          // Generate AI congratulation message
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { 
                role: "system", 
                content: "You write short, celebratory messages for small business owners who have just hit a Google review milestone. Enthusiastic but genuine. 2 sentences max. Never use exclamation marks excessively." 
              },
              { 
                role: "user", 
                content: `${business.name} just collected their ${matchedMilestone}th Google review using ReviewLift. Write a congratulations message for the business owner.` 
              }
            ],
            temperature: 0.7,
            max_tokens: 80
          });
          
          const congratsMessage = completion.choices[0].message.content.trim();
          
          // Generate milestone page URL
          const milestoneUrl = `${process.env.BASE_URL}/milestone/${slug}/${matchedMilestone}`;
          
          // Send celebration email via Resend
          await resend.emails.send({
            from: `ReviewLift <reviews@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
            to: business.email,
            subject: `🎉 You just hit ${matchedMilestone} reviews, ${business.name}!`,
            html: `
              <!DOCTYPE html>
              <html>
              <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
              <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,Helvetica,sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A18;padding:32px 16px;">
                  <tr><td align="center">
                    <table width="540" cellpadding="0" cellspacing="0" style="background:#242422;border-radius:12px;overflow:hidden;max-width:540px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,0.4);">
                      <tr><td style="background:#1E1E1C;padding:22px 32px;">
                        <p style="margin:0;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;color:#C8A96E;">⭐ ReviewLift</p>
                      </td></tr>
                      <tr><td style="padding:32px 32px 24px;text-align:center;">
                        <div style="font-family:'Syne',Arial,sans-serif;font-size:4rem;font-weight:800;color:#C8A96E;line-height:1;">${matchedMilestone}</div>
                        <div style="font-size:0.9rem;color:rgba(234,231,220,0.45);letter-spacing:2px;margin-bottom:20px;">GOOGLE REVIEWS AND COUNTING</div>
                        
                        <div style="background:rgba(200,169,110,0.06);border:1px solid rgba(200,169,110,0.15);border-radius:12px;padding:20px;margin:20px 0;">
                          <p style="margin:0;font-size:1rem;color:#EAE7DC;line-height:1.6;">"${congratsMessage}"</p>
                        </div>
                        
                        <!-- Shareable graphic card -->
                        <div style="background:#1A1A18;border:1px solid rgba(200,169,110,0.3);border-radius:16px;padding:32px;margin:24px 0;text-align:center;">
                          <div style="font-family:'Syne',Arial,sans-serif;font-size:0.8rem;font-weight:700;color:#C8A96E;letter-spacing:2px;margin-bottom:12px;">${business.name.toUpperCase()}</div>
                          <div style="font-family:'Syne',Arial,sans-serif;font-size:3.5rem;font-weight:800;color:#EAE7DC;line-height:1.1;">${matchedMilestone} ⭐ Reviews</div>
                          <div style="font-size:0.8rem;color:rgba(234,231,220,0.35);margin-top:12px;">And growing — powered by ReviewLift</div>
                        </div>
                        
                        <p style="font-size:0.85rem;color:rgba(234,231,220,0.55);line-height:1.6;margin:20px 0;">Share this on Instagram, Facebook, or your website to show customers how trusted you are.</p>
                        
                        <div style="margin:24px 0;">
                          <div style="background:var(--surface-3);border-radius:8px;padding:12px;margin-bottom:12px;">
                            <code style="font-size:0.7rem;color:#C8A96E;word-break:break-all;">${milestoneUrl}</code>
                          </div>
                          <a href="${milestoneUrl}" style="display:inline-block;background:#C8A96E;color:#1A1A18;text-decoration:none;font-weight:bold;font-size:0.9rem;padding:12px 28px;border-radius:8px;">Share your milestone →</a>
                        </div>
                        
                        <a href="${process.env.BASE_URL}/for-business" style="display:inline-block;background:transparent;color:#C8A96E;text-decoration:none;font-size:0.85rem;border:1px solid rgba(200,169,110,0.3);padding:10px 24px;border-radius:8px;">View your dashboard</a>
                      </td></tr>
                      <tr><td style="padding:16px 32px 24px;border-top:1px solid rgba(234,231,220,0.06);text-align:center;">
                        <p style="margin:0;font-size:11px;color:rgba(234,231,220,0.2);">Powered by ReviewLift · Keep collecting those 5-star reviews</p>
                      </td></tr>
                    </table>
                  </td></tr>
                </table>
              </body>
              </html>
            `
          });
          
          // Update last_milestone_sent
          await supabase
            .from("businesses")
            .update({ last_milestone_sent: matchedMilestone })
            .eq("slug", slug);
        }
      }
    }
  } catch (milestoneErr) {
    console.error("Milestone error (non-fatal):", milestoneErr.message);
  }
  
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
  
  // ─── SEND SMS ALERT TO BUSINESS OWNER ───
  try {
    // Get business details including alert settings
    const { data: businessData } = await supabase
      .from("businesses")
      .select("name, alert_enabled, alert_phone, subscription_active, plan_type")
      .eq("slug", business)
      .single();
    
    // Only send if alerts are enabled and they have a phone number
    if (businessData && businessData.alert_enabled && businessData.alert_phone) {
      const shortMessage = message.length > 100 ? message.substring(0, 97) + "..." : message;
      const businessName = businessData.name || "a customer";
      
      const alertText = `⚠️ COMPLAINT from ${businessName}: "${shortMessage}"\n\nLog in to respond: ${process.env.BASE_URL}/for-business`;
      
      // Send SMS via Twilio
      const normalisedPhone = normalisePhone(businessData.alert_phone);
      
      if (normalisedPhone.startsWith('+44')) {
        await twilioClient.messages.create({
          from: process.env.TWILIO_PHONE,
          to: normalisedPhone,
          body: alertText
        });
        console.log(`Alert SMS sent to ${normalisedPhone} for complaint from ${business}`);
      } else {
        console.log(`Invalid UK number for alerts: ${normalisedPhone}`);
      }
    }
  } catch (alertErr) {
    // Don't fail the request if alert fails - just log it
    console.error("Alert SMS failed (non-fatal):", alertErr.message);
  }
  
  res.json({ success: true });
});

// ─── VOICE NOTE TRANSCRIPTION (Pro/Agency only) ──────────────────────────────
app.post("/transcribe-voice/:slug", upload.single('audio'), async (req, res) => {
  const { slug } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided" });
  }
  
  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("plan_type, subscription_active, name, industry")
      .eq("slug", slug)
      .single();
      
    if (!business) return res.status(404).json({ error: "Business not found" });
    
    const isProOrAgency = business.subscription_active && 
      (business.plan_type === "pro" || business.plan_type === "agency");
    if (!isProOrAgency) {
      return res.status(403).json({ error: "Pro or Agency plan required" });
    }
    
    // Send to Whisper
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: new File([req.file.buffer], 'audio.webm', { type: req.file.mimetype }),
      language: "en",
      prompt: `This is a customer leaving feedback for ${business.name}, a ${business.industry || 'local'} business. They are speaking casually.`
    });
    
    const text = transcription.text.trim();
    
    if (!text || text.length < 2) {
      return res.json({ 
        sentiment: "unclear", 
        transcription: "(could not understand audio)",
        message: "Please try again"
      });
    }
    
    // Detailed sentiment analysis with business context
    const sentiment = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: `You are analysing customer feedback for ${business.name}, a ${business.industry || 'local'} business. 
          
Classify the sentiment as one of: "very_positive", "positive", "neutral", "negative", "very_negative".

Rules:
- "very_positive": enthusiastic praise, mentions specific good things, says they'll return/recommend (e.g. "absolutely loved it, best service ever, will definitely come back")
- "positive": generally happy, satisfied, says things were good (e.g. "it was good, happy with the service, no complaints")
- "neutral": mixed or matter-of-fact with no strong emotion either way (e.g. "it was fine, average, okay")
- "negative": clearly unhappy, complaining, mentions specific problems (e.g. "not happy, disappointing, could be better")
- "very_negative": angry, outraged, says they'll never return, warns others (e.g. "terrible, awful, never coming back, do not recommend")

Key guidance:
- If the customer says anything indicating satisfaction (good, great, happy, loved, recommend, return, defo, definitely), classify as at least "positive"
- Only classify as negative if there is clear dissatisfaction or a complaint
- "Neutral" is for truly mixed feedback with equal positive and negative elements
- Casual positive language like "loved it", "defo coming back", "spot on", "sound", "class" = very_positive
- Casual negative language like "not great", "bit rubbish", "wasn't impressed" = negative

Reply with JSON only: { "sentiment": "positive", "confidence": "high", "reasoning": "brief explanation in 10 words or less" }`
        },
        { 
          role: "user", 
          content: `Customer said: "${text}"`
        }
      ],
      max_tokens: 150,
      temperature: 0
    });
    
    let result;
    try {
      const cleaned = sentiment.choices[0].message.content.replace(/```json|```/g, '').trim();
      result = JSON.parse(cleaned);
    } catch(e) {
      // Fallback: simple keyword check
      const lowerText = text.toLowerCase();
      const positiveWords = ['great', 'good', 'love', 'excellent', 'happy', 'brilliant', 'fantastic', 'amazing', 'wonderful', 'best', 'perfect', 'recommend', 'defo', 'definitely', 'outstanding', 'spot on', 'class', 'sound', 'pleased', 'satisfied', 'impressed', 'coming back', 'return'];
      const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'poor', 'disappointed', 'unhappy', 'rubbish', 'worst', 'hate', 'never again', 'avoid', 'complaint', 'not good', 'not happy', 'not great', 'wasn\'t', 'wouldn\'t', 'couldn\'t', 'didn\'t'];
      
      const posCount = positiveWords.filter(w => lowerText.includes(w)).length;
      const negCount = negativeWords.filter(w => lowerText.includes(w)).length;
      
      const isPositive = posCount > negCount;
      result = {
        sentiment: isPositive ? "positive" : "negative",
        confidence: "low",
        reasoning: "Fallback keyword analysis"
      };
    }
    
    const isNegative = result.sentiment === "negative" || result.sentiment === "very_negative";
    
    if (isNegative) {
      // Store as private feedback
      await supabase.from("events").insert({
        business_slug: slug,
        event_type: "negative",
        message: `[Voice note] ${text}`,
        created_at: new Date().toISOString()
      });
      
      return res.json({ 
        sentiment: "negative", 
        transcription: text,
        message: "Feedback saved privately"
      });
    }
    
    // Positive, very_positive, or neutral — send to Google
    res.json({ 
      sentiment: "positive", 
      transcription: text,
      message: "Ready to post as a review"
    });
    
  } catch(err) {
    console.error("Voice transcription error:", err.message);
    res.status(500).json({ error: "Could not transcribe. Please try again." });
  }
});

// ─── STATS ────────────────────────────────────────────────────────────────────
app.get("/stats/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });

const { data: businessData } = await supabase
  .from("businesses")
  .select("name, subscription_active, plan_type, trial_ends_at, review_link, industry, current_software, nfc_card_ordered, nfc_card_tracking_number, alert_enabled, alert_phone")
  .eq("slug", req.params.slug)
  .single();
    
  if (!businessData) return res.status(404).json({ error: "Business not found" });

  const { data: events } = await supabase
    .from("events")
    .select("event_type, rating, message, created_at")
    .eq("business_slug", req.params.slug);

  // Get recent events for activity feed
  const { data: recentEvents } = await supabase
    .from("events")
    .select("event_type, created_at")
    .eq("business_slug", req.params.slug)
    .order("created_at", { ascending: false })
    .limit(10);

  // Build stats object
  const stats = {
    visits: 0,
    positive: 0,
    negative: 0,
    reviews: 0,
    rating_avg: 0,
    rating_count: 0,
    rating_distribution: {},
    feedback: [],
    subscription_active: businessData.subscription_active,
    plan_type: businessData.plan_type,
    trial_ends_at: businessData.trial_ends_at,
    business_name: businessData.name,
    review_link: businessData.review_link,
    account_lapsed: !businessData.subscription_active,
    industry: businessData.industry,
    current_software: businessData.current_software,
    nfc_card_ordered: businessData.nfc_card_ordered || false,
    nfc_card_tracking_number: businessData.nfc_card_tracking_number || null,
    recent_events: recentEvents || [],
     funnel_template: businessData.funnel_template || 'classic',
  funnel_logo_url: businessData.funnel_logo_url || null,
  funnel_accent_color: businessData.funnel_accent_color || '#C8A96E',
  funnel_headline: businessData.funnel_headline || null,
  funnel_happy_label: businessData.funnel_happy_label || 'Great experience!',
  funnel_unhappy_label: businessData.funnel_unhappy_label || 'Could be better',
  funnel_thankyou_message: businessData.funnel_thankyou_message || null,
  funnel_custom_domain: businessData.funnel_custom_domain || null,
  funnel_language: businessData.funnel_language || 'en'
  };

  let ratingTotal = 0;
  const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  (events || []).forEach((e) => {
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
// ─── NFC CARD ADMIN PANEL ──────────────────────────────────────────────────────

// Admin page to view all NFC card orders
app.get("/admin-nfc", (req, res) => {
  const { key } = req.query;
  if (key !== process.env.ADMIN_SECRET) {
    return res.status(401).send("Unauthorized");
  }
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>NFC Card Orders — Admin</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #1A1A18;
          color: #EAE7DC;
          padding: 40px 24px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { font-size: 1.8rem; margin-bottom: 8px; color: #C8A96E; }
        .sub { color: rgba(234,231,220,0.45); margin-bottom: 32px; }
        .stats { display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }
        .stat-card { background: #242422; border: 1px solid rgba(200,169,110,0.2); border-radius: 12px; padding: 20px 28px; }
        .stat-number { font-size: 2rem; font-weight: 800; color: #C8A96E; }
        .stat-label { font-size: 0.75rem; color: rgba(234,231,220,0.45); margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; background: #242422; border-radius: 12px; overflow: hidden; }
        th { text-align: left; padding: 16px; background: #1E1E1C; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #C8A96E; border-bottom: 1px solid rgba(200,169,110,0.2); }
        td { padding: 16px; border-bottom: 1px solid rgba(234,231,220,0.06); font-size: 0.85rem; vertical-align: top; }
        tr:hover { background: rgba(200,169,110,0.03); }
        .status-pending { color: #C8A96E; }
        .status-shipped { color: #8EC9A8; }
        .btn-ship { background: #C8A96E; color: #1A1A18; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600; }
        .btn-ship:hover { background: #D4B87A; }
        .tracking-input { width: 140px; padding: 6px 8px; background: #2E2E2B; border: 1px solid rgba(234,231,220,0.15); border-radius: 6px; color: #EAE7DC; font-size: 0.75rem; }
        .address { max-width: 250px; white-space: pre-wrap; font-size: 0.75rem; line-height: 1.5; color: rgba(234,231,220,0.7); }
        .refresh-btn { background: transparent; border: 1px solid rgba(200,169,110,0.3); color: #C8A96E; padding: 8px 16px; border-radius: 8px; cursor: pointer; margin-bottom: 20px; }
        .refresh-btn:hover { background: rgba(200,169,110,0.1); }
        @media (max-width: 800px) { td, th { padding: 12px; } .address { max-width: 180px; } }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📦 NFC Card Orders</h1>
        <p class="sub">Manage tap-to-review card orders — mark as shipped, add tracking numbers.</p>
        
        <div class="stats" id="stats"></div>
        
        <button class="refresh-btn" onclick="loadOrders()">⟳ Refresh</button>
        
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr><th>Business</th><th>Email</th><th>Order Date</th><th>Shipping Address</th><th>Status</th><th>Tracking</th><th>Action</th></tr>
            </thead>
            <tbody id="ordersTable"></tbody>
          </table>
        </div>
      </div>
      
      <script>
        const ADMIN_KEY = "${req.query.key}";
        
        async function loadOrders() {
          const res = await fetch('/admin/nfc-orders?key=' + ADMIN_KEY);
          const data = await res.json();
          
          // Update stats
          const statsHtml = \`
            <div class="stat-card"><div class="stat-number">\${data.total}</div><div class="stat-label">Total Orders</div></div>
            <div class="stat-card"><div class="stat-number">\${data.pending}</div><div class="stat-label">Pending Shipment</div></div>
            <div class="stat-card"><div class="stat-number">\${data.shipped}</div><div class="stat-label">Shipped</div></div>
            <div class="stat-card"><div class="stat-number">£\${data.total_revenue}</div><div class="stat-label">Total Revenue</div></div>
          \`;
          document.getElementById('stats').innerHTML = statsHtml;
          
          // Build table rows
          let tableHtml = '';
          data.orders.forEach(order => {
            const statusClass = order.tracking_number ? 'status-shipped' : 'status-pending';
            const statusText = order.tracking_number ? '✅ Shipped' : '⏳ Pending';
            const trackingValue = order.tracking_number || '';
            
            tableHtml += \`
              <tr>
                <td><strong>\${escapeHtml(order.name)}</strong><br><span style="font-size:0.7rem;color:rgba(234,231,220,0.35);">\${order.slug}</span></td>
                <td><a href="mailto:\${order.email}" style="color:#C8A96E;">\${order.email}</a></td>
                <td>\${new Date(order.order_date).toLocaleDateString('en-GB')}</td>
                <td class="address">\${escapeHtml(order.shipping_address || 'Not provided')}</td>
                <td class="\${statusClass}">\${statusText}</td>
                <td><input type="text" id="tracking_\${order.slug}" class="tracking-input" placeholder="Tracking #" value="\${trackingValue}"></td>
                <td><button class="btn-ship" onclick="markShipped('\${order.slug}')">✈️ Mark Shipped</button></td>
              </tr>
            \`;
          });
          document.getElementById('ordersTable').innerHTML = tableHtml || '<tr><td colspan="7" style="text-align:center;padding:40px;">No orders yet</td></tr>';
        }
        
        async function markShipped(slug) {
          const trackingInput = document.getElementById('tracking_' + slug);
          const trackingNumber = trackingInput.value.trim();
          const btn = event.target;
          
          btn.disabled = true;
          btn.textContent = 'Processing...';
          
          const res = await fetch('/admin/mark-card-shipped', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_key: ADMIN_KEY, slug: slug, tracking_number: trackingNumber })
          });
          const data = await res.json();
          
          if (data.success) {
            btn.textContent = '✅ Shipped!';
            setTimeout(() => loadOrders(), 1000);
          } else {
            btn.textContent = '❌ Failed';
            alert(data.error || 'Could not mark as shipped');
            setTimeout(() => { btn.disabled = false; btn.textContent = '✈️ Mark Shipped'; }, 2000);
          }
        }
        
        function escapeHtml(text) {
          if (!text) return '';
          return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        
        loadOrders();
      </script>
    </body>
    </html>
  `);
});

// API endpoint to get all NFC orders (for admin panel)
app.get("/admin/nfc-orders", async (req, res) => {
  const { key } = req.query;
  if (key !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const { data: orders, error } = await supabase
    .from("businesses")
    .select("slug, name, email, shipping_address, nfc_card_ordered, nfc_card_order_date, nfc_card_tracking_number")
    .eq("nfc_card_ordered", true)
    .order("nfc_card_order_date", { ascending: false });
    
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  let totalRevenue = 0;
  let pending = 0;
  let shipped = 0;
  
  const processedOrders = orders.map(order => {
    const hasTracking = order.nfc_card_tracking_number && order.nfc_card_tracking_number.length > 0;
    if (hasTracking) shipped++;
    else pending++;
    totalRevenue += 9.99;
    
    return {
      slug: order.slug,
      name: order.name,
      email: order.email,
      shipping_address: order.shipping_address,
      order_date: order.nfc_card_order_date,
      tracking_number: order.nfc_card_tracking_number
    };
  });
  
  res.json({
    total: orders.length,
    pending,
    shipped,
    total_revenue: totalRevenue.toFixed(2),
    orders: processedOrders
  });
});

// ─── CREATE BUSINESS ──────────────────────────────────────────────────────────
app.post("/create-business", async (req, res) => {
  try {
    const { name, email, review, password, referral, industry, currentSoftware } = req.body;
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
  referred_by: referral || null,
  industry: industry || null,
  current_software: currentSoftware || null,
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

await supabase.from("events").insert({ 
  business_slug: slug, 
  event_type: "sms_sent",
  channel: "sms",
  sent_at: now.toISOString(),
  appointment_hour: now.getHours(),
  appointment_day: now.getDay()
});

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
  let priceId;
  if (plan === "pro") priceId = process.env.Pro_subscription;
  else if (plan === "agency") priceId = process.env.Agency_subscription;
  else priceId = process.env.Starter_subscription;

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
    
    // Log the email send event
    const now = new Date();
    await supabase.from("events").insert({ 
      business_slug: slug, 
      event_type: "email_sent",
      channel: "email",
      sent_at: now.toISOString(),
      appointment_hour: now.getHours(),
      appointment_day: now.getDay()
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
// ─── AI REVIEW REPLY — Three-Tone (Pro/Agency only) ──────────────────────────
app.post("/generate-reply", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });
  const { review } = req.body;
  const slug = req.session.slug;
  try {
    const { data: business, error } = await supabase.from("businesses").select("plan_type, trial_ends_at, subscription_active").eq("slug", slug).single();
    if (error || !business) return res.status(404).json({ error: "Business not found" });
    
    const isProOrAgency = business.subscription_active && (business.plan_type === "pro" || business.plan_type === "agency");
    if (!isProOrAgency) return res.status(403).json({ error: "Pro or Agency plan required" });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: `Generate three different replies to this customer review. Each reply should be from the business owner's perspective. Return JSON only, no markdown, in this format: { "professional": "...", "warm": "...", "punchy": "..." }

professional: formal, polished, 2-3 sentences. Warm and respectful but professional tone.
warm: friendly and personal, feels like a real human wrote it, 2-3 sentences. Use conversational British English.
punchy: short, confident, 1-2 sentences max. Casual and direct.

Do not start any reply with "Thank you for your review".` 
        },
        { role: "user", content: `Write replies to this customer review:\n\n${review}` },
      ],
      temperature: 0.8,
      max_tokens: 400
    });
    
    let parsed;
    try {
      const cleaned = completion.choices[0].message.content.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch(e) {
      // Fallback: return raw text
      return res.json({ 
        professional: "Could not generate reply. Please try again.",
        warm: "Could not generate reply. Please try again.",
        punchy: "Could not generate reply. Please try again."
      });
    }
    
    res.json({ 
      professional: parsed.professional || parsed.Professional || "",
      warm: parsed.warm || parsed.Warm || "",
      punchy: parsed.punchy || parsed.Punchy || ""
    });
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

app.post("/update-business", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });
  const { name, review_link, alert_enabled, alert_phone } = req.body;
  if (!name || name.trim().length < 1) return res.status(400).json({ error: "Business name required" });
  
  const updateData = { 
    name: name.trim(), 
    review_link: review_link || "" 
  };
  
  if (alert_enabled !== undefined) updateData.alert_enabled = alert_enabled;
  if (alert_phone !== undefined) updateData.alert_phone = alert_phone;
  
  const { error } = await supabase
    .from("businesses")
    .update(updateData)
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
  let rate = 0.3;
  let price = b.plan_type === 'pro' ? 24.99 : b.plan_type === 'agency' ? 79 : 9.99;
  return sum + (price * rate);
}, 0);
  
  const referrals = businesses.map(b => {
    let status = 'cancelled';
    if (b.subscription_active && b.trial_ends_at && new Date(b.trial_ends_at) > now) {
      status = 'trial';
    } else if (b.subscription_active) {
      status = 'active';
    }
    
    const commission = status === 'active' 
  ? ((b.plan_type === 'pro' ? 24.99 : b.plan_type === 'agency' ? 79 : 9.99) * 0.3)
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

// ─── WEBHOOK: Automated review request trigger ──────────────────────────────
app.post("/api/hook/:slug", async (req, res) => {
  const { slug } = req.params;
  const { customer_name, customer_phone, service, staff_name, appointment_time } = req.body;

  if (!customer_name || !customer_phone) {
    return res.status(400).json({ error: "customer_name and customer_phone are required" });
  }

  try {
    // Look up business
    const { data: business, error } = await supabase
      .from("businesses")
      .select("name, industry, plan_type, review_link")
      .eq("slug", slug)
      .single();

    if (error || !business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Only pro or agency plans
    if (business.plan_type !== "pro" && business.plan_type !== "agency") {
      return res.status(403).json({ 
        error: "Webhook access requires Pro or Agency plan. Upgrade at /billing" 
      });
    }

    // Build the AI prompt
    const industry = business.industry || "local service";
    const businessName = business.name;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You write friendly, human-sounding SMS review requests on behalf of small businesses. Keep it under 160 characters. Sound like the business owner wrote it personally, not a marketing tool. Never use exclamation marks excessively. Always end with a short review link placeholder: [LINK]. Use British English spelling."
        },
        {
          role: "user",
          content: `Write an SMS from a ${industry} business called ${businessName} to a customer called ${customer_name} who just had '${service || "their appointment"}' done${staff_name ? " by " + staff_name : ""}. Ask them to leave a review.`
        }
      ],
      temperature: 0.8,
      max_tokens: 100
    });

    let message = completion.choices[0].message.content.trim();
    
    // Replace [LINK] with actual review funnel URL
    const reviewUrl = `${process.env.BASE_URL}/r/${slug}`;
    message = message.replace("[LINK]", reviewUrl);
    
    // Enforce 160 char limit for SMS
    if (message.length > 160) {
      message = message.substring(0, 157) + "...";
    }

    // Normalise and validate phone
    const normalisedPhone = normalisePhone(customer_phone);
    if (!normalisedPhone.startsWith("+44")) {
      return res.status(400).json({ 
        error: "UK phone numbers only (+44 or 07...). International support coming soon." 
      });
    }

    // Send via Twilio
    await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE,
      to: normalisedPhone,
      body: message
    });

    // Log the event
    const hookNow = new Date();
const apptDate = appointment_time ? new Date(appointment_time) : hookNow;
await supabase.from("events").insert({
  business_slug: slug,
  event_type: "sms_sent",
  channel: "sms",
  sent_at: hookNow.toISOString(),
  appointment_hour: apptDate.getHours(),
  appointment_day: apptDate.getDay(),
  service_type: service || null,
  message: `Webhook: ${service || "appointment"} for ${customer_name}`,
  created_at: hookNow.toISOString()
});

    console.log(`Webhook SMS sent for ${slug} to ${normalisedPhone}`);
    res.json({ success: true, message });

  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).json({ error: "Could not send review request. Please check your webhook configuration." });
  }
});

// ─── INVOICE HOOK: Paid invoice → QR code email ────────────────────────────
app.post("/api/invoice-hook/:slug", async (req, res) => {
  const { slug } = req.params;
  const { customer_name, customer_email, invoice_number, total_amount, status } = req.body;

  if (!customer_email || !customer_name) {
    return res.status(400).json({ error: "customer_name and customer_email are required" });
  }

  // Only process paid invoices
  if (!status || (status.toLowerCase() !== "paid")) {
    return res.status(200).json({ skipped: true, reason: "Not a paid invoice" });
  }

  try {
    const { data: business, error } = await supabase
      .from("businesses")
      .select("name, review_link, plan_type, subscription_active")
      .eq("slug", slug)
      .single();

    if (error || !business) return res.status(404).json({ error: "Business not found" });
    
    const isProOrAgency = business.subscription_active && 
      (business.plan_type === "pro" || business.plan_type === "agency");
    if (!isProOrAgency) {
      return res.status(403).json({ error: "Pro or Agency plan required" });
    }

    // Generate QR code
    const qrBuffer = await QRCode.toBuffer(business.review_link);
    const qrBase64 = qrBuffer.toString('base64');

    // Send email via Resend
    await resend.emails.send({
      from: `Reviews <reviews@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
      to: customer_email,
      subject: `Thank you for your payment, ${customer_name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
        <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,Helvetica,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A18;padding:32px 16px;">
            <tr><td align="center">
              <table width="500" cellpadding="0" cellspacing="0" style="background:#242422;border-radius:12px;overflow:hidden;max-width:500px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,0.4);">
                <tr><td style="background:#1E1E1C;padding:22px 28px;">
                  <p style="margin:0;font-size:16px;font-weight:bold;color:#C8A96E;">⭐ ${business.name}</p>
                </td></tr>
                <tr><td style="padding:32px 28px 24px;">
                  <h2 style="margin:0 0 10px;font-size:18px;color:#EAE7DC;">Thank you, ${customer_name}.</h2>
                  <p style="margin:0 0 16px;font-size:14px;color:rgba(234,231,220,0.55);line-height:1.6;">We've received your payment${invoice_number ? ' for invoice ' + invoice_number : ''}${total_amount ? ' (' + total_amount + ')' : ''}. We really appreciate your business.</p>
                  <p style="margin:0 0 8px;font-size:13px;color:rgba(234,231,220,0.4);">If we did a great job, we'd love a quick review — it only takes 30 seconds and helps us loads.</p>
                  <div style="text-align:center;margin:20px 0;">
                    <img src="data:image/png;base64,${qrBase64}" alt="QR Code" style="width:120px;height:120px;border-radius:8px;">
                    <p style="margin:8px 0 0;font-size:11px;color:rgba(234,231,220,0.3);">Scan or click below</p>
                  </div>
                  <a href="${business.review_link}" style="display:block;background:#C8A96E;color:#1E1E1C;text-align:center;text-decoration:none;font-weight:bold;font-size:14px;padding:12px;border-radius:8px;">Leave a review →</a>
                </td></tr>
                <tr><td style="padding:16px 28px 20px;border-top:1px solid rgba(234,231,220,0.06);">
                  <p style="margin:0;font-size:11px;color:rgba(234,231,220,0.2);">Sent by ${business.name} · Powered by ReviewLift</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });

    // Log event
    await supabase.from("events").insert({
      business_slug: slug,
      event_type: "invoice_email_sent",
      message: `Invoice ${invoice_number || 'N/A'} for ${customer_name}`,
      created_at: new Date().toISOString()
    });

    console.log(`Invoice email sent for ${slug} to ${customer_email}`);
    res.json({ success: true });

  } catch (err) {
    console.error("Invoice hook error:", err.message);
    res.status(500).json({ error: "Could not send invoice email." });
  }
});

// ─── SENTIMENT TRENDS (Pro/Agency only) ─────────────────────────────────────
app.get("/sentiment/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });
  
  const { data: business } = await supabase
    .from("businesses")
    .select("plan_type, subscription_active")
    .eq("slug", req.params.slug)
    .single();
    
  if (!business) return res.status(404).json({ error: "Business not found" });
  
  const isProOrAgency = business.subscription_active && 
    (business.plan_type === "pro" || business.plan_type === "agency");
    
  if (!isProOrAgency) {
    return res.status(403).json({ error: "Pro or Agency plan required for AI insights." });
  }
  
  // Get last 30 days of negative feedback
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data: feedback } = await supabase
    .from("events")
    .select("message, created_at")
    .eq("business_slug", req.params.slug)
    .eq("event_type", "negative")
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: false });
  
  const messages = (feedback || []).map(f => f.message).filter(Boolean);
  
  res.json({ 
    count: messages.length,
    messages: messages 
  });
});

// ─── UPDATE AGENCY SETTINGS ──────────────────────────────────────────────────
app.post("/update-agency-settings", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });
  const { agency_name, agency_logo_url } = req.body;
  const { error } = await supabase
    .from("businesses")
    .update({ agency_name: agency_name || null, agency_logo_url: agency_logo_url || null })
    .eq("slug", req.session.slug);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─── MONTHLY REPORT (Agency only) ────────────────────────────────────────────
const PDFDocument = require('pdfkit');

app.get("/report/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });
  
  const { data: business } = await supabase.from("businesses")
    .select("name, plan_type, subscription_active, agency_name, agency_logo_url, industry")
    .eq("slug", req.params.slug).single();
    
  if (!business || business.plan_type !== "agency") {
    return res.status(403).json({ error: "Agency plan required" });
  }
  
  const now = new Date();
  const monthLabel = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  
  const { data: events } = await supabase.from("events")
    .select("event_type, rating, message, created_at")
    .eq("business_slug", req.params.slug)
    .order("created_at", { ascending: false });
    
  const thisMonthEvents = (events || []).filter(e => e.created_at >= monthStart);
  const lastMonthEvents = (events || []).filter(e => e.created_at >= lastMonthStart && e.created_at < monthStart);
  
  const thisPos = thisMonthEvents.filter(e => e.event_type === "positive").length;
  const thisNeg = thisMonthEvents.filter(e => e.event_type === "negative").length;
  const thisClicks = thisMonthEvents.filter(e => e.event_type === "review_click").length;
  const lastPos = lastMonthEvents.filter(e => e.event_type === "positive").length;
  const lastNeg = lastMonthEvents.filter(e => e.event_type === "negative").length;
  const totalVisits = (events || []).filter(e => e.event_type === "visit").length;
  
  const ratings = thisMonthEvents.filter(e => e.rating).map(e => e.rating);
  const avgRating = ratings.length ? (ratings.reduce((a,b) => a+b, 0) / ratings.length).toFixed(1) : "N/A";
  
  const recentFeedback = thisMonthEvents.filter(e => e.event_type === "negative" && e.message).slice(0, 4);
  
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=${(business.agency_name || business.name).replace(/\s/g, '-')}-Report-${now.toISOString().slice(0,7)}.pdf`);
  doc.pipe(res);
  
  const brandName = business.agency_name || business.name;
  const industry = business.industry || "local business";
  
  // ── HEADER ──
  doc.rect(0, 0, doc.page.width, 120).fill("#121210");
  // Gold accent line
  doc.rect(0, 0, doc.page.width, 4).fill("#C8A96E");
  
  doc.fill("#C8A96E").fontSize(26).font('Helvetica-Bold').text(brandName, 50, 25);
  doc.fill("#EAE7DC").fontSize(13).font('Helvetica').text("Monthly Reputation Report", 50, 56);
  doc.fill("rgba(234,231,220,0.45)").fontSize(9).font('Helvetica').text(`${monthLabel}  ·  ${industry.charAt(0).toUpperCase() + industry.slice(1)}  ·  Confidential`, 50, 76);
  
  // ── METRICS GRID ──
  const cardW = 145, cardH = 78, startX = 50, startY = 145, gap = 12;
  
  const metrics = [
    { value: String(thisPos), label: "Reviews collected", sub: "this month", color: "#C8A96E" },
    { value: String(thisNeg), label: "Feedback captured", sub: "kept private", color: "#D4897C" },
    { value: avgRating, label: "Average rating", sub: "this month", color: "#EAE7DC" },
    { value: String(thisClicks), label: "Review clicks", sub: "sent to Google", color: "#6A9E7F" },
    { value: String(totalVisits), label: "Total visits", sub: "all time", color: "#EAE7DC" },
    { value: (() => { const c = thisPos - lastPos; return c >= 0 ? '+' + c : String(c); })(), label: "vs last month", sub: `was ${lastPos} reviews`, color: thisPos >= lastPos ? "#6A9E7F" : "#D4897C" }
  ];
  
  metrics.forEach((m, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = startX + (col * (cardW + gap));
    const y = startY + (row * (cardH + gap));
    
    // Card background — darker for readability
    doc.rect(x, y, cardW, cardH).fill("#1E1E1C");
    // Subtle border
    doc.rect(x, y, cardW, cardH).stroke("rgba(200,169,110,0.15)");
    
    doc.fill(m.color).fontSize(26).font('Helvetica-Bold').text(m.value, x + 14, y + 10);
    doc.fill("#CCCCCC").fontSize(8.5).font('Helvetica').text(m.label, x + 14, y + 42);
    doc.fill("#888888").fontSize(7).font('Helvetica').text(m.sub, x + 14, y + 56);
  });
  
  // ── RECENT FEEDBACK ──
  const feedbackY = startY + (2 * (cardH + gap)) + 30;
  doc.fill("#C8A96E").fontSize(11).font('Helvetica-Bold').text("RECENT FEEDBACK", 50, feedbackY);
  doc.moveTo(50, feedbackY + 18).lineTo(545, feedbackY + 18).stroke("rgba(200,169,110,0.2)");
  
  if (recentFeedback.length > 0) {
    let yPos = feedbackY + 35;
    recentFeedback.forEach((f, i) => {
      // Card for each feedback
      doc.rect(50, yPos - 4, 495, 38).fill("#1E1E1C").stroke("rgba(234,231,220,0.06)");
      doc.fill("#BBBBBB").fontSize(8.5).font('Helvetica').text(`"${f.message.substring(0, 150)}${f.message.length > 150 ? '...' : ''}"`, 62, yPos + 3, { width: 470 });
      yPos += 46;
    });
  } else {
    doc.fill("#888888").fontSize(9).font('Helvetica').text("No private feedback captured this month.", 50, feedbackY + 35);
  }
  
  // ── WHAT THIS MEANS ──
  const insightY = feedbackY + (recentFeedback.length > 0 ? recentFeedback.length * 46 + 40 : 80);
  
  doc.fill("#C8A96E").fontSize(11).font('Helvetica-Bold').text("SUMMARY", 50, insightY);
  doc.moveTo(50, insightY + 18).lineTo(545, insightY + 18).stroke("rgba(200,169,110,0.2)");
  
  let summaryText = `This month, ${brandName} collected ${thisPos} review${thisPos !== 1 ? 's' : ''}`;
  if (thisNeg > 0) summaryText += ` and captured ${thisNeg} private feedback message${thisNeg !== 1 ? 's' : ''} before ${thisNeg === 1 ? 'it went' : 'they went'} public`;
  summaryText += `. Total funnel visits: ${totalVisits}.`;
  if (thisPos > 0 && thisClicks > 0) summaryText += ` ${thisClicks} customer${thisClicks !== 1 ? 's' : ''} clicked through to leave a review.`;
  
  doc.fill("#AAAAAA").fontSize(9).font('Helvetica').text(summaryText, 50, insightY + 30, { width: 495 });
  
  // ── FOOTER ──
  doc.fill("#666666").fontSize(7).font('Helvetica')
    .text(`Generated by ReviewLift  ·  ${now.toLocaleDateString('en-GB')}  ·  For internal use`, 50, doc.page.height - 40, { align: "center" });
  
  doc.end();
});

// ─── COMPETITOR ANALYSIS (Agency only) ──────────────────────────────────────
app.post("/analyse-competitor", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });
  
  const { data: business } = await supabase.from("businesses")
    .select("plan_type, subscription_active")
    .eq("slug", req.session.slug).single();
    
  if (!business || business.plan_type !== "agency") {
    return res.status(403).json({ error: "Agency plan required. Upgrade at /billing" });
  }
  
  const { competitor_name, reviews_text } = req.body;
  if (!reviews_text || reviews_text.trim().length < 50) {
    return res.status(400).json({ error: "Please paste at least a few reviews to analyse." });
  }
  
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a competitive intelligence analyst for a small business. Analyse these customer reviews for a competitor${competitor_name ? ' called ' + competitor_name : ''}. Identify: 1) What customers love about them (top 2 strengths). 2) What customers complain about (top 2 weaknesses). 3) One specific, actionable opportunity for our client to win customers from them. Return JSON only: { "strengths": ["...","..."], "weaknesses": ["...","..."], "opportunity": "..." }`
        },
        {
          role: "user",
          content: reviews_text.substring(0, 3000)
        }
      ],
      temperature: 0.7,
      max_tokens: 400
    });
    
    const content = completion.choices[0].message.content.trim();
    let parsed;
    try {
      const cleaned = content.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch(e) {
      parsed = { strengths: ["Could not parse"], weaknesses: ["Could not parse"], opportunity: "Try again with more review text." };
    }
    
    res.json(parsed);
  } catch(err) {
    console.error("Competitor analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed. Please try again." });
  }
});

// ─── PUBLIC MILESTONE PAGE ─────────────────────────────────────────
app.get("/milestone/:slug/:number", async (req, res) => {
  const { slug, number } = req.params;
  const milestoneNum = parseInt(number);
  
  // Validate milestone number
  const validMilestones = [10, 25, 50, 100, 250, 500];
  if (!validMilestones.includes(milestoneNum)) {
    return res.status(404).send("Milestone not found");
  }
  
  // Get business data (including agency info)
  const { data: business } = await supabase
    .from("businesses")
    .select("name, review_link, agency_name, agency_logo_url")
    .eq("slug", slug)
    .single();
    
  if (!business) {
    return res.status(404).send("Business not found");
  }
  
  // Check if this is an agency account with white-label enabled
  const isWhiteLabel = business.agency_name && business.agency_name.trim().length > 0;
  const displayName = isWhiteLabel ? business.agency_name : business.name;
  const footerBrand = isWhiteLabel ? business.agency_name : "ReviewLift";
  const footerLink = isWhiteLabel ? `${process.env.BASE_URL}?ref=${slug}` : process.env.BASE_URL;
  const reviewLink = business.review_link || `${process.env.BASE_URL}/r/${slug}`;
  
  // Increment view count (optional)
  await supabase
    .from("businesses")
    .update({ milestone_page_views: supabase.sql`milestone_page_views + 1` })
    .eq("slug", slug);
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${displayName} — ${milestoneNum} ⭐ Reviews</title>
      <meta property="og:title" content="${displayName} — ${milestoneNum} Google Reviews">
      <meta property="og:description" content="${displayName} has collected ${milestoneNum} 5-star reviews from happy customers.${isWhiteLabel ? '' : ' Powered by ReviewLift.'}">
      <meta property="og:image" content="${process.env.BASE_URL}/milestone-preview/${slug}/${milestoneNum}">
      <meta property="og:url" content="${process.env.BASE_URL}/milestone/${slug}/${milestoneNum}">
      <meta property="og:type" content="website">
      <meta name="twitter:card" content="summary_large_image">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: #1A1A18;
          color: #EAE7DC;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .container {
          max-width: 560px;
          width: 100%;
          text-align: center;
        }
        .card {
          background: #242422;
          border: 1px solid rgba(200,169,110,0.25);
          border-radius: 24px;
          padding: 48px 32px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        }
        .milestone-number {
          font-family: 'Syne', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 5rem;
          font-weight: 800;
          color: #C8A96E;
          line-height: 1;
          margin-bottom: 8px;
        }
        .milestone-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 3px;
          color: rgba(234,231,220,0.45);
          margin-bottom: 24px;
        }
        .business-name {
          font-family: 'Syne', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 1.6rem;
          font-weight: 700;
          margin-bottom: 16px;
        }
        .stars {
          font-size: 2rem;
          letter-spacing: 8px;
          color: #C8A96E;
          margin: 24px 0;
        }
        .message {
          font-size: 1rem;
          color: rgba(234,231,220,0.65);
          line-height: 1.7;
          margin: 24px 0;
        }
        .btn {
          display: inline-block;
          background: #C8A96E;
          color: #1A1A18;
          text-decoration: none;
          font-weight: 700;
          font-size: 1rem;
          padding: 14px 32px;
          border-radius: 40px;
          margin-top: 16px;
          transition: transform 0.2s, background 0.2s;
        }
        .btn:hover {
          background: #D4B87A;
          transform: translateY(-2px);
        }
        .footer {
          margin-top: 24px;
          font-size: 0.7rem;
          color: rgba(234,231,220,0.25);
        }
        .footer a {
          color: #C8A96E;
          text-decoration: none;
        }
        @media (max-width: 500px) {
          .card { padding: 32px 20px; }
          .milestone-number { font-size: 3.5rem; }
          .business-name { font-size: 1.3rem; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="milestone-number">${milestoneNum}</div>
          <div class="milestone-label">⭐ GOOGLE REVIEWS ⭐</div>
          <div class="business-name">${escapeHtml(displayName)}</div>
          <div class="stars">★★★★★</div>
          <div class="message">
            ${milestoneNum === 10 ? "Our first big milestone! Thanks to everyone who took a moment to share their experience." :
              milestoneNum === 25 ? "Twenty-five happy customers and counting. Your feedback means the world to us." :
              milestoneNum === 50 ? "50 reviews! Every single one helps us serve you better. Thank you." :
              milestoneNum === 100 ? "Triple digits! A hundred thank-yous to our amazing community." :
              milestoneNum === 250 ? "A quarter of a thousand reviews. We're humbled by your trust." :
              "500 reviews! Half a thousand happy customers. We couldn't do it without you."}
          </div>
          <a href="${reviewLink}" class="btn">Leave a review →</a>
        </div>
        <div class="footer">
          Powered by <a href="${footerLink}">${escapeHtml(footerBrand)}</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ─── NFC CARD ORDER ──────────────────────────────────────────────────────

// Create checkout for NFC card (one-time payment)
app.post("/create-nfc-checkout", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not logged in" });
  
  const { shipping_address } = req.body;
  const slug = req.session.slug;
  
  if (!shipping_address || shipping_address.trim().length < 10) {
    return res.status(400).json({ error: "Please enter a full shipping address" });
  }
  
  const priceId = process.env.NFC_CARD_PRICE_ID;
  if (!priceId) {
    console.error("Missing NFC_CARD_PRICE_ID env var");
    return res.status(500).json({ error: "Pricing configuration error" });
  }
  
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      success_url: `${process.env.BASE_URL}/nfc-success?slug=${slug}`,
      cancel_url: `${process.env.BASE_URL}/for-business`,
      metadata: { 
        slug: slug,
        shipping_address: shipping_address,
        product: "nfc_card"
      },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("NFC checkout error:", err.message);
    res.status(500).json({ error: "Could not create checkout" });
  }
});

// NFC success page (after payment)
app.get("/nfc-success", async (req, res) => {
  const { slug } = req.query;
  
  if (!slug) {
    return res.redirect("/for-business");
  }
  
  // Mark that card was ordered in database
  await supabase
    .from("businesses")
    .update({ 
      nfc_card_ordered: true,
      nfc_card_order_date: new Date().toISOString()
    })
    .eq("slug", slug);
  
  // Send email notification to you (billy@reviewlift.app)
  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("name, shipping_address, email")
      .eq("slug", slug)
      .single();
    
    await resend.emails.send({
      from: `ReviewLift Orders <orders@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
      to: "billy@reviewlift.app",
      subject: `📦 New NFC Card Order — ${business?.name || slug}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;padding:24px;">
          <h2 style="color:#C8A96E;">📦 New NFC Card Order</h2>
          <p><strong>Business:</strong> ${business?.name || slug}</p>
          <p><strong>Slug:</strong> ${slug}</p>
          <p><strong>Business email:</strong> ${business?.email || "Not found"}</p>
          <p><strong>Shipping address:</strong></p>
          <div style="background:#f5f5f3;padding:16px;border-radius:8px;margin:12px 0;white-space:pre-line;">${business?.shipping_address || "Not saved"}</div>
          <p><strong>Order date:</strong> ${new Date().toLocaleString()}</p>
          <hr style="margin:20px 0;">
          <h3>📋 Action items:</h3>
          <ol style="margin-left:20px;">
            <li>Order 1x NFC card from GoToTags or Seritag (50p-£1)</li>
            <li>Program URL: https://www.reviewlift.app/r/${slug}</li>
            <li>Post in padded envelope to the address above</li>
            <li>Update order status in dashboard admin panel</li>
          </ol>
          <p style="margin-top:20px;color:#666;">You've made £9.99 - cost ~£2 = ~£8 profit</p>
        </div>
      `
    });
  } catch (emailErr) {
    console.error("NFC order notification email failed:", emailErr.message);
  }
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>NFC Card Ordered — ReviewLift</title>
      <link rel="stylesheet" href="/style.css">
      <style>
        body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
        .container { max-width: 480px; text-align: center; }
        .icon { font-size: 3rem; display: block; margin-bottom: 20px; }
        h2 { margin-bottom: 8px; }
        p { color: var(--cream-dim); margin-bottom: 24px; }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 40px; }
        .btn { display: inline-block; background: var(--accent); color: #1A1A18; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <span class="icon">📦</span>
          <h2>NFC Card Ordered!</h2>
          <p>Your tap-to-review card will be shipped within 2 business days.<br><br>You'll receive an email with tracking information once it's on its way.</p>
          <a href="/for-business" class="btn">Back to Dashboard →</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Update shipping address (for existing orders or corrections)
app.post("/update-shipping-address", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not logged in" });
  
  const { shipping_address } = req.body;
  const slug = req.session.slug;
  
  if (!shipping_address || shipping_address.trim().length < 10) {
    return res.status(400).json({ error: "Please enter a full shipping address" });
  }
  
  const { error } = await supabase
    .from("businesses")
    .update({ shipping_address: shipping_address.trim() })
    .eq("slug", slug);
    
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  res.json({ success: true });
});

// Admin: Mark card as shipped (add tracking)
app.post("/admin/mark-card-shipped", async (req, res) => {
  // Simple admin key check (you can make this more secure)
  const { admin_key, slug, tracking_number } = req.body;
  
  if (admin_key !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const { error } = await supabase
    .from("businesses")
    .update({ nfc_card_tracking_number: tracking_number })
    .eq("slug", slug);
    
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  // Send shipping confirmation email to business owner
  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("name, email")
      .eq("slug", slug)
      .single();
      
    if (business && business.email) {
      await resend.emails.send({
        from: `ReviewLift <reviews@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
        to: business.email,
        subject: `📮 Your ReviewLift NFC card is on its way!`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;">
            <h2 style="color:#C8A96E;">Your tap-to-review card has shipped!</h2>
            <p>Good news — your ReviewLift NFC card is on its way to you.</p>
            ${tracking_number ? `<p><strong>Tracking number:</strong> ${tracking_number}</p>` : ''}
            <p>Once it arrives, simply place it on your counter or reception desk. Customers tap it with their phone and they're guided to leave a review.</p>
            <div style="background:#f5f5f3;padding:16px;border-radius:8px;margin:20px 0;">
              <p style="margin:0;font-size:0.85rem;">💡 <strong>Pro tip:</strong> Pair your NFC card with the QR code on your dashboard for maximum review collection.</p>
            </div>
            <a href="${process.env.BASE_URL}/for-business" style="display:inline-block;background:#C8A96E;color:#1A1A18;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Go to Dashboard</a>
          </div>
        `
      });
    }
  } catch (emailErr) {
    console.error("Shipping notification email failed:", emailErr.message);
  }
  
  res.json({ success: true });
});

// ─── PUBLIC REVIEW WALL ─────────────────────────────────────────────
app.get("/wall/:slug", async (req, res) => {
  const { slug } = req.params;
  
  // Get business data (including agency info)
  const { data: business } = await supabase
    .from("businesses")
    .select("name, agency_name, agency_logo_url")
    .eq("slug", slug)
    .single();
    
  if (!business) {
    return res.status(404).send("Business not found");
  }
  
  // Check if this is an agency account with white-label enabled
  const isWhiteLabel = business.agency_name && business.agency_name.trim().length > 0;
  const displayName = isWhiteLabel ? business.agency_name : business.name;
  const footerBrand = isWhiteLabel ? business.agency_name : "ReviewLift";
  const footerLink = isWhiteLabel ? `${process.env.BASE_URL}?ref=${slug}` : process.env.BASE_URL;
  
  // Get positive events with messages
  const { data: events } = await supabase
    .from("events")
    .select("message, created_at")
    .eq("business_slug", slug)
    .eq("event_type", "positive")
    .not("message", "is", null)
    .gt("message", "")
    .order("created_at", { ascending: false });
  
  // Filter messages with at least 10 characters
  const reviews = (events || [])
    .filter(e => e.message && e.message.trim().length >= 10)
    .map(e => ({
      message: e.message.trim(),
      date: e.created_at,
      relativeDate: getRelativeDate(e.created_at)
    }));
  
  // Get stats
  const { count: totalPositive } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("business_slug", slug)
    .eq("event_type", "positive");
  
  // Calculate average rating from rating events
  const { data: ratings } = await supabase
    .from("events")
    .select("rating")
    .eq("business_slug", slug)
    .eq("event_type", "rating")
    .not("rating", "is", null);
    
  let avgRating = 0;
  if (ratings && ratings.length > 0) {
    const sum = ratings.reduce((a, b) => a + (b.rating || 0), 0);
    avgRating = (sum / ratings.length).toFixed(1);
  }
  
  const hasReviews = reviews.length >= 3;
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${displayName} — Customer Reviews</title>
      <meta property="og:title" content="${displayName} — What our customers say">
      <meta property="og:description" content="★ ${avgRating} average from ${totalPositive} real customer reviews">
      <meta property="og:image" content="${process.env.BASE_URL}/wall-preview/${slug}">
      <meta property="og:url" content="${process.env.BASE_URL}/wall/${slug}">
      <meta property="og:type" content="website">
      <meta name="twitter:card" content="summary_large_image">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: #1A1A18;
          color: #EAE7DC;
          line-height: 1.6;
        }
        .container {
          max-width: 1100px;
          margin: 0 auto;
          padding: 60px 24px;
        }
        .header {
          text-align: center;
          margin-bottom: 48px;
        }
        .business-name {
          font-family: 'Syne', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 2.5rem;
          font-weight: 800;
          margin-bottom: 8px;
        }
        .rating-summary {
          font-size: 1.1rem;
          color: #C8A96E;
          margin-top: 8px;
        }
        .stars {
          font-size: 1.2rem;
          letter-spacing: 4px;
          color: #C8A96E;
        }
        .review-grid {
          column-count: 2;
          column-gap: 24px;
        }
        .review-card {
          background: #242422;
          border: 1px solid rgba(200,169,110,0.15);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
          break-inside: avoid;
          transition: transform 0.2s, border-color 0.2s;
        }
        .review-card:hover {
          border-color: rgba(200,169,110,0.35);
        }
        .review-stars {
          font-size: 0.9rem;
          letter-spacing: 3px;
          color: #C8A96E;
          margin-bottom: 12px;
        }
        .review-message {
          font-size: 0.95rem;
          color: rgba(234,231,220,0.8);
          line-height: 1.6;
          margin-bottom: 12px;
        }
        .review-date {
          font-size: 0.7rem;
          color: rgba(234,231,220,0.35);
        }
        .placeholder {
          text-align: center;
          padding: 60px 20px;
          background: #242422;
          border-radius: 16px;
          border: 1px solid rgba(200,169,110,0.15);
        }
        .placeholder-icon {
          font-size: 3rem;
          margin-bottom: 16px;
        }
        .placeholder p {
          color: rgba(234,231,220,0.45);
        }
        .footer {
          text-align: center;
          margin-top: 48px;
          padding-top: 24px;
          border-top: 1px solid rgba(200,169,110,0.1);
          font-size: 0.75rem;
          color: rgba(234,231,220,0.3);
        }
        .footer a {
          color: #C8A96E;
          text-decoration: none;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .review-card {
          animation: fadeIn 0.5s ease forwards;
          opacity: 0;
        }
        @media (max-width: 700px) {
          .review-grid { column-count: 1; }
          .business-name { font-size: 1.8rem; }
          .container { padding: 40px 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="business-name">${escapeHtml(displayName)}</div>
          <div class="rating-summary">
            <span class="stars">★★★★★</span> ★ ${avgRating} · ${totalPositive} happy customers
          </div>
        </div>
        
        <div class="review-grid" id="reviewGrid">
          ${hasReviews ? reviews.map((review, i) => `
            <div class="review-card" style="animation-delay: ${i * 0.03}s">
              <div class="review-stars">★★★★★</div>
              <div class="review-message">"${escapeHtml(review.message)}"</div>
              <div class="review-date">${review.relativeDate}</div>
            </div>
          `).join('') : `
            <div class="placeholder">
              <div class="placeholder-icon">💬</div>
              <p>Reviews will appear here as customers leave feedback.</p>
              <p style="font-size:0.8rem;margin-top:8px;">Be the first to leave a review!</p>
            </div>
          `}
        </div>
        
        <div class="footer">
          Powered by <a href="${footerLink}">${escapeHtml(footerBrand)}</a> — Collect more reviews for your business
        </div>
      </div>
      
      <script>
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.style.opacity = '1';
            }
          });
        }, { threshold: 0.1 });
        document.querySelectorAll('.review-card').forEach(card => observer.observe(card));
      </script>
    </body>
    </html>
  `);
});
// Helper function for relative dates
function getRelativeDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── REVIEW WALL PREVIEW IMAGE (for social sharing) ─────────────────
app.get("/wall-preview/:slug", async (req, res) => {
  const { slug } = req.params;
  
  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("slug", slug)
    .single();
    
  const businessName = business?.name || "Our customers";
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0;background:#1A1A18;display:flex;align-items:center;justify-content:center;width:1200px;height:630px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="text-align:center;padding:40px;">
        <div style="font-size:0.8rem;letter-spacing:3px;color:#C8A96E;">CUSTOMER REVIEWS</div>
        <div style="font-size:2rem;font-weight:800;color:#EAE7DC;margin:20px 0;">${businessName}</div>
        <div style="font-size:1.5rem;letter-spacing:5px;color:#C8A96E;margin:20px 0;">★★★★★</div>
        <div style="font-size:0.9rem;color:rgba(234,231,220,0.45);">Real feedback from real customers</div>
        <div style="font-size:0.7rem;color:rgba(234,231,220,0.25);margin-top:30px;">Powered by ReviewLift</div>
      </div>
    </body>
    </html>
  `);
});


// ─── MILESTONE PREVIEW IMAGE (HTML-based, works everywhere) ───────────────────
app.get("/milestone-preview/:slug/:number", async (req, res) => {
  const { slug, number } = req.params;
  const milestoneNum = parseInt(number);
  
  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("slug", slug)
    .single();
    
  const businessName = business?.name || "Our Business";
  
  // Return an HTML page that looks like an image (works as og:image)
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          margin: 0;
          background: #1A1A18;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1200px;
          height: 630px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .container {
          text-align: center;
          padding: 40px;
          width: 100%;
        }
        .milestone {
          font-family: 'Syne', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 120px;
          font-weight: 800;
          color: #C8A96E;
          line-height: 1;
          margin-bottom: 16px;
        }
        .label {
          font-size: 14px;
          letter-spacing: 4px;
          color: rgba(234,231,220,0.45);
          margin-bottom: 24px;
        }
        .business {
          font-family: 'Syne', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 36px;
          font-weight: 700;
          color: #EAE7DC;
          margin-bottom: 24px;
        }
        .stars {
          font-size: 28px;
          letter-spacing: 8px;
          color: #C8A96E;
          margin: 24px 0;
        }
        .powered {
          font-size: 12px;
          color: rgba(234,231,220,0.25);
          margin-top: 40px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="milestone">${milestoneNum}</div>
        <div class="label">⭐ GOOGLE REVIEWS ⭐</div>
        <div class="business">${escapeHtml(businessName)}</div>
        <div class="stars">★★★★★</div>
        <div class="powered">Powered by ReviewLift</div>
      </div>
    </body>
    </html>
  `);
});

// Keep the original /milestone-image route as a fallback (just redirect)
app.get("/milestone-image/:slug/:number", async (req, res) => {
  res.redirect(`/milestone-preview/${req.params.slug}/${req.params.number}`);
});

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── REPUTATION SCORE ───────────────────────────────────────────────────────
app.get("/reputation/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });
  
  const slug = req.params.slug;
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: events } = await supabase
    .from("events")
    .select("event_type, rating, created_at")
    .eq("business_slug", slug);
    
  if (!events || events.length === 0) {
    // Get last month's score if available
    const { data: lastScore } = await supabase
      .from("reputation_scores")
      .select("score")
      .eq("business_slug", slug)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .single();
      
    return res.json({ 
      score: 0, 
      last_month_score: lastScore?.score || null,
      breakdown: { rating: 0, velocity: 0, feedback: 25, activity: 0 },
      message: "Not enough data yet. Start collecting reviews to build your score."
    });
  }
  
  // 1. Average star rating (40 points)
  const ratings = events.filter(e => e.rating).map(e => e.rating);
  const avgRating = ratings.length ? ratings.reduce((a,b) => a + b, 0) / ratings.length : 0;
  const ratingScore = Math.round((avgRating / 5) * 40);
  
  // 2. Review velocity (20 points)
  const thisMonthPos = events.filter(e => e.event_type === "positive" && e.created_at >= thisMonthStart).length;
  const lastMonthPos = events.filter(e => e.event_type === "positive" && e.created_at >= lastMonthStart && e.created_at < thisMonthStart).length;
  let velocityScore = 0;
  if (lastMonthPos === 0 && thisMonthPos > 0) velocityScore = 20;
  else if (lastMonthPos === 0 && thisMonthPos === 0) velocityScore = 10;
  else if (thisMonthPos >= lastMonthPos) velocityScore = 20;
  else if (thisMonthPos >= lastMonthPos * 0.5) velocityScore = 10;
  else velocityScore = 0;
  
  // 3. Negative feedback ratio (25 points)
  const totalVisits = events.filter(e => e.event_type === "visit").length || 1;
  const negativeEvents = events.filter(e => e.event_type === "negative").length;
  const ratio = negativeEvents / totalVisits;
  let feedbackScore = 25;
  if (ratio > 0.15) feedbackScore = 5;
  else if (ratio > 0.05) feedbackScore = 15;
  
  // 4. Response activity (15 points)
  const recentActivity = events.filter(e => 
    (e.event_type === "sms_sent" || e.event_type === "invoice_email_sent") && 
    e.created_at >= thirtyDaysAgo
  ).length;
  let activityScore = 0;
  if (recentActivity >= 10) activityScore = 15;
  else if (recentActivity >= 1) activityScore = 8;
  
  const totalScore = ratingScore + velocityScore + feedbackScore + activityScore;
  
  // Get last month's score
  const { data: lastScore } = await supabase
    .from("reputation_scores")
    .select("score")
    .eq("business_slug", slug)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .single();
  
  res.json({
    score: totalScore,
    last_month_score: lastScore?.score || null,
    breakdown: {
      rating: ratingScore,
      velocity: velocityScore,
      feedback: feedbackScore,
      activity: activityScore
    }
  });
});

// ─── CRON: Snapshot reputation scores monthly ───────────────────────────────
app.get("/cron/reputation-scores", async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const { data: businesses } = await supabase
    .from("businesses")
    .select("slug")
    .eq("subscription_active", true);
    
  if (!businesses) return res.json({ saved: 0 });
  
  let count = 0;
  for (const biz of businesses) {
    // Replicate the scoring logic (simplified for cron)
    const { data: events } = await supabase
      .from("events")
      .select("event_type, rating, created_at")
      .eq("business_slug", biz.slug);
      
    if (!events || events.length === 0) continue;
    
    const ratings = events.filter(e => e.rating).map(e => e.rating);
    const avgRating = ratings.length ? ratings.reduce((a,b) => a + b, 0) / ratings.length : 0;
    const ratingScore = Math.round((avgRating / 5) * 40);
    
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    
    const thisMonthPos = events.filter(e => e.event_type === "positive" && e.created_at >= thisMonthStart).length;
    const lastMonthPos = events.filter(e => e.event_type === "positive" && e.created_at >= lastMonthStart && e.created_at < thisMonthStart).length;
    let velocityScore = lastMonthPos === 0 && thisMonthPos > 0 ? 20 : lastMonthPos === 0 ? 10 : thisMonthPos >= lastMonthPos ? 20 : thisMonthPos >= lastMonthPos * 0.5 ? 10 : 0;
    
    const totalVisits = events.filter(e => e.event_type === "visit").length || 1;
    const negativeEvents = events.filter(e => e.event_type === "negative").length;
    const ratio = negativeEvents / totalVisits;
    let feedbackScore = ratio > 0.15 ? 5 : ratio > 0.05 ? 15 : 25;
    
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentActivity = events.filter(e => (e.event_type === "sms_sent" || e.event_type === "invoice_email_sent") && e.created_at >= thirtyDaysAgo).length;
    let activityScore = recentActivity >= 10 ? 15 : recentActivity >= 1 ? 8 : 0;
    
    const totalScore = ratingScore + velocityScore + feedbackScore + activityScore;
    
    await supabase.from("reputation_scores").insert({
      business_slug: biz.slug,
      score: totalScore,
      breakdown: { rating: ratingScore, velocity: velocityScore, feedback: feedbackScore, activity: activityScore },
      recorded_at: new Date().toISOString()
    });
    count++;
  }
  
  res.json({ saved: count });
});

// ─── UPDATE FUNNEL SETTINGS ──────────────────────────────────────────────
app.post("/update-funnel", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });
  
  const {
    funnel_template,
    funnel_logo_url,
    funnel_accent_color,
    funnel_headline,
    funnel_happy_label,
    funnel_unhappy_label,
    funnel_thankyou_message,
    funnel_custom_domain,
    funnel_language
  } = req.body;
  
  const slug = req.session.slug;
  
  // Get business data to check plan
  const { data: business } = await supabase
    .from("businesses")
    .select("plan_type, subscription_active")
    .eq("slug", slug)
    .single();
    
  const isProOrAgency = business?.subscription_active && 
    (business?.plan_type === "pro" || business?.plan_type === "agency");
  const isAgency = business?.plan_type === "agency";
  
  // Language translation requires Pro/Agency
  if (funnel_language && funnel_language !== 'en' && !isProOrAgency) {
    return res.status(403).json({ error: "Language translation requires Pro or Agency plan" });
  }
  
  // Custom domain requires Agency
  if (funnel_custom_domain && !isAgency) {
    return res.status(403).json({ error: "Custom domains require Agency plan" });
  }
  
  // Prepare update object
  const updateData = {};
  if (funnel_template !== undefined) updateData.funnel_template = funnel_template;
  if (funnel_logo_url !== undefined) updateData.funnel_logo_url = funnel_logo_url;
  if (funnel_accent_color !== undefined) updateData.funnel_accent_color = funnel_accent_color;
  if (funnel_headline !== undefined) updateData.funnel_headline = funnel_headline;
  if (funnel_happy_label !== undefined) updateData.funnel_happy_label = funnel_happy_label;
  if (funnel_unhappy_label !== undefined) updateData.funnel_unhappy_label = funnel_unhappy_label;
  if (funnel_thankyou_message !== undefined) updateData.funnel_thankyou_message = funnel_thankyou_message;
  if (funnel_custom_domain !== undefined && isAgency) updateData.funnel_custom_domain = funnel_custom_domain;
  if (funnel_language !== undefined && isProOrAgency) updateData.funnel_language = funnel_language;
  
  // If language changed and not English, translate using OpenAI
  if (funnel_language && funnel_language !== 'en' && isProOrAgency) {
    const translation = await translateFunnelContent(
      funnel_headline || business?.name ? `How was your experience at ${business?.name}?` : null,
      funnel_happy_label || 'Great experience!',
      funnel_unhappy_label || 'Could be better',
      funnel_thankyou_message || null,
      funnel_language
    );
    
    if (translation) {
      updateData.funnel_translated_headline = translation.headline;
      updateData.funnel_translated_happy_label = translation.happy_label;
      updateData.funnel_translated_unhappy_label = translation.unhappy_label;
      updateData.funnel_translated_thankyou_message = translation.thankyou_message;
    }
  } else {
    // Clear translations if switching back to English
    updateData.funnel_translated_headline = null;
    updateData.funnel_translated_happy_label = null;
    updateData.funnel_translated_unhappy_label = null;
    updateData.funnel_translated_thankyou_message = null;
  }
  
  const { error } = await supabase
    .from("businesses")
    .update(updateData)
    .eq("slug", slug);
    
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  res.json({ success: true });
});

// Helper function for translation
async function translateFunnelContent(headline, happyLabel, unhappyLabel, thankyouMessage, targetLang) {
  const langNames = {
    'es': 'Spanish', 'fr': 'French', 'de': 'German', 'pl': 'Polish',
    'ur': 'Urdu', 'pa': 'Punjabi', 'ar': 'Arabic', 'it': 'Italian',
    'pt': 'Portuguese', 'nl': 'Dutch', 'tr': 'Turkish', 'ro': 'Romanian'
  };
  
  const langName = langNames[targetLang] || targetLang;
  
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a translator for a review funnel tool. Translate the following text into ${langName} (${targetLang}). Keep the tone natural and conversational. Return JSON only: { "headline": "...", "happy_label": "...", "unhappy_label": "...", "thankyou_message": "..." }`
        },
        {
          role: "user",
          content: JSON.stringify({
            headline: headline || "How was your experience?",
            happy_label: happyLabel,
            unhappy_label: unhappyLabel,
            thankyou_message: thankyouMessage || "Thank you for your feedback — it means a lot to us."
          })
        }
      ],
      temperature: 0.5,
      max_tokens: 300
    });
    
    const cleaned = completion.choices[0].message.content.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Translation error:", err.message);
    return null;
  }
}

// ─── CRON: Mark conversions for sent review requests ──────────────────────────
app.get("/cron/mark-conversions", async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  
  // Find all sends in last 48 hours that haven't been marked yet
  const { data: sends } = await supabase
    .from("events")
    .select("id, business_slug, sent_at")
    .in("event_type", ["sms_sent", "email_sent"])
    .is("converted", null)
    .gte("sent_at", fortyEightHoursAgo);
    
  if (!sends || sends.length === 0) return res.json({ marked: 0 });
  
  let count = 0;
  for (const send of sends) {
    const sentDate = new Date(send.sent_at);
    const cutoffDate = new Date(sentDate.getTime() + 48 * 60 * 60 * 1000).toISOString();
    const nowCheck = new Date();
    
    if (nowCheck > new Date(sentDate.getTime() + 48 * 60 * 60 * 1000)) {
      // 48 hours have passed — check if any response happened
      const { data: responses } = await supabase
        .from("events")
        .select("id")
        .eq("business_slug", send.business_slug)
        .in("event_type", ["positive", "negative"])
        .gte("created_at", send.sent_at)
        .lte("created_at", cutoffDate)
        .limit(1);
        
      await supabase.from("events")
        .update({ converted: responses && responses.length > 0 })
        .eq("id", send.id);
      count++;
    }
  }
  
  res.json({ marked: count });
});

// ─── AI CHANNEL PREDICTION ──────────────────────────────────────────────────
app.post("/predict-channel/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });
  
  const { appointment_hour, appointment_day, service_type } = req.body;
  const slug = req.params.slug;
  
  const { data: business } = await supabase
    .from("businesses")
    .select("plan_type, subscription_active, industry")
    .eq("slug", slug)
    .single();
    
  const isProOrAgency = business?.subscription_active && 
    (business?.plan_type === "pro" || business?.plan_type === "agency");
  if (!isProOrAgency) return res.status(403).json({ error: "Pro or Agency plan required" });
  
  // Get their actual send data
  const { data: sends } = await supabase
    .from("events")
    .select("channel, appointment_hour, appointment_day, service_type, converted")
    .in("event_type", ["sms_sent", "email_sent"])
    .eq("business_slug", slug)
    .not("converted", "is", null)
    .order("sent_at", { ascending: false })
    .limit(100);
    
  const sendCount = sends?.length || 0;
  
  // Industry benchmark defaults
  const industryDefaults = {
    'dentist': { bestChannel: 'sms', bestWindow: '10am-12pm, next day', smsRate: 22, emailRate: 8 },
    'plumber': { bestChannel: 'email', bestWindow: '8am-10am, next morning', smsRate: 18, emailRate: 14 },
    'electrician': { bestChannel: 'sms', bestWindow: '8am-10am, next day', smsRate: 20, emailRate: 10 },
    'salon': { bestChannel: 'sms', bestWindow: '2pm-4pm, same day', smsRate: 24, emailRate: 7 },
    'builder': { bestChannel: 'email', bestWindow: '2-3 days after completion', smsRate: 12, emailRate: 16 },
    'restaurant': { bestChannel: 'sms', bestWindow: '6pm-8pm, same evening', smsRate: 19, emailRate: 5 },
    'gym': { bestChannel: 'sms', bestWindow: '6pm-8pm, same day', smsRate: 21, emailRate: 9 },
    'cleaner': { bestChannel: 'sms', bestWindow: '10am-12pm, next day', smsRate: 20, emailRate: 8 },
    'accountant': { bestChannel: 'email', bestWindow: '2pm-4pm, next day', smsRate: 10, emailRate: 15 },
    'solicitor': { bestChannel: 'email', bestWindow: '10am-12pm, next day', smsRate: 8, emailRate: 14 },
    'estate-agent': { bestChannel: 'email', bestWindow: '2pm-4pm, next day', smsRate: 11, emailRate: 13 },
    'vet': { bestChannel: 'sms', bestWindow: '10am-12pm, next day', smsRate: 22, emailRate: 9 },
    'physio': { bestChannel: 'sms', bestWindow: '2pm-4pm, same day', smsRate: 21, emailRate: 10 },
    'other': { bestChannel: 'sms', bestWindow: '10am-2pm, next day', smsRate: 18, emailRate: 10 }
  };
  
  const defaults = industryDefaults[business?.industry] || industryDefaults['other'];
  
  if (sendCount < 20) {
    return res.json({
      recommendation: {
        recommended_channel: defaults.bestChannel,
        confidence: 'industry data',
        best_window: defaults.bestWindow,
        predicted_conversion_rate: defaults.bestChannel === 'sms' ? defaults.smsRate : defaults.emailRate
      },
      data_source: 'industry_benchmark',
      sends_analysed: sendCount,
      message: `AI analytics based on ${business?.industry || 'industry'} data. Predictions personalise after 20 requests.`
    });
  }
  
  // Calculate actual conversion rates from their data
  const smsSends = sends.filter(s => s.channel === 'sms');
  const emailSends = sends.filter(s => s.channel === 'email');
  const smsConv = smsSends.filter(s => s.converted).length;
  const emailConv = emailSends.filter(s => s.converted).length;
  const smsRate = smsSends.length > 0 ? Math.round((smsConv / smsSends.length) * 100) : defaults.smsRate;
  const emailRate = emailSends.length > 0 ? Math.round((emailConv / emailSends.length) * 100) : defaults.emailRate;
  
  // Find best performing hour
  const hourPerformance = {};
  sends.forEach(s => {
    if (!hourPerformance[s.appointment_hour]) hourPerformance[s.appointment_hour] = { sms: 0, smsConv: 0, email: 0, emailConv: 0 };
    if (s.channel === 'sms') { hourPerformance[s.appointment_hour].sms++; if (s.converted) hourPerformance[s.appointment_hour].smsConv++; }
    else { hourPerformance[s.appointment_hour].email++; if (s.converted) hourPerformance[s.appointment_hour].emailConv++; }
  });
  
  const bestChannel = smsRate >= emailRate ? 'sms' : 'email';
  const bestRate = Math.max(smsRate, emailRate);
  
  res.json({
    recommendation: {
      recommended_channel: bestChannel,
      confidence: sendCount > 50 ? 'high' : 'moderate',
      best_window: 'Based on your data',
      predicted_conversion_rate: bestRate,
      sms_conversion_rate: smsRate,
      email_conversion_rate: emailRate
    },
    data_source: 'your_data',
    sends_analysed: sendCount
  });
});

// ─── SUGGEST REVIEW (Copy & Go) ──────────────────────────────────────────────
app.post("/suggest-review/:slug", async (req, res) => {
  const { rating, service } = req.body;
  
  const { data: business } = await supabase
    .from("businesses")
    .select("name, industry")
    .eq("slug", req.params.slug)
    .single();
    
  if (!business) return res.status(404).json({ error: "Business not found" });
  
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You write short, authentic-sounding Google reviews on behalf of customers. Write in first person. Sound like a real person, not marketing copy. 2-3 sentences max. Never use words like fantastic, amazing, or incredible. Sound natural and specific. Use British English."
        },
        {
          role: "user",
          content: `Write a ${rating}-star Google review for a customer who visited ${business.name}, a ${business.industry || 'local'} business.${service ? ' The service they had was: ' + service + '.' : ''} Make it sound genuine, conversational, and specific.`
        }
      ],
      temperature: 0.8,
      max_tokens: 150
    });
    
    const suggestion = completion.choices[0].message.content.trim();
    res.json({ suggestion });
  } catch(err) {
    console.error("Review suggestion error:", err.message);
    res.status(500).json({ error: "Could not generate suggestion." });
  }
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