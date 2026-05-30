// ===== FEATURES MODULE =====
// Builds the feature tiles grid on the dashboard

import { navigateTo } from './navigation.js';

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
    return `
      <div class="feature-tile" data-nav="${tile.nav}" style="border-left:2px solid ${borderColor}; cursor:pointer;">
        <div class="feature-tile-header">
          <div class="feature-icon"><i class="ti ${tile.icon}"></i></div>
        </div>
        <div class="feature-name">${tile.name}</div>
        <div class="feature-desc">${tile.desc}</div>
        <div class="feature-stat">${tile.stat}</div>
      </div>
    `;
  }).join('');

  if (locked.length > 0) {
    html += `
      <div style="background:rgba(200,169,110,0.06); border:1px dashed rgba(200,169,110,0.3); border-radius:12px; padding:16px; grid-column:1/-1; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="font-weight:600; margin-bottom:4px;">🔒 ${locked.length} features locked</div>
          <div style="font-size:0.75rem; color:var(--cream-dim);">${locked.map(t => t.name).join(', ')}</div>
        </div>
        <a href="/billing" style="background:var(--accent); color:#1A1A18; border:none; border-radius:8px; padding:10px 20px; font-weight:600; font-size:0.85rem; text-decoration:none; white-space:nowrap;">Upgrade to unlock →</a>
      </div>
    `;
  }

  grid.innerHTML = html;
  
  // Attach click handlers
  document.querySelectorAll('.feature-tile[data-nav]').forEach(tile => {
    tile.addEventListener('click', () => {
      const nav = tile.dataset.nav;
      if (nav) navigateTo(nav);
    });
  });
}

export { buildFeatureTiles };