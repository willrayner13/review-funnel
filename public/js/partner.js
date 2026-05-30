// partner.html - Affiliate portal functionality

(function() {
  var params = new URLSearchParams(window.location.search);
  var code = params.get('code');

  if (!code) {
    // Show code entry form
    document.getElementById('mainContent').innerHTML =
      '<span class="page-eyebrow">Affiliate Portal</span>' +
      '<h1 class="page-title">Enter your code</h1>' +
      '<p class="page-sub">Enter the affiliate code you were given to see your dashboard.</p>' +
      '<div style="display:flex;gap:10px;max-width:400px;">' +
      '<input id="codeInput" type="text" placeholder="e.g. toddnorwich" style="flex:1;margin-bottom:0;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;color:var(--cream);font-family:\'DM Sans\',sans-serif;font-size:0.95rem;outline:none;">' +
      '<button class="copy-btn" onclick="window.location=\'?code=\'+encodeURIComponent(document.getElementById(\'codeInput\').value.trim())" style="padding:14px 20px;font-size:0.95rem;">View Dashboard →</button>' +
      '</div>';
    return;
  }

  loadDashboard(code);
})();

function getNextPayoutDate() {
  var now = new Date();
  var next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function copyRefLink() {
  var link = document.getElementById('refLink').textContent;
  navigator.clipboard.writeText(link);
  var btn = event.target;
  btn.textContent = '✓ Copied!';
  setTimeout(function() { btn.textContent = '📋 Copy'; }, 2000);
}

function showBankForm() {
  document.getElementById('bankForm').style.display = 'block';
  document.getElementById('bankDetailsBtn').style.display = 'none';
}

async function submitBankDetails() {
  var btn = document.getElementById('bankSubmitBtn');
  var msg = document.getElementById('bankFormMsg');
  var name = document.getElementById('bankName').value.trim();
  var sortCode = document.getElementById('bankSortCode').value.trim();
  var accountNumber = document.getElementById('bankAccountNumber').value.trim();
  var code = new URLSearchParams(window.location.search).get('code') || 'unknown';

  if (!name || !sortCode || !accountNumber) {
    msg.textContent = 'Please fill in all fields.';
    msg.style.color = '#D4897C';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    var res = await fetch('/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        email: 'affiliate@reviewlift.app',
        message: 'AFFILIATE BANK DETAILS\nAffiliate code: ' + code + '\nName: ' + name + '\nSort code: ' + sortCode + '\nAccount number: ' + accountNumber
      })
    });
    var data = await res.json();
    if (data.success) {
      msg.textContent = '✓ Details sent!';
      msg.style.color = '#8EC9A8';
      document.getElementById('bankForm').innerHTML = '<p style="color:#8EC9A8;font-size:0.85rem;">✓ Bank details submitted. We\'ll be in touch.</p>';
    } else {
      msg.textContent = 'Error. Email billy@reviewlift.app';
      msg.style.color = '#D4897C';
      btn.disabled = false;
      btn.textContent = 'Send details →';
    }
  } catch(e) {
    msg.textContent = 'Error. Email billy@reviewlift.app';
    msg.style.color = '#D4897C';
    btn.disabled = false;
    btn.textContent = 'Send details →';
  }
}

async function loadDashboard(code) {
  var res = await fetch('/affiliate-stats/' + code);

  if (!res.ok) {
    document.getElementById('mainContent').innerHTML =
      '<span class="page-eyebrow">Affiliate Portal</span>' +
      '<h1 class="page-title">Not found</h1>' +
      '<p class="page-sub">That code doesn\'t exist yet. It activates when your first referral signs up.</p>' +
      '<p style="font-size:0.85rem;color:var(--cream-dim);">Your link: <code style="color:var(--accent);">' + window.location.origin + '?ref=' + code + '</code></p>';
    return;
  }

  var data = await res.json();
  var payoutDate = getNextPayoutDate();

  var html =
    '<span class="page-eyebrow">Affiliate Portal</span>' +
    '<h1 class="page-title">' + (data.partner_name || code) + '</h1>' +
    '<p class="page-sub">Track your referrals, conversions, and earnings.</p>' +

    '<div class="metrics-grid">' +
    '<div class="metric-card"><div class="metric-value">' + (data.total_signups || 0) + '</div><div class="metric-label">Total Signups</div></div>' +
    '<div class="metric-card"><div class="metric-value" style="color:#8EC9A8">' + (data.active_customers || 0) + '</div><div class="metric-label">Active Customers</div><div class="earnings-note">Paying customers only</div></div>' +
    '<div class="metric-card"><div class="metric-value" style="color:var(--accent)">£' + (data.monthly_earnings || 0).toFixed(2) + '</div><div class="metric-label">Monthly Earnings</div><div class="earnings-note">From active customers</div></div>' +
    '<div class="metric-card"><div class="metric-value" style="color:#8EC9A8">£' + (data.monthly_earnings || 0).toFixed(2) + '</div><div class="metric-label">Pending This Month</div><div class="earnings-note">Paid on ' + payoutDate + '</div></div>' +
    '</div>' +

    '<div class="panel" style="background:rgba(200,169,110,0.04);border-color:rgba(200,169,110,0.2);">' +
    '<h3>💳 How payouts work</h3>' +
    '<div class="payout-grid">' +
    '<div><div class="payout-value">Monthly</div><div class="payout-desc">Paid by bank transfer on the 1st of each month</div></div>' +
    '<div><div class="payout-value">30%</div><div class="payout-desc">Commission on every paying customer, every month</div></div>' +
    '<div><div class="payout-value">Recurring</div><div class="payout-desc">You earn as long as the customer stays</div></div>' +
    '</div>' +
    '<div class="payout-footer">' +
    '<span class="next-payout">Next payout: <strong>' + payoutDate + '</strong><span style="font-size:0.7rem;color:rgba(234,231,220,0.3);display:block;margin-top:2px;">Only includes paying customers</span></span>' +
    '<button class="bank-details-btn" id="bankDetailsBtn" onclick="showBankForm()">Submit bank details for payouts →</button>' +
    '</div>' +
    '<div id="bankForm" style="display:none;margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">' +
    '<p style="font-size:0.82rem;color:var(--cream-dim);margin-bottom:12px;">Enter your bank details below.</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px;">' +
    '<input id="bankName" type="text" placeholder="Your full name" style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:10px 14px;color:var(--cream);font-family:\'DM Sans\',sans-serif;font-size:0.85rem;">' +
    '<input id="bankSortCode" type="text" placeholder="Sort code (e.g. 12-34-56)" style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:10px 14px;color:var(--cream);font-family:\'DM Sans\',sans-serif;font-size:0.85rem;">' +
    '<input id="bankAccountNumber" type="text" placeholder="Account number" style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:10px 14px;color:var(--cream);font-family:\'DM Sans\',sans-serif;font-size:0.85rem;">' +
    '<button onclick="submitBankDetails()" id="bankSubmitBtn" style="background:var(--accent);color:#1A1A18;border:none;padding:11px 20px;border-radius:6px;font-family:\'DM Sans\',sans-serif;font-weight:600;font-size:0.85rem;cursor:pointer;">Send details →</button>' +
    '</div>' +
    '<p id="bankFormMsg" style="font-size:0.78rem;margin-top:10px;min-height:18px;"></p>' +
    '</div>' +
    '</div>' +

    '<div class="panel">' +
    '<h3>Your referral link</h3>' +
    '<p style="font-size:0.85rem;color:var(--cream-dim);margin-bottom:0;">Share this link anywhere. Anyone who signs up is tracked to you.</p>' +
    '<div class="ref-link-box"><span id="refLink">' + data.referral_link + '</span><button class="copy-btn" onclick="copyRefLink()">📋 Copy</button></div>' +
    '</div>';

  if (data.referrals && data.referrals.length > 0) {
    html += '<div class="panel"><h3>Your referrals</h3><table><thead><tr><th>Business</th><th>Plan</th><th>Signed up</th><th>Status</th><th>Monthly</th></tr></thead><tbody>';
    data.referrals.forEach(function(r) {
      var badge = r.status === 'active' ? '<span class="status-badge status-active">✅ Paying</span>' :
                  r.status === 'trial' ? '<span class="status-badge status-trial">🕐 Trial</span>' :
                  '<span class="status-badge status-cancelled">✕ Cancelled</span>';
      html += '<tr><td>' + (r.business_name || r.slug) + '</td><td>' + (r.plan === 'pro' ? 'Pro' : 'Starter') + '</td><td>' + new Date(r.created_at).toLocaleDateString('en-GB') + '</td><td>' + badge + '</td><td class="' + (r.status === 'active' ? 'amount' : 'trial') + '">' + (r.status === 'active' ? '£' + r.commission.toFixed(2) : '£0.00 (trial)') + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }

  document.getElementById('mainContent').innerHTML = html;
}

// Expose functions globally for onclick handlers
window.copyRefLink = copyRefLink;
window.showBankForm = showBankForm;
window.submitBankDetails = submitBankDetails;