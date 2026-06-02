// ===== STATS MODULE =====
// Handles loading dashboard statistics, activity feed, and polling

import { showToast, escapeHtml, getRelativeTime } from '../shared/utils.mjs';
import { buildFeatureTiles } from './features.mjs';
import { loadReputationScore } from './reputation.mjs';
import { loadFunnelSettings } from './funnel-settings.mjs';
import { loadAlertSettings } from './alerts.mjs';

let pollingInterval = null;

function updateGreeting(businessName) {
  const hour = new Date().getHours();
  let greeting;
  if (hour < 12) greeting = "Good morning";
  else if (hour < 18) greeting = "Good afternoon";
  else greeting = "Good evening";
  
  const greetingEl = document.getElementById("greetingText");
  if (greetingEl) {
    greetingEl.innerHTML = `${greeting}, <span style="color:var(--accent);">${escapeHtml(businessName || 'there')}</span>`;
  }
  
  const businessEl = document.getElementById("greetingBusiness");
  if (businessEl && businessName) {
    businessEl.innerHTML = `Welcome back to your dashboard`;
  }
}

function updateTicker(events) {
  const tickerText = document.getElementById("tickerText");
  const tickerContent = document.getElementById("tickerContent");
  const tickerContainer = document.getElementById("activityTicker");
  
  if (!events || events.length === 0) {
    if (tickerText) tickerText.innerHTML = "No recent activity";
    if (tickerContainer) tickerContainer?.setAttribute('data-items', '0');
    return;
  }
  
  const messages = events.map(e => {
    const timeAgo = e.created_at ? getRelativeTime(e.created_at) : "";
    switch (e.event_type) {
      case 'visit': return `👤 Customer visited funnel • ${timeAgo}`;
      case 'positive': return `⭐ New 5-star rating • ${timeAgo}`;
      case 'negative': return `📝 Private feedback received • ${timeAgo}`;
      case 'sms_sent': return `📱 SMS review request sent • ${timeAgo}`;
      case 'email_sent': return `📧 Email review request sent • ${timeAgo}`;
      case 'review_click': return `🔗 Customer clicked to leave review • ${timeAgo}`;
      default: return `${e.event_type.replace('_', ' ')} • ${timeAgo}`;
    }
  });
  
  let displayMessages = [...messages];
  if (messages.length >= 3) displayMessages = [...messages, ...messages];
  if (tickerText) tickerText.innerHTML = displayMessages.join(' &nbsp;&nbsp;•&nbsp;&nbsp; ');
  
  if (tickerContainer) tickerContainer.setAttribute('data-items', messages.length);
  if (tickerContent && messages.length >= 3) {
    tickerContent.style.animation = 'none';
    tickerContent.offsetHeight;
    tickerContent.style.animation = 'tickerScroll 20s linear infinite';
  }
}

async function loadActivityFeed() {
  const container = document.getElementById("activityList");
  if (!container) return;
  
  // Show skeleton loader
  container.innerHTML = Array(5).fill(0).map(() => `
    <div class="skeleton-row">
      <div class="skeleton-icon"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-time"></div>
    </div>
  `).join('');
  
  const res = await fetch("/stats/" + window.slug);
  if (!res.ok) return;
  const stats = await res.json();
  const events = stats.recent_events || [];
  
  if (events.length === 0) {
    container.innerHTML = '<div class="activity-item"><div class="activity-left"><div class="activity-icon visit"><i class="ti ti-eye"></i></div><div class="activity-text">No activity yet</div></div></div>';
    return;
  }
  
  container.innerHTML = events.slice(0, 10).map(e => {
    let iconClass = "visit", iconName = "ti-eye", text = "";
    if (e.event_type === 'visit') { iconClass = "visit"; iconName = "ti-eye"; text = "👤 Customer visited your funnel"; }
    else if (e.event_type === 'positive') { iconClass = "positive"; iconName = "ti-thumb-up"; text = "⭐ New 5-star rating received"; }
    else if (e.event_type === 'negative') { iconClass = "negative"; iconName = "ti-message"; text = "📝 Private feedback captured"; }
    else if (e.event_type === 'sms_sent') { iconClass = "sms"; iconName = "ti-message-circle"; text = "📱 SMS review request sent"; }
    else if (e.event_type === 'email_sent') { iconClass = "sms"; iconName = "ti-mail"; text = "📧 Email review request sent"; }
    else { iconClass = "visit"; iconName = "ti-info-circle"; text = e.event_type.replace('_', ' '); }
    const timeAgo = e.created_at ? getRelativeTime(e.created_at) : "recently";
    return `
      <div class="activity-item">
        <div class="activity-left">
          <div class="activity-icon ${iconClass}"><i class="ti ${iconName}"></i></div>
          <div class="activity-text">${text}</div>
        </div>
        <div class="activity-time">${timeAgo}</div>
      </div>
    `;
  }).join('');
}

async function loadPrivateFeedback() {
  const res = await fetch("/stats/" + window.slug);
  const stats = await res.json();
  const container = document.getElementById("privateFeedbackList");
  if (!container) return;
  
  const feedback = stats.feedback || [];
  if (feedback.length === 0) {
    container.innerHTML = '<p style="color:var(--cream-dim);font-size:0.85rem;">No private feedback yet. When customers choose \'Could be better\', their message appears here — before it can become a public review.</p>';
    return;
  }
  
  container.innerHTML = feedback.map(msg => `
    <div style="background:var(--surface-2);border-left:3px solid var(--danger);border-radius:8px;padding:14px 16px;margin-bottom:10px;">
      <p style="font-size:0.85rem;line-height:1.5;">${escapeHtml(msg)}</p>
    </div>
  `).join('');
}

async function loadGrowthChart() {
  try {
    const res = await fetch("/review-growth/" + window.slug);
    const data = await res.json();
    const months = Object.keys(data).sort();
    const counts = months.map(m => data[m]);
    if (months.length === 0) return;
    
    const canvas = document.getElementById("growthChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    
    // Destroy existing chart if any
    if (window.growthChartInstance) {
      window.growthChartInstance.destroy();
    }
    
    window.growthChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: months,
        datasets: [{
          label: "Reviews collected",
          data: counts,
          borderColor: "#C8A96E",
          backgroundColor: "rgba(200,169,110,0.1)",
          fill: true,
          tension: 0.3,
          pointBackgroundColor: "#C8A96E",
          pointBorderColor: "#1A1A18",
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { labels: { color: "#EAE7DC" } }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(234,231,220,0.1)" },
            ticks: { color: "#EAE7DC" }
          },
          x: {
            ticks: { color: "#EAE7DC", maxRotation: 45, minRotation: 45 }
          }
        }
      }
    });
  } catch (e) {
    console.log("Growth chart error:", e);
  }
}

async function loadDashboardData() {
  const res = await fetch("/stats/" + window.slug);
  if (!res.ok) {
    if (res.status === 401) window.location = "/login";
    return;
  }
  const stats = await res.json();

  // Update sidebar
  const sidebarBiz = document.getElementById("sidebarBizName");
  if (sidebarBiz) sidebarBiz.innerText = stats.business_name || window.slug;
  
  const sidebarPlan = document.getElementById("sidebarPlanName");
  if (sidebarPlan) sidebarPlan.innerText = stats.plan_type === "pro" ? "Pro" : stats.plan_type === "agency" ? "Agency" : "Starter";
  
  const upgradeLink = document.getElementById("upgradeLink");
  if (upgradeLink) upgradeLink.style.display = stats.plan_type === "agency" ? "none" : "flex";

  const reviewLinkElement = document.getElementById("reviewLink");
  if (reviewLinkElement) reviewLinkElement.value = window.location.origin + "/r/" + window.slug;

  updateGreeting(stats.business_name);

  const isAgency = stats.plan_type === 'agency';
  const hasPro = stats.subscription_active && (stats.plan_type === "pro" || stats.plan_type === "agency");
  
  // Set global flags for other modules
  window.isAgency = isAgency;
  window.hasPro = hasPro;
  window.currentPlan = stats.plan_type;

  // Update UI elements
  const statVisits = document.getElementById("statVisits");
  if (statVisits) statVisits.innerText = stats.visits ?? 0;
  
  const statPositive = document.getElementById("statPositive");
  if (statPositive) statPositive.innerText = stats.positive ?? 0;
  
  const statReviews = document.getElementById("statReviews");
  if (statReviews) statReviews.innerText = stats.reviews ?? 0;
  
  const statNegative = document.getElementById("statNegative");
  if (statNegative) statNegative.innerText = stats.negative ?? 0;
  
  const journeyVisits = document.getElementById("journeyVisits");
  if (journeyVisits) journeyVisits.innerText = stats.visits || 0;
  
  const journeyRatings = document.getElementById("journeyRatings");
  if (journeyRatings) journeyRatings.innerText = stats.rating_count || 0;
  
  const journeyClicks = document.getElementById("journeyClicks");
  if (journeyClicks) journeyClicks.innerText = stats.reviews || 0;
  
  const postedRate = stats.visits ? ((stats.reviews / stats.visits) * 100).toFixed(0) : 0;
  const journeyPosted = document.getElementById("journeyPosted");
  if (journeyPosted) journeyPosted.innerText = postedRate + '%';
  
  const journeyProgress = document.getElementById("journeyProgress");
  if (journeyProgress) journeyProgress.style.width = postedRate + '%';

  const avgRatingDisplay = document.getElementById('avgRatingDisplay');
  if (avgRatingDisplay) {
    const avgRating = stats.rating_avg || 0;
    avgRatingDisplay.innerHTML = avgRating > 0 ? `${avgRating} ★` : '—';
  }

  const velocityDisplay = document.getElementById('velocityDisplay');
  if (velocityDisplay) velocityDisplay.innerHTML = `${stats.reviews || 0} this month`;

  const positivePercent = stats.visits ? ((stats.positive / stats.visits) * 100).toFixed(0) : 0;
  const positivePercentDisplay = document.getElementById('positivePercentDisplay');
  if (positivePercentDisplay) positivePercentDisplay.innerHTML = `${positivePercent}%`;

  const reviewsCapturedDisplay = document.getElementById('reviewsCapturedDisplay');
  if (reviewsCapturedDisplay) reviewsCapturedDisplay.innerHTML = stats.reviews || 0;

  // Load components
  await loadReputationScore();
  await loadFunnelSettings();
  await loadAlertSettings();
  
  if (stats.recent_events) updateTicker(stats.recent_events);
  
  if (!isAgency) {
    buildFeatureTiles(stats);
  }
  
  await loadActivityFeed();

  // Set up asset links
  const reviewLink = window.location.origin + "/r/" + window.slug;
  
  const wallUrlEl = document.getElementById("wallUrl");
  if (wallUrlEl) wallUrlEl.value = reviewLink;
  
  const wallPreviewEl = document.getElementById("wallPreviewLink");
  if (wallPreviewEl) wallPreviewEl.href = "/wall/" + window.slug;
  
  const embedCodeEl = document.getElementById("embedCode");
  if (embedCodeEl) embedCodeEl.value = `<a href="${reviewLink}" target="_blank">Leave us a review</a>`;
  
  const webhookUrlEl = document.getElementById("webhookUrl");
  if (webhookUrlEl) webhookUrlEl.value = window.location.origin + "/api/hook/" + window.slug;
  
  const invoiceWebhookEl = document.getElementById("invoiceWebhookUrl");
  if (invoiceWebhookEl) invoiceWebhookEl.value = window.location.origin + "/api/invoice-hook/" + window.slug;
  
  const bizNameEl = document.getElementById("bizNameInput");
  if (bizNameEl) bizNameEl.value = stats.business_name || "";
  
  const reviewLinkInputEl = document.getElementById("reviewLinkInput");
  if (reviewLinkInputEl) reviewLinkInputEl.value = stats.review_link || "";
  
  const assetReviewLinkEl = document.getElementById("assetReviewLink");
  if (assetReviewLinkEl) assetReviewLinkEl.value = reviewLink;
  
  const qrDownloadLink = document.getElementById("qrDownloadLink");
  if (qrDownloadLink) qrDownloadLink.href = "/qr-download/" + window.slug;

  // Toggle Pro/Agency feature visibility
  const smsUnlocked = document.getElementById("smsUnlocked");
  if (smsUnlocked) smsUnlocked.style.display = hasPro ? "block" : "none";
  
  const smsLocked = document.getElementById("smsLocked");
  if (smsLocked) smsLocked.style.display = hasPro ? "none" : "block";
  
  const emailUnlocked = document.getElementById("emailUnlocked");
  if (emailUnlocked) emailUnlocked.style.display = hasPro ? "block" : "none";
  
  const emailLocked = document.getElementById("emailLocked");
  if (emailLocked) emailLocked.style.display = hasPro ? "none" : "block";
  
  const aiUnlocked = document.getElementById("aiUnlocked");
  if (aiUnlocked) aiUnlocked.style.display = hasPro ? "block" : "none";
  
  const aiLocked = document.getElementById("aiLocked");
  if (aiLocked) aiLocked.style.display = hasPro ? "none" : "block";
  
  const sentimentUnlocked = document.getElementById("sentimentUnlocked");
  if (sentimentUnlocked) sentimentUnlocked.style.display = hasPro ? "block" : "none";
  
  const sentimentLocked = document.getElementById("sentimentLocked");
  if (sentimentLocked) sentimentLocked.style.display = hasPro ? "none" : "block";
  
  const sendIntelUnlocked = document.getElementById("sendIntelUnlocked");
  if (sendIntelUnlocked) sendIntelUnlocked.style.display = hasPro ? "block" : "none";
  
  const sendIntelLocked = document.getElementById("sendIntelLocked");
  if (sendIntelLocked) sendIntelLocked.style.display = hasPro ? "none" : "block";
  
  const competitorUnlocked = document.getElementById("competitorUnlocked");
  if (competitorUnlocked) competitorUnlocked.style.display = isAgency ? "block" : "none";
  
  const competitorLocked = document.getElementById("competitorLocked");
  if (competitorLocked) competitorLocked.style.display = isAgency ? "none" : "block";

  // Load Pro features if available
  if (hasPro && !isAgency) {
    // Import dynamically to avoid circular deps
    const { loadSentimentTrends, loadSendIntelligence } = await import('./ai-lab.mjs');
    loadSentimentTrends();
    loadSendIntelligence();
    loadGrowthChart();
    
    const proAnalyticsPreview = document.getElementById("proAnalyticsPreview");
    if (proAnalyticsPreview) proAnalyticsPreview.style.display = "block";
    
    const analyticsUpgradePrompt = document.getElementById("analyticsUpgradePrompt");
    if (analyticsUpgradePrompt) analyticsUpgradePrompt.style.display = "none";
  }

  // Rating distribution chart
  const canvas = document.getElementById("ratingChart");
  const ctx = canvas?.getContext("2d");
  if (ctx && canvas && canvas.offsetParent !== null) {
    if (window.chartInstance) window.chartInstance.destroy();
    
    const dist = stats.rating_distribution || {};
    window.chartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["1 ★", "2 ★", "3 ★", "4 ★", "5 ★"],
        datasets: [{
          data: [dist[1] || 0, dist[2] || 0, dist[3] || 0, dist[4] || 0, dist[5] || 0],
          backgroundColor: ["#C0675A", "#C07A5A", "#C8A96E", "#8BAC6A", "#6A9E7F"],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // SMS/Email counters
  const smsCounter = document.getElementById("smsCounter");
  if (smsCounter) smsCounter.textContent = `You've sent ${stats.sms_sent_this_month || 0} requests this month`;
  
  const emailCounter = document.getElementById("emailCounter");
  if (emailCounter) emailCounter.textContent = `You've sent ${stats.email_sent_this_month || 0} requests this month`;

  // Analytics chart
  const analyticsCanvas = document.getElementById("ratingChartAnalytics");
  const analyticsCtx = analyticsCanvas?.getContext("2d");
  if (analyticsCtx && analyticsCanvas && analyticsCanvas.offsetParent !== null) {
    if (window.analyticsChartInstance) window.analyticsChartInstance.destroy();
    
    const dist = stats.rating_distribution || {};
    window.analyticsChartInstance = new Chart(analyticsCtx, {
      type: "bar",
      data: {
        labels: ["1 ★", "2 ★", "3 ★", "4 ★", "5 ★"],
        datasets: [{
          data: [dist[1] || 0, dist[2] || 0, dist[3] || 0, dist[4] || 0, dist[5] || 0],
          backgroundColor: ["#C0675A", "#C07A5A", "#C8A96E", "#8BAC6A", "#6A9E7F"],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  window.lastStats = stats;
}

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  
  pollingInterval = setInterval(async () => {
    const res = await fetch("/stats/" + window.slug);
    if (!res.ok) return;
    const newStats = await res.json();
    
    const statVisits = document.getElementById("statVisits");
    if (statVisits) statVisits.innerText = newStats.visits ?? 0;
    
    const statPositive = document.getElementById("statPositive");
    if (statPositive) statPositive.innerText = newStats.positive ?? 0;
    
    const statReviews = document.getElementById("statReviews");
    if (statReviews) statReviews.innerText = newStats.reviews ?? 0;
    
    const statNegative = document.getElementById("statNegative");
    if (statNegative) statNegative.innerText = newStats.negative ?? 0;
    
    if (newStats.recent_events) updateTicker(newStats.recent_events);
    await loadActivityFeed();
    await loadReputationScore();
  }, 30000);
}

// Export for use in other modules
export {
  updateGreeting,
  updateTicker,
  loadActivityFeed,
  loadPrivateFeedback,
  loadDashboardData,
  startPolling,
  loadGrowthChart
};