const express = require("express");
const stripe = require("../config/stripe");
const supabase = require("../config/database");
const multer = require('multer');
const Papa = require('papaparse');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });


// Stripe webhook - MUST use express.raw() for this specific route
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  console.log("=== WEBHOOK RECEIVED ===");
  console.log("Signature present:", !!sig);
  console.log("Webhook secret present:", !!webhookSecret);

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return res.status(500).send("Webhook secret not configured");
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log("✅ Webhook verified - event type:", event.type);
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle checkout.session.completed
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const slug = session.metadata.slug;
    const plan = session.metadata.plan;
    const customer = session.customer;
    const subscriptionId = session.subscription;

    console.log(`Processing checkout.session.completed for ${slug}, plan: ${plan}, customer: ${customer}`);

    try {
      let mrr = 0;
      if (plan === "pro") mrr = 24.99;
      else if (plan === "agency") mrr = 79;
      else mrr = 9.99;

      const { error: updateError } = await supabase
        .from("businesses")
        .update({
          subscription_active: true,
          plan_type: plan,
          stripe_customer: customer,
          stripe_subscription_id: subscriptionId,
          subscribed_at: new Date().toISOString(),
          mrr: mrr
        })
        .eq("slug", slug);

      if (updateError) {
        console.error("Supabase update error:", updateError);
      } else {
        console.log(`✅ Business ${slug} updated to ${plan} plan`);
      }

      const { data: biz } = await supabase
        .from("businesses")
        .select("referred_by")
        .eq("slug", slug)
        .single();

      if (biz && biz.referred_by) {
        await supabase.from("referral_conversions").insert({
          referral_code: biz.referred_by,
          business_slug: slug,
          plan: plan,
          converted_at: new Date().toISOString(),
        });
        console.log(`✅ Referral conversion recorded for ${slug}`);
      }
    } catch (err) {
      console.error("Error processing webhook:", err);
    }
  }

  // Handle subscription events
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

router.post('/upload-csv/:slug', upload.single('file'), async (req, res) => {
  const { slug } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const csvString = req.file.buffer.toString('utf8');
  
  Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const customers = results.data;
      let queued = 0;
      
      const { data: business } = await supabase
        .from('businesses')
        .select('autopilot_delay_hours')
        .eq('slug', slug)
        .single();
      
      const delayHours = business?.autopilot_delay_hours || 2;
      
      for (const customer of customers) {
        const phone = customer.phone || customer.mobile || customer.tel;
        const email = customer.email;
        const name = customer.name || customer.full_name;
        const service = customer.service || customer.job_type;
        
        if (!phone && !email) continue;
        
        const sendAt = new Date();
        sendAt.setHours(sendAt.getHours() + delayHours);
        sendAt.setMinutes(sendAt.getMinutes() + queued); // Stagger to avoid spam
        
        await supabase.from('review_queue').insert({
          business_slug: slug,
          customer_name: name,
          customer_phone: phone,
          customer_email: email,
          service: service,
          trigger_source: 'csv',
          send_at: sendAt.toISOString(),
          status: 'pending'
        });
        
        queued++;
      }
      
      res.json({ success: true, queued, total: customers.length });
    },
    error: (error) => {
      res.status(500).json({ error: error.message });
    }
  });
});

module.exports = router;