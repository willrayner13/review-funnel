const express = require('express');
const supabase = require('../config/database');

const router = express.Router();

// GET settings for a business
router.get('/api/auto-pilot/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    // Get business settings
    const { data: business, error } = await supabase
      .from('businesses')
      .select('autopilot_enabled, autopilot_delay_hours, autopilot_action, autopilot_quiet_hours_start, autopilot_quiet_hours_end, autopilot_trigger_method, industry')
      .eq('slug', slug)
      .single();
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    // Get 30-day stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: queueStats } = await supabase
      .from('review_queue')
      .select('status')
      .eq('business_slug', slug)
      .gte('created_at', thirtyDaysAgo.toISOString());
    
    const sent = queueStats?.filter(s => s.status === 'sent').length || 0;
    const total = queueStats?.length || 0;
    
    // Industry recommendations
    const industryRecs = {
      'plumbing': { optimal_delay: 4, conversion_rate: 22, best_time: 'Evening' },
      'salon': { optimal_delay: 1, conversion_rate: 31, best_time: 'After appointment' },
      'barber': { optimal_delay: 1, conversion_rate: 29, best_time: 'Same day' },
      'dental': { optimal_delay: 12, conversion_rate: 24, best_time: 'Next morning' },
      'default': { optimal_delay: 2, conversion_rate: 27, best_time: '2 hours after' }
    };
    
    const recommendation = industryRecs[business?.industry?.toLowerCase()] || industryRecs.default;
    
    res.json({
      autopilot_enabled: business?.autopilot_enabled || false,
      autopilot_delay_hours: business?.autopilot_delay_hours || 2,
      autopilot_action: business?.autopilot_action || 'sms',
      autopilot_quiet_hours_start: business?.autopilot_quiet_hours_start || 21,
      autopilot_quiet_hours_end: business?.autopilot_quiet_hours_end || 8,
      autopilot_trigger_method: business?.autopilot_trigger_method || 'sms',
      industry: business?.industry || 'default',
      autopilot_sent_30d: sent,
      autopilot_converted_30d: total,
      recommendation: recommendation
    });
    
  } catch (err) {
    console.error('Error fetching auto-pilot settings:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST update settings
router.post('/api/auto-pilot/update', async (req, res) => {
  if (!req.session?.slug) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { enabled, delayHours, action, quietStart, quietEnd, triggerMethod } = req.body;
  
  try {
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
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.json({ success: true });
    
  } catch (err) {
    console.error('Error saving auto-pilot settings:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET activity logs
router.get('/api/auto-pilot/logs/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    const { data, error } = await supabase
      .from('automation_logs')
      .select('*')
      .eq('business_slug', slug)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data || []);
    
  } catch (err) {
    console.error('Error fetching logs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;