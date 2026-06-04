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
    buttonTextColor: '#1A1A18',
    previewBg: '#1A1A18'
  },
  bright: {
    bg: '#FAFAFA',
    cardBg: '#FFFFFF',
    accent: '#C8A96E',
    textColor: '#1A1A18',
    buttonTextColor: '#1A1A18',
    previewBg: '#FAFAFA'
  },
  medical: {
    bg: '#F0F4F8',
    cardBg: '#FFFFFF',
    accent: '#3B82F6',
    textColor: '#1A1A18',
    buttonTextColor: '#FFFFFF',
    previewBg: '#F0F4F8'
  },
  bold: {
    bg: '#C8A96E',
    cardBg: 'rgba(0,0,0,0.2)',
    accent: '#FFFFFF',
    textColor: '#1A1A18',
    buttonTextColor: '#1A1A18',
    previewBg: '#C8A96E'
  },
  luxury: {
    bg: '#0A0A0A',
    cardBg: '#141414',
    accent: '#C8A96E',
    textColor: '#EAE7DC',
    buttonTextColor: '#1A1A18',
    previewBg: '#0A0A0A'
  }
};

// Apply template styles to previews
function applyTemplateStyles(template) {
  const style = TEMPLATE_STYLES[template] || TEMPLATE_STYLES.classic;
  
  // For simplified version (phone-screen / phone-card)
  const phoneScreen = document.querySelector('.phone-screen');
  if (phoneScreen) {
    phoneScreen.style.backgroundColor = style.previewBg;
  }
  
  // For desktop content
  const desktopContent = document.querySelector('.desktop-content');
  if (desktopContent) {
    desktopContent.style.backgroundColor = style.cardBg;
  }
  
  // Also handle the older class names for backward compatibility
  const mobileScreen = document.querySelector('.fs-mobile-screen');
  if (mobileScreen) {
    mobileScreen.style.backgroundColor = style.previewBg;
  }
  
  const desktopCard = document.querySelector('.fs-desktop-card');
  if (desktopCard) {
    desktopCard.style.backgroundColor = style.cardBg;
  }
  
  // Update happy buttons (using multiple selectors for compatibility)
  const happyBtns = document.querySelectorAll('.preview-happy, #fsPreviewHappy, #fsPreviewHappyDesktop');
  happyBtns.forEach(btn => {
    btn.style.background = style.accent;
    btn.style.color = style.buttonTextColor;
    btn.style.border = 'none';
  });
  
  // Update sad buttons
  const sadBtns = document.querySelectorAll('.preview-sad, #fsPreviewSad, #fsPreviewSadDesktop');
  sadBtns.forEach(btn => {
    btn.style.border = `1px solid rgba(234,231,220,0.2)`;
    btn.style.color = style.textColor;
    btn.style.background = 'transparent';
  });
  
  // Update business name color
  const bizElements = document.querySelectorAll('.preview-name, #fsPreviewBiz, #fsPreviewBizDesktop');
  bizElements.forEach(el => {
    el.style.color = style.accent;
  });
  
  // Update question text color
  const questionElements = document.querySelectorAll('.preview-question, #fsPreviewQuestion, #fsPreviewQuestionDesktop');
  questionElements.forEach(el => {
    el.style.color = style.textColor;
  });
  
  // Update phone body background
  const phoneBody = document.querySelector('.phone-body');
  if (phoneBody) {
    phoneBody.style.backgroundColor = 'transparent';
  }
  
  // Update browser body
  const browserBody = document.querySelector('.browser-body');
  if (browserBody) {
    browserBody.style.backgroundColor = style.previewBg;
  }
}

// Template selection
window.selectFSTemplate = function(template, el) {
  console.log('Template selected:', template);
  fsState.template = template;
  fsState.saved = false;
  
  // Update UI for simplified template options
  document.querySelectorAll('.template-option').forEach(opt => opt.classList.remove('selected'));
  if (el) el.classList.add('selected');
  
  // Also update older template thumbs for backward compatibility
  document.querySelectorAll('.fs-template-thumb').forEach(t => t.classList.remove('selected'));
  const oldThumb = document.querySelector(`.fs-template-thumb[data-template="${template}"]`);
  if (oldThumb) oldThumb.classList.add('selected');
  
  // Apply template styles
  applyTemplateStyles(template);
  
  updateFSPreview();
  updateFSSaveStatus();
};

// Color selection
window.selectFSColor = function(color, el) {
  console.log('Color selected:', color);
  fsState.accentColor = color;
  fsState.saved = false;
  
  // Update UI for simplified color options
  document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
  if (el) el.classList.add('selected');
  
  // Also update older color swatches for backward compatibility
  document.querySelectorAll('.fs-color-swatch').forEach(s => s.classList.remove('selected'));
  const oldSwatch = document.querySelector(`.fs-color-swatch[data-color="${color}"]`);
  if (oldSwatch) oldSwatch.classList.add('selected');
  
  const colorInput = document.querySelector('.fs-color-input, .custom-color');
  if (colorInput) colorInput.value = color;
  
  // Update happy buttons (multiple selectors for compatibility)
  const happyBtns = document.querySelectorAll('.preview-happy, #fsPreviewHappy, #fsPreviewHappyDesktop');
  happyBtns.forEach(btn => {
    btn.style.background = color;
  });
  
  // Update business name color
  const bizElements = document.querySelectorAll('.preview-name, #fsPreviewBiz, #fsPreviewBizDesktop');
  bizElements.forEach(el => {
    el.style.color = color;
  });
  
  updateFSPreview();
  updateFSSaveStatus();
};

// Device view toggle
window.setFSDevice = function(device) {
  console.log('Device set to:', device);
  fsState.device = device;
  
  // For simplified version
  const mobilePreview = document.getElementById('fsPhonePreview');
  const desktopPreview = document.getElementById('fsDesktopPreview');
  
  // For older version
  const mobileFrame = document.getElementById('fsMobileFrame');
  const desktopFrame = document.getElementById('fsDesktopFrame');
  
  const buttons = document.querySelectorAll('.view-btn, .fs-device-btn');
  
  buttons.forEach(b => b.classList.remove('active'));
  
  if (device === 'mobile') {
    if (mobilePreview) mobilePreview.style.display = 'block';
    if (desktopPreview) desktopPreview.style.display = 'none';
    if (mobileFrame) mobileFrame.style.display = 'block';
    if (desktopFrame) desktopFrame.style.display = 'none';
    const mobileBtn = document.querySelector('.view-btn[data-view="mobile"], .fs-device-btn[onclick*="mobile"]');
    if (mobileBtn) mobileBtn.classList.add('active');
    if (buttons[0]) buttons[0].classList.add('active');
  } else if (device === 'desktop') {
    if (mobilePreview) mobilePreview.style.display = 'none';
    if (desktopPreview) desktopPreview.style.display = 'block';
    if (mobileFrame) mobileFrame.style.display = 'none';
    if (desktopFrame) desktopFrame.style.display = 'block';
    const desktopBtn = document.querySelector('.view-btn[data-view="desktop"], .fs-device-btn[onclick*="desktop"]');
    if (desktopBtn) desktopBtn.classList.add('active');
    if (buttons[1]) buttons[1].classList.add('active');
  } else if (device === 'split') {
    if (mobilePreview) mobilePreview.style.display = 'block';
    if (desktopPreview) desktopPreview.style.display = 'block';
    if (mobileFrame) mobileFrame.style.display = 'block';
    if (desktopFrame) desktopFrame.style.display = 'block';
    const splitBtn = document.querySelector('.view-btn[data-view="split"], .fs-device-btn[onclick*="split"]');
    if (splitBtn) splitBtn.classList.add('active');
    if (buttons[2]) buttons[2].classList.add('active');
  }
};

// Zoom function
window.zoomFS = function(delta) {
  fsState.zoom = Math.max(60, Math.min(150, fsState.zoom + delta));
  const zoomLabel = document.getElementById('fsZoomLabel');
  const mobilePreview = document.getElementById('fsPhonePreview');
  const desktopPreview = document.getElementById('fsDesktopPreview');
  const mobileFrame = document.getElementById('fsMobileFrame');
  const desktopFrame = document.getElementById('fsDesktopFrame');
  
  if (zoomLabel) zoomLabel.textContent = fsState.zoom + '%';
  
  const scale = fsState.zoom / 100;
  const targetMobile = mobilePreview || mobileFrame;
  const targetDesktop = desktopPreview || desktopFrame;
  
  if (targetMobile && fsState.device !== 'desktop') {
    targetMobile.style.transform = `scale(${scale})`;
    targetMobile.style.transformOrigin = 'top center';
  }
  if (targetDesktop && fsState.device !== 'mobile') {
    targetDesktop.style.transform = `scale(${scale})`;
    targetDesktop.style.transformOrigin = 'top center';
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
  
  // Update simplified preview elements
  const bizElements = document.querySelectorAll('.preview-name');
  const questionElements = document.querySelectorAll('.preview-question');
  const happyButtons = document.querySelectorAll('.preview-happy');
  const sadButtons = document.querySelectorAll('.preview-sad');
  
  bizElements.forEach(el => el.textContent = businessName);
  questionElements.forEach(el => el.textContent = fsState.headline);
  happyButtons.forEach(btn => btn.innerHTML = `😊 ${fsState.happyLabel}`);
  sadButtons.forEach(btn => btn.innerHTML = `😕 ${fsState.sadLabel}`);
  
  // Update older preview elements for backward compatibility
  const oldBiz = document.getElementById('fsPreviewBiz');
  const oldBizDesktop = document.getElementById('fsPreviewBizDesktop');
  const oldQuestion = document.getElementById('fsPreviewQuestion');
  const oldQuestionDesktop = document.getElementById('fsPreviewQuestionDesktop');
  const oldHappy = document.getElementById('fsPreviewHappy');
  const oldHappyDesktop = document.getElementById('fsPreviewHappyDesktop');
  const oldSad = document.getElementById('fsPreviewSad');
  const oldSadDesktop = document.getElementById('fsPreviewSadDesktop');
  
  if (oldBiz) oldBiz.textContent = businessName;
  if (oldBizDesktop) oldBizDesktop.textContent = businessName;
  if (oldQuestion) oldQuestion.textContent = fsState.headline;
  if (oldQuestionDesktop) oldQuestionDesktop.textContent = fsState.headline;
  if (oldHappy) oldHappy.innerHTML = `😊 ${fsState.happyLabel}`;
  if (oldHappyDesktop) oldHappyDesktop.innerHTML = `😊 ${fsState.happyLabel}`;
  if (oldSad) oldSad.innerHTML = `😕 ${fsState.sadLabel}`;
  if (oldSadDesktop) oldSadDesktop.innerHTML = `😕 ${fsState.sadLabel}`;
  
  // Apply accent color to happy buttons (preserve template bg)
  const happyBtns = document.querySelectorAll('.preview-happy, #fsPreviewHappy, #fsPreviewHappyDesktop');
  happyBtns.forEach(btn => {
    btn.style.background = fsState.accentColor;
  });
  
  // Update logo preview
  const logoPreview = document.getElementById('fsLogoPreview');
  const logoImg = document.getElementById('fsLogoPreviewImg');
  if (fsState.logoUrl && logoPreview && logoImg) {
    logoImg.src = fsState.logoUrl;
    logoPreview.style.display = 'block';
  } else if (logoPreview) {
    logoPreview.style.display = 'none';
  }
  
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
      status.textContent = 'Unsaved changes';
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
    btn.textContent = 'Save';
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
    window.selectFSColor('#10B981', document.querySelector('.color-option[style*="background: #10B981"], .fs-color-swatch[data-color="#10B981"]'));
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
      // Load saved template
      if (stats.funnel_template) {
        fsState.template = stats.funnel_template;
        // Try simplified template option first
        let templateEl = document.querySelector(`.template-option[data-template="${fsState.template}"]`);
        if (!templateEl) {
          templateEl = document.querySelector(`.fs-template-thumb[data-template="${fsState.template}"]`);
        }
        if (templateEl) {
          document.querySelectorAll('.template-option, .fs-template-thumb').forEach(opt => opt.classList.remove('selected'));
          templateEl.classList.add('selected');
          applyTemplateStyles(fsState.template);
        }
      }
      
      // Load saved color
      if (stats.funnel_accent_color) {
        fsState.accentColor = stats.funnel_accent_color;
        // Try simplified color option first
        let colorEl = document.querySelector(`.color-option[data-color="${fsState.accentColor}"]`);
        if (!colorEl) {
          colorEl = document.querySelector(`.fs-color-swatch[data-color="${fsState.accentColor}"]`);
        }
        if (colorEl) {
          document.querySelectorAll('.color-option, .fs-color-swatch').forEach(opt => opt.classList.remove('selected'));
          colorEl.classList.add('selected');
        }
        // Apply color to buttons
        const happyBtns = document.querySelectorAll('.preview-happy, #fsPreviewHappy, #fsPreviewHappyDesktop');
        happyBtns.forEach(btn => btn.style.background = fsState.accentColor);
        const bizElements = document.querySelectorAll('.preview-name, #fsPreviewBiz, #fsPreviewBizDesktop');
        bizElements.forEach(el => el.style.color = fsState.accentColor);
      }
      
      // Load saved text
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
      
      // Apply logo preview
      if (fsState.logoUrl) {
        const logoPreview = document.getElementById('fsLogoPreview');
        const logoImg = document.getElementById('fsLogoPreviewImg');
        if (logoPreview && logoImg) {
          logoImg.src = fsState.logoUrl;
          logoPreview.style.display = 'block';
        }
      }
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