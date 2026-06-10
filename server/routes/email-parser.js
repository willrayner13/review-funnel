const express = require('express');
const supabase = require('../config/database');
const router = express.Router();

router.post('/inbound-email', async (req, res) => {
  console.log('📧 Email received:', req.body);
  
  const { to, from, subject, text, slug } = req.body;
  
  if (!slug) {
    return res.status(200).send('OK');
  }
  
  // Simple extraction (you can enhance with regex or AI)
  const extracted = {
    name: extractName(text),
    phone: extractPhone(text),
    email: extractEmail(text),
    service: extractService(text)
  };
  
  console.log('Extracted:', extracted);
  
  // Queue review request
  const delayHours = 2;
  const sendAt = new Date();
  sendAt.setHours(sendAt.getHours() + delayHours);
  
  await supabase.from('review_queue').insert({
    business_slug: slug,
    customer_name: extracted.name,
    customer_phone: extracted.phone,
    customer_email: extracted.email || from,
    service: extracted.service,
    trigger_source: 'email',
    send_at: sendAt.toISOString(),
    status: 'pending'
  });
  
  res.status(200).send('OK');
});

function extractPhone(text) {
  const match = text.match(/(?:\+44|07|0044)\d{9,10}\b/);
  return match ? match[0].replace(/\s/g, '') : null;
}

function extractEmail(text) {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractName(text) {
  const match = text.match(/name:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  return match ? match[1] : null;
}

function extractService(text) {
  const match = text.match(/service:?\s*([A-Za-z][^.\n]{5,30})/i);
  return match ? match[1].trim() : null;
}

router.get('/inbound-email', (req, res) => {
  res.json({ status: 'ready', message: 'Email parser is active' });
});

module.exports = router;