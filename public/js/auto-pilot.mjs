// Auto-Pilot Module - Automation settings UI

import { showToast } from './shared/utils.mjs';

let apState = {
  enabled: false,
  triggerMethod: 'sms',
  delayHours: 2,
  action: 'sms',
  quietStart: 21,
  quietEnd: 8,
  triggerNumber: '',
  emailAddress: ''
};

export async function initAutoPilot(slug) {
  console.log('Initializing Auto-Pilot for:', slug);
  await loadAutoPilotSettings(slug);
  bindAutoPilotEvents(slug);
  loadActivityLog(slug);
}

async function loadAutoPilotSettings(slug) {
  try {
    const res = await fetch(`/stats/${slug}`);
    const data = await res.json();
    
    apState.enabled = data.autopilot_enabled || false;
    apState.delayHours = data.autopilot_delay_hours || 2;
    apState.action = data.autopilot_action || 'sms';
    apState.quietStart = data.autopilot_quiet_hours_start || 21;
    apState.quietEnd = data.autopilot_quiet_hours_end || 8;
    apState.triggerNumber = data.autopilot_trigger_number || '';
    apState.emailAddress = `auto@${slug}.send.reviewlift.app`;
    
    // Update UI
    const toggle = document.getElementById('autoPilotToggle');
    if (toggle) toggle.checked = apState.enabled;
    
    document.getElementById('apDelayHours').value = apState.delayHours;
    document.getElementById('apAction').value = apState.action;
    document.getElementById('apQuietStart').value = apState.quietStart;
    document.getElementById('apQuietEnd').value = apState.quietEnd;
    
    if (apState.triggerNumber) {
      document.getElementById('apTriggerNumber').innerText = apState.triggerNumber;
    }
    
    document.getElementById('apEmailAddress').innerText = apState.emailAddress;
    
    // Highlight selected trigger method
    const method = data.autopilot_trigger_method || 'sms';
    selectTriggerMethod(method);
    
    // Update stats
    document.getElementById('apSentCount').innerText = data.autopilot_sent_30d || 0;
    document.getElementById('apConvertedCount').innerText = data.autopilot_converted_30d || 0;
    const sent = data.autopilot_sent_30d || 0;
    const converted = data.autopilot_converted_30d || 0;
    const rate = sent > 0 ? Math.round((converted / sent) * 100) : 0;
    document.getElementById('apConvRate').innerText = `${rate}%`;
    
    // Delay insight based on industry
    const industry = data.industry || 'local business';
    const insights = {
      'salon': 'Salons convert 24% better with 1-hour delay',
      'barber': 'Barbers see 22% conversion with 1-hour delay',
      'dental': 'Dentists convert best next morning at 10am',
      'plumbing': 'Plumbers get 21% conversion sending same evening',
      'physio': 'Physiotherapists: 2-hour delay = 21% conversion'
    };
    const insight = insights[industry] || '2 hours is optimal for most businesses';
    document.getElementById('delayInsight').innerHTML = `💡 ${insight}`;
    
  } catch (e) {
    console.error('Failed to load Auto-Pilot settings:', e);
  }
}

async function loadActivityLog(slug) {
  try {
    const res = await fetch(`/api/auto-pilot/logs/${slug}`);
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
  document.querySelectorAll('.trigger-option').forEach(opt => {
    opt.classList.remove('selected');
    const details = opt.querySelector('[id$="TriggerDetails"]');
    if (details) details.style.display = 'none';
  });
  
  const selected = document.querySelector(`.trigger-option[data-method="${method}"]`);
  if (selected) {
    selected.classList.add('selected');
    const details = selected.querySelector(`#${method}TriggerDetails`);
    if (details) details.style.display = 'block';
  }
  
  apState.triggerMethod = method;
}

function bindAutoPilotEvents(slug) {
  // Save button
  document.getElementById('saveAutoPilotBtn')?.addEventListener('click', async () => {
    const data = {
      autopilot_enabled: document.getElementById('autoPilotToggle').checked,
      autopilot_trigger_method: apState.triggerMethod,
      autopilot_delay_hours: parseInt(document.getElementById('apDelayHours').value),
      autopilot_action: document.getElementById('apAction').value,
      autopilot_quiet_hours_start: parseInt(document.getElementById('apQuietStart').value),
      autopilot_quiet_hours_end: parseInt(document.getElementById('apQuietEnd').value)
    };
    
    const btn = document.getElementById('saveAutoPilotBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    try {
      const res = await fetch('/update-auto-pilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      
      if (result.success) {
        showToast('Auto-Pilot settings saved!', 'success');
        apState.enabled = data.autopilot_enabled;
      } else {
        showToast(result.error || 'Failed to save', 'error');
      }
    } catch (e) {
      showToast('Something went wrong', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Save Auto-Pilot Settings';
    }
  });
  
  // Trigger method selection
  document.querySelectorAll('.trigger-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const method = opt.getAttribute('data-method');
      selectTriggerMethod(method);
    });
  });
  
  // Stripe connect button
  document.getElementById('connectStripeBtn')?.addEventListener('click', () => {
    window.location.href = `/stripe/connect/${slug}`;
  });
}

// Global functions for copy buttons
window.copyTriggerNumber = () => {
  const number = document.getElementById('apTriggerNumber')?.innerText;
  if (number) {
    navigator.clipboard.writeText(number);
    showToast('Number copied!', 'success');
  }
};

window.copyEmailAddress = () => {
  const email = document.getElementById('apEmailAddress')?.innerText;
  if (email) {
    navigator.clipboard.writeText(email);
    showToast('Email address copied!', 'success');
  }
};