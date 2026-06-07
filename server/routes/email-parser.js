const express = require('express');
const supabase = require('../config/database');
const OpenAI = require('openai');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Receive forwarded email (configure with Mailgun, Resend, or SendGrid)
router.post('/inbound-email/:slug', async (req, res) => {
  const { slug } = req.params;
  const { subject, from, text, html, to, sender } = req.body;
  
  console.log(`📧 Email received for ${slug}: ${subject}`);
  
  const emailBody = html || text || subject;
  
  if (!emailBody || emailBody.length < 50) {
    return res.status(200).send('OK');
  }
  
  try {
    // Extract customer details using AI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You extract customer booking details from confirmation emails. 
                    Return ONLY valid JSON with these fields: 
                    { "name": string or null, "phone": string or null, "email": string or null, "service": string or null, "appointment_date": string or null, "business_name": string or null }
                    Phone numbers should be in UK format (e.g., 07123456789).
                    Appointment date in ISO format if possible.
                    If a field cannot be found, return null.`
        },
        {
          role: 'user',
          content: emailBody.substring(0, 4000)
        }
      ],
      response_format: { type: 'json_object' }
    });
    
    const extracted = JSON.parse(completion.choices[0].message.content);
    console.log('📧 Extracted:', extracted);
    
    // Get business settings
    const { data: business } = await supabase
      .from('businesses')
      .select('autopilot_enabled, autopilot_delay_hours, name, industry')
      .eq('slug', slug)
      .single();
    
    if (!business?.autopilot_enabled) {
      console.log(`Auto-Pilot not enabled for ${slug}`);
      return res.status(200).send('OK');
    }
    
    // Calculate send time
    const delayHours = business.autopilot_delay_hours || 2;
    const sendAt = new Date();
    sendAt.setHours(sendAt.getHours() + delayHours);
    
    // Queue the review request
    await supabase.from('review_queue').insert({
      business_slug: slug,
      customer_name: extracted.name,
      customer_phone: extracted.phone,
      customer_email: extracted.email || (from?.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) || [null])[0],
      service: extracted.service,
      appointment_date: extracted.appointment_date,
      trigger_source: 'email',
      send_at: sendAt.toISOString(),
      status: 'pending'
    });
    
    // Log the automation trigger
    await supabase.from('automation_logs').insert({
      business_slug: slug,
      trigger_type: 'email',
      customer_identifier: extracted.phone || extracted.email || extracted.name,
      status: 'queued',
      message: `Booking: ${extracted.service || 'appointment'}`
    });
    
    console.log(`✅ Email queued for ${slug}`);
    
  } catch (err) {
    console.error('Email parsing error:', err);
  }
  
  res.status(200).send('OK');
});

// Get unique email address for business
router.get('/api/email-address/:slug', async (req, res) => {
  const { slug } = req.params;
  const emailAddress = `auto@${slug}.reviewlift.app`;
  
  // Store in database if not exists
  await supabase
    .from('businesses')
    .update({ autopilot_email_address: emailAddress })
    .eq('slug', slug);
  
  res.json({ email: emailAddress, forwarding_instructions: `
    Set up email forwarding in your booking system:
    1. Go to your booking system settings
    2. Find "Email notifications" or "Forwarding"
    3. Add ${emailAddress} as a CC or forward address
    4. Save changes
    
    Works with: Fresha, Booksy, Calendly, Acuity, Square, Timely, and any system that sends confirmation emails.
  ` });
});

module.exports = router;