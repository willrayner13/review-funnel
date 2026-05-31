// demo.js - review funnel demo with modal CTA and content scaling

// Modal functions
function showDemoModal() {
  const modal = document.getElementById('demoCtaModal');
  if (modal) {
    modal.classList.add('open');
  }
}

function closeDemoModal() {
  const modal = document.getElementById('demoCtaModal');
  if (modal) {
    modal.classList.remove('open');
  }
}

// Global scale function that can be called from funnel.js
window.scaleDemoContent = function() {
  const card = document.querySelector('#funnelContainer .funnel-card');
  const wrapper = document.querySelector('.funnel-wrapper');
  
  if (!card || !wrapper) return;
  
  card.style.transform = 'none';
  card.style.marginTop = '0';
  
  requestAnimationFrame(() => {
    const availableHeight = wrapper.clientHeight;
    const availableWidth = wrapper.clientWidth;
    const contentHeight = card.scrollHeight;
    const contentWidth = card.scrollWidth;
    
    const scaleHeight = availableHeight / contentHeight;
    const scaleWidth = availableWidth / contentWidth;
    const scale = Math.min(1, scaleHeight, scaleWidth);
    
    card.style.transformOrigin = 'top center';
    card.style.transform = `scale(${scale})`;
    
    const scaledHeight = contentHeight * scale;
    if (scaledHeight < availableHeight) {
      const topOffset = (availableHeight - scaledHeight) / 2;
      card.style.marginTop = `${topOffset}px`;
    } else {
      card.style.marginTop = '0';
    }
  });
};

// Updated button functions - show modal instead of direct action
function copyAndOpenGoogle() {
  showDemoModal();
}

function startRecording() {
  showDemoModal();
}

function sendFeedback() {
  showDemoModal();
}

function leaveReview() {
  showDemoModal();
}

// Star rating initialization
(function initStars() {
  const stars = document.querySelectorAll('#starRating span');
  if (!stars.length) return;
  
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

    star.addEventListener('click', () => {
      const rating = parseInt(star.dataset.star);
      stars.forEach(s => {
        const sVal = parseInt(s.dataset.star);
        s.style.filter = sVal <= rating ? 'grayscale(0) brightness(1.1)' : 'grayscale(1) brightness(0.5)';
        s.style.transform = sVal <= rating ? 'scale(1.15)' : 'scale(1)';
        s.style.pointerEvents = 'none';
      });

      document.getElementById("mainQuestion").style.display = "none";
      
      if (rating >= 4) {
        document.getElementById("reviewSection").style.display = "block";
      } else {
        document.getElementById("feedbackBox").style.display = "block";
      }
      
      // Improved content scaling after UI changes
      if (typeof scaleContentToFit === 'function') {
        setTimeout(scaleContentToFit, 50); 
      } else if (window.scaleDemoContent) {
        // Fallback to old name if scaleContentToFit isn't defined yet
        setTimeout(window.scaleDemoContent, 50);
      }
    });
  });
})();

function showDemoCta() {
  showDemoModal();
}

function sendFeedbackDemo() {
  showDemoModal();
}

// Voice recording demo (simulated)
let demoMediaRecorder;
let demoAudioChunks = [];
let demoRecordingTimer;
let demoSeconds = 0;

async function startDemoRecording() {
  showDemoModal();
  return;
}

function stopDemoRecording() {
  if (demoMediaRecorder && demoMediaRecorder.state === "recording") {
    demoMediaRecorder.stop();
    clearInterval(demoRecordingTimer);
    document.getElementById("recordBtn").textContent = "Processing...";
    document.getElementById("recordBtn").disabled = true;
    document.getElementById("recordingTimer").style.display = "none";
  }
}

// Expose functions globally for onclick handlers
window.copyAndOpenGoogle = copyAndOpenGoogle;
window.startRecording = startRecording;
window.sendFeedback = sendFeedback;
window.leaveReview = leaveReview;
window.showDemoModal = showDemoModal;
window.closeDemoModal = closeDemoModal;
window.showDemoCta = showDemoCta;
window.sendFeedbackDemo = sendFeedbackDemo;