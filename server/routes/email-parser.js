const express = require('express');
const supabase = require('../config/database');
const OpenAI = require('openai');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Receive forwarded email (from Mailgun, Resend, or custom SMTP)
router.post('/inbound-email/:slug', async (req, res) => {
  const { slug } = req.params;
  const { subject, from, text, html, to } = req.body;
  
  console.log(`📧 Email received for ${slug}: ${subject}`);
  
  // Extract email body (prefer HTML, fallback to text)
  const emailBody = html || text || subject;
  
  if (!emailBody || emailBody.length < 50) {
    return res.status(200).send('OK');
  }
  
  // Use AI to extract customer details
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You extract customer booking details from confirmation emails. 
                    Return ONLY valid JSON with these fields: 
                    { "name": string or null, "phone": string or null, "email": string or null, "service": string or null, "appointment_date": string or null }
                    Phone numbers should be in UK format (e.g., 07123456789).
                    If a field cannot be found, return null.`
        },
        {
          role: 'user',
          content: emailBody.substring(0, 3000)
        }
      ],
      response_format: { type: 'json_object' }
    });
    
    const extracted = JSON.parse(completion.choices[0].message.content);
    console.log('📧 Extracted:', extracted);
    
    // Get business settings
    const { data: business } = await supabase
      .from('businesses')
      .select('autopilot_enabled, autopilot_delay_hours, name')
      .eq('slug', slug)
      .single();
    
    if (!business?.autopilot_enabled) {
      console.log(`Auto-Pilot not enabled for ${slug}`);
      return res.status(200).send('OK');
    }
    
    // Queue the review request
    const delayHours = business.autopilot_delay_hours || 2;
    const sendAt = new Date();
    sendAt.setHours(sendAt.getHours() + delayHours);
    
    await supabase.from('review_queue').insert({
      business_slug: slug,
      customer_name: extracted.name,
      customer_phone: extracted.phone,
      customer_email: extracted.email,
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
      status: 'queued'
    });
    
    console.log(`✅ Email queued for ${slug}`);
    
  } catch (err) {
    console.error('Email parsing error:', err);
  }
  
  res.status(200).send('OK');
});

// Generate unique email address for business
router.get('/email-address/:slug', async (req, res) => {
  const { slug } = req.params;
  const emailAddress = `auto@${slug}.reviewlift.app`;
  res.json({ email: emailAddress });
});

module.exports = router;