import { showToast } from './shared/utils.mjs';

let currentSlug = null;

export async function initAutoPilot(slug) {
  currentSlug = slug;
  await loadSettings();
  await loadActivityLog();
  bindEvents();
}

async function loadSettings() {
  try {
    const res = await fetch(`/api/auto-pilot/${currentSlug}`);
    const data = await res.json();
    
    // Set toggle
    const toggle = document.getElementById('apToggle');
    if (toggle) toggle.checked = data.autopilot_enabled || false;
    
    // Set delay select
    const delaySelect = document.getElementById('apDelaySelect');
    if (delaySelect) delaySelect.value = data.autopilot_delay_hours || 2;
    
    // Set action select
    const actionSelect = document.getElementById('apActionSelect');
    if (actionSelect) actionSelect.value = data.autopilot_action || 'sms';
    
    // Set quiet hours
    const quietStart = document.getElementById('apQuietStart');
    const quietEnd = document.getElementById('apQuietEnd');
    if (quietStart) quietStart.value = data.autopilot_quiet_hours_start || 21;
    if (quietEnd) quietEnd.value = data.autopilot_quiet_hours_end || 8;
    
    // Update stats
    document.getElementById('apStatSent').innerText = data.autopilot_sent_30d || 0;
    document.getElementById('apStatConverted').innerText = data.autopilot_converted_30d || 0;
    const rate = data.autopilot_sent_30d > 0 
      ? Math.round((data.autopilot_converted_30d / data.autopilot_sent_30d) * 100) 
      : 0;
    document.getElementById('apStatRate').innerText = `${rate}%`;
    
    // Update status badge
    const statusText = document.getElementById('apStatusText');
    const statusDot = document.querySelector('#apStatusBadge .fs-status-dot');
    if (data.autopilot_enabled) {
      statusText.innerText = 'Active';
      statusDot.style.background = '#6A9E7F';
    } else {
      statusText.innerText = 'Disabled';
      statusDot.style.background = '#C0675A';
    }
    
    // Show industry recommendation
    if (data.recommendation && data.recommendation.optimal_delay) {
      const delayInsight = document.getElementById('delayInsight');
      const recommendationText = document.getElementById('recommendationText');
      if (delayInsight && recommendationText) {
        const rec = data.recommendation;
        recommendationText.innerHTML = `💡 For ${data.industry || 'your industry'}, sending ${rec.best_time?.toLowerCase() || `${rec.optimal_delay} hours later`} typically converts at ${rec.conversion_rate}% — ${rec.optimal_delay === data.autopilot_delay_hours ? '✓ You\'re already optimised!' : `try ${rec.optimal_delay} hours for better results.`}`;
        delayInsight.style.display = 'block';
        
        // Highlight recommended option in select
        const option = document.querySelector(`#apDelaySelect option[value="${rec.optimal_delay}"]`);
        if (option && rec.optimal_delay !== data.autopilot_delay_hours) {
          option.style.fontWeight = 'bold';
          option.style.color = '#C8A96E';
          option.textContent = option.textContent + ' ⭐ Recommended';
        }
      }
    }
    
    // Set trigger method
    const method = data.autopilot_trigger_method || 'sms';
    selectTriggerMethod(method);
    
    // Set email address display
    const emailDisplay = document.getElementById('apEmailAddressDisplay');
    if (emailDisplay) {
      emailDisplay.innerText = `auto@${currentSlug}.reviewlift.app`;
    }
    
  } catch (e) {
    console.error('Failed to load Auto-Pilot settings:', e);
  }
}

async function loadActivityLog() {
  try {
    const res = await fetch(`/api/auto-pilot/logs/${currentSlug}`);
    const logs = await res.json();
    
    const container = document.getElementById('apActivityList');
    if (!logs.length) {
      container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--cream-dim);">No automation activity yet. Send your first trigger!</div>';
      return;
    }
    
    container.innerHTML = logs.map(log => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.2rem;">${log.status === 'sent' ? '✅' : '⏳'}</span>
          <div>
            <div style="font-size: 0.8rem;">${log.customer_identifier || 'Customer'}</div>
            <div style="font-size: 0.65rem; color: var(--cream-dim);">${log.trigger_type} • ${new Date(log.created_at).toLocaleString()}</div>
          </div>
        </div>
        <div style="font-size: 0.7rem; color: ${log.status === 'sent' ? 'var(--success)' : 'var(--cream-dim)'};">${log.status === 'sent' ? 'Sent' : 'Queued'}</div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Failed to load activity log:', e);
  }
}

function selectTriggerMethod(method) {
  // Hide all detail panels
  document.getElementById('smsMethodDetails').style.display = 'none';
  document.getElementById('emailMethodDetails').style.display = 'none';
  
  // Show selected
  if (method === 'sms') {
    document.getElementById('smsMethodDetails').style.display = 'block';
  } else if (method === 'email') {
    document.getElementById('emailMethodDetails').style.display = 'block';
  }
  
  // Update button active states
  document.querySelectorAll('.trigger-method-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-method') === method) {
      btn.classList.add('active');
    }
  });
}

function bindEvents() {
  document.getElementById('apSaveBtn')?.addEventListener('click', async () => {
    const data = {
      enabled: document.getElementById('apToggle').checked,
      delayHours: parseInt(document.getElementById('apDelaySelect').value),
      action: document.getElementById('apActionSelect').value,
      quietStart: parseInt(document.getElementById('apQuietStart').value),
      quietEnd: parseInt(document.getElementById('apQuietEnd').value),
      triggerMethod: document.querySelector('.trigger-method-btn.active')?.getAttribute('data-method') || 'sms'
    };
    
    const btn = document.getElementById('apSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    try {
      const res = await fetch('/api/auto-pilot/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      
      if (result.success) {
        showToast('Auto-Pilot settings saved!', 'success');
        document.getElementById('apSaveStatus').innerHTML = '✓ Saved';
        document.getElementById('apSaveStatus').style.color = '#6A9E7F';
        setTimeout(() => {
          document.getElementById('apSaveStatus').innerHTML = '✓ Settings saved';
        }, 2000);
      } else {
        showToast(result.error || 'Failed to save', 'error');
      }
    } catch (e) {
      showToast('Something went wrong', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Save changes';
    }
  });
  
  document.querySelectorAll('.trigger-method-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const method = btn.getAttribute('data-method');
      selectTriggerMethod(method);
    });
  });
}

// Global copy functions
window.copyTriggerNumber = () => {
  const number = document.getElementById('apTriggerNumberDisplay')?.innerText;
  if (number) {
    navigator.clipboard.writeText(number);
    showToast('Number copied!', 'success');
  }
};

window.copyEmailAddress = () => {
  const email = document.getElementById('apEmailAddressDisplay')?.innerText;
  if (email) {
    navigator.clipboard.writeText(email);
    showToast('Email address copied!', 'success');
  }
};