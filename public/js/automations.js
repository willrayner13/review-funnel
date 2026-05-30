// ========== AUTOMATIONS MODULE ==========
// ReviewLift Automations - Integrations and automation builder

import { showToast } from './shared/utils.js';

window.showToast = showToast;

const integrationsData = [
  { name: "Calendly", icon: "ti ti-calendar", connected: false, category: "booking" },
  { name: "Stripe", icon: "ti ti-brand-stripe", connected: false, category: "payment" },
  { name: "Square", icon: "ti ti-brand-square", connected: false, category: "payment" },
  { name: "HubSpot", icon: "ti ti-brand-hubspot", connected: false, category: "crm" },
  { name: "Zapier", icon: "ti ti-zap", connected: false, category: "automation" },
  { name: "Google Calendar", icon: "ti ti-calendar-event", connected: true, category: "calendar" },
  { name: "Jobber", icon: "ti ti-briefcase", connected: false, category: "job" },
  { name: "ServiceM8", icon: "ti ti-tools", connected: false, category: "job" }
];

function renderIntegrations() {
  const grid = document.getElementById('integrationsGrid');
  if (!grid) return;
  
  grid.innerHTML = integrationsData.map(integ => `
    <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:16px; text-align:center;">
      <i class="${integ.icon}" style="font-size:2rem; color:var(--accent); margin-bottom:12px; display:block;"></i>
      <div style="font-weight:600; margin-bottom:8px;">${integ.name}</div>
      <button onclick="connectIntegration('${integ.name}')" style="background:${integ.connected ? 'rgba(106,158,127,0.15)' : 'var(--accent)'}; color:${integ.connected ? '#6A9E7F' : '#1A1A18'}; border:none; border-radius:20px; padding:6px 16px; font-size:0.7rem; cursor:pointer; width:100%;">
        ${integ.connected ? '✓ Connected' : 'Connect →'}
      </button>
    </div>
  `).join('');
}

function connectIntegration(name) {
  showToast(`Connecting to ${name}...`, "success");
  setTimeout(() => {
    const integ = integrationsData.find(i => i.name === name);
    if (integ) integ.connected = true;
    renderIntegrations();
    showToast(`${name} connected successfully!`, "success");
  }, 1500);
}

function openAutomationModal() {
  showToast("Integration setup wizard coming soon", "success");
}

function showAutomationDemo() {
  showToast("Demo video would play here", "success");
}

function showAllIntegrations() {
  showToast("Full integrations catalog coming soon", "success");
}

function editAutomation() {
  showToast("Automation builder coming soon", "success");
}

function enableAutomation() {
  showToast("Automation enabled! Review requests will be sent automatically.", "success");
}

function refreshConnections() {
  showToast("Syncing connections...", "success");
  setTimeout(() => showToast("All connections up to date", "success"), 1500);
}

// Initialize when DOM is ready
if (document.getElementById('integrationsGrid')) {
  renderIntegrations();
}