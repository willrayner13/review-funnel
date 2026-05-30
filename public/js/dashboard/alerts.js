// ===== ALERTS MODULE =====
// Handles SMS alert settings for private feedback

import { showToast } from '../shared/utils.js';

let alertsEnabled = false;
const alertToggleBg = document.getElementById('alertToggleBg');
const alertToggleDot = document.getElementById('alertToggleDot');
const alertSettingsContent = document.getElementById('alertSettingsContent');

async function loadAlertSettings() {
  try {
    const res = await fetch("/stats/" + window.slug);
    const stats = await res.json();
    
    if (stats.alert_enabled) {
      alertsEnabled = true;
      if (alertToggleBg) alertToggleBg.style.background = 'var(--accent)';
      if (alertToggleDot) {
        alertToggleDot.style.transform = 'translateX(20px)';
        alertToggleDot.style.background = '#1A1A18';
      }
      if (alertSettingsContent) alertSettingsContent.style.display = 'block';
    }
    
    const alertPhone = document.getElementById('alertPhoneNumber');
    if (alertPhone && stats.alert_phone) alertPhone.value = stats.alert_phone;
  } catch (e) {
    console.log("Load alert settings error:", e);
  }
}

function initAlerts() {
  if (!alertToggleBg) return;
  
  alertToggleBg.addEventListener('click', () => {
    alertsEnabled = !alertsEnabled;
    if (alertsEnabled) {
      alertToggleBg.style.background = 'var(--accent)';
      alertToggleDot.style.transform = 'translateX(20px)';
      alertToggleDot.style.background = '#1A1A18';
      if (alertSettingsContent) alertSettingsContent.style.display = 'block';
    } else {
      alertToggleBg.style.background = 'var(--surface-2)';
      alertToggleDot.style.transform = 'translateX(2px)';
      alertToggleDot.style.background = 'var(--cream-dim)';
      if (alertSettingsContent) alertSettingsContent.style.display = 'none';
    }
  });
}

async function saveAlertSettings() {
  const btn = document.getElementById('saveAlertBtn');
  const msg = document.getElementById('alertSettingsMsg');
  
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';
  }

  const data = {
    alert_enabled: alertsEnabled,
    alert_phone: document.getElementById('alertPhoneNumber')?.value.trim() || ''
  };

  try {
    const res = await fetch("/update-business", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    
    if (result.success) {
      showToast("Alert settings saved!", "success");
      if (msg) msg.innerHTML = '<span style="color:#8EC9A8;">✓ Settings saved</span>';
      setTimeout(() => { if (msg) msg.innerHTML = ''; }, 3000);
    } else {
      showToast("Could not save settings", "error");
      if (msg) msg.innerHTML = '<span style="color:#D4897C;">Error saving settings</span>';
    }
  } catch (e) {
    showToast("Could not save settings", "error");
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = 'Save settings';
  }
}

// Expose for global onclick
window.saveAlertSettings = saveAlertSettings;

export { initAlerts, loadAlertSettings, saveAlertSettings, alertsEnabled };