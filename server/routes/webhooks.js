const express = require("express");
const stripe = require("../config/stripe");
const supabase = require("../config/database");

const router = express.Router();

// Stripe webhook
router.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
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

      const { data: biz } = await supabase.from("businesses").select("referred_by").eq("slug", slug).single();
      if (biz && biz.referred_by) {
        await supabase.from("referral_conversions").insert({
          referral_code: biz.referred_by,
          business_slug: slug,
          plan: plan,
          converted_at: new Date().toISOString(),
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
    await supabase.from("businesses").update({ subscription_active: false }).eq("stripe_customer", customer);
    console.log(`Payment failed: ${customer}`);
  }

  res.json({ received: true });
});

module.exports = router;