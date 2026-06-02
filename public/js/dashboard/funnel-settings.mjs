// ===== FUNNEL SETTINGS MODULE =====
// Loads and syncs funnel settings from the server

async function loadFunnelSettings() {
  const res = await fetch("/stats/" + window.slug);
  const stats = await res.json();
  const funnelUrl = window.location.origin + "/r/" + window.slug;
  
  const funnelUrlDisplay = document.getElementById('funnelUrlDisplay');
  if (funnelUrlDisplay) funnelUrlDisplay.textContent = funnelUrl;
  
  const hasPro = stats.plan_type === 'pro' || stats.plan_type === 'agency';
  const proFeatures = document.getElementById('funnelStudioProFeatures');
  const upgradePrompt = document.getElementById('funnelStudioUpgradePrompt');
  
  if (hasPro && proFeatures && upgradePrompt) {
    if (proFeatures) proFeatures.style.display = 'block';
    if (upgradePrompt) upgradePrompt.style.display = 'none';
    
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
    if (previewMobile) previewMobile.src = '/r/' + window.slug + '?preview=true&t=' + Date.now();
    if (previewDesktop) previewDesktop.src = '/r/' + window.slug + '?preview=true&t=' + Date.now();
  } else if (upgradePrompt && proFeatures) {
    if (proFeatures) proFeatures.style.display = 'none';
    if (upgradePrompt) upgradePrompt.style.display = 'block';
  }
}

export { loadFunnelSettings };