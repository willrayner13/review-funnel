import { showToast } from './shared/utils.mjs';

console.log('🔵 Auto-Pilot module loading...');

let currentSlug = null;

export async function initAutoPilot(slug) {
  console.log('🔵 initAutoPilot called for slug:', slug);
  currentSlug = slug;
  try {
    await loadSettings();
    await loadActivityLog();
    bindEvents();
    console.log('✅ Auto-Pilot initialized successfully');
  } catch (err) {
    console.error('❌ Auto-Pilot init error:', err);
  }
}

async function loadSettings() {
  console.log('📊 Loading Auto-Pilot settings...');
  try {
    const res = await fetch(`/api/auto-pilot/${currentSlug}`);
    const data = await res.json();
    console.log('Settings received:', data);
    
    const toggle = document.getElementById('apToggle');
    if (toggle) toggle.checked = data.autopilot_enabled || false;
    
    const delaySelect = document.getElementById('apDelaySelect');
    if (delaySelect) delaySelect.value = data.autopilot_delay_hours || 2;
    
    const actionSelect = document.getElementById('apActionSelect');
    if (actionSelect) actionSelect.value = data.autopilot_action || 'sms';
    
    const quietStart = document.getElementById('apQuietStart');
    const quietEnd = document.getElementById('apQuietEnd');
    if (quietStart) quietStart.value = data.autopilot_quiet_hours_start || 21;
    if (quietEnd) quietEnd.value = data.autopilot_quiet_hours_end || 8;
    
    const sentEl = document.getElementById('apStatSent');
    const convertedEl = document.getElementById('apStatConverted');
    const rateEl = document.getElementById('apStatRate');
    if (sentEl) sentEl.innerText = data.autopilot_sent_30d || 0;
    if (convertedEl) convertedEl.innerText = data.autopilot_converted_30d || 0;
    const rate = data.autopilot_sent_30d > 0 
      ? Math.round((data.autopilot_converted_30d / data.autopilot_sent_30d) * 100) 
      : 0;
    if (rateEl) rateEl.innerText = `${rate}%`;
    
    const statusText = document.getElementById('apStatusText');
    const statusDot = document.getElementById('apStatusDot');
    if (statusText) {
      statusText.innerText = data.autopilot_enabled ? 'Active' : 'Disabled';
    }
    if (statusDot) {
      statusDot.style.background = data.autopilot_enabled ? '#6A9E7F' : '#C0675A';
    }
    
    if (data.recommendation && data.recommendation.optimal_delay) {
      const delayInsight = document.getElementById('delayInsight');
      const recommendationText = document.getElementById('recommendationText');
      if (delayInsight && recommendationText) {
        const rec = data.recommendation;
        recommendationText.innerHTML = `💡 For ${data.industry || 'your industry'}, sending ${rec.best_time} typically converts at ${rec.conversion_rate}% — ${rec.optimal_delay === data.autopilot_delay_hours ? '✓ You\'re optimised!' : `try ${rec.optimal_delay} hours for better results.`}`;
        delayInsight.style.display = 'block';
      }
    }
    
    const method = data.autopilot_trigger_method || 'sms';
    selectTriggerMethod(method);
    
  } catch (e) {
    console.error('Failed to load Auto-Pilot settings:', e);
  }
}

async function loadActivityLog() {
  console.log('📋 Loading activity log...');
  try {
    const res = await fetch(`/api/auto-pilot/logs/${currentSlug}`);
    const logs = await res.json();
    console.log('Logs received:', logs.length);
    
    const container = document.getElementById('apActivityList');
    if (!container) return;
    
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
        <div style="font-size: 0.7rem;">${log.status === 'sent' ? 'Sent' : 'Queued'}</div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Failed to load activity log:', e);
  }
}

function selectTriggerMethod(method) {
  const smsDetails = document.getElementById('smsMethodDetails');
  const emailDetails = document.getElementById('emailMethodDetails');
  
  if (smsDetails) smsDetails.style.display = method === 'sms' ? 'block' : 'none';
  if (emailDetails) emailDetails.style.display = method === 'email' ? 'block' : 'none';
  
  document.querySelectorAll('.trigger-method-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-method') === method) {
      btn.classList.add('active');
    }
  });
}

function bindEvents() {
  const saveBtn = document.getElementById('apSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const data = {
        enabled: document.getElementById('apToggle')?.checked || false,
        delayHours: parseInt(document.getElementById('apDelaySelect')?.value || 2),
        action: document.getElementById('apActionSelect')?.value || 'sms',
        quietStart: parseInt(document.getElementById('apQuietStart')?.value || 21),
        quietEnd: parseInt(document.getElementById('apQuietEnd')?.value || 8),
        triggerMethod: document.querySelector('.trigger-method-btn.active')?.getAttribute('data-method') || 'sms'
      };
      
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      
      try {
        const res = await fetch('/api/auto-pilot/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        
        if (result.success) {
          showToast('Auto-Pilot settings saved!', 'success');
          const statusSpan = document.getElementById('apSaveStatus');
          if (statusSpan) {
            statusSpan.innerHTML = '✓ Saved';
            statusSpan.style.color = '#6A9E7F';
            setTimeout(() => {
              statusSpan.innerHTML = '✓ Settings saved';
            }, 2000);
          }
        } else {
          showToast(result.error || 'Failed to save', 'error');
        }
      } catch (e) {
        showToast('Something went wrong', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save changes';
      }
    });
  }
  
  document.querySelectorAll('.trigger-method-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const method = btn.getAttribute('data-method');
      selectTriggerMethod(method);
    });
  });
}

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

console.log('✅ Auto-Pilot module loaded successfully');