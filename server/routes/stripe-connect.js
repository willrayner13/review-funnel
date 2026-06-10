const express = require('express');
const supabase = require('../config/database');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

// Start Stripe OAuth flow
router.get('/stripe/connect/:slug', async (req, res) => {
  const { slug } = req.params;
  
  const authUrl = stripe.oauth.authorizeUrl({
    client_id: process.env.STRIPE_CLIENT_ID,
    scope: 'read_write',
    redirect_uri: `${process.env.BASE_URL}/stripe/oauth/callback`,
    state: slug
  });
  
  res.redirect(authUrl);
});

// Stripe OAuth callback
router.get('/stripe/oauth/callback', async (req, res) => {
  const { code, state } = req.query;
  const slug = state;
  
  if (!code) {
    return res.redirect(`/dashboard/${slug}?stripe=error`);
  }
  
  try {
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code: code
    });
    
    await supabase
      .from('businesses')
      .update({ 
        stripe_account_id: response.stripe_user_id,
        stripe_connected: true,
        stripe_connected_at: new Date().toISOString()
      })
      .eq('slug', slug);
    
    // Create webhook endpoint for this business
    const webhookEndpoint = await stripe.webhookEndpoints.create({
      url: `${process.env.BASE_URL}/stripe-webhook/${slug}`,
      enabled_events: ['invoice.paid', 'checkout.session.completed'],
      connect: true
    });
    
    await supabase
      .from('businesses')
      .update({ stripe_webhook_id: webhookEndpoint.id })
      .eq('slug', slug);
    
    res.redirect(`/dashboard/${slug}?stripe=connected`);
    
  } catch (err) {
    console.error('Stripe OAuth error:', err);
    res.redirect(`/dashboard/${slug}?stripe=error`);
  }
});

// Disconnect Stripe
router.post('/stripe/disconnect/:slug', async (req, res) => {
  const { slug } = req.params;
  
  const { data: business } = await supabase
    .from('businesses')
    .select('stripe_account_id, stripe_webhook_id')
    .eq('slug', slug)
    .single();
  
  if (business?.stripe_account_id) {
    try {
      await stripe.oauth.deauthorize({
        client_id: process.env.STRIPE_CLIENT_ID,
        stripe_user_id: business.stripe_account_id
      });
    } catch (e) {}
  }
  
  if (business?.stripe_webhook_id) {
    try {
      await stripe.webhookEndpoints.del(business.stripe_webhook_id);
    } catch (e) {}
  }
  
  await supabase
    .from('businesses')
    .update({ 
      stripe_account_id: null,
      stripe_connected: false,
      stripe_webhook_id: null,
      stripe_connected_at: null
    })
    .eq('slug', slug);
  
  res.json({ success: true });
});

// Get Stripe connection status
router.get('/api/stripe/status/:slug', async (req, res) => {
  const { slug } = req.params;
  
  const { data: business } = await supabase
    .from('businesses')
    .select('stripe_connected, stripe_account_id, stripe_connected_at')
    .eq('slug', slug)
    .single();
  
  res.json({
    connected: business?.stripe_connected || false,
    account_id: business?.stripe_account_id,
    connected_at: business?.stripe_connected_at
  });
});

module.exports = router;