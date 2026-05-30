// ===== AGENCY MODULE =====
// Handles agency client management, white-label, and commission tracking

import { showToast, escapeHtml } from '../shared/utils.js';
import { openModal } from '../shared/modal.js';

async function initAgency() {
  await loadAgencyClients();
  await loadAgencyEarnings();
}

async function loadAgencyClients() {
  try {
    const res = await fetch("/agency/clients");
    const data = await res.json();

    if (data.error) {
      const agencySection = document.getElementById("agencyClientsSection");
      if (agencySection) agencySection.style.display = "none";
      return;
    }

    const agencySection = document.getElementById("agencyClientsSection");
    if (agencySection) agencySection.style.display = "block";

    const clientCount = document.getElementById("clientCount");
    const activeClientCount = document.getElementById("activeClientCount");
    const remainingSlots = document.getElementById("remainingSlots");

    if (clientCount) clientCount.textContent = data.agency.total_clients;
    if (activeClientCount) activeClientCount.textContent = data.agency.active_clients;
    if (remainingSlots) remainingSlots.textContent = data.agency.remaining_slots;

    const tbody = document.getElementById("clientsTableBody");
    if (!tbody) return;

    if (data.clients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--cream-dim);">No clients yet. Click "Add New Client" to get started.</td></tr>';
      return;
    }

    tbody.innerHTML = data.clients.map(client => `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:12px 8px;">
          <div style="font-weight:600;">${escapeHtml(client.name)}</div>
          <div style="font-size:0.7rem; color:var(--cream-dim);">${client.email || client.slug}</div>
        </td>
        <td style="padding:12px 8px;">
          <span style="background:${client.plan === 'pro' ? 'rgba(200,169,110,0.15)' : 'var(--surface-3)'}; padding:4px 10px; border-radius:20px; font-size:0.7rem;">
            ${client.plan === 'pro' ? 'Pro' : client.plan === 'agency' ? 'Agency' : 'Starter'}
          </span>
        </td>
        <td style="padding:12px 8px; font-weight:600;">${client.positive_count}</td>
        <td style="padding:12px 8px;">${client.conversion_rate}%</td>
        <td style="padding:12px 8px;">
          ${client.active_subscription ? '<span style="color:#8EC9A8;">● Active</span>' : '<span style="color:rgba(234,231,220,0.3);">○ Trial</span>'}
        </td>
        <td style="padding:12px 8px;">
          <button onclick="window.switchToClient('${client.slug}')" style="background:var(--accent-dim); border:1px solid var(--border); color:var(--cream); padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.7rem; margin-right:6px;">
            🔄 Switch
          </button>
          <button onclick="window.removeClient('${client.slug}')" style="background:transparent; border:1px solid var(--danger); color:var(--danger); padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.7rem;">
            Remove
          </button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error("Load agency clients error:", e);
  }
}

async function loadAgencyEarnings() {
  try {
    const res = await fetch("/agency/earnings");
    const data = await res.json();
    
    const totalMonthly = document.getElementById("agencyMonthlyEarnings");
    if (totalMonthly) totalMonthly.textContent = `£${data.total_monthly_earnings.toFixed(2)}`;
    
    const managedClients = document.getElementById("agencyManagedClients");
    if (managedClients) managedClients.textContent = data.managed_clients;
    
    const referralClients = document.getElementById("agencyReferralClients");
    if (referralClients) referralClients.textContent = data.referral_clients;
  } catch (e) {
    console.error("Load agency earnings error:", e);
  }
}

async function loadAgencyDashboard(stats) {
  const agencyOverview = document.getElementById("agencyOverview");
  if (!agencyOverview) return;
  
  // Build agency dashboard HTML
  agencyOverview.innerHTML = `
    <div style="background:linear-gradient(135deg,var(--surface) 0%,rgba(139,92,246,0.05) 100%); border:1px solid var(--border); border-radius:var(--radius-lg); padding:28px 32px; margin-bottom:24px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:20px;">
      <div>
        <div style="font-size:0.65rem; text-transform:uppercase; letter-spacing:1px; color:rgba(139,92,246,0.7); margin-bottom:6px; font-weight:600;">Monthly commission</div>
        <div style="font-family:'Syne',sans-serif; font-size:2.8rem; font-weight:800; color:var(--accent); line-height:1;" id="agencyMonthlyEarnings">£0.00</div>
        <div style="font-size:0.75rem; color:var(--cream-dim); margin-top:6px;">Next payout: 1st of next month</div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;">
        <div style="background:var(--surface-2); border-radius:10px; padding:14px; text-align:center;">
          <div style="font-family:'Syne',sans-serif; font-size:1.8rem; font-weight:800; color:var(--cream);" id="agencyTotalClients">0</div>
          <div style="font-size:0.65rem; color:var(--cream-dim); text-transform:uppercase; letter-spacing:0.5px; margin-top:4px;">Total clients</div>
        </div>
        <div style="background:var(--surface-2); border-radius:10px; padding:14px; text-align:center;">
          <div style="font-family:'Syne',sans-serif; font-size:1.8rem; font-weight:800; color:var(--success);" id="agencyManagedClients">0</div>
          <div style="font-size:0.65rem; color:var(--cream-dim); text-transform:uppercase; letter-spacing:0.5px; margin-top:4px;">Managed</div>
        </div>
        <div style="background:var(--surface-2); border-radius:10px; padding:14px; text-align:center;">
          <div style="font-family:'Syne',sans-serif; font-size:1.8rem; font-weight:800; color:var(--accent);" id="agencyReferralClients">0</div>
          <div style="font-size:0.65rem; color:var(--cream-dim); text-transform:uppercase; letter-spacing:0.5px; margin-top:4px;">Referrals</div>
        </div>
      </div>
    </div>
    
    <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; margin-bottom:24px;">
      <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
        <span style="font-weight:600; font-family:'Syne',sans-serif;">Client accounts</span>
        <button onclick="window.openAddClientModal()" style="background:rgba(139,92,246,0.15); color:#A78BFA; border:1px solid rgba(139,92,246,0.3); border-radius:8px; padding:7px 16px; font-size:0.8rem; cursor:pointer; font-weight:600;">+ Add client</button>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              <th style="text-align:left; padding:12px 8px; font-size:0.7rem; color:var(--cream-dim);">Business</th>
              <th style="text-align:left; padding:12px 8px; font-size:0.7rem; color:var(--cream-dim);">Plan</th>
              <th style="text-align:left; padding:12px 8px; font-size:0.7rem; color:var(--cream-dim);">Reviews (30d)</th>
              <th style="text-align:left; padding:12px 8px; font-size:0.7rem; color:var(--cream-dim);">Conv. Rate</th>
              <th style="text-align:left; padding:12px 8px; font-size:0.7rem; color:var(--cream-dim);">Status</th>
              <th style="text-align:left; padding:12px 8px; font-size:0.7rem; color:var(--cream-dim);">Actions</th>
            </tr>
          </thead>
          <tbody id="clientsTableBody">
            <tr><td colspan="6" style="text-align:center; padding:40px; color:var(--cream-dim);">Loading clients...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <div style="background:rgba(139,92,246,0.06); border:1px solid rgba(139,92,246,0.2); border-radius:var(--radius); padding:16px 20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
      <div>
        <div style="font-size:0.85rem; font-weight:600; margin-bottom:4px;">White-label settings</div>
        <div style="font-size:0.75rem; color:var(--cream-dim);" id="whitelabelStatus">Not configured — clients see ReviewLift branding</div>
      </div>
      <button onclick="window.navigateTo('settings')" style="background:rgba(139,92,246,0.15); color:#A78BFA; border:1px solid rgba(139,92,246,0.3); border-radius:8px; padding:8px 16px; font-size:0.8rem; cursor:pointer;">Configure →</button>
    </div>
  `;
  
  await loadAgencyClients();
  await loadAgencyEarnings();
}

function openAddClientModal() {
  const link = window.location.origin + '/admin?ref=' + window.slug;
  const input = document.getElementById('agencyReferralLink');
  if (input) input.value = link;
  openModal('addClientModal');
}

function copyAgencyLink() {
  const input = document.getElementById('agencyReferralLink');
  if (input) {
    navigator.clipboard.writeText(input.value);
    showToast('Client signup link copied!', 'success');
  }
}

async function switchToClient(clientSlug) {
  if (!confirm(`Switch to this client's dashboard? You can switch back from your Settings.`)) return;
  
  try {
    const res = await fetch(`/agency/switch-client/${clientSlug}`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      showToast(`Switched to client view`, "success");
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showToast(data.error || "Could not switch", "error");
    }
  } catch (e) {
    showToast("Something went wrong", "error");
  }
}

async function removeClient(clientSlug) {
  if (!confirm(`Remove this client? They will lose access to their dashboard.`)) return;
  
  try {
    const res = await fetch(`/agency/remove-client/${clientSlug}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      showToast("Client removed", "success");
      loadAgencyClients();
    } else {
      showToast(data.error || "Could not remove", "error");
    }
  } catch (e) {
    showToast("Something went wrong", "error");
  }
}

async function exitClientMode() {
  try {
    const res = await fetch("/agency/exit-client-mode", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      showToast("Returned to agency view", "success");
      setTimeout(() => window.location.reload(), 1000);
    }
  } catch (e) {
    console.error("Exit client mode error:", e);
  }
}

async function checkClientMode() {
  const res = await fetch("/session");
  const data = await res.json();
  
  if (data.agency_mode) {
    const topBar = document.querySelector(".top-bar");
    if (topBar && !document.getElementById("clientModeBanner")) {
      const banner = document.createElement("div");
      banner.id = "clientModeBanner";
      banner.style.cssText = "background:rgba(200,169,110,0.15); border-bottom:1px solid var(--accent); padding:8px 20px; text-align:center; font-size:0.8rem; display:flex; align-items:center; justify-content:center; gap:16px;";
      banner.innerHTML = `
        <span>👁️ You are viewing a client dashboard</span>
        <button onclick="window.exitClientMode()" style="background:var(--accent); color:#1A1A18; border:none; padding:6px 16px; border-radius:6px; cursor:pointer;">Exit client mode →</button>
      `;
      document.querySelector(".main").insertBefore(banner, document.querySelector(".main").firstChild);
    }
  }
}

// Expose for global onclick
window.openAddClientModal = openAddClientModal;
window.copyAgencyLink = copyAgencyLink;
window.switchToClient = switchToClient;
window.removeClient = removeClient;
window.exitClientMode = exitClientMode;

export { 
  initAgency, 
  loadAgencyClients, 
  loadAgencyDashboard, 
  loadAgencyEarnings,
  checkClientMode,
  openAddClientModal,
  copyAgencyLink,
  switchToClient,
  removeClient,
  exitClientMode
};