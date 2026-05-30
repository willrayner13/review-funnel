// lapsed.html - Account expiration page functionality

let slug = null;
let stats = null;

async function init() {
  // Get slug from URL or session
  const urlParams = new URLSearchParams(window.location.search);
  slug = urlParams.get('slug');
  
  if (!slug) {
    // Try to get from session
    const sessionRes = await fetch("/session");
    const sessionData = await sessionRes.json();
    if (sessionData.loggedIn) {
      slug = sessionData.slug;
    } else {
      // Show error if no slug
      document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card">
          <div class="stat-number">—</div>
          <div class="stat-label">Unable to load stats</div>
        </div>
      `;
      return;
    }
  }
  
  await loadStats();
}

async function loadStats() {
  try {
    const res = await fetch("/lapsed-stats/" + slug);
    if (!res.ok) {
      throw new Error('Failed to load');
    }
    
    const data = await res.json();
    
    // Check if account is actually active
    if (data.active === true) {
      // Account is active - redirect to dashboard
      window.location = "/for-business";
      return;
    }
    
    stats = data;
    updateStatsDisplay();
    
  } catch (e) {
    console.error("Failed to load stats:", e);
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-number">—</div>
        <div class="stat-label">Stats unavailable</div>
      </div>
    `;
  }
}

function updateStatsDisplay() {
  const visits = stats.visits || 0;
  const feedback = stats.feedback || 0;
  const reviews = stats.reviews || 0;
  
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card">
      <div class="stat-number">${visits}</div>
      <div class="stat-label">Total Funnel Visits</div>
      <div class="stat-sub">Customers who used your link</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${feedback}</div>
      <div class="stat-label">Private Feedback Messages</div>
      <div class="stat-sub">Complaints that never reached Google</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${reviews}</div>
      <div class="stat-label">Reviews Collected</div>
      <div class="stat-sub">5-star reviews posted to Google</div>
    </div>
  `;
}

function goToBilling() {
  window.location = "/billing";
}

function goToLogin() {
  window.location = "/login";
}

// Expose functions globally
window.goToBilling = goToBilling;
window.goToLogin = goToLogin;

// Initialize on load
document.addEventListener('DOMContentLoaded', init);