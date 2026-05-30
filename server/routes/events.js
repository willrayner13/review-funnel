const express = require("express");
const multer = require("multer");
const supabase = require("../config/database");
const emailService = require("../services/emailService");
const smsService = require("../services/smsService");
const aiService = require("../services/aiService");
const { normalisePhone } = require("../utils/helpers");
const { MILESTONES } = require("../utils/constants");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Positive event
router.post("/positive", async (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const { data: bizCheck } = await supabase.from("businesses").select("slug").eq("slug", slug).single();
  if (!bizCheck) return res.status(404).json({ error: "Business not found" });

  const { error } = await supabase.from("events").insert({ business_slug: slug, event_type: "positive" });
  if (error) return res.status(500).json(error);

  // Milestone check
  try {
    const { count, error: countError } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("business_slug", slug)
      .eq("event_type", "positive");

    if (!countError && count) {
      const milestones = [10, 25, 50, 100, 250, 500];
      const matchedMilestone = milestones.find(m => m === count);

      if (matchedMilestone) {
        const { data: business } = await supabase
          .from("businesses")
          .select("name, email, last_milestone_sent, review_link, plan_type")
          .eq("slug", slug)
          .single();

        if (business && matchedMilestone > (business.last_milestone_sent || 0)) {
          const funnelUrl = `${process.env.BASE_URL}/r/${slug}`;
          const dashboardUrl = `${process.env.BASE_URL}/for-business`;
          const milestoneUrl = `${process.env.BASE_URL}/milestone/${slug}/${matchedMilestone}`;

          // Generate AI congratulations message
          let congratsMessage = "";
          try {
            congratsMessage = await aiService.generateMilestoneMessage(business.name, matchedMilestone);
          } catch (aiErr) {
            console.error("AI milestone message failed:", aiErr.message);
            congratsMessage = `Congratulations on ${matchedMilestone} Google reviews! 🎉`;
          }

          // Send milestone email
          await emailService.sendMilestoneEmail(
            business.email,
            business.name,
            matchedMilestone,
            milestoneUrl,
            dashboardUrl,
            congratsMessage
          );

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

// Rating event
router.post("/rating", async (req, res) => {
  const { slug, rating } = req.body;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const { data: bizCheck } = await supabase.from("businesses").select("slug").eq("slug", slug).single();
  if (!bizCheck) return res.status(404).json({ error: "Business not found" });

  const { error } = await supabase.from("events").insert({ business_slug: slug, event_type: "rating", rating });
  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

// Review click
router.post("/review-click", async (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const { data: bizCheck } = await supabase.from("businesses").select("slug").eq("slug", slug).single();
  if (!bizCheck) return res.status(404).json({ error: "Business not found" });

  const { error } = await supabase.from("events").insert({ business_slug: slug, event_type: "review_click" });
  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

// Feedback (negative)
router.post("/feedback", async (req, res) => {
  const { business, message } = req.body;
  if (!business) return res.status(400).json({ error: "Missing slug" });

  const { data: bizCheck } = await supabase.from("businesses").select("slug").eq("slug", business).single();
  if (!bizCheck) return res.status(404).json({ error: "Business not found" });

  const { error } = await supabase.from("events").insert({ business_slug: business, event_type: "negative", message });
  if (error) return res.status(500).json(error);

  // Send alerts
  try {
    const { data: businessData } = await supabase
      .from("businesses")
      .select("name, email, alert_enabled, alert_phone")
      .eq("slug", business)
      .single();

    if (businessData && businessData.alert_enabled) {
      const shortMessage = message.length > 200 ? message.substring(0, 197) + "..." : message;
      const businessName = businessData.name || "a customer";
      const dashboardUrl = `${process.env.BASE_URL}/for-business`;

      // Send email alert using service
      try {
        await emailService.sendAlertEmail(businessData.email, businessName, shortMessage, dashboardUrl);
      } catch (emailAlertErr) {
        console.error("Alert email failed:", emailAlertErr.message);
      }

      // Send SMS alert using service
      if (businessData.alert_phone) {
        try {
          await smsService.sendAlertSMS(businessData.alert_phone, businessName, message, dashboardUrl);
        } catch (smsErr) {
          console.error("Alert SMS failed:", smsErr.message);
        }
      }
    }
  } catch (alertErr) {
    console.error("Alert failed (non-fatal):", alertErr.message);
  }

  res.json({ success: true });
});

// Review growth
router.get("/review-growth/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });

  const { data } = await supabase
    .from("events")
    .select("created_at")
    .eq("business_slug", req.params.slug)
    .eq("event_type", "review_click");

  const months = {};
  (data || []).forEach((e) => {
    const month = new Date(e.created_at).toISOString().slice(0, 7);
    months[month] = (months[month] || 0) + 1;
  });
  res.json(months);
});

// Voice transcription
router.post("/transcribe-voice/:slug", upload.single("audio"), async (req, res) => {
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

    const isProOrAgency = business.subscription_active && (business.plan_type === "pro" || business.plan_type === "agency");
    if (!isProOrAgency) {
      return res.status(403).json({ error: "Pro or Agency plan required" });
    }

    // Transcribe using AI service
    const text = await aiService.transcribeAudio(req.file.buffer, req.file.mimetype, business.name, business.industry);

    if (!text || text.length < 2) {
      return res.json({
        sentiment: "unclear",
        transcription: "(could not understand audio)",
        message: "Please try again",
      });
    }

    // Analyse sentiment using AI service
    const sentimentResult = await aiService.analyseSentiment(text, business.name, business.industry);
    const isNegative = sentimentResult.sentiment === "negative" || sentimentResult.sentiment === "very_negative";

    if (isNegative) {
      await supabase.from("events").insert({
        business_slug: slug,
        event_type: "negative",
        message: `[Voice note] ${text}`,
        created_at: new Date().toISOString(),
      });

      return res.json({
        sentiment: "negative",
        transcription: text,
        message: "Feedback saved privately",
      });
    }

    res.json({
      sentiment: "positive",
      transcription: text,
      message: "Ready to post as a review",
    });
  } catch (err) {
    console.error("Voice transcription error:", err.message);
    res.status(500).json({ error: "Could not transcribe. Please try again." });
  }
});

module.exports = router;