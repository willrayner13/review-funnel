// demo.html - review funnel demo
const params = new URLSearchParams(window.location.search);
const bizName = params.get('name') || 'Your Business';
document.getElementById('businessTitle').innerText = bizName;
document.title = bizName + ' — Review';

// Star rating
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
    });
  });
})();

function showDemoCta() {
  document.getElementById("reviewSection").innerHTML = `
    <div style="font-size:2.5rem;margin-bottom:12px;">✅</div>
    <h2>In your live funnel...</h2>
    <p style="color:var(--cream-dim);margin-top:8px;">Your customer would now be redirected to your review page — Google, Trustpilot, Checkatrade, or wherever you choose.</p>
  `;
  document.getElementById("demoCta").style.display = "block";
}

function sendFeedbackDemo() {
  document.getElementById("feedbackBox").innerHTML = `
    <div style="font-size:2.5rem;margin-bottom:12px;">🔒</div>
    <h2>Feedback captured privately</h2>
    <p style="color:var(--cream-dim);margin-top:8px;">In your live funnel, this message would appear only in your dashboard — never on Google.</p>
  `;
  document.getElementById("demoCta").style.display = "block";
}

// Voice recording demo
let demoMediaRecorder;
let demoAudioChunks = [];
let demoRecordingTimer;
let demoSeconds = 0;

async function startDemoRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    demoMediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    demoAudioChunks = [];
    demoMediaRecorder.ondataavailable = e => { if (e.data.size > 0) demoAudioChunks.push(e.data); };
    demoMediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      document.getElementById("voiceResult").innerHTML = `
        <div style="background:rgba(106,158,127,0.08);border:1px solid rgba(106,158,127,0.2);border-radius:8px;padding:14px;margin-bottom:12px;">
          <p style="color:#8EC9A8;font-size:0.85rem;margin-bottom:8px;">✅ In the live version, your voice note would be transcribed and analysed by AI — positive feedback goes to Google, negative stays private.</p>
        </div>`;
      document.getElementById("recordBtn").style.display = "none";
    };
    demoMediaRecorder.start();
    document.getElementById("recordBtn").textContent = "⏹ Stop recording";
    document.getElementById("recordBtn").onclick = stopDemoRecording;
    document.getElementById("recordingTimer").style.display = "inline";
    demoSeconds = 0;
    demoRecordingTimer = setInterval(() => {
      demoSeconds++;
      const mins = Math.floor(demoSeconds / 60);
      const secs = demoSeconds % 60;
      document.getElementById("recordingTimer").textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      if (demoSeconds >= 30) stopDemoRecording();
    }, 1000);
  } catch(e) {
    document.getElementById("voiceResult").innerHTML = '<p style="color:#D4897C;font-size:0.85rem;">Microphone access needed. Please allow it and try again.</p>';
  }
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