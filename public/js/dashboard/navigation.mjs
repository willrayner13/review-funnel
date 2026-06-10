// ===== NAVIGATION MODULE =====
// Handles sidebar navigation, keyboard shortcuts, and hash routing

import { showToast } from '../shared/utils.mjs';

const navIdMap = {
  'overview': 'overviewSection',
  'funnel-studio': 'funnelStudioSection',
  'customers': 'customersSection',
  'campaigns': 'campaignsSection',
  'ai-lab': 'aiLabSection',
  'automations': 'automationsSection',
  'assets': 'assetsSection',
  'analytics': 'analyticsSection',
  'settings': 'settingsSection',
    'auto-pilot': 'autoPilotSection',   // 👈 ADD THIS
  'reports': 'reportsSection'         // 👈 ADD THIS
};

function showNavTransition() {
  const bar = document.getElementById('navProgressBar');
  if (!bar) return;
  bar.style.width = '0%';
  bar.style.opacity = '1';
  setTimeout(() => bar.style.width = '60%', 50);
  setTimeout(() => bar.style.width = '100%', 200);
  setTimeout(() => bar.style.opacity = '0', 400);
}

function navigateTo(nav) {
  const targetNav = document.querySelector(`.nav-item[data-nav="${nav}"]`);
  if (targetNav) targetNav.click();
}

function navigateToMobile(nav) {
  navigateTo(nav);
  document.querySelectorAll('.mobile-tab').forEach(tab => {
    tab.classList.remove('active');
    tab.style.opacity = '0.6';
    const icon = tab.querySelector('i');
    if (icon) icon.style.color = '';
  });
  const activeTab = document.querySelector(`.mobile-tab[data-tab="${nav}"]`);
  if (activeTab) {
    activeTab.classList.add('active');
    activeTab.style.opacity = '1';
    const icon = activeTab.querySelector('i');
    if (icon) icon.style.color = 'var(--accent)';
  }
}

function handleHash() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const targetNav = document.querySelector(`.nav-item[data-nav="${hash}"]`);
    if (targetNav) targetNav.click();
  }
}

function initNavigation() {
  // Set up navigation click handlers
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      showNavTransition();
      const target = item.dataset.nav;
      const sectionId = navIdMap[target];
      if (!sectionId) return;
      
      document.title = `ReviewLift — ${item.querySelector('span')?.textContent || target}`;
      document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
      
      const section = document.getElementById(sectionId);
      if (section) section.classList.add('active');
      window.location.hash = target;
      
      // Dynamic imports for specific sections
      if (target === 'customers') {
        import('./stats.mjs').then(module => {
          module.loadPrivateFeedbackInbox();
        });
      }
      if (target === 'assets') {
        // Refresh asset links when assets section loads
        const reviewLink = window.location.origin + "/r/" + window.slug;
        const assetReviewLink = document.getElementById("assetReviewLink");
        if (assetReviewLink) assetReviewLink.value = reviewLink;
        const qrDownloadLink = document.getElementById("qrDownloadLink");
        if (qrDownloadLink) qrDownloadLink.href = "/qr-download/" + window.slug;
      }
      
      const mainEl = document.querySelector('.main');
      if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Mobile menu functions
window.toggleMobileMenu = function() {
  const menu = document.getElementById('mobileMoreMenu');
  if (menu) {
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  }
};

window.closeMobileMenu = function() {
  const menu = document.getElementById('mobileMoreMenu');
  if (menu) menu.style.display = 'none';
};

// Update mobile badge for unread feedback
window.updateMobileInboxBadge = function(count) {
  const badge = document.getElementById('mobileInboxBadge');
  if (badge) {
    badge.style.display = count > 0 ? 'block' : 'none';
  }
};

// Update mobile send badge (show if user has Pro features)
window.updateMobileSendBadge = function(hasPro) {
  const badge = document.getElementById('mobileSendBadge');
  if (badge) {
    badge.style.display = hasPro ? 'block' : 'none';
  }
};

// Close menu when clicking outside
document.addEventListener('click', function(e) {
  const menu = document.getElementById('mobileMoreMenu');
  const moreTab = document.querySelector('.mobile-tab[data-tab="more"]');
  if (menu && menu.style.display === 'block' && moreTab && !moreTab.contains(e.target) && !menu.contains(e.target)) {
    closeMobileMenu();
  }
});
  
  // Keyboard shortcuts (Cmd/Ctrl + number)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      const keyMap = {
        '1': 'overview',
        '2': 'funnel-studio',
        '3': 'customers',
        '4': 'campaigns',
        '5': 'ai-lab',
        '6': 'assets',
        '7': 'analytics',
        '8': 'settings'
      };
      if (keyMap[e.key]) {
        e.preventDefault();
        navigateTo(keyMap[e.key]);
      }
    }
  });
  
  // Handle hash on load and hash changes
  handleHash();
  window.addEventListener('hashchange', handleHash);
}

// Expose for inline handlers
window.navigateTo = navigateTo;

export { initNavigation, navigateTo, navigateToMobile, showNavTransition };