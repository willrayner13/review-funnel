// funnel.js - Review funnel page functionality

const slug = window.slug;
const isLapsed = window.accountLapsed === true;
const REDIRECT_DELAY = 8;
let _stepHistory = [];
let mediaRecorder, audioChunks, recordingTimer, seconds = 0;

// ========== FUNNEL CUSTOMISATION ==========
function applyFunnelCustomisation() {
  const template = window.funnelTemplate || 'classic';
  const accentColor = window.funnelAccentColor || '#C8A96E';
  document.body.classList.add(`template-${template}`);
  document.documentElement.style.setProperty('--accent', accentColor);
  
  const headlineEl = document.getElementById('mainHeadline');
  if (window.funnelHeadline && window.funnelHeadline.trim() !== '') {
    headlineEl.textContent = window.funnelHeadline;
  } else if (window.businessName) {
    headlineEl.textContent = `How was your experience at ${window.businessName}?`;
  }
  
  if (window.funnelLogoUrl && window.funnelLogoUrl.length > 0) {
    const logo = document.getElementById('funnelLogo');
    logo.src = window.funnelLogoUrl;
    logo.style.display = 'block';
  }
  
  const btns = document.querySelectorAll('.review-prompt button, #feedbackBox button, #copyGoBtn, #voiceRecordBtn');
  btns.forEach(btn => { if(btn) btn.style.backgroundColor = accentColor; });
}

// ========== NAVIGATION ==========
function show(id, pushHistory) {
  const steps = ["mainQuestion","reviewSection","reviewSectionLapsed","feedbackBox","feedbackBoxLapsed"];
  if(pushHistory){
    const current = steps.find(s => { const el = document.getElementById(s); return el && el.style.display !== "none"; });
    if(current) _stepHistory.push(current);
  }
  steps.forEach(s => { document.getElementById(s).style.display = s === id ? "block" : "none"; });
  const backBtn = document.getElementById("backBtn");
  if(backBtn) backBtn.style.display = id === "mainQuestion" ? "none" : "flex";
}

function goBack() {
  if(_stepHistory.length > 0) show(_stepHistory.pop(), false);
}

function showFeedback() {
  show(isLapsed ? "feedbackBoxLapsed" : "feedbackBox", true);
}

// ========== COUNTDOWN ==========
function startCountdown() {
  const circumference = 175.9;
  const ring = document.getElementById("countdownRing");
  const numEl = document.getElementById("countdownNum");
  const secEl = document.getElementById("countdownSec");
  let remaining = REDIRECT_DELAY;
  ring.style.strokeDashoffset = "0";
  const interval = setInterval(() => {
    remaining--;
    numEl.textContent = remaining;
    secEl.textContent = remaining;
    const progress = (REDIRECT_DELAY - remaining) / REDIRECT_DELAY;
    ring.style.strokeDashoffset = String(circumference * progress);
    if(remaining <= 0){
      clearInterval(interval);
      fetch("/review-click", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
      window.location.href = window.reviewLink;
    }
  }, 1000);
}

// ========== FEEDBACK ==========
function sendFeedback() {
  const message = document.getElementById("message").value.trim();
  if(!message) return;
  const btn = document.querySelector('#feedbackBox button');
  btn.disabled = true;
  btn.textContent = "Sending...";
  fetch("/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business: slug, message })
  }).then(() => {
    document.getElementById("feedbackBox").innerHTML = `<div style="font-size:2.4rem;margin-bottom:12px;">✅</div><h2>Feedback received</h2><p>Thank you — we appreciate you taking the time.</p>`;
  });
}

// ========== REVIEW SUGGESTION ==========
async function loadSuggestion(rating) {
  const loadingEl = document.getElementById('suggestionLoading');
  const suggestionSection = document.getElementById('copyGoSection');
  const fallbackEl = document.getElementById('reviewFallback');
  const textarea = document.getElementById('suggestionText');

  loadingEl.style.display = 'block';
  suggestionSection.style.display = 'none';
  fallbackEl.style.display = 'none';

  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));

  try {
    const fetchPromise = fetch("/suggest-review/" + window.slug, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating,
        service: window.service || null,
        business_name: window.businessName || '',
        industry: window.industry || null
      })
    });

    const res = await Promise.race([fetchPromise, timeout]);
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();

    if (data.suggestion) {
      textarea.value = data.suggestion;
      loadingEl.style.display = 'none';
      suggestionSection.style.display = 'block';
      return;
    }
  } catch (e) {
    console.log('Suggestion failed, showing fallback');
  }

  loadingEl.style.display = 'none';
  fallbackEl.style.display = 'block';
}

async function copyAndOpenGoogle() {
  const text = document.getElementById('suggestionText').value;
  await navigator.clipboard.writeText(text);
  const btn = document.getElementById('copyGoBtn');
  btn.textContent = 'Copied! Opening Google...';
  btn.style.opacity = '0.7';
  btn.disabled = true;
  await fetch('/review-click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: window.slug })
  });
  setTimeout(() => window.open(window.reviewLink, '_blank'), 400);
}

function openGoogleDirectly() {
  fetch('/review-click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: window.slug })
  });
  window.open(window.reviewLink, '_blank');
}

function leaveReview() {
  fetch("/review-click", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
  window.location.href = window.reviewLink;
}

// ========== VOICE RECORDING ==========
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await transcribeAudio(audioBlob);
    };
    mediaRecorder.start();
    document.getElementById("voiceRecordBtn").textContent = "⏹ Stop recording";
    document.getElementById("voiceRecordBtn").onclick = stopRecording;
    document.getElementById("recordingTimer").style.display = "inline";
    seconds = 0;
    recordingTimer = setInterval(() => {
      seconds++;
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      document.getElementById("recordingTimer").textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      if (seconds >= 30) stopRecording();
    }, 1000);
  } catch (e) {
    document.getElementById("voiceResult").innerHTML = '<p style="color:#D4897C;font-size:0.85rem;">Microphone access needed.</p>';
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    clearInterval(recordingTimer);
    document.getElementById("voiceRecordBtn").textContent = "Processing...";
    document.getElementById("voiceRecordBtn").disabled = true;
    document.getElementById("recordingTimer").style.display = "none";
  }
}

async function transcribeAudio(blob) {
  const formData = new FormData();
  formData.append('audio', blob, 'recording.webm');
  try {
    const res = await fetch("/transcribe-voice/" + window.slug, { method: "POST", body: formData });
    const data = await res.json();
    if (data.sentiment === "positive") {
      document.getElementById("voiceResult").innerHTML = `
        <div style="padding:14px;border-radius:12px;margin-bottom:12px;">
          <p>We heard: "${data.transcription}"</p>
          <button onclick="leaveReview()" style="padding:10px 20px;border-radius:40px;cursor:pointer;width:100%;">Post as Google review →</button>
        </div>`;
    } else {
      document.getElementById("voiceResult").innerHTML = `<p>Thank you — your feedback has been saved privately.</p>`;
      const reviewPrompt = document.querySelector(".review-prompt");
      if (reviewPrompt) reviewPrompt.style.display = "none";
    }
  } catch (e) {
    document.getElementById("voiceResult").innerHTML = '<p>Could not process audio. Please try again.</p>';
  }
  document.getElementById("voiceRecordBtn").style.display = "none";
}

// ========== PREVIEW BANNER ==========
(function setupPreviewBanner() {
  const urlParams = new URLSearchParams(window.location.search);
  const isPreview = urlParams.get('preview') === 'true';
  if(isPreview){
    document.body.classList.add('has-preview-banner');
    const banner = document.createElement('div');
    banner.className = 'preview-banner';
    banner.innerHTML = `<span>👁️ <strong>Preview Mode</strong> — This is how your customers would see your funnel</span><div style="display:flex;gap:12px;"><a href="/admin">✨ Get this for your business →</a><span class="banner-close" onclick="this.closest('.preview-banner').style.display='none'; document.body.classList.remove('has-preview-banner');" style="cursor:pointer;">✕</span></div>`;
    document.body.prepend(banner);
  }
})();

// ========== INITIALISE STARS ==========
(function initStars() {
  const stars = document.querySelectorAll('#starRating span');
  stars.forEach(star => {
    star.addEventListener('mouseover', () => {
      const val = parseInt(star.dataset.star);
      stars.forEach(s => {
        const sVal = parseInt(s.dataset.star);
        s.style.filter = sVal <= val ? 'grayscale(0) brightness(1.1)' : 'grayscale(1) brightness(0.5)';
        s.style.transform = sVal <= val ? 'scale(1.15)' : 'scale(1)';
      });
    });
    star.addEventListener('mouseout', () => {
      stars.forEach(s => {
        s.style.filter = 'grayscale(1) brightness(0.5)';
        s.style.transform = 'scale(1)';
      });
    });
    star.addEventListener('click', async () => {
      const rating = parseInt(star.dataset.star);
      stars.forEach(s => {
        const sVal = parseInt(s.dataset.star);
        s.style.filter = sVal <= rating ? 'grayscale(0) brightness(1.1)' : 'grayscale(1) brightness(0.5)';
        s.style.transform = sVal <= rating ? 'scale(1.15)' : 'scale(1)';
        s.style.pointerEvents = 'none';
      });
      
      document.getElementById("mainQuestion").style.display = "none";
      
      if (rating >= 4) {
        if (isLapsed) { show('reviewSectionLapsed', true); startCountdown(); }
        else { show('reviewSection', true); loadSuggestion(rating); }
      } else {
        show(isLapsed ? 'feedbackBoxLapsed' : 'feedbackBox', true);
      }
      
      fetch('/rating', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ slug: window.slug, rating })
      }).catch(e => console.log('Rating fetch failed:', e));
      
      if (rating >= 4) {
        fetch('/positive', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ slug: window.slug })
        }).catch(e => console.log('Positive fetch failed:', e));
      }
    });
  });
})();

// ========== INIT ==========
const titleEl = document.getElementById("businessTitle");
if(titleEl && window.businessName) titleEl.innerText = window.businessName;

applyFunnelCustomisation();

// Listen for funnel studio preview updates
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  
  if (event.data?.type === 'FUNNEL_PREVIEW_UPDATE') {
    const s = event.data.settings;
    
    if (s.accentColor) {
      document.documentElement.style.setProperty('--accent', s.accentColor);
      const accentButtons = document.querySelectorAll('.review-prompt button, #feedbackBox button, #copyGoBtn, #voiceRecordBtn');
      accentButtons.forEach(btn => { if (btn) btn.style.backgroundColor = s.accentColor; });
    }
    
    if (s.template) {
      const templateClasses = ['template-classic', 'template-bright', 'template-medical', 'template-bold', 'template-luxury'];
      templateClasses.forEach(cls => document.body.classList.remove(cls));
      document.body.classList.add(`template-${s.template}`);
    }
    
    const headlineEl = document.getElementById('mainHeadline');
    if (headlineEl && s.headline && s.headline.trim() !== '') {
      headlineEl.textContent = s.headline;
    } else if (headlineEl && window.businessName) {
      headlineEl.textContent = `How was your experience at ${window.businessName}?`;
    }
    
    if (s.logoUrl && s.logoUrl.trim() !== '') {
      let logoEl = document.querySelector('.funnel-logo');
      if (!logoEl) {
        const img = document.createElement('img');
        img.className = 'funnel-logo';
        img.style.cssText = 'max-height:60px; max-width:200px; margin:0 auto 20px; display:block;';
        const funnelCard = document.querySelector('.funnel-card');
        if (funnelCard) funnelCard.prepend(img);
        logoEl = document.querySelector('.funnel-logo');
      }
      if (logoEl) logoEl.src = s.logoUrl;
    } else {
      const logoEl = document.querySelector('.funnel-logo');
      if (logoEl) logoEl.remove();
    }
  }
});

// DOM ready fallback
document.addEventListener('DOMContentLoaded', () => {
  if (window.funnelTemplate) {
    const templateClasses = ['template-classic', 'template-bright', 'template-medical', 'template-bold', 'template-luxury'];
    templateClasses.forEach(cls => document.body.classList.remove(cls));
    document.body.classList.add(`template-${window.funnelTemplate}`);
  }
  
  if (window.funnelAccentColor) {
    document.documentElement.style.setProperty('--accent', window.funnelAccentColor);
  }
  
  const headlineEl = document.getElementById('mainHeadline');
  if (window.funnelHeadline && window.funnelHeadline.trim() !== '' && headlineEl) {
    headlineEl.textContent = window.funnelHeadline;
  } else if (headlineEl && window.businessName) {
    headlineEl.textContent = `How was your experience at ${window.businessName}?`;
  }
  
  if (window.funnelLogoUrl && window.funnelLogoUrl.trim() !== '') {
    let logoEl = document.querySelector('.funnel-logo');
    if (!logoEl) {
      const img = document.createElement('img');
      img.className = 'funnel-logo';
      img.style.cssText = 'max-height:60px; max-width:200px; margin:0 auto 20px; display:block;';
      const funnelCard = document.querySelector('.funnel-card');
      if (funnelCard) funnelCard.prepend(img);
      logoEl = document.querySelector('.funnel-logo');
    }
    if (logoEl) logoEl.src = window.funnelLogoUrl;
  }
});

// Expose global functions for inline onclick handlers
window.goBack = goBack;
window.sendFeedback = sendFeedback;
window.copyAndOpenGoogle = copyAndOpenGoogle;
window.openGoogleDirectly = openGoogleDirectly;
window.leaveReview = leaveReview;
window.startRecording = startRecording;
window.stopRecording = stopRecording;