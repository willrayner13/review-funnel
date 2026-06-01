const express = require("express");
const stripe = require("../config/stripe");
const supabase = require("../config/database");

const router = express.Router();

// Debug endpoint - check environment variables
router.get("/debug-env", (req, res) => {
  res.json({
    stripe_secret_exists: !!process.env.STRIPE_SECRET,
    stripe_secret_prefix: process.env.STRIPE_SECRET ? process.env.STRIPE_SECRET.substring(0, 7) : 'missing',
    base_url: process.env.BASE_URL,
    starter_price_exists: !!process.env.Starter_subscription,
    starter_price: process.env.Starter_subscription,
    pro_price_exists: !!process.env.Pro_subscription,
    pro_price: process.env.Pro_subscription,
    agency_price_exists: !!process.env.Agency_subscription,
    agency_price: process.env.Agency_subscription,
    node_env: process.env.NODE_ENV
  });
});


// Subscription status
router.get("/subscription-status/:slug", async (req, res) => {
  console.log("Looking for slug:", req.params.slug);
  
  const { data, error } = await supabase
    .from("businesses")
    .select("name, subscription_active, plan_type, trial_ends_at, review_link, stripe_customer")
    .eq("slug", req.params.slug)
    .maybeSingle();  // Change from .single() to .maybeSingle()

  console.log("Error:", error);
  console.log("Data:", data);

  if (error || !data) {
    return res.status(404).json({ error: "Not found", debug_error: error?.message });
  }

  let cancel_pending = false;
  if (stripe && data.stripe_customer && data.subscription_active) {
    try {
      const [activeSubs, trialSubs] = await Promise.all([
        stripe.subscriptions.list({ customer: data.stripe_customer, status: "active", limit: 1 }),
        stripe.subscriptions.list({ customer: data.stripe_customer, status: "trialing", limit: 1 }),
      ]);
      const sub = activeSubs.data[0] || trialSubs.data[0];
      if (sub && sub.cancel_at_period_end) cancel_pending = true;
    } catch (e) {}
  }

  res.json({
    subscription_active: data.subscription_active,
    plan_type: data.plan_type,
    trial_ends_at: data.trial_ends_at,
    cancel_pending,
  });
});

router.get("/debug-db-check", async (req, res) => {
  // Test 1: Check if we can connect and count businesses
  const { count, error: countError } = await supabase
    .from("businesses")
    .select("*", { count: "exact", head: true });
  
  // Test 2: Try to find your specific business
  const { data, error } = await supabase
    .from("businesses")
    .select("slug, name")
    .eq("slug", "leckyuk-5676")
    .maybeSingle();
  
  res.json({
    total_businesses: count,
    count_error: countError?.message,
    specific_business_found: !!data,
    specific_business_data: data,
    supabase_url_configured: !!process.env.SUPABASE_URL,
    supabase_key_configured: !!process.env.SUPABASE_KEY,
  });
});

router.post("/create-checkout", async (req, res) => {
  const { slug, plan } = req.body;
  
  console.log("Received request:", { slug, plan });
  console.log("BASE_URL:", process.env.BASE_URL);
  
  let priceId;
  if (plan === "pro") priceId = process.env.Pro_subscription;
  else if (plan === "agency") priceId = process.env.Agency_subscription;
  else priceId = process.env.Starter_subscription;

  console.log("Price ID:", priceId);

  if (!priceId) {
    console.error("Missing price ID for plan:", plan);
    console.error("Available env vars:", {
      Starter_subscription: !!process.env.Starter_subscription,
      Pro_subscription: !!process.env.Pro_subscription,
      Agency_subscription: !!process.env.Agency_subscription
    });
    return res.status(500).json({ error: "Pricing configuration error. Please contact support." });
  }

  if (!process.env.BASE_URL) {
    console.error("BASE_URL is missing from environment variables");
    return res.status(500).json({ error: "Configuration error. BASE_URL not set." });
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
    console.error("Full error:", err);
    res.status(500).json({ error: err.message });
  }
});
// Billing portal
router.post("/billing-portal", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not logged in" });

  try {
    const { data } = await supabase
      .from("businesses")
      .select("stripe_customer")
      .eq("slug", req.session.slug)
      .single();

    if (!data || !data.stripe_customer) {
      return res.status(400).json({ error: "No billing account found. Please subscribe first." });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer,
      return_url: process.env.BASE_URL + "/billing",
    });
    res.json({ url: portal.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel subscription (sets cancel_at_period_end)
router.post("/cancel-subscription", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not logged in" });

  try {
    const { data } = await supabase
      .from("businesses")
      .select("stripe_customer")
      .eq("slug", req.session.slug)
      .single();

    if (!data || !data.stripe_customer) {
      return res.status(400).json({ error: "No active subscription found." });
    }

    const [activeSubs, trialSubs] = await Promise.all([
      stripe.subscriptions.list({ customer: data.stripe_customer, status: "active", limit: 1 }),
      stripe.subscriptions.list({ customer: data.stripe_customer, status: "trialing", limit: 1 }),
    ]);
    const sub = activeSubs.data[0] || trialSubs.data[0];
    if (!sub) return res.status(400).json({ error: "No active subscription found." });

    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    await supabase
      .from("businesses")
      .update({ cancel_requested_at: new Date().toISOString() })
      .eq("slug", req.session.slug);

    res.json({ success: true, message: "Subscription cancelled. You'll keep access until your billing period ends." });
  } catch (err) {
    console.log("Cancel error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reactivate subscription (removes cancel_at_period_end)
router.post("/reactivate-subscription", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not logged in" });

  try {
    const { data } = await supabase
      .from("businesses")
      .select("stripe_customer")
      .eq("slug", req.session.slug)
      .single();

    if (!data || !data.stripe_customer) {
      return res.status(400).json({ error: "No subscription found." });
    }

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

// Upgrade plan (for trial users)
router.post("/upgrade-plan", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not logged in" });

  const { plan } = req.body;
  try {
    const { data } = await supabase
      .from("businesses")
      .select("stripe_customer, plan_type")
      .eq("slug", req.session.slug)
      .single();

    if (!data || !data.stripe_customer) {
      return res.status(400).json({ error: "No active subscription found." });
    }

    const newPriceId = plan === "pro" ? process.env.Pro_subscription : process.env.Starter_subscription;
    if (!newPriceId) return res.status(500).json({ error: "Price configuration error." });

    const subs = await stripe.subscriptions.list({ customer: data.stripe_customer, status: "trialing", limit: 1 });
    const sub = subs.data[0];
    if (!sub) return res.status(400).json({ error: "No active trial found." });

    await stripe.subscriptions.update(sub.id, {
      items: [{ id: sub.items.data[0].id, price: newPriceId }],
      proration_behavior: "none",
    });

    const newMrr = plan === "pro" ? 24.99 : 9.99;
    await supabase.from("businesses").update({ plan_type: plan, mrr: newMrr }).eq("slug", req.session.slug);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;