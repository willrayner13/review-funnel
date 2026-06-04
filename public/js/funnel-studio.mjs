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

// Template style configurations
const TEMPLATE_STYLES = {
  classic: {
    bg: '#1A1A18',
    cardBg: '#242422',
    accent: '#C8A96E',
    textColor: '#EAE7DC',
    buttonTextColor: '#1A1A18'
  },
  bright: {
    bg: '#FAFAFA',
    cardBg: '#FFFFFF',
    accent: '#C8A96E',
    textColor: '#1A1A18',
    buttonTextColor: '#1A1A18'
  },
  medical: {
    bg: '#F0F4F8',
    cardBg: '#FFFFFF',
    accent: '#3B82F6',
    textColor: '#1A1A18',
    buttonTextColor: '#FFFFFF'
  },
  bold: {
    bg: '#C8A96E',
    cardBg: 'rgba(0,0,0,0.1)',
    accent: '#FFFFFF',
    textColor: '#1A1A18',
    buttonTextColor: '#1A1A18'
  },
  luxury: {
    bg: '#0A0A0A',
    cardBg: '#141414',
    accent: '#C8A96E',
    textColor: '#EAE7DC',
    buttonTextColor: '#1A1A18'
  }
};

// Apply template styles to previews
function applyTemplateStyles(template) {
  const style = TEMPLATE_STYLES[template] || TEMPLATE_STYLES.classic;
  
  // Update mobile preview background
  const phoneMock = document.querySelector('.phone-mock');
  if (phoneMock) phoneMock.style.backgroundColor = style.bg;
  
  // Update desktop card background
  const desktopCard = document.querySelector('.desktop-card');
  if (desktopCard) desktopCard.style.backgroundColor = style.cardBg;
  
  // Update business name color
  document.querySelectorAll('.preview-business').forEach(el => {
    el.style.color = style.accent;
  });
  
  // Update question text color
  document.querySelectorAll('.preview-question').forEach(el => {
    el.style.color = style.textColor;
  });
  
  // Update happy buttons
  document.querySelectorAll('.preview-btn.happy-btn, .happy-btn').forEach(btn => {
    btn.style.background = fsState.accentColor;
    btn.style.color = style.buttonTextColor;
  });
  
  // Update sad buttons
  document.querySelectorAll('.preview-btn.sad-btn, .sad-btn').forEach(btn => {
    btn.style.border = '1px solid rgba(234,231,220,0.2)';
    btn.style.color = style.textColor;
    btn.style.background = 'transparent';
  });
}

// Template selection
window.selectFSTemplate = function(template, el) {
  console.log('Template selected:', template);
  fsState.template = template;
  fsState.saved = false;
  
  document.querySelectorAll('.template-item').forEach(opt => opt.classList.remove('selected'));
  if (el) el.classList.add('selected');
  
  applyTemplateStyles(template);
  updateFSPreview();
  updateFSSaveStatus();
};

// Color selection
window.selectFSColor = function(color, el) {
  console.log('Color selected:', color);
  fsState.accentColor = color;
  fsState.saved = false;
  
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  if (el && el.classList) el.classList.add('selected');
  
  const customColor = document.querySelector('.custom-color');
  if (customColor) customColor.value = color;
  
  document.querySelectorAll('.preview-btn.happy-btn, .happy-btn').forEach(btn => {
    btn.style.background = color;
  });
  
  document.querySelectorAll('.preview-business').forEach(el => {
    el.style.color = color;
  });
  
  updateFSPreview();
  updateFSSaveStatus();
};

// Device view toggle
window.setFSDevice = function(device) {
  console.log('Device set to:', device);
  fsState.device = device;
  
  const mobilePreview = document.getElementById('fsMobilePreview');
  const desktopPreview = document.getElementById('fsDesktopPreview');
  const buttons = document.querySelectorAll('.fs-device-btn');
  
  buttons.forEach(b => b.classList.remove('active'));
  
  if (device === 'mobile') {
    if (mobilePreview) mobilePreview.style.display = 'block';
    if (desktopPreview) desktopPreview.style.display = 'none';
    if (buttons[0]) buttons[0].classList.add('active');
  } else if (device === 'desktop') {
    if (mobilePreview) mobilePreview.style.display = 'none';
    if (desktopPreview) desktopPreview.style.display = 'block';
    if (buttons[1]) buttons[1].classList.add('active');
  } else if (device === 'split') {
    if (mobilePreview) mobilePreview.style.display = 'block';
    if (desktopPreview) desktopPreview.style.display = 'block';
    if (buttons[2]) buttons[2].classList.add('active');
  }
};

// Zoom function
window.zoomFS = function(delta) {
  fsState.zoom = Math.max(60, Math.min(150, fsState.zoom + delta));
  const zoomLabel = document.getElementById('fsZoomLabel');
  const previewContainer = document.getElementById('fsPreviewContainer');
  
  if (zoomLabel) zoomLabel.textContent = fsState.zoom + '%';
  
  const scale = fsState.zoom / 100;
  if (previewContainer) {
    previewContainer.style.transform = `scale(${scale})`;
    previewContainer.style.transformOrigin = 'top center';
  }
};

// Update preview text
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
  
  // Update all preview elements
  document.querySelectorAll('.preview-business').forEach(el => el.textContent = businessName);
  document.querySelectorAll('.preview-question').forEach(el => el.textContent = fsState.headline);
  document.querySelectorAll('.preview-btn.happy-btn, .happy-btn').forEach(btn => {
    btn.innerHTML = `😊 ${fsState.happyLabel}`;
  });
  document.querySelectorAll('.preview-btn.sad-btn, .sad-btn').forEach(btn => {
    btn.innerHTML = `😕 ${fsState.sadLabel}`;
  });
  
  // Update browser URL
  const browserUrl = document.querySelector('.browser-url');
  if (browserUrl && fsSlug) {
    browserUrl.textContent = window.location.origin + '/r/' + fsSlug;
  }
  
  // Update logo preview
  const logoElements = document.querySelectorAll('.preview-logo-img, #previewLogoImg, #previewLogoDesktop');
  logoElements.forEach(img => {
    if (fsState.logoUrl && fsState.logoUrl.trim()) {
      img.src = fsState.logoUrl;
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
    }
  });
  
  // Apply accent color
  document.querySelectorAll('.preview-btn.happy-btn, .happy-btn').forEach(btn => {
    btn.style.background = fsState.accentColor;
  });
  document.querySelectorAll('.preview-business').forEach(el => {
    el.style.color = fsState.accentColor;
  });
  
  // Update char counter
  const countSpan = document.getElementById('fsHeadlineCount');
  if (countSpan && headlineInput) countSpan.textContent = headlineInput.value.length;
  
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
      status.textContent = '✓ Saved';
      status.style.color = '#6A9E7F';
    } else {
      status.textContent = '⚠️ Unsaved changes';
      status.style.color = 'rgba(234,231,220,0.52)';
    }
  }
}

window.saveFSSettings = async function() {
  const btn = document.getElementById('fsSaveBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
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
    btn.textContent = '💾 Save changes';
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
  }
};

function initFunnelStudio(slug) {
  console.log('Initializing Funnel Studio for slug:', slug);
  fsSlug = slug;
  
  const linkDisplay = document.getElementById('fsLinkDisplay');
  if (linkDisplay) linkDisplay.textContent = window.location.origin + '/r/' + slug;
  
  const browserUrl = document.querySelector('.browser-url');
  if (browserUrl) browserUrl.textContent = window.location.origin + '/r/' + slug;
  
  window.setFSDevice('split');
  
  fetch('/stats/' + slug)
    .then(r => r.json())
    .then(stats => {
      if (stats.funnel_template) {
        fsState.template = stats.funnel_template;
        const templateEl = document.querySelector(`.template-item[data-template="${fsState.template}"]`);
        if (templateEl) {
          document.querySelectorAll('.template-item').forEach(opt => opt.classList.remove('selected'));
          templateEl.classList.add('selected');
          applyTemplateStyles(fsState.template);
        }
      }
      
      if (stats.funnel_accent_color) {
        fsState.accentColor = stats.funnel_accent_color;
        const colorEl = document.querySelector(`.color-swatch[data-color="${fsState.accentColor}"]`);
        if (colorEl) {
          document.querySelectorAll('.color-swatch').forEach(opt => opt.classList.remove('selected'));
          colorEl.classList.add('selected');
        }
        const customColor = document.querySelector('.custom-color');
        if (customColor) customColor.value = fsState.accentColor;
        
        document.querySelectorAll('.preview-btn.happy-btn, .happy-btn').forEach(btn => {
          btn.style.background = fsState.accentColor;
        });
        document.querySelectorAll('.preview-business').forEach(el => {
          el.style.color = fsState.accentColor;
        });
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
      if (stats.funnel_logo_url) {
        fsState.logoUrl = stats.funnel_logo_url;
        const logoInput = document.getElementById('fsLogoUrl');
        if (logoInput) logoInput.value = stats.funnel_logo_url;
      }
      
      updateFSPreview();
      updateFSCharCount();
      updateConversionPrediction();
      
      if (fsState.logoUrl) {
        document.querySelectorAll('.preview-logo-img').forEach(img => {
          img.src = fsState.logoUrl;
          img.style.display = 'block';
        });
      }
      
      fsState.saved = true;
      updateFSSaveStatus();
    })
    .catch(err => {
      console.error('Failed to load funnel stats:', err);
      updateFSPreview();
    });
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

// Auto-init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.slug) initFunnelStudio(window.slug);
  });
} else if (window.slug) {
  setTimeout(() => initFunnelStudio(window.slug), 500);
}

export { initFunnelStudio };