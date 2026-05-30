const express = require("express");
const stripe = require("../config/stripe");
const supabase = require("../config/database");

const router = express.Router();

// Subscription status
router.get("/subscription-status/:slug", async (req, res) => {
  const { data, error } = await supabase
    .from("businesses")
    .select("name, subscription_active, plan_type, trial_ends_at, review_link, stripe_customer")
    .eq("slug", req.params.slug)
    .single();

  if (error || !data) return res.status(404).json({ error: "Not found" });

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

// Create checkout session
router.post("/create-checkout", async (req, res) => {
  const { slug, plan } = req.body;
  let priceId;

  if (plan === "pro") priceId = process.env.Pro_subscription;
  else if (plan === "agency") priceId = process.env.Agency_subscription;
  else priceId = process.env.Starter_subscription;

  if (!priceId) {
    console.error("Missing price ID");
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