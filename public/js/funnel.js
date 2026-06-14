// funnel.js - Enhanced ReviewLift review funnel
// Preserves all existing functionality while adding premium animations

const slug = window.slug;
const isLapsed = window.accountLapsed === true;
const REDIRECT_DELAY = 8;
let _stepHistory = [];
let mediaRecorder, audioChunks, recordingTimer, seconds = 0;
let audioContext, analyser, source, animationId;
let currentTypingInterval = null;

// ========== FUNNEL CUSTOMISATION ==========
function applyFunnelCustomisation() {
  const template = window.funnelTemplate || 'classic';
  const accentColor = window.funnelAccentColor || '#C8A96E';
  document.body.classList.add(`template-${template}`);
  document.documentElement.style.setProperty('--accent', accentColor);
  
  const headlineEl = document.getElementById('mainHeadline');
  if (headlineEl) {
    if (window.funnelHeadline && window.funnelHeadline.trim() !== '') {
      headlineEl.textContent = window.funnelHeadline;
    } else if (window.businessName) {
      headlineEl.textContent = `How was your experience at ${window.businessName}?`;
    }
  }
  
  const businessTitleEl = document.getElementById('businessTitle');
  if (businessTitleEl && window.businessName) {
    businessTitleEl.textContent = window.businessName;
  }
  
  if (window.funnelLogoUrl && window.funnelLogoUrl.length > 0) {
    const logo = document.getElementById('funnelLogo');
    if (logo) {
      logo.src = window.funnelLogoUrl;
      logo.style.display = 'block';
    }
  }
}

// ========== SVG STAR GENERATION ==========
function createStarSvg(rating = 0, filled = false) {
  const fillColor = filled ? 'var(--accent)' : 'none';
  const strokeColor = 'var(--accent)';
  return `<svg viewBox="0 0 24 24" data-star="${rating}" style="cursor:pointer;">
    <defs>
      <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:var(--accent);stop-opacity:1" />
        <stop offset="100%" style="stop-color:#E8C98A;stop-opacity:1" />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <path class="star-fill" d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" 
      fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}

function renderStars(container, selectedRating = 0) {
  container.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const svgHtml = createStarSvg(i, selectedRating >= i);
    container.insertAdjacentHTML('beforeend', svgHtml);
  }
  // Reattach event listeners
  attachStarEvents();
}

function attachStarEvents() {
  const stars = document.querySelectorAll('#starRating svg');
  stars.forEach(star => {
    star.removeEventListener('mouseover', starMouseOver);
    star.removeEventListener('mouseout', starMouseOut);
    star.removeEventListener('click', starClick);
    star.addEventListener('mouseover', starMouseOver);
    star.addEventListener('mouseout', starMouseOut);
    star.addEventListener('click', starClick);
  });
}

function starMouseOver(e) {
  const star = e.currentTarget;
  const rating = parseInt(star.dataset.star);
  const allStars = document.querySelectorAll('#starRating svg');
  allStars.forEach((s, idx) => {
    const path = s.querySelector('.star-fill');
    if (idx < rating) {
      path.setAttribute('fill', 'var(--accent)');
      s.style.transform = 'scale(1.15)';
    } else {
      path.setAttribute('fill', 'none');
      s.style.transform = 'scale(1)';
    }
  });
}

function starMouseOut(e) {
  const selectedRating = parseInt(document.getElementById('starRating').dataset.selected || '0');
  const allStars = document.querySelectorAll('#starRating svg');
  allStars.forEach((s, idx) => {
    const path = s.querySelector('.star-fill');
    if (idx < selectedRating) {
      path.setAttribute('fill', 'var(--accent)');
    } else {
      path.setAttribute('fill', 'none');
    }
    s.style.transform = 'scale(1)';
  });
}

async function starClick(e) {
  const star = e.currentTarget;
  const rating = parseInt(star.dataset.star);
  const starContainer = document.getElementById('starRating');
  starContainer.dataset.selected = rating;
  
  // Particle burst effect
  createParticleBurst(star.getBoundingClientRect());
  
  // Pulse animation on click
  star.style.transform = 'scale(1.3)';
  setTimeout(() => { star.style.transform = 'scale(1.1)'; }, 150);
  
  // Update stars visual
  const allStars = document.querySelectorAll('#starRating svg');
  allStars.forEach((s, idx) => {
    const path = s.querySelector('.star-fill');
    if (idx < rating) {
      path.setAttribute('fill', 'url(#starGrad)');
      s.style.filter = 'url(#glow)';
    } else {
      path.setAttribute('fill', 'none');
      s.style.filter = 'none';
    }
  });
  
  // Slide transition
  const mainQuestion = document.getElementById('mainQuestion');
  mainQuestion.style.transition = 'opacity 0.4s var(--ease-smooth), transform 0.4s var(--ease-smooth)';
  mainQuestion.style.opacity = '0';
  mainQuestion.style.transform = 'translateY(-20px)';
  
  setTimeout(() => {
    mainQuestion.style.display = 'none';
    
    if (rating >= 4) {
      if (isLapsed) { 
        showReviewSectionLapsed(); 
        startCountdown();
      } else { 
        showReviewSection(); 
        loadSuggestion(rating);
      }
    } else {
      showFeedbackSection();
    }
    
    // Slide in new content
    const newSection = document.getElementById(rating >= 4 ? 'reviewSection' : 'feedbackBox');
    newSection.style.display = 'block';
    newSection.style.opacity = '0';
    newSection.style.transform = 'translateY(20px)';
    setTimeout(() => {
      newSection.style.transition = 'opacity 0.4s var(--ease-smooth), transform 0.4s var(--ease-smooth)';
      newSection.style.opacity = '1';
      newSection.style.transform = 'translateY(0)';
    }, 50);
  }, 400);
  
  // Keep mini stars visible
  createMiniStars(rating);
  
  // API calls
 fetch(`/api/rating/${window.slug}`, { method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ slug: window.slug, rating })
  }).catch(e => console.log('Rating fetch failed:', e));
  
  if (rating >= 4) {
    fetch(`/api/positive/${window.slug}`, { method: 'POST' })
.catch(e => console.log('Positive fetch failed:', e));
  }
}

function createMiniStars(rating) {
  let miniContainer = document.querySelector('.star-rating-mini');
  if (!miniContainer) {
    miniContainer = document.createElement('div');
    miniContainer.className = 'star-rating-mini';
    const mainQuestion = document.getElementById('mainQuestion');
    mainQuestion.parentNode.insertBefore(miniContainer, mainQuestion);
  }
  miniContainer.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const svg = createStarSvg(i, i <= rating);
    miniContainer.insertAdjacentHTML('beforeend', svg);
  }
}

function createParticleBurst(rect) {
  const canvas = document.createElement('canvas');
  canvas.className = 'particle-canvas';
  document.body.appendChild(canvas);
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  
  const particles = [];
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 3;
    particles.push({
      x: centerX, y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 3 + Math.random() * 3,
      alpha: 1,
      color: `hsl(${45 + Math.random() * 20}, 80%, 60%)`
    });
  }
  
  let animationId;
  function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let allDead = true;
    for (let p of particles) {
      if (p.alpha <= 0) continue;
      allDead = false;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.alpha -= 0.02;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    if (allDead) {
      cancelAnimationFrame(animationId);
      canvas.remove();
    } else {
      animationId = requestAnimationFrame(animateParticles);
    }
  }
  animateParticles();
}

function showReviewSection() {
  const reviewSection = document.getElementById('reviewSection');
  reviewSection.style.display = 'block';
  document.getElementById('feedbackBox').style.display = 'none';
  document.body.classList.remove('unhappy-path');
}

function showReviewSectionLapsed() {
  const lapsedSection = document.getElementById('reviewSectionLapsed');
  lapsedSection.style.display = 'block';
}

function showFeedbackSection() {
  const feedbackBox = document.getElementById('feedbackBox');
  feedbackBox.style.display = 'block';
  document.getElementById('reviewSection').style.display = 'none';
  document.body.classList.add('unhappy-path');
}

function startCountdown() {
  const circumference = 175.9;
  const ring = document.getElementById('countdownRing');
  const numEl = document.getElementById('countdownNum');
  const secEl = document.getElementById('countdownSec');
  let remaining = REDIRECT_DELAY;
  const interval = setInterval(() => {
    remaining--;
    numEl.textContent = remaining;
    secEl.textContent = remaining;
    const progress = (REDIRECT_DELAY - remaining) / REDIRECT_DELAY;
    ring.style.strokeDashoffset = String(circumference * progress);
    if (remaining <= 0) {
      clearInterval(interval);
      fetch('/review-click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
      window.location.href = window.reviewLink;
    }
  }, 1000);
}

function showSkeletonLoader(show) {
  const suggestionLoading = document.getElementById('suggestionLoading');
  const copyGoSection = document.getElementById('copyGoSection');
  if (show) {
    suggestionLoading.style.display = 'block';
    copyGoSection.style.display = 'none';
    const loadingHtml = `
      <div class="skeleton-loader">
        <div class="skeleton-line full"></div>
        <div class="skeleton-line full"></div>
        <div class="skeleton-line sixty"></div>
      </div>
    `;
    suggestionLoading.innerHTML = loadingHtml;
  } else {
    suggestionLoading.style.display = 'none';
    copyGoSection.style.display = 'block';
  }
}

function typeTextToTextarea(element, text, callback) {
  if (currentTypingInterval) clearInterval(currentTypingInterval);
  element.value = '';
  element.classList.add('typing');
  let index = 0;
  currentTypingInterval = setInterval(() => {
    if (index < text.length) {
      element.value += text[index];
      element.scrollTop = element.scrollHeight;
      index++;
    } else {
      clearInterval(currentTypingInterval);
      currentTypingInterval = null;
      element.classList.remove('typing');
      if (callback) callback();
    }
  }, 35);
}

async function loadSuggestion(rating) {
  showSkeletonLoader(true);
  const textarea = document.getElementById('suggestionText');
  
  try {
    const res = await fetch('/suggest-review/' + window.slug, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rating,
        service: window.service || null,
        business_name: window.businessName || '',
        industry: window.industry || null
      })
    });
    const data = await res.json();
    showSkeletonLoader(false);
    if (data.suggestion) {
      typeTextToTextarea(textarea, data.suggestion);
    } else {
      textarea.value = 'Thanks for your feedback! Your support means the world to us.';
    }
  } catch (e) {
    showSkeletonLoader(false);
    textarea.value = 'Thanks for your feedback! Your support means the world to us.';
  }
}

async function copyAndOpenGoogle() {
  const textarea = document.getElementById('suggestionText');
  const text = textarea.value;
  await navigator.clipboard.writeText(text);
  const btn = document.getElementById('copyGoBtn');
  const originalText = btn.textContent;
  btn.classList.add('success');
  btn.innerHTML = '✓ Copied! Opening Google...';
  showToast('Review copied to clipboard');
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
  fetch('/review-click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
  window.location.href = window.reviewLink;
}

function showToast(message) {
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) existingToast.remove();
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `<span class="dot"></span><span>${message}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

async function sendFeedback() {
  const message = document.getElementById('message').value.trim();
  if (!message) return;
  const btn = document.querySelector('#feedbackBox .btn-send');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  await fetch('/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business: slug, message })
  });
  document.getElementById('feedbackBox').innerHTML = `
    <div style="font-size:2.4rem;margin-bottom:12px;">✅</div>
    <h2>Feedback received</h2>
    <p>Thank you — we appreciate you taking the time.</p>
  `;
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (audioContext) await audioContext.close();
      if (animationId) cancelAnimationFrame(animationId);
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await transcribeAudio(audioBlob);
    };
    mediaRecorder.start();
    
    const voiceBtn = document.getElementById('voiceRecordBtn');
    voiceBtn.classList.add('recording');
    voiceBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="12" height="12" rx="2"/><line x1="12" y1="16" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg>`;
    document.getElementById('recordingTimer').style.display = 'inline';
    seconds = 0;
    updateTimerDisplay();
    recordingTimer = setInterval(() => {
      seconds++;
      updateTimerDisplay();
      if (seconds >= 30) stopRecording();
    }, 1000);
    
    setupWaveform(stream);
  } catch (e) {
    document.getElementById('voiceResult').innerHTML = '<p style="color:#D4897C;font-size:0.85rem;">Microphone access needed.</p>';
  }
}

function updateTimerDisplay() {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  document.getElementById('recordingTimer').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function setupWaveform(stream) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
  analyser.fftSize = 64;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  function drawWaveform() {
    if (!analyser || !animationId) return;
    analyser.getByteFrequencyData(dataArray);
    const waveformContainer = document.getElementById('waveformContainer');
    if (!waveformContainer) return;
    const bars = waveformContainer.querySelectorAll('.waveform-bar');
    for (let i = 0; i < bars.length; i++) {
      const value = dataArray[i] || 0;
      const height = Math.max(4, (value / 255) * 36);
      bars[i].style.height = `${height}px`;
    }
    animationId = requestAnimationFrame(drawWaveform);
  }
  drawWaveform();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    clearInterval(recordingTimer);
    const voiceBtn = document.getElementById('voiceRecordBtn');
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;
    voiceBtn.disabled = true;
    voiceBtn.textContent = 'Processing...';
    document.getElementById('recordingTimer').style.display = 'none';
    
    showSkeletonLoader(true);
    const voiceResult = document.getElementById('voiceResult');
    voiceResult.innerHTML = '<div class="skeleton-loader"><div class="skeleton-line full"></div><div class="skeleton-line full"></div></div>';
  }
}

async function transcribeAudio(blob) {
  const formData = new FormData();
  formData.append('audio', blob, 'recording.webm');
  try {
    const res = await fetch('/transcribe-voice/' + window.slug, { method: 'POST', body: formData });
    const data = await res.json();
    showSkeletonLoader(false);
    const voiceResult = document.getElementById('voiceResult');
    if (data.sentiment === 'positive') {
      voiceResult.innerHTML = `
        <div style="margin-top:16px; padding:14px; background:var(--surface-2); border-radius:16px;">
          <p style="margin-bottom:12px;">We heard: "${data.transcription}"</p>
          <button onclick="leaveReview()" class="btn-copy" style="margin:0;">Post as Google review →</button>
        </div>`;
    } else {
      voiceResult.innerHTML = `<p style="margin-top:16px; color:var(--success);">Thank you — your feedback has been saved privately.</p>`;
    }
  } catch (e) {
    showSkeletonLoader(false);
    document.getElementById('voiceResult').innerHTML = '<p style="color:#D4897C;">Could not process audio. Please try again.</p>';
  }
  document.getElementById('voiceRecordBtn').disabled = false;
  document.getElementById('voiceRecordBtn').textContent = 'Start recording';
}

function goBack() {
  if (_stepHistory.length > 0) show(_stepHistory.pop(), false);
}

const titleEl = document.getElementById('businessTitle');
if (titleEl && window.businessName) titleEl.textContent = window.businessName;

applyFunnelCustomisation();

// Initialize stars
const starContainer = document.getElementById('starRating');
renderStars(starContainer, 0);

// Add waveform container
const voiceSection = document.getElementById('voiceSection');
if (voiceSection) {
  const waveformContainer = document.createElement('div');
  waveformContainer.id = 'waveformContainer';
  waveformContainer.className = 'waveform';
  for (let i = 0; i < 25; i++) {
    const bar = document.createElement('div');
    bar.className = 'waveform-bar';
    bar.style.height = '4px';
    waveformContainer.appendChild(bar);
  }
  voiceSection.insertBefore(waveformContainer, voiceSection.querySelector('.voice-button-container'));
}

window.goBack = goBack;
window.sendFeedback = sendFeedback;
window.copyAndOpenGoogle = copyAndOpenGoogle;
window.openGoogleDirectly = openGoogleDirectly;
window.leaveReview = leaveReview;
window.startRecording = startRecording;
window.stopRecording = stopRecording;