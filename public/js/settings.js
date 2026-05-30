// settings.html - Account settings management
let slug;

async function init() {
  const res = await fetch("/session");
  const data = await res.json();
  if (!data.loggedIn) {
    window.location = "/login";
    return;
  }
  slug = data.slug;
  loadDetails();
  loadAgencySettings();
}

init();

async function loadDetails() {
  const res = await fetch("/stats/" + slug);
  if (!res.ok) {
    if (res.status === 401) {
      window.location = "/login";
      return;
    }
    return;
  }
  const stats = await res.json();
  const bizNameInput = document.getElementById("bizNameInput");
  const reviewLinkInput = document.getElementById("reviewLinkInput");
  if (bizNameInput) bizNameInput.value = stats.business_name || "";
  if (reviewLinkInput) reviewLinkInput.value = stats.review_link || "";
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "🙈";
  } else {
    input.type = "password";
    btn.textContent = "👁";
  }
}

async function saveBizDetails() {
  const btn = document.getElementById("saveBizBtn");
  const msg = document.getElementById("bizMsg");
  btn.disabled = true;
  btn.textContent = "Saving...";

  const name = document.getElementById("bizNameInput").value.trim();
  const reviewLink = document.getElementById("reviewLinkInput").value.trim();

  if (!name) {
    showMsg("bizMsg", "Business name cannot be empty.", "error");
    btn.disabled = false;
    btn.textContent = "Save changes";
    return;
  }

  try {
    const res = await fetch("/update-business", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, review_link: reviewLink })
    });
    const data = await res.json();
    if (data.success) {
      showMsg("bizMsg", "✓ Details saved.", "success");
      const sidebarBiz = document.getElementById("sidebarBizName");
      if (sidebarBiz) sidebarBiz.innerText = name;
    } else {
      showMsg("bizMsg", data.error || "Could not save.", "error");
    }
  } catch (e) {
    showMsg("bizMsg", "Something went wrong.", "error");
  }
  btn.disabled = false;
  btn.textContent = "Save changes";
}

async function changePassword() {
  const btn = document.getElementById("savePwBtn");
  btn.disabled = true;
  btn.textContent = "Updating...";

  const current = document.getElementById("currentPw").value;
  const newPw = document.getElementById("newPw").value;
  const confirm = document.getElementById("confirmPw").value;

  if (!current || !newPw || !confirm) {
    showMsg("pwMsg", "Please fill in all fields.", "error");
    btn.disabled = false;
    btn.textContent = "Update password";
    return;
  }
  if (newPw.length < 6) {
    showMsg("pwMsg", "New password must be at least 6 characters.", "error");
    btn.disabled = false;
    btn.textContent = "Update password";
    return;
  }
  if (newPw !== confirm) {
    showMsg("pwMsg", "Passwords don't match.", "error");
    btn.disabled = false;
    btn.textContent = "Update password";
    return;
  }

  try {
    const res = await fetch("/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: current, new_password: newPw })
    });
    const data = await res.json();
    if (data.success) {
      showMsg("pwMsg", "✓ Password updated.", "success");
      document.getElementById("currentPw").value = "";
      document.getElementById("newPw").value = "";
      document.getElementById("confirmPw").value = "";
    } else {
      showMsg("pwMsg", data.error || "Could not update password.", "error");
    }
  } catch (e) {
    showMsg("pwMsg", "Something went wrong.", "error");
  }
  btn.disabled = false;
  btn.textContent = "Update password";
}

async function loadAgencySettings() {
  const res = await fetch("/stats/" + slug);
  const stats = await res.json();
  const whiteLabelCard = document.getElementById("whiteLabelCard");
  const agencyNameInput = document.getElementById("agencyNameInput");
  const agencyLogoInput = document.getElementById("agencyLogoInput");

  if (stats.plan_type === "agency" && stats.subscription_active && whiteLabelCard) {
    whiteLabelCard.style.display = "block";
    if (agencyNameInput) agencyNameInput.value = stats.agency_name || "";
    if (agencyLogoInput) agencyLogoInput.value = stats.agency_logo_url || "";
  }
}

async function saveAgencySettings() {
  const btn = document.getElementById("saveAgencyBtn");
  const msg = document.getElementById("agencyMsg");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }

  const agency_name = document.getElementById("agencyNameInput")?.value.trim() || "";
  const agency_logo_url = document.getElementById("agencyLogoInput")?.value.trim() || "";

  try {
    const res = await fetch("/update-agency-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency_name, agency_logo_url })
    });
    const data = await res.json();
    if (data.success) {
      if (msg) {
        msg.textContent = "✓ Branding saved.";
        msg.className = "msg success";
      }
    } else {
      if (msg) {
        msg.textContent = data.error || "Could not save.";
        msg.className = "msg error";
      }
    }
  } catch (e) {
    if (msg) {
      msg.textContent = "Something went wrong.";
      msg.className = "msg error";
    }
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Save branding";
  }
}

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = "msg " + type;
  setTimeout(() => {
    if (el) {
      el.textContent = "";
      el.className = "msg";
    }
  }, 5000);
}

// Expose functions globally for onclick handlers
window.togglePw = togglePw;
window.saveBizDetails = saveBizDetails;
window.changePassword = changePassword;
window.saveAgencySettings = saveAgencySettings;