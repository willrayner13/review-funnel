// ===== CAMPAIGNS MODULE =====
// Handles sending SMS and email review requests

import { showToast } from '../shared/utils.js';

async function sendSMS() {
  const phone = document.getElementById("customerPhone")?.value.trim();
  if (!phone) {
    showToast("Please enter a phone number.", "error");
    return;
  }
  
  const btn = event.target;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.textContent = "Sending...";
  
  const res = await fetch("/send-sms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, slug: window.slug })
  });
  
  const data = await res.json();
  
  if (data.success) {
    document.getElementById("customerPhone").value = "";
    showToast("SMS sent! ✓", "success");
  } else {
    showToast("SMS failed: " + (data.error || "Check your Twilio credentials."), "error");
  }
  
  btn.disabled = false;
  btn.classList.remove('btn-loading');
  btn.textContent = "Send SMS";
}

async function sendEmail() {
  const email = document.getElementById("customerEmail")?.value.trim();
  if (!email) {
    showToast("Please enter an email address.", "error");
    return;
  }
  
  const btn = event.target;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.textContent = "Sending...";
  
  const res = await fetch("/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  
  const data = await res.json();
  
  if (data.success) {
    document.getElementById("customerEmail").value = "";
    showToast("Email sent! ✓", "success");
  } else {
    showToast(data.error || "Email failed.", "error");
  }
  
  btn.disabled = false;
  btn.classList.remove('btn-loading');
  btn.textContent = "Send Email";
}

function initCampaigns() {
  // Attach event listeners if buttons exist
  const smsBtn = document.querySelector('#smsUnlocked button');
  if (smsBtn && !smsBtn.hasAttribute('data-listener')) {
    smsBtn.setAttribute('data-listener', 'true');
    smsBtn.onclick = sendSMS;
  }
  
  const emailBtn = document.querySelector('#emailUnlocked button');
  if (emailBtn && !emailBtn.hasAttribute('data-listener')) {
    emailBtn.setAttribute('data-listener', 'true');
    emailBtn.onclick = sendEmail;
  }
}

// Expose for global onclick
window.sendSMS = sendSMS;
window.sendEmail = sendEmail;

export { initCampaigns, sendSMS, sendEmail };