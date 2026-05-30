const express = require("express");
const bcrypt = require("bcrypt");
const supabase = require("../config/database");
const { authLimiter } = require("../middleware/rateLimit");
const emailService = require("../services/emailService");

const router = express.Router();

// Create business
router.post("/create-business", authLimiter, async (req, res) => {
  try {
    const {
      name,
      email,
      review,
      password,
      referral,
      industry,
      currentSoftware,
      account_type,
      agency_website,
      agency_source,
      agency_client_count,
    } = req.body;

    if (!name) return res.status(400).json({ error: "Business name is required." });
    if (!email) return res.status(400).json({ error: "Email is required." });
    if (!password) return res.status(400).json({ error: "Password is required." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    let slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.floor(Math.random() * 10000);

    let slugExists = true;
    while (slugExists) {
      const { data: existing } = await supabase.from("businesses").select("slug").eq("slug", slug).single();
      if (!existing) {
        slugExists = false;
      } else {
        slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.floor(Math.random() * 10000);
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: existing } = await supabase.from("businesses").select("email").eq("email", email).maybeSingle();
    if (existing) return res.status(400).json({ error: "Email already exists" });

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    const { error } = await supabase.from("businesses").insert({
      name: name.trim(),
      email: email.trim(),
      review_link: account_type === "agency" ? review || null : review || "",
      slug: slug,
      password: hashedPassword,
      plan_type: account_type === "agency" ? "agency" : "starter",
      subscription_active: false,
      trial_ends_at: trialEnd.toISOString(),
      referred_by: referral || null,
      industry: account_type === "business" ? industry || null : null,
      current_software: account_type === "business" ? currentSoftware || null : null,
      account_type: account_type || "business",
      agency_website: agency_website || null,
      agency_source: agency_source || null,
      agency_client_count: agency_client_count || null,
    });

    if (error) {
      console.error("Supabase insert error:", JSON.stringify(error));
      if (error.code === "42501" || (error.message && error.message.includes("row-level"))) {
        return res.status(500).json({ error: "Database permission error. Please contact support." });
      }
      return res.status(500).json({ error: error.message || "Could not create account. Please try again." });
    }

    req.session.slug = slug;
    req.session.save(async (err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Session save failed. Please try again." });
      }

      try {
        const funnelUrl = `${process.env.BASE_URL}/r/${slug}`;
        const dashboardUrl = `${process.env.BASE_URL}/for-business`;

        if (account_type === "agency") {
          await emailService.sendAgencyWelcomeEmail(email, name, dashboardUrl);
        } else {
          await emailService.sendWelcomeEmail(email, name, funnelUrl, dashboardUrl);
        }
      } catch (emailErr) {
        console.error("Welcome email failed (non-fatal):", emailErr.message);
      }

      res.json({ success: true, slug });
    });
  } catch (err) {
    console.error("Server error on /create-business:", err);
    res.status(500).json({ error: err.message || "Something went wrong. Please try again." });
  }
});

// Update business
router.post("/update-business", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });
  const { name, review_link, alert_enabled, alert_phone } = req.body;
  if (!name || name.trim().length < 1) return res.status(400).json({ error: "Business name required" });

  const updateData = {
    name: name.trim(),
    review_link: review_link || "",
  };

  if (alert_enabled !== undefined) updateData.alert_enabled = alert_enabled;
  if (alert_phone !== undefined) updateData.alert_phone = alert_phone;

  const { error } = await supabase.from("businesses").update(updateData).eq("slug", req.session.slug);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Change password
router.post("/change-password", async (req, res) => {
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

// Stats
router.get("/stats/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });

  const { data: businessData } = await supabase
    .from("businesses")
    .select(
      "name, subscription_active, plan_type, trial_ends_at, review_link, industry, current_software, nfc_card_ordered, nfc_card_tracking_number, alert_enabled, alert_phone"
    )
    .eq("slug", req.params.slug)
    .single();

  if (!businessData) return res.status(404).json({ error: "Business not found" });

  const { data: events } = await supabase
    .from("events")
    .select("event_type, rating, message, created_at")
    .eq("business_slug", req.params.slug);

  const { data: recentEvents } = await supabase
    .from("events")
    .select("event_type, created_at")
    .eq("business_slug", req.params.slug)
    .order("created_at", { ascending: false })
    .limit(10);

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
    funnel_template: businessData.funnel_template || "classic",
    funnel_logo_url: businessData.funnel_logo_url || null,
    funnel_accent_color: businessData.funnel_accent_color || "#C8A96E",
    funnel_headline: businessData.funnel_headline || null,
    funnel_happy_label: businessData.funnel_happy_label || "Great experience!",
    funnel_unhappy_label: businessData.funnel_unhappy_label || "Could be better",
    funnel_thankyou_message: businessData.funnel_thankyou_message || null,
    funnel_custom_domain: businessData.funnel_custom_domain || null,
    funnel_language: businessData.funnel_language || "en",
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

// Lapsed stats
router.get("/lapsed-stats/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });

  const { data, error } = await supabase
    .from("businesses")
    .select("subscription_active")
    .eq("slug", req.params.slug)
    .single();

  if (error || !data) return res.status(404).json({ error: "Not found" });
  if (data.subscription_active) return res.json({ active: true });

  const { data: events } = await supabase.from("events").select("event_type").eq("business_slug", req.params.slug);
  const counts = { visits: 0, feedback: 0, reviews: 0 };
  (events || []).forEach((e) => {
    if (e.event_type === "visit") counts.visits++;
    if (e.event_type === "negative") counts.feedback++;
    if (e.event_type === "review_click") counts.reviews++;
  });
  res.json(counts);
});

// Session restore (after Stripe redirect)
router.post("/restore-session/:slug", async (req, res) => {
  const { slug } = req.params;
  const { data, error } = await supabase.from("businesses").select("slug, subscription_active").eq("slug", slug).single();
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

module.exports = router;