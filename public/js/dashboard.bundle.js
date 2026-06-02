// dashboard.bundle.js - Single entry point for all dashboard modules

import { initNavigation, navigateTo } from './navigation.js';
import { loadDashboardData, startPolling, loadActivityFeed, loadPrivateFeedback } from './stats.js';
import { buildFeatureTiles } from './features.js';
import { loadReputationScore } from './reputation.js';
import { initAlerts, loadAlertSettings, saveAlertSettings } from './alerts.js';
import { initCampaigns, sendSMS, sendEmail } from './campaigns.js';
import { initAILab, generateRepliesStreaming, copyAiReply, analyseCompetitor } from './ai-lab.js';
import { initAssets, copyReviewLink, copyEmbedCode, copyWallUrl, copyWebhook, copyInvoiceWebhook, orderNfcCard } from './assets.js';
import { initAgency, loadAgencyClients, loadAgencyEarnings, checkClientMode, openAddClientModal, copyAgencyLink, switchToClient, removeClient, exitClientMode } from './agency.js';
import { loadFunnelSettings } from './funnel-settings.js';
import { initModals, openModal, closeModal } from '../shared/modal.js';
import { showToast, escapeHtml, getRelativeTime, copyToClipboard } from '../shared/utils.js';

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