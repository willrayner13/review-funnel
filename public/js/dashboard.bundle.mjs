// dashboard.bundle.js - Single entry point for all dashboard modules

import { initNavigation, navigateTo } from './dashboard/navigation.mjs';
import { loadDashboardData, startPolling, loadActivityFeed } from './dashboard/stats.mjs';import { buildFeatureTiles } from './dashboard/features.mjs';
import { loadReputationScore } from './dashboard/reputation.mjs';
import { initAlerts, loadAlertSettings, saveAlertSettings } from './dashboard/alerts.mjs';
import { initCampaigns, sendSMS, sendEmail } from './dashboard/campaigns.mjs';
import { initAILab, generateRepliesStreaming, copyAiReply, analyseCompetitor } from './dashboard/ai-lab.mjs';
import { initAssets, copyReviewLink, copyEmbedCode, copyWallUrl, copyWebhook, copyInvoiceWebhook, orderNfcCard } from './dashboard/assets.mjs';
import { initAgency, loadAgencyClients, loadAgencyEarnings, checkClientMode, openAddClientModal, copyAgencyLink, switchToClient, removeClient, exitClientMode } from './dashboard/agency.mjs';
import { loadFunnelSettings } from './dashboard/funnel-settings.mjs';
import { initModals, openModal, closeModal } from './shared/modal.mjs';
import { showToast, escapeHtml, getRelativeTime, copyToClipboard } from './shared/utils.mjs';
import { initFunnelStudio } from './funnel-studio.mjs';
// Global variables
window.slug = null;
window.currentPlan = "starter";
window.chartInstance = null;
window.analyticsChartInstance = null;
window.pollingInterval = null;
window.lastStats = null;

// Expose functions globally for inline onclick handlers
window.navigateTo = navigateTo;
window.openModal = openModal;
window.closeModal = closeModal;
window.showToast = showToast;
window.saveAlertSettings = saveAlertSettings;
window.sendSMS = sendSMS;
window.sendEmail = sendEmail;
window.generateRepliesStreaming = generateRepliesStreaming;
window.copyAiReply = copyAiReply;
window.analyseCompetitor = analyseCompetitor;
window.copyReviewLink = copyReviewLink;
window.copyEmbedCode = copyEmbedCode;
window.copyWallUrl = copyWallUrl;
window.copyWebhook = copyWebhook;
window.copyInvoiceWebhook = copyInvoiceWebhook;
window.orderNfcCard = orderNfcCard;
window.openAddClientModal = openAddClientModal;
window.copyAgencyLink = copyAgencyLink;
window.switchToClient = switchToClient;
window.removeClient = removeClient;
window.exitClientMode = exitClientMode;

window.openAutomationModal = () => showToast('Integration setup wizard coming soon', 'success');
window.showAutomationDemo = () => showToast('Demo video would play here', 'success');
window.showAllIntegrations = () => showToast('Full integrations catalog coming soon', 'success');
window.editAutomation = () => showToast('Automation builder coming soon', 'success');
window.enableAutomation = () => showToast('Automation enabled! Review requests will be sent automatically.', 'success');
window.refreshConnections = () => {
  showToast('Syncing connections...', 'success');
  setTimeout(() => showToast('All connections up to date', 'success'), 1500);
};
window.confirmLogout = () => {
  if (confirm('Are you sure you want to log out?')) {
    window.location = '/logout';
  }
};
window.closeFab = () => {
  const fabMenu = document.getElementById('fabMenu');
  if (fabMenu) fabMenu.style.display = 'none';
};
window.copyReviewLinkAndClose = () => {
  const link = window.location.origin + '/r/' + window.slug;
  navigator.clipboard.writeText(link);
  showToast('Review link copied!', 'success');
  window.closeFab();
};
window.goToAILab = () => {
  window.navigateTo('ai-lab');
  window.closeFab();
};
window.navigateToMobile = (nav) => {
  window.navigateTo(nav);
  document.querySelectorAll('.mobile-tab').forEach(tab => {
    tab.classList.remove('active');
    tab.style.opacity = '0.6';
  });
  const activeTab = document.querySelector(`.mobile-tab[data-tab="${nav}"]`);
  if (activeTab) {
    activeTab.classList.add('active');
    activeTab.style.opacity = '1';
  }
};
window.openNfcModal = () => window.openModal('nfcModal');
window.confirmCancel = () => window.openModal('cancelModal');
window.saveBizDetails = async () => {
  const name = document.getElementById('bizNameInput')?.value;
  const reviewLink = document.getElementById('reviewLinkInput')?.value;
  if (!name) {
    showToast('Business name required', 'error');
    return;
  }
  const res = await fetch('/update-business', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, review_link: reviewLink })
  });
  const data = await res.json();
  if (data.success) {
    showToast('Business details saved!', 'success');
    document.getElementById('sidebarBizName').textContent = name;
  } else {
    showToast('Could not save', 'error');
  }
};
window.changePassword = async () => {
  const current = document.getElementById('currentPw')?.value;
  const newPw = document.getElementById('newPw')?.value;
  const confirm = document.getElementById('confirmPw')?.value;
  if (!current || !newPw) {
    showToast('Please fill in all fields', 'error');
    return;
  }
  if (newPw !== confirm) {
    showToast('New passwords do not match', 'error');
    return;
  }
  if (newPw.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }
  const res = await fetch('/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: current, new_password: newPw })
  });
  const data = await res.json();
  if (data.success) {
    showToast('Password changed!', 'success');
    document.getElementById('currentPw').value = '';
    document.getElementById('newPw').value = '';
    document.getElementById('confirmPw').value = '';
  } else {
    showToast(data.error || 'Could not change password', 'error');
  }
};
window.copyAssetReviewLink = () => {
  const input = document.getElementById('assetReviewLink');
  if (input) {
    navigator.clipboard.writeText(input.value);
    showToast('Link copied!', 'success');
  }
};
window.handleModalOverlay = (e, id) => {
  if (e.target === document.getElementById(id)) {
    window.closeModal(id);
  }
};
window.doCancel = async () => {
  const btn = document.getElementById('confirmCancelBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Cancelling...';
  }
  try {
    const res = await fetch('/cancel-subscription', { method: 'POST' });
    const data = await res.json();
    window.closeModal('cancelModal');
    if (data.success) {
      showToast('Subscription cancelled. You keep access until your billing period ends.', 'success');
      setTimeout(() => window.location.reload(), 2000);
    } else {
      showToast(data.error || 'Could not cancel', 'error');
    }
  } catch (e) {
    window.closeModal('cancelModal');
    showToast('Something went wrong', 'error');
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Yes, cancel';
  }
};

// Initialize dashboard
// Initialize dashboard
async function initDashboard() {
  try {
    const sessionRes = await fetch("/session");
    const sessionData = await sessionRes.json();
    
    if (!sessionData.loggedIn) {
      window.location = "/login";
      return;
    }
    
    window.slug = sessionData.slug;
    
    await checkClientMode();
    initModals();
await loadDashboardData();
initNavigation();
initAlerts();
initCampaigns();
initAILab();
initAssets();
startPolling();

    // Initialize Funnel Studio
if (typeof initFunnelStudio === 'function' && window.slug) {
  initFunnelStudio(window.slug);
}
    
    // Only load agency features if user is actually an agency
    if (window.isAgency) {
      await initAgency();
    } else {
      // Hide agency section for non-agency users
      const agencySection = document.getElementById("agencyClientsSection");
      if (agencySection) agencySection.style.display = "none";
    }
    
    // Initialize FAB menu
    const fabMain = document.getElementById('fabMain');
    const fabMenu = document.getElementById('fabMenu');
    if (fabMain && fabMenu) {
      fabMain.addEventListener('click', () => {
        if (fabMenu.style.display === 'flex') {
          fabMenu.style.display = 'none';
        } else {
          fabMenu.style.display = 'flex';
        }
      });
    }
    
    // Initialize Funnel Studio if on that section
    const fsSection = document.getElementById('funnelStudioSection');
    if (fsSection) {
      const observer = new MutationObserver(() => {
        if (fsSection.classList.contains('active') && window.slug) {
          const linkDisplay = document.getElementById('fsLinkDisplay');
          if (linkDisplay && !linkDisplay.textContent.includes(window.slug)) {
            linkDisplay.textContent = window.location.origin + '/r/' + window.slug;
          }
        }
      });
      observer.observe(fsSection, { attributes: true, attributeFilter: ['class'] });
    }
    
  } catch (error) {
    console.error("Dashboard init error:", error);
    showToast("Failed to load dashboard", "error");
  }
}

// Start everything when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}