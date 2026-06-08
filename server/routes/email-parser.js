const express = require('express');
const router = express.Router();

// Simple test route - this should work immediately
router.get('/test-email', (req, res) => {
  res.json({ status: 'ok', message: 'Email parser route is working!' });
});

// This is the webhook that Resend/Cloudflare will call
router.post('/inbound-email', async (req, res) => {
  console.log('📧 Email received:', req.body);
  
  const { to, from, subject, html, text } = req.body;
  const match = to?.match(/auto@(.+?)\.reviewlift\.app/);
  const slug = match ? match[1] : null;
  
  if (slug) {
    console.log(`Processing email for business: ${slug}`);
  }
  
  res.status(200).send('OK');
});

// Test endpoint - check if deployed
router.get('/inbound-email', (req, res) => {
  res.json({ status: 'ready', message: 'Email parser is active', timestamp: new Date().toISOString() });
});

module.exports = router;