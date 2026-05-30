// ===== API MODULE =====
// Centralized API calls

const API = {
  // Session
  getSession: () => fetch('/session').then(r => r.json()),
  
  // Business
  getStats: (slug) => fetch(`/stats/${slug}`).then(r => r.json()),
  updateBusiness: (data) => fetch('/update-business', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  changePassword: (data) => fetch('/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  
  // Agency
  getAgencyClients: () => fetch('/agency/clients').then(r => r.json()),
  createAgencyClient: (data) => fetch('/agency/create-client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  getAgencyEarnings: () => fetch('/agency/earnings').then(r => r.json()),
  switchToClient: (clientSlug) => fetch(`/agency/switch-client/${clientSlug}`, { method: 'POST' }).then(r => r.json()),
  exitClientMode: () => fetch('/agency/exit-client-mode', { method: 'POST' }).then(r => r.json()),
  removeClient: (clientSlug) => fetch(`/agency/remove-client/${clientSlug}`, { method: 'DELETE' }).then(r => r.json()),
  
  // Funnel
  updateFunnel: (data) => fetch('/update-funnel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  
  // AI
  generateReply: (review) => fetch('/generate-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ review })
  }).then(r => r.json()),
  
  // Reputation
  getReputation: (slug) => fetch(`/reputation/${slug}`).then(r => r.json()),
  getReviewGrowth: (slug) => fetch(`/review-growth/${slug}`).then(r => r.json()),
  getSentiment: (slug) => fetch(`/sentiment/${slug}`).then(r => r.json()),
  
  // Predict channel
  predictChannel: (slug, data) => fetch(`/predict-channel/${slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  
  // Competitor analysis
  analyseCompetitor: (data) => fetch('/analyse-competitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  
  // NFC
  createNfcCheckout: (data) => fetch('/create-nfc-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  
  // Billing
  createCheckout: (data) => fetch('/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  billingPortal: () => fetch('/billing-portal', { method: 'POST' }).then(r => r.json()),
  cancelSubscription: () => fetch('/cancel-subscription', { method: 'POST' }).then(r => r.json()),
  reactivateSubscription: () => fetch('/reactivate-subscription', { method: 'POST' }).then(r => r.json()),
  
  // Campaigns
  sendSMS: (data) => fetch('/send-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  sendEmail: (data) => fetch('/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  
  // Assets
  downloadQR: (slug) => `/qr-download/${slug}`,
  
  // Feedback
  sendFeedback: (data) => fetch('/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
};

// Expose globally
window.API = API;

export default API;