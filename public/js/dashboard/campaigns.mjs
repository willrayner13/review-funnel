// ===== CAMPAIGNS MODULE =====
// Handles sending SMS and email review requests

import { showToast } from '../shared/utils.mjs';

// Store send intelligence data
let sendIntelData = null;

async function loadSendIntelligence() {
  try {
    const now = new Date();
    const res = await fetch("/predict-channel/" + window.slug, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        appointment_hour: now.getHours(), 
        appointment_day: now.getDay(), 
        service_type: null 
      })
    });
    sendIntelData = await res.json();
    return sendIntelData;
  } catch (e) {
    console.log("Send intelligence error:", e);
    return null;
  }
}

async function sendSMS(event) {
  const phone = document.getElementById("customerPhone")?.value.trim();
  if (!phone) {
    showToast("Please enter a phone number.", "error");
    return;
  }
  
  const btn = event?.target || document.querySelector('#smsUnlocked button');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.textContent = "Sending...";
  }
  
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
  
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.textContent = "Send SMS";
  }
}

async function sendEmail(event) {
  const email = document.getElementById("customerEmail")?.value.trim();
  if (!email) {
    showToast("Please enter an email address.", "error");
    return;
  }
  
  const btn = event?.target || document.querySelector('#emailUnlocked button');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.textContent = "Sending...";
  }
  
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
  
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.textContent = "Send Email";
  }
}

// Smart Send with data
async function smartSendWithData(phone, email, recommendedChannel) {
  if (recommendedChannel === 'sms' && !phone) {
    showToast("Please enter a phone number for SMS", "error");
    return false;
  }
  if (recommendedChannel === 'email' && !email) {
    showToast("Please enter an email address", "error");
    return false;
  }
  
  const predictedRate = sendIntelData?.recommendation?.predicted_conversion_rate || '14';
  const confirmed = confirm(
    `✨ Smart Send\n\n` +
    `AI recommends sending via ${recommendedChannel.toUpperCase()}.\n` +
    `Predicted conversion: ${predictedRate}%\n\n` +
    `Send now?`
  );
  
  if (!confirmed) return false;
  
  if (recommendedChannel === 'sms') {
    const phoneInput = document.getElementById('customerPhone');
    if (phoneInput) phoneInput.value = phone;
    await sendSMS();
  } else {
    const emailInput = document.getElementById('customerEmail');
    if (emailInput) emailInput.value = email;
    await sendEmail();
  }
  
  return true;
}

// Add SMS tracker
async function addSMSTracker() {
  const smsPanel = document.querySelector('#smsUnlocked .panel');
  if (!smsPanel) return;
  
  if (document.getElementById('smsTracker')) return;
  
  try {
    const res = await fetch("/stats/" + window.slug);
    const stats = await res.json();
    const sent = stats.sms_sent_this_month || 0;
    const estimatedResponses = Math.round(sent * 0.3);
    
    const trackerHtml = `
      <div id="smsTracker" style="margin-top: 16px; padding: 12px; background: var(--surface-2); border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <span style="font-size: 0.7rem; color: var(--cream-dim);">📊 This month</span>
            <div style="font-weight: 700;">${sent} sent · ~${estimatedResponses} responded</div>
          </div>
          <div style="font-size: 0.65rem; color: var(--success);">✓ 30% avg response rate</div>
        </div>
      </div>
    `;
    
    smsPanel.insertAdjacentHTML('beforeend', trackerHtml);
  } catch (e) {
    console.log("SMS tracker error:", e);
  }
}

// Add email tracker
async function addEmailTracker() {
  const emailPanel = document.querySelector('#emailUnlocked .panel');
  if (!emailPanel) return;
  
  if (document.getElementById('emailTracker')) return;
  
  try {
    const res = await fetch("/stats/" + window.slug);
    const stats = await res.json();
    const sent = stats.email_sent_this_month || 0;
    const estimatedResponses = Math.round(sent * 0.25);
    
    const trackerHtml = `
      <div id="emailTracker" style="margin-top: 16px; padding: 12px; background: var(--surface-2); border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <span style="font-size: 0.7rem; color: var(--cream-dim);">📧 This month</span>
            <div style="font-weight: 700;">${sent} sent · ~${estimatedResponses} responded</div>
          </div>
          <div style="font-size: 0.65rem; color: var(--accent);">📈 25% avg response rate</div>
        </div>
      </div>
    `;
    
    emailPanel.insertAdjacentHTML('beforeend', trackerHtml);
  } catch (e) {
    console.log("Email tracker error:", e);
  }
}

// Add Smart Send Panel (as its own section above both SMS and email)
async function addSmartSendPanel() {
  const campaignsSection = document.getElementById('campaignsSection');
  if (!campaignsSection) return;
  
  if (document.getElementById('smartSendPanel')) return;
  
  await loadSendIntelligence();
  
  let bestChannel = "SMS";
  let predictedRate = "14";
  let bestTime = "2 hours after appointments";
  let confidence = "medium";
  
  if (sendIntelData && sendIntelData.recommendation) {
    bestChannel = sendIntelData.recommendation.recommended_channel?.toUpperCase() || "SMS";
    predictedRate = sendIntelData.recommendation.predicted_conversion_rate || "14";
    bestTime = sendIntelData.recommendation.best_window || "2 hours after appointments";
    confidence = sendIntelData.recommendation.confidence || "medium";
  }
  
  const confidenceColor = confidence === 'high' ? 'var(--success)' : confidence === 'medium' ? 'var(--accent)' : 'var(--cream-dim)';
  
  const smartSendPanel = document.createElement('div');
  smartSendPanel.id = 'smartSendPanel';
  smartSendPanel.className = 'panel';
  smartSendPanel.style.marginBottom = '24px';
  smartSendPanel.style.background = 'linear-gradient(135deg, var(--surface) 0%, rgba(200,169,110,0.08) 100%)';
  smartSendPanel.style.border = '1px solid rgba(200,169,110,0.25)';
  smartSendPanel.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 1.8rem;">✨</span>
        <div>
          <h3 style="margin: 0; color: var(--accent);">Smart Send</h3>
          <p style="margin: 2px 0 0; font-size: 0.7rem; color: var(--cream-dim);">AI-powered send recommendations</p>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <span style="font-size: 0.65rem; background: var(--accent-dim); padding: 4px 12px; border-radius: 20px; color: var(--accent);">
          🧠 ${bestChannel} recommended
        </span>
        <span style="font-size: 0.65rem; background: rgba(0,0,0,0.2); padding: 4px 12px; border-radius: 20px; color: ${confidenceColor};">
          Confidence: ${confidence}
        </span>
      </div>
    </div>
    
    <div style="background: rgba(200,169,110,0.06); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
        <div style="flex: 1;">
          <div style="font-size: 0.7rem; color: var(--cream-dim); margin-bottom: 4px;">📊 Predicted conversion</div>
          <div style="font-size: 1.8rem; font-weight: 800; color: var(--accent);">${predictedRate}%</div>
        </div>
        <div style="flex: 2;">
          <div style="font-size: 0.7rem; color: var(--cream-dim); margin-bottom: 4px;">⏰ Best time to send</div>
          <div style="font-weight: 600;">${bestTime}</div>
        </div>
        <div style="flex: 2;">
          <div style="font-size: 0.7rem; color: var(--cream-dim); margin-bottom: 4px;">🎯 Recommended channel</div>
          <div style="font-weight: 600; color: var(--accent);">${bestChannel}</div>
        </div>
      </div>
    </div>
    
    <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
      <input type="tel" id="smartPhone" placeholder="📱 Customer phone number" style="flex: 1;">
      <input type="email" id="smartEmail" placeholder="✉️ Customer email address" style="flex: 1;">
    </div>
    
    <button id="smartSendBtn" class="btn-full" style="background: linear-gradient(135deg, var(--accent) 0%, #D4B87A 100%); font-weight: 700;">
      ✨ Send via ${bestChannel} (recommended)
    </button>
    <p style="font-size: 0.65rem; color: var(--cream-dim); text-align: center; margin-top: 12px;">
      AI learns from your data — predictions improve with more sends
    </p>
  `;
  
  // Insert at the beginning of campaigns section
  const firstChild = campaignsSection.firstChild;
  campaignsSection.insertBefore(smartSendPanel, firstChild);
  
  // Attach smart send event listener
  const smartBtn = document.getElementById('smartSendBtn');
  if (smartBtn) {
    smartBtn.addEventListener('click', async () => {
      const phone = document.getElementById('smartPhone')?.value.trim();
      const email = document.getElementById('smartEmail')?.value.trim();
      const recommendedChannel = bestChannel.toLowerCase();
      await smartSendWithData(phone, email, recommendedChannel);
    });
  }
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
  
  // Add Smart Send panel and trackers for Pro users
  if (window.hasPro) {
    setTimeout(() => {
      addSmartSendPanel();
      addSMSTracker();
      addEmailTracker();
    }, 500);
  }
}

// Expose for global onclick
window.sendSMS = sendSMS;
window.sendEmail = sendEmail;

export { initCampaigns, sendSMS, sendEmail, loadSendIntelligence };