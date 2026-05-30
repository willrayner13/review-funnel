// ========== FUNNEL STUDIO MODULE ==========
// ReviewLift Funnel Studio - All funnel customization functionality

import { showToast } from './shared/utils.js';

// Make sure showToast is available globally
window.showToast = showToast;

let fsState = {
  template: 'classic',
  accentColor: '#C8A96E',
  logoUrl: '',
  headline: 'How was your experience?',
  happyLabel: 'Great experience!',
  sadLabel: 'Could be better',
  thankyouMsg: 'Thanks for your feedback!',
  device: 'mobile',
  zoom: 100,
  saved: false
};

let fsSlug = '';

// ========== TEMPLATE SELECTION ==========
function selectFSTemplate(template, el) {
  fsState.template = template;
  fsState.saved = false;
  
  document.querySelectorAll('.fs-template-thumb').forEach(t => t.classList.remove('selected'));
  if (el) el.classList.add('selected');
  
  updateFSPreview();
  updateFSSaveStatus();
}

// ========== COLOR SELECTION ==========
function selectFSColor(color, el) {
  fsState.accentColor = color;
  fsState.saved = false;
  
  document.querySelectorAll('.fs-color-swatch').forEach(s => s.classList.remove('selected'));
  if (el) el.classList.add('selected');
  
  const colorInput = document.querySelector('.fs-color-input');
  if (colorInput) colorInput.value = color;
  
  updateFSPreview();
  updateFSSaveStatus();
}

// ========== DEVICE TOGGLE ==========
function setFSDevice(device) {
  fsState.device = device;
  
  const mobileFrame = document.getElementById('fsMobileFrame');
  const desktopFrame = document.getElementById('fsDesktopFrame');
  const buttons = document.querySelectorAll('.fs-device-btn');
  
  buttons.forEach(b => b.classList.remove('active'));
  
  if (device === 'mobile') {
    if (mobileFrame) mobileFrame.style.display = 'block';
    if (desktopFrame) desktopFrame.style.display = 'none';
    if (buttons[0]) buttons[0].classList.add('active');
  } else {
    if (mobileFrame) mobileFrame.style.display = 'none';
    if (desktopFrame) desktopFrame.style.display = 'block';
    if (buttons[1]) buttons[1].classList.add('active');
  }
}

// ========== ZOOM ==========
function zoomFS(delta) {
  fsState.zoom = Math.max(60, Math.min(150, fsState.zoom + delta));
  const zoomLabel = document.getElementById('fsZoomLabel');
  const mobileFrame = document.getElementById('fsMobileFrame');
  
  if (zoomLabel) zoomLabel.textContent = fsState.zoom + '%';
  if (mobileFrame) {
    mobileFrame.style.transform = `scale(${fsState.zoom / 100})`;
    mobileFrame.style.transformOrigin = 'top center';
  }
}

// ========== LIVE PREVIEW UPDATE ==========
function updateFSPreview() {
  const headlineInput = document.getElementById('fsHeadline');
  const happyInput = document.getElementById('fsHappyLabel');
  const sadInput = document.getElementById('fsSadLabel');
  const logoInput = document.getElementById('fsLogoUrl');
  
  if (headlineInput) fsState.headline = headlineInput.value;
  if (happyInput) fsState.happyLabel = happyInput.value;
  if (sadInput) fsState.sadLabel = sadInput.value;
  if (logoInput) fsState.logoUrl = logoInput.value;
  
  const businessName = document.getElementById('sidebarBizName')?.innerText || 'Your Business';
  
  const bizEl = document.getElementById('fsPreviewBiz');
  const questionEl = document.getElementById('fsPreviewQuestion');
  const happyEl = document.getElementById('fsPreviewHappy');
  const sadEl = document.getElementById('fsPreviewSad');
  
  if (bizEl) bizEl.textContent = businessName;
  if (questionEl) questionEl.textContent = fsState.headline;
  if (happyEl) happyEl.innerHTML = `😊 ${fsState.happyLabel}`;
  if (sadEl) sadEl.innerHTML = `😕 ${fsState.sadLabel}`;
  
  if (happyEl) {
    happyEl.style.background = fsState.accentColor;
    happyEl.style.borderColor = fsState.accentColor;
  }
  
  const bizDesktop = document.getElementById('fsPreviewBizDesktop');
  const questionDesktop = document.getElementById('fsPreviewQuestionDesktop');
  const happyDesktop = document.getElementById('fsPreviewHappyDesktop');
  const sadDesktop = document.getElementById('fsPreviewSadDesktop');
  
  if (bizDesktop) bizDesktop.textContent = businessName;
  if (questionDesktop) questionDesktop.textContent = fsState.headline;
  if (happyDesktop) happyDesktop.innerHTML = `😊 ${fsState.happyLabel}`;
  if (sadDesktop) sadDesktop.innerHTML = `😕 ${fsState.sadLabel}`;
  
  if (happyDesktop) {
    happyDesktop.style.background = fsState.accentColor;
    happyDesktop.style.borderColor = fsState.accentColor;
  }
  
  const logoPreview = document.getElementById('fsLogoPreview');
  const logoImg = document.getElementById('fsLogoPreviewImg');
  if (fsState.logoUrl && logoPreview && logoImg) {
    logoImg.src = fsState.logoUrl;
    logoPreview.style.display = 'block';
  } else if (logoPreview) {
    logoPreview.style.display = 'none';
  }
  
  fsState.saved = false;
  updateFSSaveStatus();
}

function updateFSCharCount() {
  const headline = document.getElementById('fsHeadline');
  const count = document.getElementById('fsHeadlineCount');
  if (headline && count) {
    count.textContent = headline.value.length;
    if (count.style) {
      count.style.color = headline.value.length > 55 ? '#D4897C' : 'var(--cream-dim)';
    }
  }
}

// ========== AI SUGGESTIONS ==========
function applyAISuggestion(type) {
  if (type === 'headline') {
    const headlineInput = document.getElementById('fsHeadline');
    if (headlineInput) {
      headlineInput.value = 'How did we do today?';
      updateFSPreview();
      updateFSCharCount();
    }
  } else if (type === 'happy') {
    const happyInput = document.getElementById('fsHappyLabel');
    if (happyInput) {
      happyInput.value = 'Loved it! ⭐';
      updateFSPreview();
    }
  } else if (type === 'color') {
    selectFSColor('#10B981', document.querySelector('[data-color="#10B981"]'));
  }
  updateFSSaveStatus();
}

// ========== SAVE STATUS ==========
function updateFSSaveStatus() {
  const status = document.getElementById('fsSaveStatus');
  if (status) {
    if (fsState.saved) {
      status.textContent = '✓ All changes saved';
      status.className = 'fs-save-status saved';
    } else {
      status.textContent = 'Changes not saved';
      status.className = 'fs-save-status';
    }
  }
}

// ========== SAVE SETTINGS ==========
async function saveFSSettings() {
  const btn = document.getElementById('fsSaveBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';
  }
  
  const data = {
    funnel_template: fsState.template,
    funnel_accent_color: fsState.accentColor,
    funnel_logo_url: fsState.logoUrl,
    funnel_headline: fsState.headline,
    funnel_happy_label: fsState.happyLabel,
    funnel_unhappy_label: fsState.sadLabel,
    funnel_thankyou_message: fsState.thankyouMsg
  };
  
  try {
    const res = await fetch('/update-funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    
    if (result.success) {
      fsState.saved = true;
      updateFSSaveStatus();
      showToast('Funnel updated! Changes are live.', 'success');
    } else {
      showToast(result.error || 'Could not save', 'error');
    }
  } catch (e) {
    showToast('Something went wrong', 'error');
  }
  
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save changes';
  }
}

// ========== COPY LINK ==========
function copyFSLink() {
  const link = document.getElementById('fsLinkDisplay');
  if (link) {
    navigator.clipboard.writeText(link.textContent);
    showToast('Funnel link copied!', 'success');
  }
}

function initFunnelStudio(slug) {
  fsSlug = slug;
  const linkDisplay = document.getElementById('fsLinkDisplay');
  if (linkDisplay) linkDisplay.textContent = window.location.origin + '/r/' + slug;
  
  fetch('/stats/' + slug)
    .then(r => r.json())
    .then(stats => {
      if (stats.funnel_template) {
        fsState.template = stats.funnel_template;
        const selectedTemplate = document.querySelector(`[data-template="${fsState.template}"]`);
        if (selectedTemplate) selectFSTemplate(fsState.template, selectedTemplate);
      }
      if (stats.funnel_accent_color) {
        fsState.accentColor = stats.funnel_accent_color;
        const colorSwatch = document.querySelector(`[data-color="${fsState.accentColor}"]`);
        if (colorSwatch) selectFSColor(fsState.accentColor, colorSwatch);
      }
      if (stats.funnel_logo_url) {
        fsState.logoUrl = stats.funnel_logo_url;
        const logoInput = document.getElementById('fsLogoUrl');
        if (logoInput) logoInput.value = stats.funnel_logo_url;
      }
      if (stats.funnel_headline) {
        fsState.headline = stats.funnel_headline;
        const headlineInput = document.getElementById('fsHeadline');
        if (headlineInput) headlineInput.value = stats.funnel_headline;
      }
      if (stats.funnel_happy_label) {
        fsState.happyLabel = stats.funnel_happy_label;
        const happyInput = document.getElementById('fsHappyLabel');
        if (happyInput) happyInput.value = stats.funnel_happy_label;
      }
      if (stats.funnel_unhappy_label) {
        fsState.sadLabel = stats.funnel_unhappy_label;
        const sadInput = document.getElementById('fsSadLabel');
        if (sadInput) sadInput.value = stats.funnel_unhappy_label;
      }
      
      updateFSPreview();
      updateFSCharCount();
    })
    .catch(() => updateFSPreview());
}

// ========== KEYBOARD SHORTCUTS ==========
document.addEventListener('keydown', function(e) {
  const fsSection = document.getElementById('funnelStudioSection');
  if (!fsSection || !fsSection.classList.contains('active')) return;
  
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveFSSettings();
  }
});

// ========== INITIALIZE WHEN SECTION BECOMES VISIBLE ==========
const fsObserver = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if (mutation.target.id === 'funnelStudioSection' &&
        mutation.target.classList.contains('active') &&
        fsSlug) {
      initFunnelStudio(fsSlug);
    }
  });
});

const fsSectionElement = document.getElementById('funnelStudioSection');
if (fsSectionElement) {
  fsObserver.observe(fsSectionElement, { attributes: true, attributeFilter: ['class'] });
}