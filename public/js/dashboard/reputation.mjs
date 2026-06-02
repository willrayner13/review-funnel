// ===== REPUTATION MODULE =====
// Handles reputation score display and breakdown bars

async function loadReputationScore() {
  try {
    const res = await fetch("/reputation/" + window.slug);
    const data = await res.json();
    const score = data.score;
    const lastMonth = data.last_month_score;
    const b = data.breakdown;

    const heroScoreEl = document.getElementById("heroScore");
    if (heroScoreEl) heroScoreEl.innerHTML = `${score}/100`;

    const trendEl = document.getElementById("heroTrend");
    if (trendEl && lastMonth !== null) {
      const diff = score - lastMonth;
      if (diff > 0) trendEl.innerHTML = `<span class="up">↑ ${diff} points from last month</span>`;
      else if (diff < 0) trendEl.innerHTML = `<span class="down">↓ ${Math.abs(diff)} points from last month</span>`;
      else trendEl.innerHTML = `<span>No change from last month</span>`;
    }

    const barsContainer = document.querySelector('.rep-bars');
    if (barsContainer && b) {
      const bars = [
        { label: "Average Rating", value: b.rating || 0, max: 40, color: "#8EC9A8" },
        { label: "Review Velocity", value: b.velocity || 0, max: 20, color: "#C8A96E" },
        { label: "Feedback Ratio", value: b.feedback || 0, max: 25, color: "#D4897C" },
        { label: "Send Activity", value: b.activity || 0, max: 15, color: "#C8A96E" }
      ];

      const barsHtml = bars.map(bar => {
        const pct = (bar.value / bar.max) * 100;
        return `
          <div class="rep-bar-item">
            <div class="rep-bar-label">${bar.label}</div>
            <div class="rep-bar-track">
              <div class="rep-bar-fill" style="width:${pct}%;background:${bar.color};"></div>
            </div>
            <div style="font-size:0.7rem;min-width:35px;">${bar.value}/${bar.max}</div>
          </div>
        `;
      }).join('');
      barsContainer.innerHTML = barsHtml;
    }
  } catch (e) {
    console.log("Reputation score error:", e);
  }
}

export { loadReputationScore };