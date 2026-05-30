// admin.html - Account creation and plan selection

let currentSlug = "";
let selectedAccountType = "business";

// Check for agency signup via URL parameter
(function checkAgencySignup() {
  const urlParams = new URLSearchParams(window.location.search);
  const type = urlParams.get('type');
  
  if (type === 'agency') {
    setAccountType('agency');
  } else {
    setAccountType('business');
  }
})();

function setAccountType(type) {
  selectedAccountType = type;
  document.getElementById("accountType").value = type;
  
  const businessOption = document.querySelector('.type-option.business');
  const agencyOption = document.querySelector('.type-option.agency');
  const businessFields = document.getElementById('businessFields');
  const agencyFields = document.getElementById('agencyFields');
  
  if (type === 'business') {
    if (businessOption) {
      businessOption.style.background = 'var(--accent)';
      businessOption.style.color = '#1A1A18';
    }
    if (agencyOption) {
      agencyOption.style.background = 'transparent';
      agencyOption.style.color = 'var(--cream-dim)';
    }
    if (businessFields) businessFields.style.display = 'block';
    if (agencyFields) agencyFields.style.display = 'none';
  } else {
    if (agencyOption) {
      agencyOption.style.background = 'var(--accent)';
      agencyOption.style.color = '#1A1A18';
    }
    if (businessOption) {
      businessOption.style.background = 'transparent';
      businessOption.style.color = 'var(--cream-dim)';
    }
    if (businessFields) businessFields.style.display = 'none';
    if (agencyFields) agencyFields.style.display = 'block';
  }
}

function togglePw() {
  const input = document.getElementById("password");
  const btn = document.getElementById("pwEye");
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "🙈";
  } else {
    input.type = "password";
    btn.textContent = "👁";
  }
}

function checkPwStrength(val) {
  const hint = document.getElementById("pwHint");
  if (!val) {
    hint.textContent = "";
    hint.className = "pw-hint";
    return;
  }
  if (val.length < 4) {
    hint.textContent = "Too short — minimum 6 characters";
    hint.className = "pw-hint weak";
  } else if (val.length < 6) {
    hint.textContent = "Almost — needs 6 characters";
    hint.className = "pw-hint weak";
  } else if (val.length < 8) {
    hint.textContent = "Good";
    hint.className = "pw-hint ok";
  } else {
    hint.textContent = "Strong ✓";
    hint.className = "pw-hint strong";
  }
}

function openModal() {
  const modal = document.getElementById('helpModal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal() {
  const modal = document.getElementById('helpModal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function handleOverlayClick(e) {
  const modal = document.getElementById('helpModal');
  if (e.target === modal) closeModal();
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

async function createBusiness() {
  const btn = document.getElementById("createBtn");
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const accountType = document.getElementById("accountType").value;
  
  const review = document.getElementById("review")?.value.trim() || "";
  const industry = document.getElementById("industry")?.value || "";
  const currentSoftware = document.getElementById("currentSoftware")?.value || "";
  
  const agencyWebsite = document.getElementById("agencyWebsite")?.value.trim() || "";
  const agencySource = document.getElementById("agencySource")?.value || "";
  const agencyClientCount = document.getElementById("agencyClientCount")?.value || "";

  const result = document.getElementById("result");
  
  if (!name) {
    result.innerText = "Please enter your business/agency name.";
    result.style.color = "#D4897C";
    btn.disabled = false;
    btn.textContent = 'Continue to plan selection →';
    return;
  }
  if (!email || !email.includes("@")) {
    result.innerText = "Please enter a valid email address.";
    result.style.color = "#D4897C";
    btn.disabled = false;
    btn.textContent = 'Continue to plan selection →';
    return;
  }
  if (!password) {
    result.innerText = "Please choose a password.";
    result.style.color = "#D4897C";
    btn.disabled = false;
    btn.textContent = 'Continue to plan selection →';
    return;
  }
  if (password.length < 6) {
    result.innerText = "Password must be at least 6 characters.";
    result.style.color = "#D4897C";
    btn.disabled = false;
    btn.textContent = 'Continue to plan selection →';
    return;
  }

  const referral = getCookie('rl_ref') || sessionStorage.getItem('referral_code') || '';
  
  const payload = {
    name, email, review, password, referral,
    industry: accountType === 'business' ? industry : null,
    currentSoftware: accountType === 'business' ? currentSoftware : null,
    account_type: accountType,
    agency_website: accountType === 'agency' ? agencyWebsite : null,
    agency_source: accountType === 'agency' ? agencySource : null,
    agency_client_count: accountType === 'agency' ? agencyClientCount : null
  };
  
  const res = await fetch("/create-business", { 
    method: "POST", 
    headers: { "Content-Type": "application/json" }, 
    body: JSON.stringify(payload) 
  });
  const data = await res.json();

  if (data.success) {
    currentSlug = data.slug;
    sessionStorage.setItem("currentSlug", currentSlug);
    document.getElementById("signupCard").style.display = "none";
    document.getElementById("planScreen").style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    const msg = data.error || "";
    if (msg.includes("already")) {
      result.innerText = "That email is already registered. Try signing in.";
    } else if (msg.includes("Password") || msg.includes("password")) {
      result.innerText = msg;
    } else if (msg.includes("Email") || msg.includes("email")) {
      result.innerText = "Please enter a valid email address.";
    } else {
      result.innerText = "Something went wrong. Please check your details and try again.";
    }
    result.style.color = "#D4897C";
    btn.disabled = false;
    btn.textContent = 'Continue to plan selection →';
  }
}

function toggleAgencyMode(e) {
  e.preventDefault();
  const accountTypeInput = document.getElementById('accountType');
  const isAgency = accountTypeInput && accountTypeInput.value === 'agency';
  
  if (isAgency) {
    setAccountType('business');
    document.getElementById('agencyToggleLink').textContent = 'Signing up as an agency? Click here';
    document.querySelector('#signupCard h2').textContent = 'Create your account';
  } else {
    setAccountType('agency');
    document.getElementById('agencyToggleLink').textContent = 'Signing up as a business? Click here';
    document.querySelector('#signupCard h2').textContent = 'Create your agency account';
  }
}

async function subscribe(plan) {
  document.querySelectorAll('.plan button').forEach(b => {
    b.disabled = true;
    b.textContent = 'Taking you to Stripe...';
  });
  
  try {
    const res = await fetch("/create-checkout", { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ slug: currentSlug, plan }) 
    });
    const data = await res.json();
    if (data.url) {
      window.location = data.url;
    } else {
      document.querySelectorAll('.plan button').forEach(b => {
        b.disabled = false;
        b.textContent = 'Start free trial';
      });
    }
  } catch(e) {
    document.querySelectorAll('.plan button').forEach(b => {
      b.disabled = false;
      b.textContent = 'Start free trial';
    });
  }
}

// Initialize on page load
window.addEventListener("DOMContentLoaded", () => {
  const skipToPlans = sessionStorage.getItem("skipToPlans");
  const savedSlug = sessionStorage.getItem("currentSlug");
  if (skipToPlans === "true" && savedSlug) {
    currentSlug = savedSlug;
    sessionStorage.removeItem("skipToPlans");
    document.getElementById("signupCard").style.display = "none";
    document.getElementById("planScreen").style.display = "block";
  }
});

window.addEventListener('pageshow', e => { 
  if (e.persisted) { 
    document.querySelectorAll('.plan button').forEach(b => {
      b.disabled = false;
      b.textContent = 'Start free trial';
    }); 
  } 
});

// Expose functions globally
window.setAccountType = setAccountType;
window.togglePw = togglePw;
window.checkPwStrength = checkPwStrength;
window.openModal = openModal;
window.closeModal = closeModal;
window.handleOverlayClick = handleOverlayClick;
window.createBusiness = createBusiness;
window.toggleAgencyMode = toggleAgencyMode;
window.subscribe = subscribe;