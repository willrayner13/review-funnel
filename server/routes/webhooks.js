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

  // Auto-pilot: queue review request when invoice is paid
if (event.type === "invoice.paid") {
  const invoice = event.data.object;
  const customer = invoice.customer;
  const customerEmail = invoice.customer_email;
  const customerName = invoice.customer_name;

  // Find which ReviewLift business owns this Stripe customer
  const { data: business } = await supabase
    .from("businesses")
    .select("slug, name, industry, autopilot_enabled, autopilot_delay_hours")
    .eq("stripe_customer", customer)
    .maybeSingle();

  if (business && business.autopilot_enabled && customerEmail) {
    const delayHours = business.autopilot_delay_hours || 2;
    const sendAt = new Date();
    sendAt.setHours(sendAt.getHours() + delayHours);

    // Quiet hours — don't send 9pm to 8am
    if (sendAt.getHours() >= 21 || sendAt.getHours() < 8) {
      sendAt.setDate(sendAt.getDate() + 1);
      sendAt.setHours(9, 0, 0, 0);
    }

    await supabase.from("review_queue").insert({
      business_slug: business.slug,
      customer_name: customerName || null,
      customer_email: customerEmail,
      service: "invoice payment",
      trigger_source: "stripe_invoice",
      send_at: sendAt.toISOString(),
      status: "pending",
    });

    console.log(`✅ Review request queued for ${customerEmail} after invoice payment`);
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

// Existing Stripe webhook handler
// Add this to your existing webhooks.js
router.post('/stripe-webhook/:slug', async (req, res) => {
  const { slug } = req.params;
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle invoice paid event
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;
    const customerEmail = invoice.customer_email;
    const customerName = invoice.customer_name;
    const amount = invoice.amount_paid / 100;
    const description = invoice.lines?.data[0]?.description || 'invoice';
    
    if (!customerEmail) {
      return res.status(200).send('OK');
    }
    
    // Get business settings
    const { data: business } = await supabase
      .from('businesses')
      .select('autopilot_enabled, autopilot_delay_hours')
      .eq('slug', slug)
      .single();
    
    if (!business?.autopilot_enabled) {
      return res.status(200).send('OK');
    }
    
    const delayHours = business.autopilot_delay_hours || 2;
    const sendAt = new Date();
    sendAt.setHours(sendAt.getHours() + delayHours);
    
    await supabase.from('review_queue').insert({
      business_slug: slug,
      customer_name: customerName,
      customer_email: customerEmail,
      service: `Invoice paid: £${amount} - ${description}`,
      trigger_source: 'stripe',
      send_at: sendAt.toISOString(),
      status: 'pending'
    });
    
    console.log(`💰 Stripe invoice paid for ${slug}, queued review request`);
  }
  
  res.json({ received: true });
});


async function handleStripeInvoice(event) {
  const invoice = event.data.object;
  const customerEmail = invoice.customer_email;
  const customerName = invoice.customer_name;
  const customerPhone = invoice.customer_phone;
  const amount = invoice.amount_paid / 100;
  const description = invoice.lines?.data[0]?.description || 
                      invoice.lines?.data[0]?.plan?.nickname || 
                      'invoice';
  
  if (!customerEmail && !customerPhone) return;
  
  // Find business by Stripe account ID
  const { data: business } = await supabase
    .from('businesses')
    .select('slug, autopilot_enabled, autopilot_delay_hours, name')
    .eq('stripe_account_id', invoice.account)
    .single();
  
  if (!business?.autopilot_enabled) return;
  
  const delayHours = business.autopilot_delay_hours || 2;
  const sendAt = new Date();
  sendAt.setHours(sendAt.getHours() + delayHours);
  
  await supabase.from('review_queue').insert({
    business_slug: business.slug,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    service: description,
    trigger_source: 'stripe',
    send_at: sendAt.toISOString(),
    status: 'pending'
  });
  
  await supabase.from('automation_logs').insert({
    business_slug: business.slug,
    trigger_type: 'stripe',
    customer_identifier: customerEmail || customerPhone,
    status: 'queued',
    message: `Invoice £${amount} - ${description}`
  });
  
  console.log(`💰 Stripe invoice paid for ${business.slug}, queued review request`);
}

async function handleStripeCheckout(event) {
  const session = event.data.object;
  const customerEmail = session.customer_email;
  const customerName = session.customer_details?.name;
  const amount = session.amount_total / 100;
  
  if (!customerEmail) return;
  
  const { data: business } = await supabase
    .from('businesses')
    .select('slug, autopilot_enabled, autopilot_delay_hours')
    .eq('stripe_account_id', session.account)
    .single();
  
  if (!business?.autopilot_enabled) return;
  
  const delayHours = business.autopilot_delay_hours || 2;
  const sendAt = new Date();
  sendAt.setHours(sendAt.getHours() + delayHours);
  
  await supabase.from('review_queue').insert({
    business_slug: business.slug,
    customer_name: customerName,
    customer_email: customerEmail,
    service: `Purchase of £${amount}`,
    trigger_source: 'stripe',
    send_at: sendAt.toISOString(),
    status: 'pending'
  });
}

// Stripe OAuth connection for businesses
router.get('/stripe/connect/:slug', async (req, res) => {
  const { slug } = req.params;
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  
  const authUrl = stripe.oauth.authorizeUrl({
    client_id: process.env.STRIPE_CLIENT_ID,
    scope: 'read_write',
    redirect_uri: `${process.env.BASE_URL}/stripe/oauth/callback`,
    state: slug
  });
  
  res.redirect(authUrl);
});

router.get('/stripe/oauth/callback', async (req, res) => {
  const { code, state } = req.query;
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  
  try {
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code: code
    });
    
    await supabase
      .from('businesses')
      .update({ 
        stripe_account_id: response.stripe_user_id,
        stripe_connected: true
      })
      .eq('slug', state);
    
    res.redirect(`/dashboard/${state}?stripe=connected`);
  } catch (err) {
    console.error('Stripe OAuth error:', err);
    res.redirect(`/dashboard/${state}?stripe=error`);
  }
});

module.exports = router;