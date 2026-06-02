// ===== AI LAB MODULE =====
// Handles AI reply generation, sentiment trends, send intelligence, and competitor analysis

import { showToast } from '../shared/utils.mjs';

// ========== AI REPLY GENERATOR ==========
async function streamToDiv(div, text) {
  if (!div) return;
  div.innerHTML = "";
  const chars = text.split('');
  for (let i = 0; i < chars.length; i++) {
    div.innerHTML += chars[i];
    await new Promise(r => setTimeout(r, 8 + Math.random() * 12));
  }
}

async function generateRepliesStreaming() {
  const review = document.getElementById("reviewText")?.value.trim();
  if (!review) {
    showToast("Please paste a review first.", "error");
    return;
  }
  
  const btn = document.getElementById("aiBtn");
  if (btn) {
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.textContent = "Generating...";
  }
  
  const profDisplay = document.getElementById("aiProfessionalDisplay");
  const warmDisplay = document.getElementById("aiWarmDisplay");
  const punchyDisplay = document.getElementById("aiPunchyDisplay");
  const profTextarea = document.getElementById("aiProfessional");
  const warmTextarea = document.getElementById("aiWarm");
  const punchyTextarea = document.getElementById("aiPunchy");
  
  if (profDisplay) profDisplay.innerHTML = "<span style='opacity:0.5;'>✦ Generating...</span>";
  if (warmDisplay) warmDisplay.innerHTML = "<span style='opacity:0.5;'>✦ Generating...</span>";
  if (punchyDisplay) punchyDisplay.innerHTML = "<span style='opacity:0.5;'>✦ Generating...</span>";
  
  try {
    const res = await fetch("/generate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review })
    });
    const data = await res.json();
    
    if (data.error) {
      showToast(data.error, "error");
      if (profDisplay) profDisplay.innerHTML = "";
      if (warmDisplay) warmDisplay.innerHTML = "";
      if (punchyDisplay) punchyDisplay.innerHTML = "";
    } else {
      if (profTextarea) profTextarea.value = data.professional || "";
      if (warmTextarea) warmTextarea.value = data.warm || "";
      if (punchyTextarea) punchyTextarea.value = data.punchy || "";
      if (profDisplay) await streamToDiv(profDisplay, data.professional || "");
      if (warmDisplay) await streamToDiv(warmDisplay, data.warm || "");
      if (punchyDisplay) await streamToDiv(punchyDisplay, data.punchy || "");
      showToast("Replies generated! ✓", "success");
    }
  } catch (e) {
    showToast("Something went wrong", "error");
  }
  
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.textContent = "Generate Replies";
  }
}

function copyAiReply(id) {
  const textarea = document.getElementById(id);
  if (textarea) {
    textarea.select();
    navigator.clipboard.writeText(textarea.value);
    showToast("Copied!", "success");
  }
}

// ========== SENTIMENT TRENDS ==========
async function loadSentimentTrends() {
  try {
    const res = await fetch("/sentiment/" + window.slug);
    const data = await res.json();
    
    if (!data.count || data.count < 3) {
      const sentimentContent = document.getElementById("sentimentContent");
      if (sentimentContent) {
        sentimentContent.innerHTML = `<p>${data.count || 0} feedback messages collected. Collect 3+ to unlock insights.</p>`;
      }
      return;
    }
    
    const completion = await fetch("/generate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        review: `ANALYSIS_MODE: Analyse private feedback: ${data.messages.join('\n\n')}. Return JSON: { "themes": [ { "issue": "...", "advice": "..." } ] }` 
      })
    });
    const result = await completion.json();
    
    const sentimentContent = document.getElementById("sentimentContent");
    if (sentimentContent) {
      sentimentContent.innerHTML = `<div>${result.reply || "Analysis complete"}</div>`;
    }
  } catch (e) {
    const sentimentContent = document.getElementById("sentimentContent");
    if (sentimentContent) {
      sentimentContent.innerHTML = `<p>Could not load insights.</p>`;
    }
  }
}

// ========== SEND INTELLIGENCE ==========
async function loadSendIntelligence() {
  try {
    const now = new Date();
    const res = await fetch("/predict-channel/" + window.slug, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        appointment_hour: now.getHours(), 
        appointment_day: now.getDay(), 
        service_type: null 
      })
    });
    const data = await res.json();
    const r = data.recommendation;
    
    const sendIntelMessage = document.getElementById("sendIntelMessage");
    if (sendIntelMessage) {
      sendIntelMessage.innerHTML = data.data_source === 'industry_benchmark' 
        ? `Based on industry data. Personalises after 20 sends.` 
        : `Based on ${data.sends_analysed} requests.`;
    }
    
    const sendIntelInsight = document.getElementById("sendIntelInsight");
    if (sendIntelInsight) {
      sendIntelInsight.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="font-size:2rem;font-weight:800;color:var(--accent);">${r.predicted_conversion_rate}%</div>
          <div>
            <strong>${r.recommended_channel.toUpperCase()}</strong> is best<br>
            Best window: ${r.best_window}
          </div>
        </div>
      `;
    }
  } catch (e) {
    const sendIntelMessage = document.getElementById("sendIntelMessage");
    if (sendIntelMessage) sendIntelMessage.innerHTML = "Could not load analytics.";
  }
}

// ========== COMPETITOR ANALYSIS ==========
async function analyseCompetitor() {
  const name = document.getElementById("competitorName")?.value.trim();
  const reviews = document.getElementById("competitorReviews")?.value.trim();
  
  if (!reviews || reviews.length < 50) {
    showToast("Please paste at least a few reviews.", "error");
    return;
  }
  
  const btn = event.target;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.textContent = "Analysing...";
  
  const res = await fetch("/analyse-competitor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ competitor_name: name, reviews_text: reviews })
  });
  
  const data = await res.json();
  
  if (data.error) {
    showToast(data.error, "error");
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.textContent = "Analyse Competitor";
    return;
  }
  
  let html = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">';
  html += `<div><div style="color:#8EC9A8;">✅ Strengths</div>${data.strengths.map(s => `<p>${s}</p>`).join('')}</div>`;
  html += `<div><div style="color:#D4897C;">❌ Weaknesses</div>${data.weaknesses.map(w => `<p>${w}</p>`).join('')}</div>`;
  html += `<div><div style="color:var(--accent);">💡 Opportunity</div><p>${data.opportunity}</p></div></div>`;
  
  const competitorResults = document.getElementById("competitorResults");
  if (competitorResults) competitorResults.innerHTML = html;
  
  btn.disabled = false;
  btn.classList.remove('btn-loading');
  btn.textContent = "Analyse Competitor";
}

function initAILab() {
  // Attach event listener for AI button if it exists
  const aiBtn = document.getElementById("aiBtn");
  if (aiBtn && !aiBtn.hasAttribute('data-listener')) {
    aiBtn.setAttribute('data-listener', 'true');
    aiBtn.onclick = generateRepliesStreaming;
  }
  
  const competitorBtn = document.querySelector('#competitorUnlocked button');
  if (competitorBtn && !competitorBtn.hasAttribute('data-listener')) {
    competitorBtn.setAttribute('data-listener', 'true');
    competitorBtn.onclick = analyseCompetitor;
  }
}

// Expose for global onclick
window.generateRepliesStreaming = generateRepliesStreaming;
window.copyAiReply = copyAiReply;
window.analyseCompetitor = analyseCompetitor;

export { 
  initAILab, 
  generateRepliesStreaming, 
  copyAiReply, 
  loadSentimentTrends, 
  loadSendIntelligence, 
  analyseCompetitor  // ← Make sure this is here
};