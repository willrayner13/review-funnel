// billing.html - subscription management
let currentPlan = "starter";
let slug;
let isCancelPending = false;

async function init() {
  const sessionRes = await fetch("/session");
  const sessionData = await sessionRes.json();
  if (!sessionData.loggedIn) { window.location = "/login"; return; }
  slug = sessionData.slug;

  const [statsRes, subRes] = await Promise.all([
    fetch("/stats/" + slug),
    fetch("/subscription-status/" + slug)
  ]);
  if (!statsRes.ok) { window.location = "/login"; return; }

  const stats = await statsRes.json();
  const subData = subRes.ok ? await subRes.json() : {};

  isCancelPending = subData.cancel_pending === true;
  currentPlan = stats.plan_type || "starter";
  const isActive = stats.subscription_active;
  const trialEnd = stats.trial_ends_at ? new Date(stats.trial_ends_at) : null;
  const inTrial = isActive && trialEnd && new Date() < trialEnd;

  let planDisplay = "Starter";
  if (currentPlan === "pro") planDisplay = "Pro";
  if (currentPlan === "agency") planDisplay = "Agency";
  document.getElementById("planName").textContent = planDisplay;

  let priceHtml = '<sup>£</sup>9.99<span>/mo</span>';
  if (currentPlan === "pro") priceHtml = '<sup>£</sup>24.99<span>/mo</span>';
  if (currentPlan === "agency") priceHtml = '<sup>£</sup>79<span>/mo</span>';
  document.getElementById("planPrice").innerHTML = priceHtml;

  const badge = document.getElementById("planBadge");
  if (isCancelPending) {
    badge.textContent = "⏳ Cancelling";
    badge.className = "plan-badge-inline badge-cancelling";
  } else if (inTrial && currentPlan === "pro") {
    badge.textContent = "⭐ Pro Trial";
    badge.className = "plan-badge-inline badge-pro";
  } else if (inTrial) {
    badge.textContent = "🕐 Trial";
    badge.className = "plan-badge-inline badge-trial";
  } else if (currentPlan === "pro") {
    badge.textContent = "⭐ Pro";
    badge.className = "plan-badge-inline badge-pro";
  } else {
    badge.textContent = "Starter";
    badge.className = "plan-badge-inline badge-starter";
  }

  const statusEl = document.getElementById("planStatusText");
  if (isCancelPending) {
    const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24))) : null;
    const when = daysLeft !== null ? `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : "at the end of your billing period";
    statusEl.innerHTML = `<span style="color:#D4897C;">Your subscription is scheduled to cancel ${when}.</span> You have full access until then.`;
  } else if (inTrial && trialEnd) {
    const daysLeft = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
    statusEl.textContent = `Your free trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. You won't be charged until then.`;
  } else if (isActive) {
    statusEl.textContent = "Your subscription is active and renews automatically.";
  } else {
    statusEl.textContent = "No active subscription. Choose a plan below to continue.";
  }

  renderActionRow(isActive, isCancelPending);

  document.getElementById("plansRow").innerHTML = `
    <div class="plan-option ${currentPlan === 'starter' ? 'current-plan' : ''}">
      <div class="plan-option-name">Starter</div>
      <div class="plan-option-price"><sup>£</sup>9.99<span>/mo</span></div>
      <ul class="plan-option-features">
        <li>Smart review funnel</li>
        <li>Analytics dashboard</li>
        <li>QR code generator</li>
        <li>Private feedback capture</li>
      </ul>
      ${currentPlan === 'starter' ? '<button disabled>Current plan</button>' : '<button onclick="changePlan(\'starter\')">Switch to Starter</button>'}
    </div>
    <div class="plan-option ${currentPlan === 'pro' ? 'current-plan' : ''}">
      <div class="plan-option-name">Pro</div>
      <div class="plan-option-price"><sup>£</sup>24.99<span>/mo</span></div>
      <ul class="plan-option-features">
        <li>Everything in Starter</li>
        <li>AI reply generator</li>
        <li>SMS & email requests</li>
        <li>Advanced analytics</li>
        <li>Send Intelligence</li>
      </ul>
      ${currentPlan === 'pro' ? '<button disabled>Current plan</button>' : '<button onclick="changePlan(\'pro\')" style="background:var(--accent);color:#1A1A18;border-color:var(--accent);">⭐ Upgrade to Pro</button>'}
    </div>
    <div class="plan-option ${currentPlan === 'agency' ? 'current-plan' : ''}">
      <div class="plan-option-name">Agency</div>
      <div class="plan-option-price"><sup>£</sup>79<span>/mo</span></div>
      <ul class="plan-option-features">
        <li>Everything in Pro</li>
        <li>White-label branding</li>
        <li>Up to 10 clients</li>
        <li>Monthly PDF reports</li>
        <li>Competitor analysis</li>
        <li>30% commission</li>
      </ul>
      ${currentPlan === 'agency' ? '<button disabled>Current plan</button>' : '<button onclick="changePlan(\'agency\')" style="background:var(--accent);color:#1A1A18;border-color:var(--accent);">🚀 Upgrade to Agency</button>'}
    </div>
  `;
}

function renderActionRow(isActive, cancelPending) {
  const row = document.getElementById("actionRow");
  if (cancelPending) {
    row.innerHTML = `
      <button class="btn-reactivate" onclick="reactivateSubscription()">⭐ Reactivate my subscription</button>
      <button class="btn-outline-sm" onclick="goToPortal()">🔗 Manage payment details</button>
    `;
  } else if (isActive) {
    row.innerHTML = `
      <button class="btn-stripe" onclick="goToPortal()">🔗 Manage payment details</button>
      <button class="btn-danger-outline" onclick="openModal('cancelModal')">Cancel subscription</button>
    `;
  } else {
    row.innerHTML = `<button class="btn-stripe" onclick="goToPortal()">🔗 Manage billing</button>`;
  }
}

async function goToPortal() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = "Opening...";
  const res = await fetch("/billing-portal", { method: "POST" });
  const data = await res.json();
  if (data.url) window.location = data.url;
  else { setMsg(data.error || "Could not open billing portal.", "error"); btn.disabled = false; btn.textContent = "🔗 Manage payment details"; }
}

async function changePlan(plan) {
  const res = await fetch("/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, plan })
  });
  const data = await res.json();
  if (data.url) window.location = data.url;
  else setMsg(data.error || "Could not create checkout.", "error");
}

async function reactivateSubscription() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = "Reactivating...";
  try {
    const res = await fetch("/reactivate-subscription", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      setMsg("✓ Subscription reactivated! Your plan will continue as normal.", "success");
      setTimeout(() => window.location.reload(), 1800);
    } else {
      setMsg(data.error || "Could not reactivate. Please contact support.", "error");
      btn.disabled = false;
      btn.textContent = "⭐ Reactivate my subscription";
    }
  } catch (e) {
    setMsg("Something went wrong. Please try the billing portal.", "error");
    btn.disabled = false;
    btn.textContent = "⭐ Reactivate my subscription";
  }
}

function setMsg(text, type) {
  const msg = document.getElementById("statusMsg");
  msg.textContent = text;
  msg.style.color = type === "success" ? "#8EC9A8" : "#D4897C";
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function handleModalOverlay(e, id) {
  if (e.target === document.getElementById(id)) {
    closeModal(id);
  }
}

async function doCancel() {
  const btn = document.getElementById("confirmCancelBtn");
  btn.disabled = true;
  btn.textContent = "Cancelling...";
  try {
    const res = await fetch("/cancel-subscription", { method: "POST" });
    const data = await res.json();
    closeModal("cancelModal");
    if (data.success) {
      setMsg("✓ Cancellation scheduled. You keep full access until your billing period ends.", "success");
      setTimeout(() => window.location.reload(), 1800);
    } else {
      setMsg("Could not cancel: " + (data.error || "Please try the billing portal."), "error");
    }
  } catch (e) {
    closeModal("cancelModal");
    setMsg("Something went wrong. Please try the billing portal.", "error");
  }
  btn.disabled = false;
  btn.textContent = "Yes, cancel";
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open"));
});

init();