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

// ========== PRIVATE FEEDBACK INBOX ==========
async function loadPrivateFeedbackInbox() {
  const res = await fetch("/stats/" + window.slug);
  const stats = await res.json();
  const container = document.getElementById("privateFeedbackList");
  if (!container) return;
  
  const feedback = stats.feedback || [];
  
  // Load read status from localStorage
  const readFeedback = JSON.parse(localStorage.getItem('read_feedback_' + window.slug) || '[]');
  
  // Update sidebar badge count
  const unreadCount = feedback.filter(msg => !readFeedback.includes(msg)).length;
  updateFeedbackBadge(unreadCount);
  
  if (feedback.length === 0) {
    container.innerHTML = '<div class="feedback-inbox-empty">📭 No private feedback yet. When customers choose "Could be better", their messages appear here — before they become public reviews.</div>';
    return;
  }
  
  container.innerHTML = feedback.map(msg => {
    const isRead = readFeedback.includes(msg);
    return `
      <div class="feedback-card ${isRead ? 'read' : 'unread'}" data-message="${escapeHtml(msg).replace(/"/g, '&quot;')}">
        <div class="feedback-card-header">
          <div class="feedback-status ${isRead ? 'status-read' : 'status-unread'}"></div>
          <div class="feedback-time">${getRelativeTime(new Date().toISOString())}</div>
        </div>
        <div class="feedback-message">${escapeHtml(msg)}</div>
        <div class="feedback-actions">
          <button class="feedback-btn reply-btn" onclick="window.replyToFeedback('${escapeHtml(msg).replace(/'/g, "\\'")}')">✉️ Reply via email</button>
          <button class="feedback-btn resolve-btn" onclick="window.markFeedbackResolved('${escapeHtml(msg).replace(/'/g, "\\'")}')">✓ Mark resolved</button>
        </div>
      </div>
    `;
  }).join('');
  
  // Auto-mark as read when viewed
  if (!container.dataset.markedRead) {
    const currentFeedback = feedback.filter(msg => !readFeedback.includes(msg));
    if (currentFeedback.length > 0) {
      const updatedRead = [...readFeedback, ...currentFeedback];
      localStorage.setItem('read_feedback_' + window.slug, JSON.stringify(updatedRead));
      updateFeedbackBadge(0);
    }
    container.dataset.markedRead = 'true';
  }
}

function updateFeedbackBadge(count) {
  const customersNav = document.querySelector('.nav-item[data-nav="customers"]');
  if (!customersNav) return;
  
  if (count > 0) {
    customersNav.classList.add('has-new');
    // Add or update badge number
    let badge = customersNav.querySelector('.nav-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-badge';
      customersNav.appendChild(badge);
    }
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = 'inline-block';
  } else {
    customersNav.classList.remove('has-new');
    const badge = customersNav.querySelector('.nav-badge');
    if (badge) badge.style.display = 'none';
  }
}

// Expose reply and resolve functions globally
window.replyToFeedback = function(message) {
  const subject = encodeURIComponent('Regarding your recent feedback');
  const body = encodeURIComponent('Thank you for your feedback. We take your concerns seriously and would like to address them.\n\nOriginal feedback: "' + message + '"\n\nCould you please share more details so we can make things right?');
  window.location.href = 'mailto:customer@example.com?subject=' + subject + '&body=' + body;
  showToast('Opening email client...', 'success');
};

window.markFeedbackResolved = function(message) {
  // Mark as resolved in localStorage
  const resolvedFeedback = JSON.parse(localStorage.getItem('resolved_feedback_' + window.slug) || '[]');
  if (!resolvedFeedback.includes(message)) {
    resolvedFeedback.push(message);
    localStorage.setItem('resolved_feedback_' + window.slug, JSON.stringify(resolvedFeedback));
  }
  
  // Remove from UI
  const cards = document.querySelectorAll('.feedback-card');
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].dataset.message === message) {
      cards[i].style.opacity = '0.5';
      cards[i].style.pointerEvents = 'none';
      break;
    }
  }
  
  showToast('✓ Marked as resolved', 'success');
};

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

// ========== PULSE STRIP (Always visible top bar) ==========
async function updatePulseStrip(stats) {
  const pulseContainer = document.getElementById('pulseStrip');
  if (!pulseContainer) return;
  
  // Calculate today's stats (from today's events)
  const today = new Date().toISOString().split('T')[0];
  const todayVisits = stats.recent_events?.filter(e => 
    e.created_at?.startsWith(today) && e.event_type === 'visit'
  ).length || 0;
  
  const todayPositive = stats.recent_events?.filter(e => 
    e.created_at?.startsWith(today) && e.event_type === 'positive'
  ).length || 0;
  
  // Calculate weekly trend
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastWeekPositive = stats.recent_events?.filter(e => 
    e.created_at && new Date(e.created_at) >= lastWeek && e.event_type === 'positive'
  ).length || 0;
  
  const thisWeekPositive = stats.positive || 0;
  const trend = thisWeekPositive - lastWeekPositive;
  const trendText = trend > 0 ? `↑ ${trend} from last week` : trend < 0 ? `↓ ${Math.abs(trend)} from last week` : 'same as last week';
  const trendColor = trend > 0 ? 'var(--success)' : trend < 0 ? 'var(--danger)' : 'var(--cream-dim)';
  
  pulseContainer.innerHTML = `
    <div class="pulse-strip">
      <div class="pulse-item">
        <span class="pulse-label">📊 Today's visits</span>
        <span class="pulse-value">${todayVisits}</span>
      </div>
      <div class="pulse-divider"></div>
      <div class="pulse-item">
        <span class="pulse-label">⭐ Today's ratings</span>
        <span class="pulse-value">${todayPositive}</span>
      </div>
      <div class="pulse-divider"></div>
      <div class="pulse-item">
        <span class="pulse-label">📈 Weekly trend</span>
        <span class="pulse-value" style="color: ${trendColor}">${trendText}</span>
      </div>
    </div>
  `;
}

// ========== TODAY'S STORY CARD ==========
async function generateStoryCard(stats) {
  const storyContainer = document.getElementById('todayStoryCard');
  if (!storyContainer) return;
  
  const visits = stats.visits || 0;
  const positive = stats.positive || 0;
  const negative = stats.negative || 0;
  const avgRating = stats.rating_avg || 0;
  const conversionRate = stats.visits ? ((stats.reviews / stats.visits) * 100).toFixed(0) : 0;
  
  // Generate a unique story based on the data
  let storyText = '';
  let storyAction = '';
  let storyIcon = '';
  
  if (visits === 0) {
    storyText = `No visitors yet today. Share your QR code or review link to get started.`;
    storyAction = 'Share your review link →';
    storyIcon = '🔗';
  } else if (positive >= 5) {
    storyText = `You've had ${positive} happy customers give you 5 stars today! That's amazing momentum.`;
    storyAction = 'Share this win →';
    storyIcon = '🎉';
  } else if (negative > 0 && positive === 0) {
    storyText = `You received ${negative} piece${negative > 1 ? 's' : ''} of private feedback. Read and respond to turn things around.`;
    storyAction = 'View private feedback →';
    storyIcon = '💬';
  } else if (conversionRate < 20 && visits > 5) {
    storyText = `Your conversion rate is ${conversionRate}%. Tweaking your funnel headline could boost reviews by up to 18%.`;
    storyAction = 'Optimise your funnel →';
    storyIcon = '🎨';
  } else if (avgRating > 4.5 && positive > 0) {
    storyText = `Your average rating is ${avgRating} ★ — well above the UK national average (4.2). Keep it up!`;
    storyAction = 'Celebrate this milestone →';
    storyIcon = '🏆';
  } else if (positive > 0) {
    storyText = `${positive} happy customer${positive > 1 ? 's' : ''} gave you 5 stars. Every review builds your reputation.`;
    storyAction = 'Send a thank you →';
    storyIcon = '⭐';
  } else {
    storyText = `Your review funnel is live. ${visits} people have visited — now it's time to turn visitors into reviews.`;
    storyAction = 'Create a campaign →';
    storyIcon = '🚀';
  }
  
  storyContainer.innerHTML = `
    <div class="story-card">
      <div class="story-icon">${storyIcon}</div>
      <div class="story-content">
        <div class="story-text">${storyText}</div>
        <button class="story-action" onclick="window.handleStoryAction('${storyAction.replace(' →', '')}')">${storyAction}</button>
      </div>
    </div>
  `;
}

// Add story action handler
window.handleStoryAction = (action) => {
  if (action.includes('Share your review link')) {
    window.copyReviewLinkAndClose();
  } else if (action.includes('View private feedback')) {
    window.navigateTo('customers');
  } else if (action.includes('Optimise your funnel')) {
    window.navigateTo('funnel-studio');
  } else if (action.includes('Celebrate this milestone')) {
    showToast('🎉 Keep up the great work!', 'success');
  } else if (action.includes('Send a thank you')) {
    window.navigateTo('campaigns');
  } else if (action.includes('Create a campaign')) {
    window.navigateTo('campaigns');
  }
};

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

  await updatePulseStrip(stats);
  await generateStoryCard(stats);

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
  await loadBenchmarks(stats); 
  
  if (stats.recent_events) updateTicker(stats.recent_events);
  
  if (!isAgency) {
    // Replace static feature tiles with dynamic action queue
    const { generateActionQueue } = await import('./actions.mjs');
    await generateActionQueue(stats);
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

// ========== INDUSTRY BENCHMARKS ==========
async function loadBenchmarks(stats) {
  const container = document.getElementById('benchmarkContainer');
  if (!container) return;
  
  const industry = stats.industry || 'other';
  const benchmark = INDUSTRY_BENCHMARKS[industry] || INDUSTRY_BENCHMARKS.other;
  
  // Calculate performance ratings
  const ratingDiff = (stats.rating_avg - benchmark.avgRating).toFixed(1);
  const ratingStatus = ratingDiff > 0 ? 'above' : ratingDiff < 0 ? 'below' : 'average';
  const ratingColor = ratingDiff > 0 ? 'var(--success)' : ratingDiff < 0 ? 'var(--danger)' : 'var(--cream-dim)';
  
  const conversionDiff = stats.conversion_rate - benchmark.conversionRate;
  const conversionStatus = conversionDiff > 0 ? 'above' : conversionDiff < 0 ? 'below' : 'average';
  const conversionColor = conversionDiff > 0 ? 'var(--success)' : conversionDiff < 0 ? 'var(--danger)' : 'var(--cream-dim)';
  
  const velocityDiff = stats.reviews - benchmark.reviewVelocity;
  const velocityStatus = velocityDiff > 0 ? 'above' : velocityDiff < 0 ? 'below' : 'average';
  const velocityColor = velocityDiff > 0 ? 'var(--success)' : velocityDiff < 0 ? 'var(--danger)' : 'var(--cream-dim)';
  
  // Calculate overall percentile
  let overallRating = 'Average';
  let overallColor = 'var(--cream-dim)';
  if (ratingDiff > 0.2 && conversionDiff > 5 && velocityDiff > 2) {
    overallRating = 'Top 10%';
    overallColor = 'var(--success)';
  } else if (ratingDiff > 0 && conversionDiff > 0 && velocityDiff > 0) {
    overallRating = 'Above Average';
    overallColor = 'var(--accent)';
  } else if (ratingDiff < -0.2 || conversionDiff < -5) {
    overallRating = 'Needs Attention';
    overallColor = 'var(--danger)';
  }
  
  // Generate insight message
  let insightText = '';
  let insightAction = '';
  
  if (conversionDiff < -5) {
    insightText = `Your conversion rate is ${Math.abs(conversionDiff)}% below the industry average. Try personalising your funnel headline.`;
    insightAction = 'Optimise funnel →';
  } else if (velocityDiff < -2) {
    insightText = `You're collecting ${Math.abs(velocityDiff)} fewer reviews than similar businesses. Send a campaign today.`;
    insightAction = 'Start campaign →';
  } else if (ratingDiff < -0.2) {
    insightText = `Your rating is ${Math.abs(ratingDiff)}★ below the industry average. Check your private feedback for patterns.`;
    insightAction = 'View feedback →';
  } else if (conversionDiff > 10) {
    insightText = `Your conversion rate is ${conversionDiff}% above average! You're outperforming ${benchmark.description}.`;
    insightAction = 'Share this win →';
  } else {
    insightText = `You're performing on par with ${benchmark.description}. A few more reviews could push you above average.`;
    insightAction = 'Send campaign →';
  }
  
  container.innerHTML = `
    <div class="benchmark-section">
      <div class="benchmark-header">
        <h3>📊 Industry Comparison</h3>
        <span class="benchmark-badge" style="background: ${overallColor}20; color: ${overallColor};">${overallRating}</span>
      </div>
      
      <div class="benchmark-grid">
        <div class="benchmark-card">
          <div class="benchmark-label">⭐ Average Rating</div>
          <div class="benchmark-values">
            <div>
              <span class="benchmark-your">${stats.rating_avg || 0} ★</span>
              <span class="benchmark-vs">vs</span>
              <span class="benchmark-industry">${benchmark.avgRating} ★</span>
            </div>
            <div class="benchmark-bar">
              <div class="benchmark-bar-fill" style="width: ${(stats.rating_avg / 5) * 100}%; background: ${ratingColor};"></div>
            </div>
            <div class="benchmark-status ${ratingStatus}">${ratingStatus === 'above' ? '↑ Above average' : ratingStatus === 'below' ? '↓ Below average' : '— Average'}</div>
          </div>
        </div>
        
        <div class="benchmark-card">
          <div class="benchmark-label">📈 Conversion Rate</div>
          <div class="benchmark-values">
            <div>
              <span class="benchmark-your">${stats.conversion_rate || 0}%</span>
              <span class="benchmark-vs">vs</span>
              <span class="benchmark-industry">${benchmark.conversionRate}%</span>
            </div>
            <div class="benchmark-bar">
              <div class="benchmark-bar-fill" style="width: ${Math.min(100, (stats.conversion_rate || 0))}%; background: ${conversionColor};"></div>
            </div>
            <div class="benchmark-status ${conversionStatus}">${conversionStatus === 'above' ? '↑ Above average' : conversionStatus === 'below' ? '↓ Below average' : '— Average'}</div>
          </div>
        </div>
        
        <div class="benchmark-card">
          <div class="benchmark-label">📝 Reviews per Month</div>
          <div class="benchmark-values">
            <div>
              <span class="benchmark-your">${stats.reviews || 0}</span>
              <span class="benchmark-vs">vs</span>
              <span class="benchmark-industry">${benchmark.reviewVelocity}</span>
            </div>
            <div class="benchmark-bar">
              <div class="benchmark-bar-fill" style="width: ${Math.min(100, ((stats.reviews || 0) / benchmark.reviewVelocity) * 100)}%; background: ${velocityColor};"></div>
            </div>
            <div class="benchmark-status ${velocityStatus}">${velocityStatus === 'above' ? '↑ Above average' : velocityStatus === 'below' ? '↓ Below average' : '— Average'}</div>
          </div>
        </div>
      </div>
      
      <div class="benchmark-insight">
        <div class="benchmark-insight-icon">💡</div>
        <div class="benchmark-insight-text">${insightText}</div>
        <button class="benchmark-insight-btn" onclick="window.handleBenchmarkAction('${insightAction.replace(' →', '')}')">${insightAction}</button>
      </div>
    </div>
  `;
}

// Add benchmark action handler
window.handleBenchmarkAction = (action) => {
  if (action.includes('Optimise funnel')) {
    window.navigateTo('funnel-studio');
  } else if (action.includes('Start campaign') || action.includes('Send campaign')) {
    window.navigateTo('campaigns');
  } else if (action.includes('View feedback')) {
    window.navigateTo('customers');
  } else if (action.includes('Share this win')) {
    showToast('🎉 Great work! Keep it up!', 'success');
  }
};

// Export for use in other modules
export {
  updateGreeting,
  updateTicker,
  loadActivityFeed,
  loadPrivateFeedback,
  loadPrivateFeedbackInbox,
  loadDashboardData,
  startPolling,
  loadGrowthChart,
  loadBenchmarks  // ← ADD THIS
};