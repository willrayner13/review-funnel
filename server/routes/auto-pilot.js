const express = require('express');
const supabase = require('../config/database');

const router = express.Router();

// Get Auto-Pilot settings and stats
router.get('/api/auto-pilot/:slug', async (req, res) => {
  const { slug } = req.params;
  
  const { data: business, error } = await supabase
    .from('businesses')
    .select('autopilot_enabled, autopilot_delay_hours, autopilot_action, autopilot_quiet_hours_start, autopilot_quiet_hours_end, autopilot_trigger_number, industry')
    .eq('slug', slug)
    .single();
  
  if (error) return res.status(500).json({ error: error.message });
  
  // Get 30-day stats
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data: sentStats } = await supabase
    .from('review_queue')
    .select('status')
    .eq('business_slug', slug)
    .eq('trigger_source', 'auto_pilot')
    .gte('created_at', thirtyDaysAgo.toISOString());
  
  const sent = sentStats?.length || 0;
  const converted = sentStats?.filter(s => s.status === 'sent')?.length || 0;
  
  res.json({
    ...business,
    autopilot_sent_30d: sent,
    autopilot_converted_30d: converted
  });
});

// Update Auto-Pilot settings
router.post('/update-auto-pilot', async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: 'Not authorised' });
  
  const { autopilot_enabled, autopilot_trigger_method, autopilot_delay_hours, autopilot_action, autopilot_quiet_hours_start, autopilot_quiet_hours_end } = req.body;
  
  const updateData = {
    autopilot_enabled,
    autopilot_trigger_method,
    autopilot_delay_hours,
    autopilot_action,
    autopilot_quiet_hours_start,
    autopilot_quiet_hours_end
  };
  
  const { error } = await supabase
    .from('businesses')
    .update(updateData)
    .eq('slug', req.session.slug);
  
  if (error) return res.status(500).json({ error: error.message });
  
  res.json({ success: true });
});

// Get activity logs
router.get('/api/auto-pilot/logs/:slug', async (req, res) => {
  const { slug } = req.params;
  
  const { data, error } = await supabase
    .from('automation_logs')
    .select('*')
    .eq('business_slug', slug)
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) return res.status(500).json({ error: error.message });
  
  res.json(data || []);
});

// Stripe OAuth connect
router.get('/stripe/connect/:slug', async (req, res) => {
  // Implement Stripe Connect OAuth flow here
  // Redirect to Stripe authorization URL
  res.redirect(`https://connect.stripe.com/oauth/authorize?client_id=${process.env.STRIPE_CLIENT_ID}&scope=read_write&redirect_uri=${process.env.BASE_URL}/stripe/oauth/callback`);
});

module.exports = router;