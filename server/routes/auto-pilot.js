const express = require('express');
const supabase = require('../config/database');

const router = express.Router();

// Get Auto-Pilot settings
router.get('/api/auto-pilot/:slug', async (req, res) => {
  const { slug } = req.params;
  
  const { data: business, error } = await supabase
    .from('businesses')
    .select('autopilot_enabled, autopilot_delay_hours, autopilot_action, autopilot_quiet_hours_start, autopilot_quiet_hours_end, autopilot_trigger_method, autopilot_trigger_number')
    .eq('slug', slug)
    .single();
  
  if (error) return res.status(500).json({ error: error.message });
  
  // Get 30-day stats
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data: stats } = await supabase
    .from('review_queue')
    .select('status')
    .eq('business_slug', slug)
    .eq('trigger_source', 'sms')
    .gte('created_at', thirtyDaysAgo.toISOString());
  
  const sent = stats?.filter(s => s.status === 'sent').length || 0;
  const total = stats?.length || 0;
  
  res.json({
    ...business,
    autopilot_sent_30d: sent,
    autopilot_converted_30d: total,
    autopilot_trigger_number: business?.autopilot_trigger_number || '+447846879077'
  });
});

// Update Auto-Pilot settings
router.post('/api/auto-pilot/update', async (req, res) => {
  if (!req.session?.slug) return res.status(401).json({ error: 'Not authenticated' });
  
  const { enabled, delayHours, action, quietStart, quietEnd, triggerMethod } = req.body;
  
  const { error } = await supabase
    .from('businesses')
    .update({
      autopilot_enabled: enabled,
      autopilot_delay_hours: delayHours,
      autopilot_action: action,
      autopilot_quiet_hours_start: quietStart,
      autopilot_quiet_hours_end: quietEnd,
      autopilot_trigger_method: triggerMethod
    })
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

module.exports = router;