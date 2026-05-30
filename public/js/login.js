// login.html - Sign in and password reset functionality

function togglePw(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "🙈";
  } else {
    input.type = "password";
    btn.textContent = "👁";
  }
}

function showForgotPassword(e) {
  e.preventDefault();
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('forgotForm').style.display = 'block';
}

function showLogin(e) {
  if (e) e.preventDefault();
  document.getElementById('forgotForm').style.display = 'none';
  document.getElementById('loginForm').style.display = 'block';
  const resetMsg = document.getElementById('resetMsg');
  if (resetMsg) resetMsg.textContent = '';
}

async function sendReset() {
  const email = document.getElementById('resetEmail').value.trim();
  if (!email) return;
  
  const btn = document.getElementById('resetBtn');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  
  await fetch('/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  
  const resetMsg = document.getElementById('resetMsg');
  if (resetMsg) {
    resetMsg.textContent = 'If that email is registered, instructions are on their way.';
  }
  btn.textContent = 'Sent';
}

async function login() {
  const btn = document.querySelector('.btn-full');
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const resultEl = document.getElementById("result");
  
  if (!email || !password) {
    if (resultEl) resultEl.innerText = "Please enter both email and password.";
    btn.disabled = false;
    btn.textContent = 'Sign In →';
    return;
  }
  
  try {
    const res = await fetch("/verify-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    
    if (data.success) {
      if (!data.subscription_active) {
        sessionStorage.setItem("currentSlug", data.slug);
        sessionStorage.setItem("skipToPlans", "true");
        window.location = "/admin";
      } else {
        window.location = "/for-business";
      }
    } else {
      if (resultEl) resultEl.innerText = "Incorrect email or password.";
      btn.disabled = false;
      btn.textContent = 'Sign In →';
    }
  } catch(e) {
    if (resultEl) resultEl.innerText = "Something went wrong. Please try again.";
    btn.disabled = false;
    btn.textContent = 'Sign In →';
  }
}

// Enter key support
document.addEventListener("keydown", e => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm && loginForm.style.display !== 'none' && e.key === "Enter") {
    login();
  }
});

// Expose functions globally
window.togglePw = togglePw;
window.showForgotPassword = showForgotPassword;
window.showLogin = showLogin;
window.sendReset = sendReset;
window.login = login;