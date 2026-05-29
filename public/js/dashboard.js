// ===== DASHBOARD JAVASCRIPT =====
// ReviewLift Dashboard - Part 1

let slug, currentPlan = "starter", chartInstance = null, lastStats = null, pollingInterval = null;
let analyticsChartInstance = null;

// ========== HELPER FUNCTIONS ==========
function showToast(message, type) {
  const t = document.getElementById("toast");
  t.textContent = type === "success" ? "✓ " + message : "✕ " + message;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove("show"), 4000);
}

function getRelativeTime(dateStr) {
  const date = new Date(dateStr), now = new Date(), diffMins = Math.floor((now - date) / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showNavTransition() {
  const bar = document.getElementById('navProgressBar');
  if (!bar) return;
  bar.style.width = '0%';
  bar.style.opacity = '1';
  setTimeout(() => bar.style.width = '60%', 50);
  setTimeout(() => bar.style.width = '100%', 200);
  setTimeout(() => bar.style.opacity = '0', 400);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  showToast("Link copied!", "success");
}

// ========== NAVIGATION ==========
const navIdMap = {
  'overview': 'overviewSection',
  'funnel-studio': 'funnelStudioSection',
  'customers': 'customersSection',
  'campaigns': 'campaignsSection',
  'ai-lab': 'aiLabSection',
  'automations': 'automationsSection',
  'assets': 'assetsSection',
  'analytics': 'analyticsSection',
  'settings': 'settingsSection'
};

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

// Initialize navigation event listeners
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
    if (target === 'customers') loadPrivateFeedback();
    document.querySelector('.main').scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === '1') navigateTo('overview');
    if (e.key === '2') navigateTo('funnel-studio');
    if (e.key === '3') navigateTo('customers');
    if (e.key === '4') navigateTo('campaigns');
    if (e.key === '5') navigateTo('ai-lab');
    if (e.key === '6') navigateTo('assets');
    if (e.key === '7') navigateTo('analytics');
    if (e.key === '8') navigateTo('settings');
  }
});

// ========== GREETING & TICKER ==========
function updateGreeting(businessName) {
  const hour = new Date().getHours();
  let greeting;
  if (hour < 12) greeting = "Good morning";
  else if (hour < 18) greeting = "Good afternoon";
  else greeting = "Good evening";
  document.getElementById("greetingText").innerHTML = `${greeting}, <span style="color:var(--accent);">${businessName || 'there'}</span>`;
  document.getElementById("greetingBusiness").innerHTML = businessName ? `Welcome back to your dashboard` : '';
}

function updateTicker(events) {
  const tickerText = document.getElementById("tickerText"), tickerContent = document.getElementById("tickerContent"), tickerContainer = document.getElementById("activityTicker");
  if (!events || events.length === 0) {
    tickerText.innerHTML = "No recent activity";
    if (tickerContainer) tickerContainer.setAttribute('data-items', '0');
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
  tickerText.innerHTML = displayMessages.join(' &nbsp;&nbsp;•&nbsp;&nbsp; ');
  if (tickerContainer) tickerContainer.setAttribute('data-items', messages.length);
  if (tickerContent && messages.length >= 3) {
    tickerContent.style.animation = 'none';
    tickerContent.offsetHeight;
    tickerContent.style.animation = 'tickerScroll 20s linear infinite';
  }
}

// ========== COPY FUNCTIONS ==========
function copyReviewLink() {
  let input = document.getElementById("assetReviewLink");
  if (!input) input = document.getElementById("reviewLink");
  if (input && input.value) {
    navigator.clipboard.writeText(input.value);
    showToast("Copied!", "success");
  } else {
    const funnelUrl = window.location.origin + "/r/" + slug;
    navigator.clipboard.writeText(funnelUrl);
    showToast("Copied!", "success");
  }
}

function copyEmbedCode() {
  const reviewLink = window.location.origin + "/r/" + slug;
  const embedHtml = `<a href="${reviewLink}" target="_blank" style="display:inline-block;background:#C8A96E;color:#1A1A18;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Leave us a review →</a>`;
  navigator.clipboard.writeText(embedHtml);
  showToast("Embed code copied!", "success");
}

function copyWallUrl() {
  const input = document.getElementById("wallUrl");
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast("Copied!", "success");
  }
}

function copyWebhook() {
  const input = document.getElementById("webhookUrl");
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast("Copied!", "success");
  }
}

function copyInvoiceWebhook() {
  const input = document.getElementById("invoiceWebhookUrl");
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast("Copied!", "success");
  }
}

function copyAssetReviewLink() {
  const input = document.getElementById("assetReviewLink");
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast("Copied!", "success");
  }
}

function copyAiReply(id) {
  const textarea = document.getElementById(id);
  if (textarea) {
    textarea.select();
    navigator.clipboard.writeText(textarea.value);
    showToast("Copied!", "success");
  }
}

function copyFunnelLink() {
  const funnelUrl = window.location.origin + "/r/" + slug;
  navigator.clipboard.writeText(funnelUrl);
  showToast("Funnel link copied!", "success");
}

function confirmLogout() {
  if (confirm('Are you sure you want to sign out?')) {
    window.location = "/logout";
  }
}

function confirmCancel() {
  openModal("cancelModal");
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function handleModalOverlay(e, id) {
  if (e.target === document.getElementById(id)) {
    closeModal(id);
  }
}

function closeBankModalOnOverlay(e) {
  if (e.target === document.getElementById('bankDetailsModal')) {
    closeModal('bankDetailsModal');
  }
}

// ========== ALERT SETTINGS ==========
const alertToggleBg = document.getElementById('alertToggleBg');
const alertToggleDot = document.getElementById('alertToggleDot');
const alertSettingsContent = document.getElementById('alertSettingsContent');
let alertsEnabled = false;

async function loadAlertSettings() {
  try {
    const res = await fetch("/stats/" + slug);
    const stats = await res.json();
    if (stats.alert_enabled) {
      alertsEnabled = true;
      alertToggleBg.style.background = 'var(--accent)';
      alertToggleDot.style.transform = 'translateX(20px)';
      alertToggleDot.style.background = '#1A1A18';
      if (alertSettingsContent) alertSettingsContent.style.display = 'block';
    }
    const alertPhone = document.getElementById('alertPhoneNumber');
    if (alertPhone && stats.alert_phone) alertPhone.value = stats.alert_phone;
  } catch (e) { }
}

if (alertToggleBg) {
  alertToggleBg.addEventListener('click', () => {
    alertsEnabled = !alertsEnabled;
    if (alertsEnabled) {
      alertToggleBg.style.background = 'var(--accent)';
      alertToggleDot.style.transform = 'translateX(20px)';
      alertToggleDot.style.background = '#1A1A18';
      if (alertSettingsContent) alertSettingsContent.style.display = 'block';
    } else {
      alertToggleBg.style.background = 'var(--surface-2)';
      alertToggleDot.style.transform = 'translateX(2px)';
      alertToggleDot.style.background = 'var(--cream-dim)';
      if (alertSettingsContent) alertSettingsContent.style.display = 'none';
    }
  });
}

async function saveAlertSettings() {
  const btn = document.getElementById('saveAlertBtn');
  const msg = document.getElementById('alertSettingsMsg');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';
  }

  const data = {
    alert_enabled: alertsEnabled,
    alert_phone: document.getElementById('alertPhoneNumber')?.value.trim() || ''
  };

  try {
    const res = await fetch("/update-business", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      showToast("Alert settings saved!", "success");
      if (msg) msg.innerHTML = '<span style="color:#8EC9A8;">✓ Settings saved</span>';
      setTimeout(() => { if (msg) msg.innerHTML = ''; }, 3000);
    } else {
      showToast("Could not save settings", "error");
      if (msg) msg.innerHTML = '<span style="color:#D4897C;">Error saving settings</span>';
    }
  } catch (e) {
    showToast("Could not save settings", "error");
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = 'Save settings';
  }
}

// ========== FEATURE TILES ==========
function buildFeatureTiles(stats) {
  const hasPro = stats.subscription_active && (stats.plan_type === "pro" || stats.plan_type === "agency");
  const isAgency = stats.plan_type === "agency";
  const tiles = [
    { id: "sms", name: "SMS Review Requests", icon: "ti-message", desc: "Send review requests via text", stat: `${stats.sms_sent_this_month || 0} sent this month`, nav: "campaigns", locked: !hasPro, lockMsg: "Upgrade to Pro", category: "communication" },
    { id: "email", name: "Email Campaigns", icon: "ti-mail", desc: "Send review requests via email", stat: `${stats.email_sent_this_month || 0} sent this month`, nav: "campaigns", locked: !hasPro, lockMsg: "Upgrade to Pro", category: "communication" },
    { id: "ai", name: "AI Reply Generator", icon: "ti-sparkles", desc: "Generate replies to reviews", stat: `${stats.ai_replies_generated || 0} replies this month`, nav: "ai-lab", locked: !hasPro, lockMsg: "Upgrade to Pro", category: "ai" },
    { id: "webhook", name: "Webhook Integration", icon: "ti-webhook", desc: "Auto-send review requests", stat: stats.webhook_configured ? "Connected" : "Not set up", nav: "assets", locked: false, category: "communication" },
    { id: "reviewWall", name: "Review Wall", icon: "ti-layout-grid", desc: "Share customer love", stat: `${stats.positive || 0} reviews displayed`, nav: "customers", locked: false, category: "display" },
    { id: "widget", name: "Website Widget", icon: "ti-code", desc: "Embed on your site", stat: "Copy code to install", nav: "assets", locked: false, category: "display" },
    { id: "sentiment", name: "Sentiment Trends", icon: "ti-chart-dots", desc: "AI analysis of feedback", stat: `${stats.feedback_themes || 0} themes identified`, nav: "ai-lab", locked: !hasPro, lockMsg: "Upgrade to Pro", category: "ai" },
    { id: "competitor", name: "Competitor Analysis", icon: "ti-spy", desc: "See competitor weaknesses", stat: `Last run: ${stats.last_competitor_analysis || 'Never'}`, nav: "ai-lab", locked: !isAgency, lockMsg: "Upgrade to Agency", category: "ai" },
    { id: "voice", name: "Voice Reviews", icon: "ti-microphone", desc: "Collect voice feedback", stat: `${stats.voice_notes || 0} received this month`, nav: "ai-lab", locked: !hasPro, lockMsg: "Upgrade to Pro", category: "display" },
    { id: "sendIntel", name: "Send Intelligence", icon: "ti-brain", desc: "AI channel prediction", stat: `${stats.send_intel_rate || 0}% avg conversion`, nav: "ai-lab", locked: !hasPro, lockMsg: "Upgrade to Pro", category: "ai" }
  ];

  const grid = document.getElementById("featuresGrid");
  if (!grid) return;

  const unlocked = tiles.filter(t => !t.locked);
  const locked = tiles.filter(t => t.locked);

  const borderMap = {
    communication: '#C8A96E',
    ai: '#8B5CF6',
    display: '#6A9E7F'
  };

  let html = unlocked.map(tile => {
    const borderColor = borderMap[tile.category] || 'transparent';
    return `<div class="feature-tile" data-nav="${tile.nav}" onclick="navigateTo('${tile.nav}')" style="border-left:2px solid ${borderColor};">
      <div class="feature-tile-header"><div class="feature-icon"><i class="ti ${tile.icon}"></i></div></div>
      <div class="feature-name">${tile.name}</div>
      <div class="feature-desc">${tile.desc}</div>
      <div class="feature-stat">${tile.stat}</div>
    </div>`;
  }).join('');

  if (locked.length > 0) {
    html += `<div style="background:rgba(200,169,110,0.06); border:1px dashed rgba(200,169,110,0.3); border-radius:12px; padding:16px; grid-column:1/-1; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
      <div>
        <div style="font-weight:600; margin-bottom:4px;">🔒 ${locked.length} features locked</div>
        <div style="font-size:0.75rem; color:var(--cream-dim);">${locked.map(t => t.name).join(', ')}</div>
      </div>
      <a href="/billing" style="background:var(--accent); color:#1A1A18; border:none; border-radius:8px; padding:10px 20px; font-weight:600; font-size:0.85rem; text-decoration:none; white-space:nowrap;">Upgrade to unlock →</a>
    </div>`;
  }

  grid.innerHTML = html;
}

// ========== ACTIVITY FEED ==========
async function loadActivityFeed() {
  const container = document.getElementById("activityList");
  if (!container) return;
  container.innerHTML = Array(5).fill(0).map(() => `<div class="skeleton-row"><div class="skeleton-icon"></div><div class="skeleton-text"></div><div class="skeleton-time"></div></div>`).join('');
  const res = await fetch("/stats/" + slug);
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
    return `<div class="activity-item"><div class="activity-left"><div class="activity-icon ${iconClass}"><i class="ti ${iconName}"></i></div><div class="activity-text">${text}</div></div><div class="activity-time">${timeAgo}</div></div>`;
  }).join('');
}

// ========== PRIVATE FEEDBACK ==========
async function loadPrivateFeedback() {
  const res = await fetch("/stats/" + slug);
  const stats = await res.json();
  const container = document.getElementById("privateFeedbackList");
  if (!container) return;
  const feedback = stats.feedback || [];
  if (feedback.length === 0) {
    container.innerHTML = '<p style="color:var(--cream-dim);font-size:0.85rem;">No private feedback yet. When customers choose \'Could be better\', their message appears here — before it can become a public review.</p>';
    return;
  }
  container.innerHTML = feedback.map(msg => `<div style="background:var(--surface-2);border-left:3px solid var(--danger);border-radius:8px;padding:14px 16px;margin-bottom:10px;"><p style="font-size:0.85rem;line-height:1.5;">${escapeHtml(msg)}</p></div>`).join('');
}

// ===== DASHBOARD JAVASCRIPT - PART 2 =====
// Continue from Part 1

// ========== REPUTATION SCORE ==========
async function loadReputationScore() {
  try {
    const res = await fetch("/reputation/" + slug);
    const data = await res.json();
    const score = data.score, lastMonth = data.last_month_score, b = data.breakdown;

    const heroScoreEl = document.getElementById("heroScore");
    if (heroScoreEl) heroScoreEl.innerHTML = `${score}/100`;

    const trendEl = document.getElementById("heroTrend");
    if (trendEl && lastMonth !== null) {
      const diff = score - lastMonth;
      if (diff > 0) trendEl.innerHTML = `<span class="up">↑ ${diff} points from last month</span>`;
      else if (diff < 0) trendEl.innerHTML = `<span class="down">↓ ${Math.abs(diff)} points from last month</span>`;
      else trendEl.innerHTML = `<span>No change from last month</span>`;
    }

    const barsContainer = document.querySelector('.rep-bars');
    if (barsContainer) {
      const bars = [
        { label: "Average Rating", value: b.rating, max: 40, color: "#8EC9A8" },
        { label: "Review Velocity", value: b.velocity, max: 20, color: "#C8A96E" },
        { label: "Feedback Ratio", value: b.feedback, max: 25, color: "#D4897C" },
        { label: "Send Activity", value: b.activity, max: 15, color: "#C8A96E" }
      ];

      const barsHtml = bars.map(bar => {
        const pct = (bar.value / bar.max) * 100;
        return `<div class="rep-bar-item">
          <div class="rep-bar-label">${bar.label}</div>
          <div class="rep-bar-track">
            <div class="rep-bar-fill" style="width:${pct}%;background:${bar.color};"></div>
          </div>
          <div style="font-size:0.7rem;min-width:35px;">${bar.value}/${bar.max}</div>
        </div>`;
      }).join('');
      barsContainer.innerHTML = barsHtml;
    }
  } catch (e) {
    console.log("Reputation score error:", e);
  }
}

// ========== FUNNEL SETTINGS ==========
async function loadFunnelSettings() {
  const res = await fetch("/stats/" + slug);
  const stats = await res.json();
  const funnelUrl = window.location.origin + "/r/" + slug;
  const funnelUrlDisplay = document.getElementById('funnelUrlDisplay');
  if (funnelUrlDisplay) funnelUrlDisplay.textContent = funnelUrl;
  
  const hasPro = stats.plan_type === 'pro' || stats.plan_type === 'agency';
  const proFeatures = document.getElementById('funnelStudioProFeatures');
  const upgradePrompt = document.getElementById('funnelStudioUpgradePrompt');
  
  if (hasPro && proFeatures && upgradePrompt) {
    proFeatures.style.display = 'block';
    upgradePrompt.style.display = 'none';
    
    const logoUrl = document.getElementById('funnelLogoUrl');
    const accentColor = document.getElementById('funnelAccentColor');
    const headline = document.getElementById('funnelHeadline');
    const happyLabel = document.getElementById('funnelHappyLabel');
    const unhappyLabel = document.getElementById('funnelUnhappyLabel');
    const thankyouMessage = document.getElementById('funnelThankyouMessage');
    
    if (logoUrl) logoUrl.value = stats.funnel_logo_url || '';
    if (accentColor) accentColor.value = stats.funnel_accent_color || '#C8A96E';
    if (headline) headline.value = stats.funnel_headline || '';
    if (happyLabel) happyLabel.value = stats.funnel_happy_label || 'Great experience!';
    if (unhappyLabel) unhappyLabel.value = stats.funnel_unhappy_label || 'Could be better';
    if (thankyouMessage) thankyouMessage.value = stats.funnel_thankyou_message || '';
    
    const previewMobile = document.getElementById('funnelPreviewMobile');
    const previewDesktop = document.getElementById('funnelPreviewDesktop');
    if (previewMobile) previewMobile.src = '/r/' + slug + '?preview=true&t=' + Date.now();
    if (previewDesktop) previewDesktop.src = '/r/' + slug + '?preview=true&t=' + Date.now();
  } else if (upgradePrompt && proFeatures) {
    proFeatures.style.display = 'none';
    upgradePrompt.style.display = 'block';
  }
}

// ========== SENTIMENT TRENDS ==========
async function loadSentimentTrends() {
  try {
    const res = await fetch("/sentiment/" + slug);
    const data = await res.json();
    if (!data.count || data.count < 3) {
      document.getElementById("sentimentContent").innerHTML = `<p>${data.count || 0} feedback messages collected. Collect 3+ to unlock insights.</p>`;
      return;
    }
    const completion = await fetch("/generate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review: `ANALYSIS_MODE: Analyse private feedback: ${data.messages.join('\n\n')}. Return JSON: { "themes": [ { "issue": "...", "advice": "..." } ] }` })
    });
    const result = await completion.json();
    document.getElementById("sentimentContent").innerHTML = `<div>${result.reply || "Analysis complete"}</div>`;
  } catch (e) {
    document.getElementById("sentimentContent").innerHTML = `<p>Could not load insights.</p>`;
  }
}

// ========== SEND INTELLIGENCE ==========
async function loadSendIntelligence() {
  try {
    const now = new Date();
    const res = await fetch("/predict-channel/" + slug, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointment_hour: now.getHours(), appointment_day: now.getDay(), service_type: null })
    });
    const data = await res.json();
    const r = data.recommendation;
    document.getElementById("sendIntelMessage").innerHTML = data.data_source === 'industry_benchmark' ? `Based on industry data. Personalises after 20 sends.` : `Based on ${data.sends_analysed} requests.`;
    document.getElementById("sendIntelInsight").innerHTML = `<div style="display:flex;align-items:center;gap:14px;"><div style="font-size:2rem;font-weight:800;color:var(--accent);">${r.predicted_conversion_rate}%</div><div><strong>${r.recommended_channel.toUpperCase()}</strong> is best<br>Best window: ${r.best_window}</div></div>`;
  } catch (e) {
    document.getElementById("sendIntelMessage").innerHTML = "Could not load analytics.";
  }
}

// ========== GROWTH CHART ==========
async function loadGrowthChart() {
  try {
    const res = await fetch("/review-growth/" + slug);
    const data = await res.json();
    const months = Object.keys(data).sort(), counts = months.map(m => data[m]);
    if (months.length === 0) return;
    const canvas = document.getElementById("growthChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    new Chart(ctx, {
      type: "line",
      data: {
        labels: months,
        datasets: [{ label: "Reviews collected", data: counts, borderColor: "#C8A96E", backgroundColor: "rgba(200,169,110,0.1)", fill: true, tension: 0.3, pointBackgroundColor: "#C8A96E", pointBorderColor: "#1A1A18", pointRadius: 4 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { labels: { color: "#EAE7DC" } } },
        scales: { y: { beginAtZero: true, grid: { color: "rgba(234,231,220,0.1)" }, ticks: { color: "#EAE7DC" } }, x: { ticks: { color: "#EAE7DC", maxRotation: 45, minRotation: 45 } } }
      }
    });
  } catch (e) {
    console.log("Growth chart error:", e);
  }
}

// ========== COMPETITOR ANALYSIS ==========
async function analyseCompetitor() {
  const name = document.getElementById("competitorName")?.value.trim();
  const reviews = document.getElementById("competitorReviews")?.value.trim();
  if (!reviews || reviews.length < 50) {
    showToast("Please paste at least a few reviews.", "error");
    return;
  }
  const btn = event.target;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.textContent = "Analysing...";
  const res = await fetch("/analyse-competitor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ competitor_name: name, reviews_text: reviews })
  });
  const data = await res.json();
  if (data.error) {
    showToast(data.error, "error");
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.textContent = "Analyse Competitor";
    return;
  }
  let html = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">';
  html += `<div><div style="color:#8EC9A8;">✅ Strengths</div>${data.strengths.map(s => `<p>${s}</p>`).join('')}</div>`;
  html += `<div><div style="color:#D4897C;">❌ Weaknesses</div>${data.weaknesses.map(w => `<p>${w}</p>`).join('')}</div>`;
  html += `<div><div style="color:var(--accent);">💡 Opportunity</div><p>${data.opportunity}</p></div></div>`;
  document.getElementById("competitorResults").innerHTML = html;
  btn.disabled = false;
  btn.classList.remove('btn-loading');
  btn.textContent = "Analyse Competitor";
}

// ========== SAVE BUSINESS DETAILS ==========
async function saveBizDetails() {
  const name = document.getElementById("bizNameInput").value.trim();
  const reviewLink = document.getElementById("reviewLinkInput").value.trim();
  if (!name) {
    showToast("Business name required", "error");
    return;
  }
  const btn = event.target;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  const res = await fetch("/update-business", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, review_link: reviewLink })
  });
  const data = await res.json();
  if (data.success) {
    showToast("Saved!", "success");
    document.getElementById("sidebarBizName").innerText = name;
  } else {
    showToast("Could not save", "error");
  }
  btn.disabled = false;
  btn.classList.remove('btn-loading');
}

// ========== CHANGE PASSWORD ==========
async function changePassword() {
  const current = document.getElementById("currentPw").value;
  const newPw = document.getElementById("newPw").value;
  const confirm = document.getElementById("confirmPw").value;
  if (!current || !newPw || !confirm) {
    showToast("Fill all fields", "error");
    return;
  }
  if (newPw.length < 6) {
    showToast("Password must be 6+ characters", "error");
    return;
  }
  if (newPw !== confirm) {
    showToast("Passwords don't match", "error");
    return;
  }
  const btn = event.target;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  const res = await fetch("/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: current, new_password: newPw })
  });
  const data = await res.json();
  if (data.success) {
    showToast("Password updated", "success");
    document.getElementById("currentPw").value = "";
    document.getElementById("newPw").value = "";
    document.getElementById("confirmPw").value = "";
  } else {
    showToast(data.error || "Could not update", "error");
  }
  btn.disabled = false;
  btn.classList.remove('btn-loading');
}

// ========== SEND SMS ==========
async function sendSMS() {
  const phone = document.getElementById("customerPhone")?.value.trim();
  if (!phone) {
    showToast("Please enter a phone number.", "error");
    return;
  }
  const btn = event.target;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.textContent = "Sending...";
  const res = await fetch("/send-sms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, slug })
  });
  const data = await res.json();
  if (data.success) {
    document.getElementById("customerPhone").value = "";
    showToast("SMS sent! ✓", "success");
  } else {
    showToast("SMS failed: " + (data.error || "Check your Twilio credentials."), "error");
  }
  btn.disabled = false;
  btn.classList.remove('btn-loading');
  btn.textContent = "Send SMS";
}

// ========== SEND EMAIL ==========
async function sendEmail() {
  const email = document.getElementById("customerEmail")?.value.trim();
  if (!email) {
    showToast("Please enter an email address.", "error");
    return;
  }
  const btn = event.target;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.textContent = "Sending...";
  const res = await fetch("/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const data = await res.json();
  if (data.success) {
    document.getElementById("customerEmail").value = "";
    showToast("Email sent! ✓", "success");
  } else {
    showToast(data.error || "Email failed.", "error");
  }
  btn.disabled = false;
  btn.classList.remove('btn-loading');
  btn.textContent = "Send Email";
}

// ========== AI REPLY GENERATOR ==========
async function streamToDiv(div, text) {
  div.innerHTML = "";
  const chars = text.split('');
  for (let i = 0; i < chars.length; i++) {
    div.innerHTML += chars[i];
    await new Promise(r => setTimeout(r, 8 + Math.random() * 12));
  }
}

async function generateRepliesStreaming() {
  const review = document.getElementById("reviewText")?.value.trim();
  if (!review) {
    showToast("Please paste a review first.", "error");
    return;
  }
  const btn = document.getElementById("aiBtn");
  if (btn) {
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.textContent = "Generating...";
  }
  const profDisplay = document.getElementById("aiProfessionalDisplay");
  const warmDisplay = document.getElementById("aiWarmDisplay");
  const punchyDisplay = document.getElementById("aiPunchyDisplay");
  const profTextarea = document.getElementById("aiProfessional");
  const warmTextarea = document.getElementById("aiWarm");
  const punchyTextarea = document.getElementById("aiPunchy");
  
  if (profDisplay) profDisplay.innerHTML = "<span style='opacity:0.5;'>✦ Generating...</span>";
  if (warmDisplay) warmDisplay.innerHTML = "<span style='opacity:0.5;'>✦ Generating...</span>";
  if (punchyDisplay) punchyDisplay.innerHTML = "<span style='opacity:0.5;'>✦ Generating...</span>";
  
  try {
    const res = await fetch("/generate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review })
    });
    const data = await res.json();
    if (data.error) {
      showToast(data.error, "error");
      if (profDisplay) profDisplay.innerHTML = "";
      if (warmDisplay) warmDisplay.innerHTML = "";
      if (punchyDisplay) punchyDisplay.innerHTML = "";
    } else {
      if (profTextarea) profTextarea.value = data.professional || "";
      if (warmTextarea) warmTextarea.value = data.warm || "";
      if (punchyTextarea) punchyTextarea.value = data.punchy || "";
      if (profDisplay) await streamToDiv(profDisplay, data.professional || "");
      if (warmDisplay) await streamToDiv(warmDisplay, data.warm || "");
      if (punchyDisplay) await streamToDiv(punchyDisplay, data.punchy || "");
      showToast("Replies generated! ✓", "success");
    }
  } catch (e) {
    showToast("Something went wrong", "error");
  }
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.textContent = "Generate Replies";
  }
}

// ========== NFC CARD ORDER ==========
function openNfcModal() {
  openModal("nfcModal");
}

async function orderNfcCard() {
  const fullName = document.getElementById("nfcFullName")?.value.trim();
  const address = document.getElementById("nfcAddress")?.value.trim();
  if (!fullName || !address) {
    showToast("Please enter your name and address", "error");
    return;
  }
  const btn = document.getElementById("nfcOrderBtn");
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.textContent = "Processing...";
  const res = await fetch("/create-nfc-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shipping_address: `${fullName}\n${address}` })
  });
  const data = await res.json();
  if (data.url) window.location = data.url;
  else {
    showToast(data.error || "Could not create order", "error");
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.textContent = "Continue to payment (£9.99) →";
  }
}

// ========== CANCEL SUBSCRIPTION ==========
async function doCancel() {
  const btn = document.getElementById("confirmCancelBtn");
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.textContent = "Cancelling...";
  const res = await fetch("/cancel-subscription", { method: "POST" });
  const data = await res.json();
  closeModal("cancelModal");
  if (data.success) {
    showToast("Subscription cancelled", "success");
    setTimeout(() => window.location.reload(), 1500);
  } else {
    showToast("Could not cancel", "error");
  }
  btn.disabled = false;
  btn.classList.remove('btn-loading');
  btn.textContent = "Yes, cancel";
}

// ========== FAB MENU ==========
function closeFab() {
  const menu = document.getElementById("fabMenu");
  if (menu) menu.style.display = "none";
}

function goToAILab() {
  const aiLabNav = document.querySelector('.nav-item[data-nav="ai-lab"]');
  if (aiLabNav) aiLabNav.click();
  closeFab();
}

function copyReviewLinkAndClose() {
  copyReviewLink();
  closeFab();
}

// FAB main button toggle
const fabMain = document.getElementById("fabMain");
const fabMenu = document.getElementById("fabMenu");
if (fabMain) {
  fabMain.addEventListener("click", () => {
    if (fabMenu.style.display === "flex") fabMenu.style.display = "none";
    else fabMenu.style.display = "flex";
  });
}

// ========== START POLLING ==========
function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(async () => {
    const res = await fetch("/stats/" + slug);
    if (!res.ok) return;
    const newStats = await res.json();
    document.getElementById("statVisits").innerText = newStats.visits ?? 0;
    document.getElementById("statPositive").innerText = newStats.positive ?? 0;
    document.getElementById("statReviews").innerText = newStats.reviews ?? 0;
    document.getElementById("statNegative").innerText = newStats.negative ?? 0;
    if (newStats.recent_events) updateTicker(newStats.recent_events);
    loadActivityFeed();
    loadReputationScore();
  }, 30000);
}

// ========== AGENCY CLIENT MANAGEMENT ==========
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
          <button onclick="switchToClient('${client.slug}')" style="background:var(--accent-dim); border:1px solid var(--border); color:var(--cream); padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.7rem; margin-right:6px;">
            🔄 Switch
          </button>
          <button onclick="removeClient('${client.slug}')" style="background:transparent; border:1px solid var(--danger); color:var(--danger); padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.7rem;">
            Remove
          </button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error("Load agency clients error:", e);
  }
}

function openAddClientModal() {
  const link = window.location.origin + '/admin?ref=' + slug;
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

function checkClientMode() {
  fetch("/session")
    .then(r => r.json())
    .then(data => {
      if (data.agency_mode) {
        const topBar = document.querySelector(".top-bar");
        if (topBar && !document.getElementById("clientModeBanner")) {
          const banner = document.createElement("div");
          banner.id = "clientModeBanner";
          banner.style.cssText = "background:rgba(200,169,110,0.15); border-bottom:1px solid var(--accent); padding:8px 20px; text-align:center; font-size:0.8rem; display:flex; align-items:center; justify-content:center; gap:16px;";
          banner.innerHTML = `
            <span>👁️ You are viewing a client dashboard</span>
            <button onclick="exitClientMode()" style="background:var(--accent); color:#1A1A18; border:none; padding:6px 16px; border-radius:6px; cursor:pointer;">Exit client mode →</button>
          `;
          document.querySelector(".main").insertBefore(banner, document.querySelector(".main").firstChild);
        }
      }
    });
}

// ========== LOAD DASHBOARD DATA ==========
async function loadDashboardData() {
  const res = await fetch("/stats/" + slug);
  if (!res.ok) return;
  const stats = await res.json();

  document.getElementById("sidebarBizName").innerText = stats.business_name || slug;
  document.getElementById("sidebarPlanName").innerText = stats.plan_type === "pro" ? "Pro" : stats.plan_type === "agency" ? "Agency" : "Starter";
  document.getElementById("upgradeLink").style.display = stats.plan_type === "agency" ? "none" : "flex";

  const reviewLinkElement = document.getElementById("reviewLink");
  if (reviewLinkElement) reviewLinkElement.value = window.location.origin + "/r/" + slug;

  updateGreeting(stats.business_name);

  const isAgency = stats.plan_type === 'agency';

  if (isAgency) {
    updateNavForAgency(true);
    loadAgencyDashboard(stats);
    if (stats.recent_events) updateTicker(stats.recent_events);
    loadReputationScore();
    loadFunnelSettings();
    loadAlertSettings();
    lastStats = stats;
    return;
  }

  document.getElementById("statVisits").innerText = stats.visits ?? 0;
  document.getElementById("statPositive").innerText = stats.positive ?? 0;
  document.getElementById("statReviews").innerText = stats.reviews ?? 0;
  document.getElementById("statNegative").innerText = stats.negative ?? 0;
  document.getElementById('journeyVisits').innerText = stats.visits || 0;
  document.getElementById('journeyRatings').innerText = stats.rating_count || 0;
  document.getElementById('journeyClicks').innerText = stats.reviews || 0;
  const postedRate = stats.visits ? ((stats.reviews / stats.visits) * 100).toFixed(0) : 0;
  document.getElementById('journeyPosted').innerText = postedRate + '%';
  document.getElementById('journeyProgress').style.width = postedRate + '%';

  const avgRating = stats.rating_avg || 0;
  const avgRatingDisplay = document.getElementById('avgRatingDisplay');
  if (avgRatingDisplay) avgRatingDisplay.innerHTML = avgRating > 0 ? `${avgRating} ★` : '—';

  const velocityDisplay = document.getElementById('velocityDisplay');
  if (velocityDisplay) velocityDisplay.innerHTML = `${stats.reviews || 0} this month`;

  const positivePercent = stats.visits ? ((stats.positive / stats.visits) * 100).toFixed(0) : 0;
  const positivePercentDisplay = document.getElementById('positivePercentDisplay');
  if (positivePercentDisplay) positivePercentDisplay.innerHTML = `${positivePercent}%`;

  const reviewsCapturedDisplay = document.getElementById('reviewsCapturedDisplay');
  if (reviewsCapturedDisplay) reviewsCapturedDisplay.innerHTML = stats.reviews || 0;

  loadReputationScore();
  loadFunnelSettings();
  loadAlertSettings();
  if (stats.recent_events) updateTicker(stats.recent_events);
  buildFeatureTiles(stats);
  loadActivityFeed();

  const reviewLink = window.location.origin + "/r/" + slug;

  const wallUrlEl = document.getElementById("wallUrl");
  if (wallUrlEl) wallUrlEl.value = reviewLink;

  const wallPreviewEl = document.getElementById("wallPreviewLink");
  if (wallPreviewEl) wallPreviewEl.href = "/wall/" + slug;

  const embedCodeEl = document.getElementById("embedCode");
  if (embedCodeEl) embedCodeEl.value = `<a href="${reviewLink}" target="_blank">Leave us a review</a>`;

  const webhookUrlEl = document.getElementById("webhookUrl");
  if (webhookUrlEl) webhookUrlEl.value = window.location.origin + "/api/hook/" + slug;

  const invoiceWebhookEl = document.getElementById("invoiceWebhookUrl");
  if (invoiceWebhookEl) invoiceWebhookEl.value = window.location.origin + "/api/invoice-hook/" + slug;

  const bizNameEl = document.getElementById("bizNameInput");
  if (bizNameEl) bizNameEl.value = stats.business_name || "";

  const reviewLinkInputEl = document.getElementById("reviewLinkInput");
  if (reviewLinkInputEl) reviewLinkInputEl.value = stats.review_link || "";

  const assetReviewLinkEl = document.getElementById("assetReviewLink");
  if (assetReviewLinkEl) assetReviewLinkEl.value = window.location.origin + "/r/" + slug;

  const qrDownloadLink = document.getElementById("qrDownloadLink");
  if (qrDownloadLink) qrDownloadLink.href = "/qr-download/" + slug;

  const hasPro = stats.subscription_active && (stats.plan_type === "pro" || stats.plan_type === "agency");

  document.getElementById("smsUnlocked").style.display = hasPro ? "block" : "none";
  document.getElementById("smsLocked").style.display = hasPro ? "none" : "block";
  document.getElementById("emailUnlocked").style.display = hasPro ? "block" : "none";
  document.getElementById("emailLocked").style.display = hasPro ? "none" : "block";
  document.getElementById("aiUnlocked").style.display = hasPro ? "block" : "none";
  document.getElementById("aiLocked").style.display = hasPro ? "none" : "block";
  document.getElementById("sentimentUnlocked").style.display = hasPro ? "block" : "none";
  document.getElementById("sentimentLocked").style.display = hasPro ? "none" : "block";
  document.getElementById("sendIntelUnlocked").style.display = hasPro ? "block" : "none";
  document.getElementById("sendIntelLocked").style.display = hasPro ? "none" : "block";
  document.getElementById("competitorUnlocked").style.display = isAgency ? "block" : "none";
  document.getElementById("competitorLocked").style.display = isAgency ? "none" : "block";

  if (hasPro) {
    loadSentimentTrends();
    loadSendIntelligence();
    loadGrowthChart();
    document.getElementById("proAnalyticsPreview").style.display = "block";
    document.getElementById("analyticsUpgradePrompt").style.display = "none";
  }

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const canvas = document.getElementById("ratingChart");
  const ctx = canvas?.getContext("2d");
  if (ctx && canvas && canvas.offsetParent !== null) {
    const dist = stats.rating_distribution || {};
    chartInstance = new Chart(ctx, {
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

  const smsCounter = document.getElementById("smsCounter");
  if (smsCounter) smsCounter.textContent = `You've sent ${stats.sms_sent_this_month || 0} requests this month`;

  const emailCounter = document.getElementById("emailCounter");
  if (emailCounter) emailCounter.textContent = `You've sent ${stats.email_sent_this_month || 0} requests this month`;

  const analyticsCanvas = document.getElementById("ratingChartAnalytics");
  const analyticsCtx = analyticsCanvas?.getContext("2d");
  if (analyticsCtx && analyticsCanvas && analyticsCanvas.offsetParent !== null) {
    if (analyticsChartInstance) {
      analyticsChartInstance.destroy();
      analyticsChartInstance = null;
    }
    const dist = stats.rating_distribution || {};
    analyticsChartInstance = new Chart(analyticsCtx, {
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

  lastStats = stats;
}

function updateNavForAgency(isAgency) {
  if (!isAgency) return;
  const overviewNav = document.querySelector('.nav-item[data-nav="overview"]');
  if (overviewNav) overviewNav.querySelector('span').textContent = 'Agency Hub';
  const customersNav = document.querySelector('.nav-item[data-nav="customers"]');
  if (customersNav) customersNav.querySelector('span').textContent = 'Clients';
  const campaignsNav = document.querySelector('.nav-item[data-nav="campaigns"]');
  if (campaignsNav) campaignsNav.style.display = 'none';
}

function loadAgencyDashboard(stats) {
  document.getElementById('agencyOverview').style.display = 'block';
  document.getElementById('businessOverview').style.display = 'none';
  document.getElementById("greetingText").innerHTML = `Welcome back, <span style="color:var(--accent);">${stats.business_name}</span>`;
  document.getElementById("greetingBusiness").innerHTML = 'Agency Dashboard';

  const agencyCode = slug;
  fetch('/affiliate-stats/' + agencyCode)
    .then(res => res.json())
    .then(data => {
      document.getElementById('agencyCommission').textContent = '£' + (data.monthly_earnings || 0).toFixed(2);
      document.getElementById('agencyTotalClients').textContent = data.total_signups || 0;
      document.getElementById('agencyPayingClients').textContent = data.active_customers || 0;
      document.getElementById('agencyTrialClients').textContent = data.trial_customers || 0;
      const now = new Date();
      const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      document.getElementById('agencyPayoutDate').textContent = 'Next payout: ' + nextFirst.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const list = document.getElementById('agencyClientsList');
      if (!data.referrals || data.referrals.length === 0) {
        list.innerHTML = `<div style="padding:40px; text-align:center; color:var(--cream-dim);">
          <div style="font-size:2rem; margin-bottom:12px;">👥</div>
          <div style="font-size:0.9rem; font-weight:600; margin-bottom:6px;">No clients yet</div>
          <div style="font-size:0.8rem;">Add your first client using the button above. They'll appear here once they've signed up.</div>
        </div>`;
        return;
      }
      list.innerHTML = data.referrals.map(client => {
        const statusColor = client.status === 'active' ? 'var(--success)' : client.status === 'trial' ? 'var(--accent)' : 'var(--danger)';
        const statusBg = client.status === 'active' ? 'rgba(106,158,127,0.15)' : client.status === 'trial' ? 'rgba(200,169,110,0.15)' : 'rgba(192,103,90,0.15)';
        const statusLabel = client.status === 'active' ? 'Paying' : client.status === 'trial' ? 'Trial' : 'Cancelled';
        const commission = client.commission > 0 ? '£' + client.commission.toFixed(2) + '/mo' : '—';
        return `<div style="display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid var(--border);">
          <div style="flex:1;">
            <div style="font-size:0.9rem; font-weight:600; margin-bottom:2px;">${escapeHtml(client.business_name)}</div>
            <div style="font-size:0.7rem; color:var(--cream-dim);">${client.plan ? client.plan.charAt(0).toUpperCase() + client.plan.slice(1) : 'Starter'} · Joined ${new Date(client.created_at).toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})}</div>
          </div>
          <div style="font-size:0.8rem; color:var(--accent); min-width:80px; text-align:right;">${commission}</div>
          <div style="margin-left:16px;">
            <span style="font-size:0.7rem; font-weight:600; color:${statusColor}; background:${statusBg}; padding:4px 12px; border-radius:20px;">${statusLabel}</span>
          </div>
        </div>`;
      }).join('');
      if (stats.agency_name) {
        document.getElementById('whitelabelStatus').textContent = '✓ White-labelled as "' + stats.agency_name + '" — clients see your branding';
      }
    })
    .catch(e => console.error('Agency dashboard error:', e));
  loadClientSelect();
}

function loadClientSelect() {
  fetch('/affiliate-stats/' + slug)
    .then(res => res.json())
    .then(data => {
      const select = document.getElementById('clientSelect');
      if (select && data.referrals && data.referrals.length > 0) {
        select.innerHTML = '<option value="">Select a client...</option>' + data.referrals.map(client => `<option value="${client.slug}">${escapeHtml(client.business_name)}</option>`).join('');
      } else if (select) {
        select.innerHTML = '<option value="">No clients yet</option>';
      }
    })
    .catch(() => {});
}

function downloadReport() {
  const reportType = document.getElementById('reportType').value;
  const clientSelect = document.getElementById('clientSelect');
  const clientSlug = clientSelect ? clientSelect.value : null;
  let url;
  if (reportType === 'client' && clientSlug) {
    url = '/report/' + clientSlug;
  } else {
    url = '/report/' + slug;
  }
  window.open(url, '_blank');
}

// ========== SESSION CHECK ==========
async function checkSession() {
  const res = await fetch("/session");
  const data = await res.json();
  if (!data.loggedIn) {
    window.location = "/login";
    return;
  }
  slug = data.slug;
  await loadDashboardData();
  startPolling();
  handleHash();
  checkClientMode();
}

// Initialize everything when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  checkSession();
});