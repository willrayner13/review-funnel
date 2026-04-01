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

// ⚠️ Stripe webhook must be BEFORE bodyParser.json()
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
    const session = event.data.object;
    const slug = session.metadata.slug;
    const plan = session.metadata.plan;

    // Update subscription status in Supabase
    try {
      await supabase
        .from("businesses")
        .update({ subscription_active: true, plan_type: plan })
        .eq("slug", slug);
      console.log(`Subscription updated for ${slug} to plan ${plan}`);
    } catch (err) {
      console.log("Supabase update error:", err.message);
    }
  }

  res.json({ received: true });
});

// ---------- MIDDLEWARE ----------
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "supersecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// ---------- HTML ROUTES ----------
const htmlPages = ["admin", "for-business", "success", "cancel", "thanks", "bad"];
htmlPages.forEach((page) => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.resolve("public", `${page}.html`));
  });
});

// ---------- BUSINESS PAGES ----------
app.get("/r/:business", async (req, res) => {
  const slug = req.params.business;

  const { data } = await supabase.from("businesses").select("*").eq("slug", slug).single();
  if (!data) return res.send("Business not found");

  await supabase.from("events").insert({ business_slug: slug, event_type: "visit" });

  const pagePath = path.join(__dirname, "public", "index.html");
  const page = fs.readFileSync(pagePath, "utf8");

  res.send(`
    <html>
      <script>
        window.businessName="${data.name}";
        window.slug="${slug}";
        window.reviewLink="${data.review_link}";
      </script>
      ${page}
    </html>
  `);
});

// ---------- EVENTS ----------
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

// ---------- STATS ----------
app.get("/stats/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });

  const { data: businessData } = await supabase.from("businesses").select("subscription_active, plan_type").eq("slug", req.params.slug).single();
  if (!businessData) return res.status(404).json({ error: "Business not found" });

  const { data } = await supabase.from("events").select("event_type, rating").eq("business_slug", req.params.slug);

  const stats = {
    visits: 0,
    positive: 0,
    negative: 0,
    reviews: 0,
    rating_avg: 0,
    rating_count: 0,
    rating_distribution: {},
    subscription_active: businessData.subscription_active,
    plan_type: businessData.plan_type,
  };

  let ratingTotal = 0;
  const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  data.forEach((e) => {
    if (e.event_type === "visit") stats.visits++;
    if (e.event_type === "positive") stats.positive++;
    if (e.event_type === "negative") stats.negative++;
    if (e.event_type === "review_click") stats.reviews++;
    if (e.event_type === "rating" && e.rating) {
      ratingTotal += e.rating;
      stats.rating_count++;
      ratingDist[e.rating] = (ratingDist[e.rating] || 0) + 1;
    }
  });

  stats.rating_avg = stats.rating_count ? (ratingTotal / stats.rating_count).toFixed(2) : 0;
  stats.rating_distribution = ratingDist;
  stats.conversion_rate = stats.visits ? ((stats.positive / stats.visits) * 100).toFixed(1) : 0;
  stats.negative_rate = stats.visits ? ((stats.negative / stats.visits) * 100).toFixed(1) : 0;

  res.json(stats);
});

// ---------- CREATE BUSINESS ----------
app.post("/create-business", async (req, res) => {
  try {
    const { name, email, review, password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: "Password required (min 4 characters)" });

    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.floor(Math.random() * 10000);
    const hashedPassword = await bcrypt.hash(password, 10);

    const { error } = await supabase.from("businesses").insert({
      name,
      email,
      review_link: review,
      slug,
      password: hashedPassword,
      plan_type: "starter",
      subscription_active: false,
    });

    if (error) return res.status(500).json(error);

    req.session.slug = slug;
    res.json({ success: true, slug });
  } catch (err) {
    console.log("Server error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- VERIFY LOGIN ----------
app.post("/verify-login", async (req, res) => {
  const { slug, password } = req.body;
  const { data } = await supabase.from("businesses").select("*").eq("slug", slug).single();
  if (!data) return res.json({ success: false });

  const valid = await bcrypt.compare(password, data.password);
  if (!valid) return res.json({ success: false });

  req.session.slug = slug;
  res.json({ success: true });
});

// ---------- QR DOWNLOAD ----------
app.get("/qr-download/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });
  const url = `${process.env.BASE_URL}/r/${req.params.slug}`;
  const qr = await QRCode.toBuffer(url);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", "attachment; filename=review-qr.png");
  res.send(qr);
});

// ---------- SEND SMS ----------
app.post("/send-sms", smsLimiter, async (req, res) => {
  const { phone, slug } = req.body;
  try {
    const { data } = await supabase.from("businesses").select("*").eq("slug", slug).single();
    if (!data) return res.status(404).json({ error: "Business not found" });

    const message = `Hi! Thanks for visiting ${data.name} today. Please leave a review: ${process.env.BASE_URL}/r/${slug}`;
    await twilioClient.messages.create({ from: process.env.TWILIO_PHONE, to: phone, body: message });
    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- STRIPE CHECKOUT ----------
app.post("/create-checkout", async (req, res) => {
  const { slug, plan } = req.body;
  const priceId = plan === "pro" ? process.env.PRICE_PRO : process.env.PRICE_STARTER;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    success_url: `${process.env.BASE_URL}/success?slug=${slug}`,
    cancel_url: `${process.env.BASE_URL}/cancel`,
    metadata: { slug, plan },
  });

  res.json({ url: session.url });
});

// ---------- EXPORT ----------
const serverless = require("serverless-http");
module.exports = app;
module.exports.handler = serverless(app);