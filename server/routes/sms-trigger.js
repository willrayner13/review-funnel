const express = require('express');
const supabase = require('../config/database');
const smsService = require('../services/smsService');

const router = express.Router();

// IMPORTANT: Parse URL-encoded form data from Twilio
router.use(express.urlencoded({ extended: true }));

router.post('/sms-trigger', async (req, res) => {
  try {
    console.log('📱 SMS Trigger received:', req.body);
    
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
    
    console.log('Business found:', business?.slug, 'Enabled:', business?.autopilot_enabled);
    
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
    res.send('<Response></Response>');
  }
});

// Test endpoint - remove after debugging
// Test endpoint to check Twilio credentials
router.get('/test-twilio', async (req, res) => {
  const twilio = require('twilio');
  
  // Log what credentials are loaded
  console.log('TWILIO_SID loaded:', !!process.env.TWILIO_SID);
  console.log('TWILIO_TOKEN loaded:', !!process.env.TWILIO_TOKEN);
  console.log('TWILIO_PHONE loaded:', process.env.TWILIO_PHONE);
  
  if (!process.env.TWILIO_SID || !process.env.TWILIO_TOKEN) {
    return res.json({ 
      success: false, 
      error: 'Missing credentials',
      hasSid: !!process.env.TWILIO_SID,
      hasToken: !!process.env.TWILIO_TOKEN
    });
  }
  
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  
  try {
    const message = await client.messages.create({
      body: 'Test from ReviewLift - credentials working!',
      from: process.env.TWILIO_PHONE,
      to: '+447375030520'
    });
    res.json({ success: true, sid: message.sid });
  } catch (err) {
    res.json({ 
      success: false, 
      error: err.message, 
      code: err.code,
      sid: process.env.TWILIO_SID?.substring(0, 10) + '...'
    });
  }
});

module.exports = router;