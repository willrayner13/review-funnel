// ===== DASHBOARD MAIN - ENTRY POINT =====
// This file initializes everything after DOM is ready

import { initNavigation, navigateTo } from './navigation.mjs';
import { initStats, loadDashboardData, startPolling } from './stats.mjs';
import { initModals, openModal, closeModal } from '../shared/modal.mjs';
import { initAlerts, loadAlertSettings } from './alerts.mjs';
import { initAgency, loadAgencyClients, checkClientMode } from './agency.mjs';
import { initCampaigns } from './campaigns.mjs';
import { initAILab } from './ai-lab.mjs';
import { initAssets } from './assets.mjs';
import { showToast } from '../shared/utils.mjs';

// Global variables (accessible to other scripts via window)
window.slug = null;
window.currentPlan = "starter";
window.chartInstance = null;
window.analyticsChartInstance = null;
window.pollingInterval = null;
window.lastStats = null;

// Initialize dashboard
async function initDashboard() {
  try {
    // Check session
    const sessionRes = await fetch("/session");
    const sessionData = await sessionRes.json();
    
    if (!sessionData.loggedIn) {
      window.location = "/login";
      return;
    }
    
    window.slug = sessionData.slug;
    
    // Check if in agency client mode
    await checkClientMode();
    
    // Initialize shared modules
    initModals();
    
    // Load all dashboard data
    await loadDashboardData();
    
    // Initialize all modules
    initNavigation();
    initAlerts();
    initCampaigns();
    initAILab();
    initAssets();
    
    // Start real-time polling
    startPolling();
    
    // Load agency features if applicable
    await initAgency();
    
  } catch (error) {
    console.error("Dashboard init error:", error);
    showToast("Failed to load dashboard", "error");
  }
}

// Expose globally for inline onclick handlers
window.navigateTo = navigateTo;
window.openModal = openModal;
window.closeModal = closeModal;
window.showToast = showToast;

// Start everything when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}