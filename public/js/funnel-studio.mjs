// ============================================================
//  FUNNEL STUDIO MODULE — complete replacement
//  Matches the new HTML in funnel-studio-section.html
// ============================================================
import { showToast } from './shared/utils.mjs';

// ── State ────────────────────────────────────────────────────
const state = {
  template:    'classic',
  accentColor: '#C8A96E',
  logoUrl:     '',
  headline:    'How was your experience?',
  happyLabel:  'Great experience!',
  sadLabel:    'Could be better',
  thankyouMsg: '',
  device:      'split',
  zoom:        100,
  saved:       true,
};

// Template background / card colours
const TEMPLATES = {
  classic: { pageBg:'#1A1A18', cardBg:'#242422', textColor:'#EAE7DC', btnText:'#1A1A18' },
  bright:  { pageBg:'#FAFAFA', cardBg:'#FFFFFF', textColor:'#1A1A18', btnText:'#1A1A18' },
  medical: { pageBg:'#F0F4F8', cardBg:'#FFFFFF', textColor:'#1A1A18', btnText:'#FFFFFF' },
  bold:    { pageBg:'#C8A96E', cardBg:'rgba(0,0,0,0.18)', textColor:'#1A1A18', btnText:'#1A1A18' },
  luxury:  { pageBg:'#0A0A0A', cardBg:'#141414', textColor:'#EAE7DC', btnText:'#1A1A18' },
};

const INDUSTRY_BENCHMARKS = {
  'How was your experience?':       18,
  'How did we do today?':           22,
  'How would you rate your visit?': 20,
  'Loved it? Leave a review!':      24,
};

// ── DOM helpers ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── Apply template styles to preview ────────────────────────
function applyTemplate(templateKey) {
  const t = TEMPLATES[templateKey] || TEMPLATES.classic;
  const phone    = $('fsPhoneMock');
  const browser  = $('fsBrowserBody');
  const card     = document.querySelector('.fs-desktop-card');

  if (phone)   phone.style.background   = t.pageBg;
  if (browser) browser.style.background = t.pageBg;
  if (card)    card.style.background    = t.cardBg;

  $$('.fs-preview-biz, .fs-preview-q').forEach(el => {
    el.style.color = t.textColor;
  });
  $$('.fs-btn-sad').forEach(btn => {
    btn.style.color       = t.textColor;
    btn.style.borderColor = `${t.textColor}30`;
  });
  $$('.fs-btn-happy').forEach(btn => {
    btn.style.color = t.btnText;
  });
  $$('.fs-preview-footer').forEach(el => {
    el.style.color = `${t.textColor}50`;
  });
}

// ── Apply accent colour ──────────────────────────────────────
function applyAccent(color) {
  $$('.fs-btn-happy').forEach(btn => {
    btn.style.background = color;
  });
  $$('.fs-preview-biz').forEach(el => {
    el.style.color = color;
  });
}

// ── Full preview refresh ─────────────────────────────────────
function refreshPreview() {
  // Read inputs
  state.headline    = $('fsHeadline')?.value    || state.headline;
  state.happyLabel  = $('fsHappyLabel')?.value  || state.happyLabel;
  state.sadLabel    = $('fsSadLabel')?.value    || state.sadLabel;
  state.logoUrl     = $('fsLogoUrl')?.value     || '';
  state.thankyouMsg = $('fsThankyouMsg')?.value || '';

  const bizName = $('sidebarBizName')?.innerText || 'Your Business';

  // Text
  $$('#previewBiz, #previewBizDesktop').forEach(el => el && (el.textContent = bizName));
  $$('#previewQuestion, #previewQuestionDesktop').forEach(el => el && (el.textContent = state.headline));
  $$('#previewHappyBtn, #previewHappyBtnDesktop').forEach(el => el && (el.innerHTML = `😊 ${state.happyLabel}`));
  $$('#previewSadBtn, #previewSadBtnDesktop').forEach(el => el && (el.innerHTML = `😕 ${state.sadLabel}`));

  // Logo
  const logos = [$('previewLogoImg'), $('previewLogoDesktop')];
  logos.forEach(img => {
    if (!img) return;
    if (state.logoUrl) { img.src = state.logoUrl; img.style.display = 'block'; }
    else img.style.display = 'none';
  });
  const logoPreview = $('fsLogoPreview');
  const logoPreviewImg = $('fsLogoPreviewImg');
  if (logoPreview && logoPreviewImg) {
    if (state.logoUrl) { logoPreviewImg.src = state.logoUrl; logoPreview.style.display = 'block'; }
    else logoPreview.style.display = 'none';
  }

  // Colours + template
  applyTemplate(state.template);
  applyAccent(state.accentColor);

  // Conversion bar
  updateConversionBar();

  // Mark unsaved
  markUnsaved();
}

// ── Conversion prediction bar ────────────────────────────────
function updateConversionBar() {
  const bar = $('conversionPrediction');
  if (!bar) return;

  const base    = INDUSTRY_BENCHMARKS[state.headline] || 18;
  const isQ     = state.headline.includes('?');
  const hasEmoji = /[⭐🎉😊]/.test(state.headline);
  const short   = state.headline.length < 30;
  let rate = base + (isQ ? 2 : 0) + (hasEmoji ? 3 : 0) + (short ? 1 : 0);
  rate = Math.min(rate, 42);
  const potential = Math.min(rate + 6, 50);
  const diff      = rate - 18;
  const diffColor = diff > 0 ? '#6A9E7F' : diff < 0 ? '#C0675A' : 'rgba(234,231,220,0.5)';

  bar.innerHTML = `
    <div class="fs-conv-row">
      <div>
        <div class="fs-conv-label">Predicted conversion</div>
        <div class="fs-conv-num">${rate}%</div>
        <div class="fs-conv-diff" style="color:${diffColor}">
          ${diff >= 0 ? '+' : ''}${diff}% vs average
        </div>
      </div>
      <div class="fs-conv-divider"></div>
      <div>
        <div class="fs-conv-label">With A/B testing</div>
        <div class="fs-conv-num" style="color:#6A9E7F">${potential}%</div>
        <div class="fs-conv-diff" style="color:rgba(234,231,220,0.4)">optimised potential</div>
      </div>
    </div>`;
}

// ── Save status ──────────────────────────────────────────────
function markUnsaved() {
  state.saved = false;
  const el = $('fsSaveStatus');
  if (el) { el.textContent = 'Unsaved changes'; el.style.color = 'rgba(234,231,220,0.5)'; }
}
function markSaved() {
  state.saved = true;
  const el = $('fsSaveStatus');
  if (el) { el.textContent = '✓ Saved'; el.style.color = '#6A9E7F'; }
}

// ── Device toggle ────────────────────────────────────────────
window.setFSDevice = function(device) {
  state.device = device;
  const mob  = $('fsMobilePreview');
  const desk = $('fsDesktopPreview');
  $$('.fs-dev-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.fs-dev-btn[data-device="${device}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  if (device === 'mobile')  { mob.style.display = 'flex'; desk.style.display = 'none'; }
  else if (device === 'desktop') { mob.style.display = 'none'; desk.style.display = 'flex'; }
  else { mob.style.display = 'flex'; desk.style.display = 'flex'; }
};

// ── Template select ──────────────────────────────────────────
window.selectFSTemplate = function(tpl, el) {
  state.template = tpl;
  $$('.fs-tpl').forEach(b => b.classList.remove('selected'));
  if (el) el.classList.add('selected');
  refreshPreview();
};

// ── Colour select ────────────────────────────────────────────
window.selectFSColor = function(color, el) {
  state.accentColor = color;
  $$('.fs-colour').forEach(b => b.classList.remove('selected'));
  if (el) el.classList.add('selected');
  const custom = document.querySelector('.fs-colour-custom');
  if (custom) custom.value = color;
  applyAccent(color);
  markUnsaved();
};

// ── Input wired ──────────────────────────────────────────────
window.updateFSPreview   = refreshPreview;
window.updateFSCharCount = function() {
  const h = $('fsHeadline'), c = $('fsHeadlineCount');
  if (h && c) {
    c.textContent = h.value.length;
    c.style.color = h.value.length > 50 ? '#C0675A' : 'rgba(234,231,220,0.4)';
  }
};

// ── AI suggestions ───────────────────────────────────────────
window.applyAISuggestion = function(type) {
  if (type === 'headline') {
    const el = $('fsHeadline');
    if (el) { el.value = 'How did we do today?'; refreshPreview(); window.updateFSCharCount(); }
  } else if (type === 'happy') {
    const el = $('fsHappyLabel');
    if (el) { el.value = 'Loved it! ⭐'; refreshPreview(); }
  }
  showToast('AI suggestion applied', 'success');
};

// ── Copy link ────────────────────────────────────────────────
window.copyFSLink = function() {
  const link = $('fsLinkDisplay');
  if (link) { navigator.clipboard.writeText(link.textContent.trim()); showToast('Link copied!', 'success'); }
};

// ── Save ─────────────────────────────────────────────────────
window.saveFSSettings = async function() {
  const btn = $('fsSaveBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving...'; }

  try {
    const res = await fetch('/update-funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funnel_template:       state.template,
        funnel_accent_color:   state.accentColor,
        funnel_logo_url:       state.logoUrl,
        funnel_headline:       state.headline,
        funnel_happy_label:    state.happyLabel,
        funnel_unhappy_label:  state.sadLabel,
        funnel_thankyou_message: state.thankyouMsg,
      }),
    });
    const data = await res.json();
    if (data.success) { markSaved(); showToast('Funnel saved — changes are live!', 'success'); }
    else showToast(data.error || 'Could not save', 'error');
  } catch { showToast('Something went wrong', 'error'); }

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save'; }
};

// ── Keyboard shortcut Cmd/Ctrl+S ─────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    const sec = $('funnelStudioSection');
    if (sec?.classList.contains('active')) { e.preventDefault(); window.saveFSSettings(); }
  }
});

// ── Init ─────────────────────────────────────────────────────
function initFunnelStudio(slug) {
  const linkEl = $('fsLinkDisplay');
  if (linkEl) linkEl.textContent = `${window.location.origin}/r/${slug}`;

  window.setFSDevice('split');

  fetch(`/stats/${slug}`)
    .then(r => r.json())
    .then(stats => {
      if (stats.funnel_template) {
        state.template = stats.funnel_template;
        const tplBtn = document.querySelector(`[data-template="${state.template}"]`);
        if (tplBtn) { $$('.fs-tpl').forEach(b => b.classList.remove('selected')); tplBtn.classList.add('selected'); }
      }
      if (stats.funnel_accent_color) {
        state.accentColor = stats.funnel_accent_color;
        const swatch = document.querySelector(`[data-color="${state.accentColor}"]`);
        if (swatch) { $$('.fs-colour').forEach(b => b.classList.remove('selected')); swatch.classList.add('selected'); }
        const custom = document.querySelector('.fs-colour-custom');
        if (custom) custom.value = state.accentColor;
      }
      if (stats.funnel_logo_url)    { state.logoUrl = stats.funnel_logo_url;  const el = $('fsLogoUrl');    if (el) el.value = state.logoUrl; }
      if (stats.funnel_headline)    { state.headline = stats.funnel_headline; const el = $('fsHeadline');   if (el) el.value = state.headline; }
      if (stats.funnel_happy_label) { state.happyLabel = stats.funnel_happy_label; const el = $('fsHappyLabel'); if (el) el.value = state.happyLabel; }
      if (stats.funnel_unhappy_label) { state.sadLabel = stats.funnel_unhappy_label; const el = $('fsSadLabel'); if (el) el.value = state.sadLabel; }
      if (stats.funnel_thankyou_message) { const el = $('fsThankyouMsg'); if (el) el.value = stats.funnel_thankyou_message; }

      refreshPreview();
      window.updateFSCharCount();
      state.saved = true;
      markSaved();
    })
    .catch(() => refreshPreview());
}

// Watch for section becoming active
const observer = new MutationObserver(mutations => {
  mutations.forEach(m => {
    if (m.target.id === 'funnelStudioSection' && m.target.classList.contains('active') && window.slug) {
      initFunnelStudio(window.slug);
    }
  });
});
const fsSection = $('funnelStudioSection');
if (fsSection) observer.observe(fsSection, { attributes: true, attributeFilter: ['class'] });

// Also init on load if already active
if (fsSection?.classList.contains('active') && window.slug) {
  setTimeout(() => initFunnelStudio(window.slug), 200);
}

export { initFunnelStudio };
