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

// Smart Send - uses AI to suggest best channel and time
async function smartSend() {
  const phone = document.getElementById("customerPhone")?.value.trim();
  const email = document.getElementById("customerEmail")?.value.trim();
  
  if (!phone && !email) {
    showToast("Please enter a phone number or email address.", "error");
    return;
  }
  
  const btn = document.getElementById("smartSendBtn");
  if (btn) {
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.textContent = "Analysing best channel...";
  }
  
  // Load send intelligence if not already loaded
  if (!sendIntelData) {
    await loadSendIntelligence();
  }
  
  let bestChannel = "sms";
  let confidence = "medium";
  let bestTime = "Now";
  
  if (sendIntelData && sendIntelData.recommendation) {
    bestChannel = sendIntelData.recommendation.recommended_channel;
    confidence = sendIntelData.recommendation.confidence || "medium";
    bestTime = sendIntelData.recommendation.best_window || "Now";
  }
  
  // Show recommendation before sending
  const userConfirmed = confirm(
    `📊 Send Intelligence says:\n\n` +
    `Best channel: ${bestChannel.toUpperCase()}\n` +
    `Best time: ${bestTime}\n` +
    `Confidence: ${confidence}\n\n` +
    `Send a ${bestChannel.toUpperCase()} review request now?`
  );
  
  if (!userConfirmed) {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('btn-loading');
      btn.textContent = "✨ Smart Send";
    }
    return;
  }
  
  // Send using the recommended channel
  if (bestChannel === "sms" && phone) {
    const smsBtn = document.querySelector('#smsUnlocked button');
    if (smsBtn) {
      smsBtn.click();
    } else {
      showToast("Please enter a phone number for SMS", "error");
    }
  } else if (bestChannel === "email" && email) {
    const emailBtn = document.querySelector('#emailUnlocked button');
    if (emailBtn) {
      emailBtn.click();
    } else {
      showToast("Please enter an email address", "error");
    }
  } else if (bestChannel === "sms" && !phone) {
    showToast("Please enter a phone number to use SMS", "error");
  } else if (bestChannel === "email" && !email) {
    showToast("Please enter an email address to use email", "error");
  }
  
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.textContent = "✨ Smart Send";
  }
}

// Add Smart Send button to the UI
async function addSmartSendButton() {
  const smsPanel = document.querySelector('#smsUnlocked .panel');
  if (!smsPanel) return;
  
  // Check if button already exists
  if (document.getElementById('smartSendBtn')) return;
  
  // Load send intelligence
  await loadSendIntelligence();
  
  let buttonText = "✨ Smart Send";
  let buttonHint = "";
  
  if (sendIntelData && sendIntelData.recommendation) {
    const channel = sendIntelData.recommendation.recommended_channel.toUpperCase();
    const rate = sendIntelData.recommendation.predicted_conversion_rate;
    buttonHint = `AI recommends ${channel} (${rate}% predicted conversion)`;
    buttonText = `✨ Smart Send (${channel})`;
  }
  
  // Create a wrapper div for the smart send button
  const smartSendWrapper = document.createElement('div');
  smartSendWrapper.style.marginTop = '16px';
  smartSendWrapper.style.paddingTop = '16px';
  smartSendWrapper.style.borderTop = '1px solid var(--border)';
  smartSendWrapper.innerHTML = `
    <button id="smartSendBtn" class="btn-full" style="background: linear-gradient(135deg, var(--accent) 0%, #D4B87A 100%); margin-bottom: 8px;">
      ${buttonText}
    </button>
    ${buttonHint ? `<p style="font-size: 0.7rem; color: var(--cream-dim); text-align: center;">${buttonHint}</p>` : ''}
  `;
  
  smsPanel.appendChild(smartSendWrapper);
  
  const smartBtn = document.getElementById('smartSendBtn');
  if (smartBtn) {
    smartBtn.addEventListener('click', smartSend);
  }
}

// Add SMS sent/responded tracker
async function addSMSTracker() {
  const smsPanel = document.querySelector('#smsUnlocked .panel');
  if (!smsPanel) return;
  
  // Check if tracker already exists
  if (document.getElementById('smsTracker')) return;
  
  try {
    const res = await fetch("/stats/" + window.slug);
    const stats = await res.json();
    const sent = stats.sms_sent_this_month || 0;
    
    // Estimate response rate (30% is typical for review requests)
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
  
  // Add Smart Send button and tracker for Pro users
  if (window.hasPro) {
    setTimeout(() => {
      addSmartSendButton();
      addSMSTracker();
    }, 500);
  }
}

// Expose for global onclick
window.sendSMS = sendSMS;
window.sendEmail = sendEmail;
window.smartSend = smartSend;

export { initCampaigns, sendSMS, sendEmail, smartSend, loadSendIntelligence };