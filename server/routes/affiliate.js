const express = require("express");
const supabase = require("../config/database");
const emailService = require("../services/emailService");

const router = express.Router();

// Affiliate stats
router.get("/affiliate-stats/:code", async (req, res) => {
  const code = req.params.code;

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
      referrals: [],
    });
  }

  const now = new Date();

  const paying = businesses.filter((b) => {
    if (!b.subscription_active) return false;
    if (b.trial_ends_at && new Date(b.trial_ends_at) > now) return false;
    return true;
  });

  const trialCustomers = businesses.filter((b) => {
    return b.subscription_active && b.trial_ends_at && new Date(b.trial_ends_at) > now;
  });

  const monthlyEarnings = paying.reduce((sum, b) => {
    let price = b.plan_type === "pro" ? 24.99 : b.plan_type === "agency" ? 79 : 9.99;
    return sum + price * 0.3;
  }, 0);

  const referrals = businesses.map((b) => {
    let status = "cancelled";
    if (b.subscription_active && b.trial_ends_at && new Date(b.trial_ends_at) > now) {
      status = "trial";
    } else if (b.subscription_active) {
      status = "active";
    }

    const commission =
      status === "active" ? (b.plan_type === "pro" ? 24.99 : b.plan_type === "agency" ? 79 : 9.99) * 0.3 : 0;

    return {
      business_name: b.name,
      slug: b.slug,
      plan: b.plan_type || "starter",
      created_at: b.created_at,
      status: status,
      commission: commission,
    };
  });

  res.json({
    partner_name: code,
    referral_link: `https://www.reviewlift.app?ref=${code}`,
    total_signups: businesses.length,
    active_customers: paying.length,
    trial_customers: trialCustomers.length,
    monthly_earnings: monthlyEarnings,
    referrals,
  });
});

// Partner info
router.get("/partner-info/:code", async (req, res) => {
  const code = req.params.code;

  const { count } = await supabase.from("businesses").select("*", { count: "exact", head: true }).eq("referred_by", code);

  res.json({
    code: code,
    name: code.charAt(0).toUpperCase() + code.slice(1).replace(/-/g, " "),
    has_referrals: count > 0,
  });
});

// Contact form
router.post("/contact", async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: "All fields required" });

  try {
    await emailService.sendContactNotification(name, email, message);
    res.json({ success: true });
  } catch (err) {
    console.log("Contact error:", err.message);
    res.status(500).json({ error: "Could not send. Please email billy@reviewlift.app directly." });
  }
});

module.exports = router;