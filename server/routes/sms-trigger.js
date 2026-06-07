const express = require('express');
const supabase = require('../config/database');
const smsService = require('../services/smsService');

const router = express.Router();

// Twilio webhook for incoming SMS triggers
router.post('/sms-trigger', async (req, res) => {
  try {
    console.log('📱 SMS Trigger hit!', req.body);
    
    const { Body, From, To } = req.body;
    
    if (!Body || !From || !To) {
      console.log('Missing required fields');
      return res.send('<Response></Response>');
    }
    
    // Find which business owns this Twilio number
    const { data: business, error } = await supabase
      .from('businesses')
      .select('slug, autopilot_enabled, autopilot_delay_hours, name')
      .eq('autopilot_trigger_number', To)
      .single();
    
    console.log('Business lookup result:', { businessSlug: business?.slug, error });
    
    if (error || !business) {
      console.log('No business found for number:', To);
      return res.send('<Response></Response>');
    }
    
    if (!business.autopilot_enabled) {
      await smsService.sendSMS(From, `❌ Auto-Pilot not enabled. Enable in your ReviewLift dashboard.`);
      return res.send('<Response></Response>');
    }
    
    // Parse message: "07911 234567 boiler repair"
    const trimmedBody = Body.trim();
    const parts = trimmedBody.split(' ');
    const customerPhone = parts[0];
    const service = parts.slice(1).join(' ') || null;
    
    // Validate UK phone number format
    const ukPhoneRegex = /^(07|\+447|00447)\d{9}$/;
    if (!ukPhoneRegex.test(customerPhone.replace(/\s/g, ''))) {
      await smsService.sendSMS(From, `❌ Invalid format. Send: "07911 234567 service name"`);
      return res.send('<Response></Response>');
    }
    
    // Calculate send time with delay
    const delayHours = business.autopilot_delay_hours || 2;
    const sendAt = new Date();
    sendAt.setHours(sendAt.getHours() + delayHours);
    
    // Queue the review request
    const { error: queueError } = await supabase
      .from('review_queue')
      .insert({
        business_slug: business.slug,
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
      await smsService.sendSMS(From, 
        `✅ Review request queued for ${customerPhone}. Sends in ${delayHours} hour${delayHours === 1 ? '' : 's'}.`
      );
    }
    
    // Log the automation trigger
    await supabase.from('automation_logs').insert({
      business_slug: business.slug,
      trigger_type: 'sms',
      customer_identifier: customerPhone,
      status: 'queued'
    });
    
    res.send('<Response></Response>');
    
  } catch (err) {
    console.error('SMS Trigger Error:', err);
    res.status(500).send('<Response><Message>Server error</Message></Response>');
  }
});

module.exports = router;