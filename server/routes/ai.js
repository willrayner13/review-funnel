const express = require("express");
const supabase = require("../config/database");
const aiService = require("../services/aiService");

const router = express.Router();

// Generate AI reply
router.post("/generate-reply", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const { review } = req.body;
  const slug = req.session.slug;

  try {
    const { data: business, error } = await supabase
      .from("businesses")
      .select("plan_type, trial_ends_at, subscription_active, name")
      .eq("slug", slug)
      .single();

    if (error || !business) return res.status(404).json({ error: "Business not found" });

    const isProOrAgency = business.subscription_active && (business.plan_type === "pro" || business.plan_type === "agency");
    if (!isProOrAgency) return res.status(403).json({ error: "Pro or Agency plan required" });

    const replies = await aiService.generateReviewReplies(review, business.name);

    res.json({
      professional: replies.professional || "",
      warm: replies.warm || "",
      punchy: replies.punchy || "",
    });
  } catch (err) {
    console.log("OpenAI error:", err.status, err.message);
    if (err.status === 429 || (err.message && err.message.includes("quota"))) {
      return res.status(503).json({ error: "AI temporarily unavailable. Try again in a few minutes." });
    }
    res.status(500).json({ error: "AI temporarily unavailable. Please try again." });
  }
});

// Sentiment trends
router.get("/sentiment/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });

  const { data: business } = await supabase
    .from("businesses")
    .select("plan_type, subscription_active")
    .eq("slug", req.params.slug)
    .single();

  if (!business) return res.status(404).json({ error: "Business not found" });

  const isProOrAgency = business.subscription_active && (business.plan_type === "pro" || business.plan_type === "agency");
  if (!isProOrAgency) {
    return res.status(403).json({ error: "Pro or Agency plan required for AI insights." });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: feedback } = await supabase
    .from("events")
    .select("message, created_at")
    .eq("business_slug", req.params.slug)
    .eq("event_type", "negative")
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: false });

  const messages = (feedback || []).map((f) => f.message).filter(Boolean);
  res.json({ count: messages.length, messages });
});

// Feedback summary (AI)
router.post("/feedback-summary", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const slug = req.session.slug;
  const { data } = await supabase.from("events").select("message").eq("business_slug", slug).eq("event_type", "negative");

  const feedbackMessages = (data || []).map((f) => f.message).filter(Boolean);

  try {
    const summary = await aiService.summariseComplaints(feedbackMessages);
    res.json({ summary });
  } catch (err) {
    res.status(503).json({ error: "AI temporarily unavailable. Please try again." });
  }
});

// Predict channel (send intelligence)
router.post("/predict-channel/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });

  const { appointment_hour, appointment_day } = req.body;
  const slug = req.params.slug;

  const { data: business } = await supabase
    .from("businesses")
    .select("plan_type, subscription_active, industry")
    .eq("slug", slug)
    .single();

  const isProOrAgency = business?.subscription_active && (business?.plan_type === "pro" || business?.plan_type === "agency");
  if (!isProOrAgency) return res.status(403).json({ error: "Pro or Agency plan required" });

  const { data: sends } = await supabase
    .from("events")
    .select("channel, appointment_hour, appointment_day, converted")
    .in("event_type", ["sms_sent", "email_sent"])
    .eq("business_slug", slug)
    .not("converted", "is", null)
    .limit(100);

  const sendCount = sends?.length || 0;

  // Industry benchmark defaults
  const industryDefaults = {
    dentist: { bestChannel: "sms", bestWindow: "10am-12pm, next day", smsRate: 22, emailRate: 8 },
    plumber: { bestChannel: "email", bestWindow: "8am-10am, next morning", smsRate: 18, emailRate: 14 },
    electrician: { bestChannel: "sms", bestWindow: "8am-10am, next day", smsRate: 20, emailRate: 10 },
    salon: { bestChannel: "sms", bestWindow: "2pm-4pm, same day", smsRate: 24, emailRate: 7 },
    builder: { bestChannel: "email", bestWindow: "2-3 days after completion", smsRate: 12, emailRate: 16 },
    restaurant: { bestChannel: "sms", bestWindow: "6pm-8pm, same evening", smsRate: 19, emailRate: 5 },
    gym: { bestChannel: "sms", bestWindow: "6pm-8pm, same day", smsRate: 21, emailRate: 9 },
    cleaner: { bestChannel: "sms", bestWindow: "10am-12pm, next day", smsRate: 20, emailRate: 8 },
    accountant: { bestChannel: "email", bestWindow: "2pm-4pm, next day", smsRate: 10, emailRate: 15 },
    solicitor: { bestChannel: "email", bestWindow: "10am-12pm, next day", smsRate: 8, emailRate: 14 },
    "estate-agent": { bestChannel: "email", bestWindow: "2pm-4pm, next day", smsRate: 11, emailRate: 13 },
    vet: { bestChannel: "sms", bestWindow: "10am-12pm, next day", smsRate: 22, emailRate: 9 },
    physio: { bestChannel: "sms", bestWindow: "2pm-4pm, same day", smsRate: 21, emailRate: 10 },
    other: { bestChannel: "sms", bestWindow: "10am-2pm, next day", smsRate: 18, emailRate: 10 },
  };

  const defaults = industryDefaults[business?.industry] || industryDefaults["other"];

  if (sendCount < 20) {
    return res.json({
      recommendation: {
        recommended_channel: defaults.bestChannel,
        confidence: "industry data",
        best_window: defaults.bestWindow,
        predicted_conversion_rate: defaults.bestChannel === "sms" ? defaults.smsRate : defaults.emailRate,
      },
      data_source: "industry_benchmark",
      sends_analysed: sendCount,
      message: `AI analytics based on ${business?.industry || "industry"} data. Predictions personalise after 20 requests.`,
    });
  }

  const smsSends = sends.filter((s) => s.channel === "sms");
  const emailSends = sends.filter((s) => s.channel === "email");
  const smsConv = smsSends.filter((s) => s.converted).length;
  const emailConv = emailSends.filter((s) => s.converted).length;
  const smsRate = smsSends.length > 0 ? Math.round((smsConv / smsSends.length) * 100) : defaults.smsRate;
  const emailRate = emailSends.length > 0 ? Math.round((emailConv / emailSends.length) * 100) : defaults.emailRate;

  const bestChannel = smsRate >= emailRate ? "sms" : "email";
  const bestRate = Math.max(smsRate, emailRate);

  res.json({
    recommendation: {
      recommended_channel: bestChannel,
      confidence: sendCount > 50 ? "high" : "moderate",
      best_window: "Based on your data",
      predicted_conversion_rate: bestRate,
      sms_conversion_rate: smsRate,
      email_conversion_rate: emailRate,
    },
    data_source: "your_data",
    sends_analysed: sendCount,
  });
});

// Suggest review (AI-generated review text)
router.post("/suggest-review/:slug", async (req, res) => {
  const { rating, service } = req.body;
  const slug = req.params.slug;

  const { data: business } = await supabase
    .from("businesses")
    .select("name, industry")
    .eq("slug", slug)
    .single();

  if (!business) return res.status(404).json({ error: "Business not found" });

  try {
    const suggestion = await aiService.generateSuggestedReview(rating, business.name, business.industry, service);
    res.json({ suggestion });
  } catch (err) {
    console.error("Review suggestion error:", err.message);
    res.status(500).json({ error: "Could not generate suggestion." });
  }
});

// Competitor analysis (Agency only)
router.post("/analyse-competitor", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const { data: business } = await supabase
    .from("businesses")
    .select("plan_type, subscription_active")
    .eq("slug", req.session.slug)
    .single();

  if (!business || business.plan_type !== "agency") {
    return res.status(403).json({ error: "Agency plan required. Upgrade at /billing" });
  }

  const { competitor_name, reviews_text } = req.body;
  if (!reviews_text || reviews_text.trim().length < 50) {
    return res.status(400).json({ error: "Please paste at least a few reviews to analyse." });
  }

  try {
    const analysis = await aiService.analyseCompetitor(reviews_text, competitor_name);
    res.json(analysis);
  } catch (err) {
    console.error("Competitor analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed. Please try again." });
  }
});

module.exports = router;