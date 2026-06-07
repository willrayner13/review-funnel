const express = require('express');
const supabase = require('../config/database');
const smsService = require('../services/smsService');
const { INDUSTRY_DELAYS } = require('../config/benchmarks');

const router = express.Router();

// Twilio webhook for incoming SMS triggers
router.post('/sms-trigger/:slug?', async (req, res) => {
  const { Body, From, To } = req.body;  // 'To' is your Twilio number
  let slug = req.params.slug;
  
  // If no slug in URL, look it up by the receiving number
  if (!slug) {
    const { data: business } = await supabase
      .from('businesses')
      .select('slug')
      .eq('autopilot_trigger_number', To)
      .single();
    
    if (business) slug = business.slug;
    else return res.send('<Response></Response>');
  }  const { slug } = req.params;
  const { Body, From } = req.body;
  
  if (!Body || !From) {
    return res.send('<Response></Response>');
  }
  
  const trimmedBody = Body.trim();
  const parts = trimmedBody.split(' ');
  const customerPhone = parts[0];
  const service = parts.slice(1).join(' ') || null;
  
  // Validate it looks like a UK phone number (basic check)
  const phoneRegex = /^(07|\+447|00447)\d{9}$/;
  if (!phoneRegex.test(customerPhone.replace(/\s/g, ''))) {
    // Not a trigger SMS - ignore silently
    return res.send('<Response></Response>');
  }
  
  // Get business settings
  const { data: business, error } = await supabase
    .from('businesses')
    .select('autopilot_enabled, autopilot_delay_hours, autopilot_quiet_hours_start, autopilot_quiet_hours_end, industry, name, autopilot_action')
    .eq('slug', slug)
    .single();
  
  if (error || !business?.autopilot_enabled) {
    await smsService.sendSMS(From, `❌ Auto-Pilot not enabled. Enable in your ReviewLift dashboard.`);
    return res.send('<Response></Response>');
  }
  
  const delayHours = business.autopilot_delay_hours || 
                     INDUSTRY_DELAYS?.[business.industry]?.default || 2;
  
  let sendAt = new Date();
  sendAt.setHours(sendAt.getHours() + delayHours);
  
  // Quiet hours (default: don't send 9pm-8am)
  const quietStart = business.autopilot_quiet_hours_start || 21;
  const quietEnd = business.autopilot_quiet_hours_end || 8;
  
  if (sendAt.getHours() >= quietStart || sendAt.getHours() < quietEnd) {
    sendAt.setDate(sendAt.getDate() + 1);
    sendAt.setHours(quietEnd, 0, 0, 0);
  }
  
  // Queue the review request
  const { error: queueError } = await supabase
    .from('review_queue')
    .insert({
      business_slug: slug,
      customer_phone: customerPhone,
      service: service,
      trigger_source: 'sms',
      send_at: sendAt.toISOString(),
      status: 'pending'
    });
  
  if (queueError) {
    console.error('Queue error:', queueError);
    await smsService.sendSMS(From, `❌ Error queuing request. Contact support.`);
  } else {
    const confirmMsg = `✓ Review request queued for ${customerPhone}. Sends in ${delayHours} hour${delayHours === 1 ? '' : 's'}.`;
    await smsService.sendSMS(From, confirmMsg);
  }
  
  // Log the automation trigger
  await supabase.from('automation_logs').insert({
    business_slug: slug,
    trigger_type: 'sms',
    customer_identifier: customerPhone,
    status: 'queued'
  });
  
  res.send('<Response></Response>');
});

module.exports = router;