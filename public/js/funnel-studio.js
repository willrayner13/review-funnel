// ========== FUNNEL STUDIO MODULE ==========
// ReviewLift Funnel Studio - All funnel customization functionality

import { showToast } from './shared/utils.mjs';

window.showToast = showToast;

let fsState = {
  template: 'classic',
  accentColor: '#C8A96E',
  logoUrl: '',
  headline: 'How was your experience?',
  happyLabel: 'Great experience!',
  sadLabel: 'Could be better',
  thankyouMsg: 'Thanks for your feedback!',
  device: 'split',
  zoom: 100,
  saved: false
};

let fsSlug = '';
let conversionPredictionTimeout = null;

const CONVERSION_BENCHMARKS = {
  'How was your experience?': { baseline: 18, better: 22, best: 26 },
  'How did we do today?': { baseline: 22, better: 26, best: 31 },
  'How would you rate your visit?': { baseline: 20, better: 24, best: 28 },
  'Loved it? Leave a review!': { baseline: 24, better: 28, best: 33 },
  'What did you think?': { baseline: 19, better: 23, best: 27 },
  'default': { baseline: 18, better: 22, best: 26 }
};

window.selectFSTemplate = function(template, el) {
  fsState.template = template;
  fsState.saved = false;
  
  document.querySelectorAll('.fs-template-thumb').forEach(t => t.classList.remove('selected'));
  if (el) el.classList.add('selected');
  
  updateFSPreview();
  updateFSSaveStatus();
};

window.selectFSColor = function(color, el) {
  fsState.accentColor = color;
  fsState.saved = false;
  
  document.querySelectorAll('.fs-color-swatch').forEach(s => s.classList.remove('selected'));
  if (el) el.classList.add('selected');
  
  const colorInput = document.querySelector('.fs-color-input');
  if (colorInput) colorInput.value = color;
  
  updateFSPreview();
  updateFSSaveStatus();
  
  const happyBtns = document.querySelectorAll('#fsPreviewHappy, #fsPreviewHappyDesktop');
  happyBtns.forEach(btn => {
    btn.style.background = fsState.accentColor;
    btn.style.borderColor = fsState.accentColor;
  });
  
  document.documentElement.style.setProperty('--accent', color);
};

window.setFSDevice = function(device) {
  fsState.device = device;
  
  const mobileFrame = document.getElementById('fsMobileFrame');
  const desktopFrame = document.getElementById('fsDesktopFrame');
  const buttons = document.querySelectorAll('.fs-device-btn');
  
  buttons.forEach(b => b.classList.remove('active'));
  
  if (device === 'mobile') {
    if (mobileFrame) mobileFrame.style.display = 'block';
    if (desktopFrame) desktopFrame.style.display = 'none';
    if (buttons[0]) buttons[0].classList.add('active');
  } else if (device === 'desktop') {
    if (mobileFrame) mobileFrame.style.display = 'none';
    if (desktopFrame) desktopFrame.style.display = 'block';
    if (buttons[1]) buttons[1].classList.add('active');
  } else if (device === 'split') {
    if (mobileFrame) mobileFrame.style.display = 'block';
    if (desktopFrame) desktopFrame.style.display = 'block';
    if (buttons[2]) buttons[2].classList.add('active');
  }
};

window.zoomFS = function(delta) {
  fsState.zoom = Math.max(60, Math.min(150, fsState.zoom + delta));
  const zoomLabel = document.getElementById('fsZoomLabel');
  const mobileFrame = document.getElementById('fsMobileFrame');
  const desktopFrame = document.getElementById('fsDesktopFrame');
  
  if (zoomLabel) zoomLabel.textContent = fsState.zoom + '%';
  
  const scale = fsState.zoom / 100;
  if (mobileFrame) {
    mobileFrame.style.transform = `scale(${scale})`;
    mobileFrame.style.transformOrigin = 'top center';
  }
  if (desktopFrame && fsState.device !== 'split') {
    desktopFrame.style.transform = `scale(${scale})`;
    desktopFrame.style.transformOrigin = 'top center';
  }
};

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
  
  if (conversionPredictionTimeout) clearTimeout(conversionPredictionTimeout);
  conversionPredictionTimeout = setTimeout(() => {
    updateConversionPrediction();
  }, 300);
  
  fsState.saved = false;
  updateFSSaveStatus();
}

window.updateFSPreview = updateFSPreview;

function updateFSCharCount() {
  const headline = document.getElementById('fsHeadline');
  const count = document.getElementById('fsHeadlineCount');
  if (headline && count) {
    count.textContent = headline.value.length;
  }
}

window.updateFSCharCount = updateFSCharCount;

function calculateConversionPrediction(headline) {
  const benchmarks = CONVERSION_BENCHMARKS[headline] || CONVERSION_BENCHMARKS.default;
  const isQuestion = headline.includes('?');
  const hasEmoji = headline.includes('⭐') || headline.includes('🎉') || headline.includes('😊');
  const length = headline.length;
  
  let multiplier = 1.0;
  if (isQuestion) multiplier += 0.05;
  if (hasEmoji) multiplier += 0.08;
  if (length < 30) multiplier += 0.03;
  if (length > 60) multiplier -= 0.05;
  
  const predicted = Math.min(45, Math.round(benchmarks.baseline * multiplier));
  const potential = Math.min(55, Math.round(benchmarks.best * multiplier));
  
  return { predicted, potential, baseline: benchmarks.baseline };
}

function updateConversionPrediction() {
  const headline = document.getElementById('fsHeadline')?.value || fsState.headline;
  const prediction = calculateConversionPrediction(headline);
  
  const predictionContainer = document.getElementById('conversionPrediction');
  if (!predictionContainer) return;
  
  const improvement = prediction.predicted - prediction.baseline;
  const improvementText = improvement > 0 ? `+${improvement}% better than average` : improvement < 0 ? `${improvement}% below average` : 'average';
  const improvementColor = improvement > 0 ? '#6A9E7F' : improvement < 0 ? '#C0675A' : 'rgba(234,231,220,0.52)';
  
  predictionContainer.innerHTML = `
    <div style="background: rgba(200,169,110,0.06); border-radius: 12px; padding: 14px 16px; margin-top: 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div>
          <div style="font-size: 0.65rem; color: rgba(234,231,220,0.52); letter-spacing: 0.5px;">📈 PREDICTED CONVERSION</div>
          <div style="font-size: 1.6rem; font-weight: 800; color: #C8A96E;">${prediction.predicted}%</div>
          <div style="font-size: 0.7rem; color: ${improvementColor};">${improvementText}</div>
        </div>
        <div style="width: 1px; height: 40px; background: rgba(234,231,220,0.09);"></div>
        <div>
          <div style="font-size: 0.65rem; color: rgba(234,231,220,0.52); letter-spacing: 0.5px;">🎯 OPTIMISED POTENTIAL</div>
          <div style="font-size: 1.6rem; font-weight: 800; color: #6A9E7F;">${prediction.potential}%</div>
          <div style="font-size: 0.7rem; color: rgba(234,231,220,0.52);">with A/B testing</div>
        </div>
      </div>
    </div>
  `;
}

function updateFSSaveStatus() {
  const status = document.getElementById('fsSaveStatus');
  if (status) {
    if (fsState.saved) {
      status.textContent = '✓ All changes saved';
      status.style.color = '#6A9E7F';
    } else {
      status.textContent = 'Changes not saved';
      status.style.color = 'rgba(234,231,220,0.52)';
    }
  }
}

window.saveFSSettings = async function() {
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
};

window.copyFSLink = function() {
  const link = document.getElementById('fsLinkDisplay');
  if (link) {
    navigator.clipboard.writeText(link.textContent);
    showToast('Funnel link copied!', 'success');
  }
};

window.applyAISuggestion = function(type, customText = null) {
  if (type === 'headline') {
    const headlineInput = document.getElementById('fsHeadline');
    if (headlineInput) {
      headlineInput.value = customText || 'How did we do today?';
      updateFSPreview();
      updateFSCharCount();
      showToast('AI suggestion applied to headline!', 'success');
    }
  } else if (type === 'happy') {
    const happyInput = document.getElementById('fsHappyLabel');
    if (happyInput) {
      happyInput.value = 'Loved it! ⭐';
      updateFSPreview();
      showToast('AI suggestion applied to happy button!', 'success');
    }
  } else if (type === 'color') {
    window.selectFSColor('#10B981', document.querySelector('[data-color="#10B981"]'));
    showToast('AI colour suggestion applied!', 'success');
  }
};

function initFunnelStudio(slug) {
  console.log('Initializing Funnel Studio for slug:', slug);
  fsSlug = slug;
  const linkDisplay = document.getElementById('fsLinkDisplay');
  if (linkDisplay) linkDisplay.textContent = window.location.origin + '/r/' + slug;
  
  window.setFSDevice('split');
  
  fetch('/stats/' + slug)
    .then(r => r.json())
    .then(stats => {
      if (stats.funnel_template) {
        fsState.template = stats.funnel_template;
        const selectedTemplate = document.querySelector(`[data-template="${fsState.template}"]`);
        if (selectedTemplate) window.selectFSTemplate(fsState.template, selectedTemplate);
      }
      if (stats.funnel_accent_color) {
        fsState.accentColor = stats.funnel_accent_color;
        const colorSwatch = document.querySelector(`[data-color="${fsState.accentColor}"]`);
        if (colorSwatch) window.selectFSColor(fsState.accentColor, colorSwatch);
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
      updateConversionPrediction();
    })
    .catch(err => {
      console.error('Failed to load funnel stats:', err);
      updateFSPreview();
    });
}

// Auto-initialize when funnel studio section becomes visible
function checkAndInit() {
  const fsSection = document.getElementById('funnelStudioSection');
  if (fsSection && fsSection.classList.contains('active') && window.slug) {
    initFunnelStudio(window.slug);
  }
}

// Watch for section visibility
const observer = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if (mutation.target.id === 'funnelStudioSection' &&
        mutation.target.classList.contains('active') &&
        window.slug) {
      initFunnelStudio(window.slug);
    }
  });
});

const fsSection = document.getElementById('funnelStudioSection');
if (fsSection) {
  observer.observe(fsSection, { attributes: true, attributeFilter: ['class'] });
}

// Also try to init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAndInit);
} else {
  setTimeout(checkAndInit, 500);
}