const express = require("express");
const supabase = require("../config/database");
const openai = require("../config/openai");

const router = express.Router();

// Generate AI reply
router.post("/generate-reply", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const { review } = req.body;
  const slug = req.session.slug;

  try {
    const { data: business, error } = await supabase
      .from("businesses")
      .select("plan_type, trial_ends_at, subscription_active")
      .eq("slug", slug)
      .single();

    if (error || !business) return res.status(404).json({ error: "Business not found" });

    const isProOrAgency = business.subscription_active && (business.plan_type === "pro" || business.plan_type === "agency");
    if (!isProOrAgency) return res.status(403).json({ error: "Pro or Agency plan required" });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Generate three different replies to this customer review. Return JSON only: { "professional": "...", "warm": "...", "punchy": "..." }`,
        },
        { role: "user", content: `Write replies to this customer review:\n\n${review}` },
      ],
      temperature: 0.8,
      max_tokens: 400,
    });

    let parsed;
    try {
      const cleaned = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.json({
        professional: "Could not generate reply. Please try again.",
        warm: "Could not generate reply. Please try again.",
        punchy: "Could not generate reply. Please try again.",
      });
    }

    res.json({
      professional: parsed.professional || "",
      warm: parsed.warm || "",
      punchy: parsed.punchy || "",
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

  if (sendCount < 20) {
    return res.json({
      recommendation: {
        recommended_channel: "sms",
        confidence: "industry data",
        best_window: "10am-2pm, next day",
        predicted_conversion_rate: 18,
      },
      data_source: "industry_benchmark",
      sends_analysed: sendCount,
      message: "AI analytics based on industry data. Predictions personalise after 20 requests.",
    });
  }

  const smsSends = sends.filter((s) => s.channel === "sms");
  const emailSends = sends.filter((s) => s.channel === "email");
  const smsConv = smsSends.filter((s) => s.converted).length;
  const emailConv = emailSends.filter((s) => s.converted).length;
  const smsRate = smsSends.length > 0 ? Math.round((smsConv / smsSends.length) * 100) : 0;
  const emailRate = emailSends.length > 0 ? Math.round((emailConv / emailSends.length) * 100) : 0;

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
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write short, authentic-sounding Google reviews on behalf of customers. Write in first person. 2-3 sentences max. Use British English.",
        },
        {
          role: "user",
          content: `Write a ${rating}-star Google review for a customer who visited ${business.name}, a ${business.industry || "local"} business.${service ? " The service they had was: " + service + "." : ""}`,
        },
      ],
      temperature: 0.8,
      max_tokens: 150,
    });

    const suggestion = completion.choices[0].message.content.trim();
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
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Analyse these customer reviews for a competitor${competitor_name ? " called " + competitor_name : ""}. Return JSON only: { "strengths": ["...","..."], "weaknesses": ["...","..."], "opportunity": "..." }`,
        },
        { role: "user", content: reviews_text.substring(0, 3000) },
      ],
      temperature: 0.7,
      max_tokens: 400,
    });

    const content = completion.choices[0].message.content.trim();
    let parsed;
    try {
      const cleaned = content.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parsed = { strengths: ["Could not parse"], weaknesses: ["Could not parse"], opportunity: "Try again with more review text." };
    }

    res.json(parsed);
  } catch (err) {
    console.error("Competitor analysis error:", err.message);
    res.status(500).json({ error: "Analysis failed. Please try again." });
  }
});

module.exports = router;