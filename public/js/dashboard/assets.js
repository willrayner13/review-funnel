// ===== ASSETS MODULE =====
// Handles QR codes, NFC cards, webhooks, and embed codes

import { showToast } from '../shared/utils.js';
import { openModal } from '../shared/modal.js';

function copyReviewLink() {
  let input = document.getElementById("assetReviewLink");
  if (!input) input = document.getElementById("reviewLink");
  
  if (input && input.value) {
    navigator.clipboard.writeText(input.value);
    showToast("Copied!", "success");
  } else {
    const funnelUrl = window.location.origin + "/r/" + window.slug;
    navigator.clipboard.writeText(funnelUrl);
    showToast("Copied!", "success");
  }
}

function copyEmbedCode() {
  const reviewLink = window.location.origin + "/r/" + window.slug;
  const embedHtml = `<a href="${reviewLink}" target="_blank" style="display:inline-block;background:#C8A96E;color:#1A1A18;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Leave us a review →</a>`;
  navigator.clipboard.writeText(embedHtml);
  showToast("Embed code copied!", "success");
}

function copyWallUrl() {
  const input = document.getElementById("wallUrl");
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast("Copied!", "success");
  }
}

function copyWebhook() {
  const input = document.getElementById("webhookUrl");
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast("Copied!", "success");
  }
}

function copyInvoiceWebhook() {
  const input = document.getElementById("invoiceWebhookUrl");
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast("Copied!", "success");
  }
}

function copyFunnelLink() {
  const funnelUrl = window.location.origin + "/r/" + window.slug;
  navigator.clipboard.writeText(funnelUrl);
  showToast("Funnel link copied!", "success");
}

async function orderNfcCard() {
  const fullName = document.getElementById("nfcFullName")?.value.trim();
  const address = document.getElementById("nfcAddress")?.value.trim();
  
  if (!fullName || !address) {
    showToast("Please enter your name and address", "error");
    return;
  }
  
  const btn = document.getElementById("nfcOrderBtn");
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.textContent = "Processing...";
  
  const res = await fetch("/create-nfc-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shipping_address: `${fullName}\n${address}` })
  });
  
  const data = await res.json();
  
  if (data.url) {
    window.location = data.url;
  } else {
    showToast(data.error || "Could not create order", "error");
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.textContent = "Continue to payment (£9.99) →";
  }
}

function initAssets() {
  // Attach event listeners for copy buttons
  const copyReviewLinkBtn = document.getElementById("copyReviewLinkBtn");
  if (copyReviewLinkBtn) copyReviewLinkBtn.onclick = copyReviewLink;
  
  const copyEmbedBtn = document.getElementById("copyEmbedBtn");
  if (copyEmbedBtn) copyEmbedBtn.onclick = copyEmbedCode;
  
  const copyWallBtn = document.querySelector('#wallUrl + button');
  if (copyWallBtn) copyWallBtn.onclick = copyWallUrl;
  
  const copyWebhookBtn = document.querySelector('#webhookUrl + button');
  if (copyWebhookBtn) copyWebhookBtn.onclick = copyWebhook;
  
  const copyInvoiceBtn = document.querySelector('#invoiceWebhookUrl + button');
  if (copyInvoiceBtn) copyInvoiceBtn.onclick = copyInvoiceWebhook;
  
  const orderNfcBtn = document.getElementById("nfcOrderBtn");
  if (orderNfcBtn && !orderNfcBtn.hasAttribute('data-listener')) {
    orderNfcBtn.setAttribute('data-listener', 'true');
    orderNfcBtn.onclick = orderNfcCard;
  }
  
  const openNfcModalBtn = document.getElementById("openNfcModalBtn");
  if (openNfcModalBtn) openNfcModalBtn.onclick = () => openModal("nfcModal");
  
  // Set NFC card order status from stats
  fetch("/stats/" + window.slug)
    .then(r => r.json())
    .then(stats => {
      const nfcCardOrdered = document.getElementById("nfcCardOrderedAssets");
      const nfcCardUpsell = document.getElementById("nfcCardUpsellAssets");
      if (stats.nfc_card_ordered && nfcCardOrdered) {
        if (nfcCardOrdered) nfcCardOrdered.style.display = "block";
        if (nfcCardUpsell) nfcCardUpsell.style.display = "none";
      }
    })
    .catch(() => {});
}

// Expose for global onclick
window.copyReviewLink = copyReviewLink;
window.copyEmbedCode = copyEmbedCode;
window.copyWallUrl = copyWallUrl;
window.copyWebhook = copyWebhook;
window.copyInvoiceWebhook = copyInvoiceWebhook;
window.copyFunnelLink = copyFunnelLink;
window.orderNfcCard = orderNfcCard;

export { initAssets, copyReviewLink, copyEmbedCode, copyWallUrl, copyWebhook, copyInvoiceWebhook, orderNfcCard };