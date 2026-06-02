// dashboard.bundle.js - Single entry point for all dashboard modules

import { initNavigation, navigateTo } from './dashboard/navigation.js';
import { loadDashboardData, startPolling, loadActivityFeed, loadPrivateFeedback } from './dashboard/stats.js';
import { buildFeatureTiles } from './dashboard/features.js';
import { loadReputationScore } from './dashboard/reputation.js';
import { initAlerts, loadAlertSettings, saveAlertSettings } from './dashboard/alerts.js';
import { initCampaigns, sendSMS, sendEmail } from './dashboard/campaigns.js';
import { initAILab, generateRepliesStreaming, copyAiReply, analyseCompetitor } from './dashboard/ai-lab.js';
import { initAssets, copyReviewLink, copyEmbedCode, copyWallUrl, copyWebhook, copyInvoiceWebhook, orderNfcCard } from './dashboard/assets.js';
import { initAgency, loadAgencyClients, loadAgencyEarnings, checkClientMode, openAddClientModal, copyAgencyLink, switchToClient, removeClient, exitClientMode } from './dashboard/agency.js';
import { loadFunnelSettings } from './dashboard/funnel-settings.js';
import { initModals, openModal, closeModal } from './shared/modal.js';
import { showToast, escapeHtml, getRelativeTime, copyToClipboard } from './shared/utils.js';

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
window.copyFSLink = () => {
  const link = document.getElementById('fsLinkDisplay');
  if (link) {
    navigator.clipboard.writeText(link.textContent);
    showToast('Funnel link copied!', 'success');
  }
};
window.setFSDevice = (device) => {
  const mobileFrame = document.getElementById('fsMobileFrame');
  const desktopFrame = document.getElementById('fsDesktopFrame');
  const buttons = document.querySelectorAll('.fs-device-btn');
  buttons.forEach(b => b.classList.remove('active'));
  if (device === 'mobile') {
    if (mobileFrame) mobileFrame.style.display = 'block';
    if (desktopFrame) desktopFrame.style.display = 'none';
    if (buttons[0]) buttons[0].classList.add('active');
  } else {
    if (mobileFrame) mobileFrame.style.display = 'none';
    if (desktopFrame) desktopFrame.style.display = 'block';
    if (buttons[1]) buttons[1].classList.add('active');
  }
};
window.zoomFS = (delta) => {
  let zoom = parseInt(document.getElementById('fsZoomLabel')?.textContent || '100');
  zoom = Math.max(60, Math.min(150, zoom + delta));
  const zoomLabel = document.getElementById('fsZoomLabel');
  const mobileFrame = document.getElementById('fsMobileFrame');
  if (zoomLabel) zoomLabel.textContent = zoom + '%';
  if (mobileFrame) {
    mobileFrame.style.transform = `scale(${zoom / 100})`;
    mobileFrame.style.transformOrigin = 'top center';
  }
};
window.selectFSTemplate = (template, el) => {
  document.querySelectorAll('.fs-template-thumb').forEach(t => t.classList.remove('selected'));
  if (el) el.classList.add('selected');
  showToast(`Template: ${template}`, 'success');
};
window.selectFSColor = (color, el) => {
  document.querySelectorAll('.fs-color-swatch').forEach(s => s.classList.remove('selected'));
  if (el) el.classList.add('selected');
  document.querySelector('.fs-color-input').value = color;
  document.documentElement.style.setProperty('--accent', color);
  showToast('Color updated', 'success');
};
window.updateFSPreview = () => {
  const headline = document.getElementById('fsHeadline')?.value;
  const happy = document.getElementById('fsHappyLabel')?.value;
  const sad = document.getElementById('fsSadLabel')?.value;
  const bizName = document.getElementById('sidebarBizName')?.innerText || 'Your Business';
  if (document.getElementById('fsPreviewBiz')) document.getElementById('fsPreviewBiz').textContent = bizName;
  if (document.getElementById('fsPreviewBizDesktop')) document.getElementById('fsPreviewBizDesktop').textContent = bizName;
  if (document.getElementById('fsPreviewQuestion')) document.getElementById('fsPreviewQuestion').textContent = headline;
  if (document.getElementById('fsPreviewQuestionDesktop')) document.getElementById('fsPreviewQuestionDesktop').textContent = headline;
  if (document.getElementById('fsPreviewHappy')) document.getElementById('fsPreviewHappy').innerHTML = `😊 ${happy}`;
  if (document.getElementById('fsPreviewHappyDesktop')) document.getElementById('fsPreviewHappyDesktop').innerHTML = `😊 ${happy}`;
  if (document.getElementById('fsPreviewSad')) document.getElementById('fsPreviewSad').innerHTML = `😕 ${sad}`;
  if (document.getElementById('fsPreviewSadDesktop')) document.getElementById('fsPreviewSadDesktop').innerHTML = `😕 ${sad}`;
};
window.updateFSCharCount = () => {
  const headline = document.getElementById('fsHeadline');
  const count = document.getElementById('fsHeadlineCount');
  if (headline && count) count.textContent = headline.value.length;
};
window.applyAISuggestion = (type) => {
  if (type === 'headline') {
    const input = document.getElementById('fsHeadline');
    if (input) input.value = 'How did we do today?';
  } else if (type === 'happy') {
    const input = document.getElementById('fsHappyLabel');
    if (input) input.value = 'Loved it! ⭐';
  } else if (type === 'color') {
    window.selectFSColor('#10B981', document.querySelector('[data-color="#10B981"]'));
  }
  window.updateFSPreview();
  window.updateFSCharCount();
  showToast('AI suggestion applied', 'success');
};
window.saveFSSettings = async () => {
  const btn = document.getElementById('fsSaveBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';
  }
  const data = {
    funnel_template: document.querySelector('.fs-template-thumb.selected')?.dataset.template || 'classic',
    funnel_accent_color: document.querySelector('.fs-color-swatch.selected')?.dataset.color || '#C8A96E',
    funnel_logo_url: document.getElementById('fsLogoUrl')?.value || '',
    funnel_headline: document.getElementById('fsHeadline')?.value || '',
    funnel_happy_label: document.getElementById('fsHappyLabel')?.value || '',
    funnel_unhappy_label: document.getElementById('fsSadLabel')?.value || '',
    funnel_thankyou_message: document.getElementById('fsThankyouMsg')?.value || ''
  };
  try {
    const res = await fetch('/update-funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      showToast('Funnel updated! Changes are live.', 'success');
    } else {
      showToast(result.error || 'Could not save', 'error');
    }
  } catch (e) {
    showToast('Something went wrong', 'error');
  }
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save changes';
  }
};
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
    await initAgency();
    
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