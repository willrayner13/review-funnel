// ===== ACTIONS MODULE =====
// Dynamic action queue - tells users what to do next

import { navigateTo } from './navigation.mjs';
import { showToast } from '../shared/utils.mjs';

// Priority levels
const PRIORITY = {
  URGENT: 1,    // Red - must do today
  HIGH: 2,      // Orange - do soon
  NORMAL: 3,    // Blue - nice to do
  LOW: 4        // Gray - when you have time
};

async function generateActionQueue(stats) {
  const container = document.getElementById('actionsContainer');
  if (!container) return;
  
  const actions = [];
  
  // ========== ACTION 1: Unread private feedback ==========
  const unreadFeedback = stats.unread_feedback_count || stats.feedback?.length || 0;
  if (unreadFeedback > 0) {
    actions.push({
      priority: PRIORITY.URGENT,
      icon: '💬',
      title: unreadFeedback + ' unread message' + (unreadFeedback > 1 ? 's' : ''),
      description: 'Customer' + (unreadFeedback > 1 ? 's have' : ' has') + ' left private feedback that needs your attention.',
      action: 'Read and respond →',
      nav: 'customers',
      color: '#D4897C'
    });
  }
  
  // ========== ACTION 2: Low review velocity ==========
  const reviewsThisMonth = stats.reviews || 0;
  const targetReviews = 5;
  if (reviewsThisMonth < targetReviews && stats.visits > 10) {
    const needed = targetReviews - reviewsThisMonth;
    actions.push({
      priority: PRIORITY.HIGH,
      icon: '📉',
      title: 'Only ' + reviewsThisMonth + ' review' + (reviewsThisMonth !== 1 ? 's' : '') + ' this month',
      description: 'You\'re ' + needed + ' review' + (needed > 1 ? 's' : '') + ' away from your target. Send a campaign now.',
      action: 'Send review requests →',
      nav: 'campaigns',
      color: '#F59E0B'
    });
  }
  
  // ========== ACTION 3: New 5-star milestone ==========
  if (stats.positive > 0 && stats.positive % 5 === 0 && stats.positive <= 50) {
    actions.push({
      priority: PRIORITY.NORMAL,
      icon: '🎉',
      title: stats.positive + ' 5-star ratings!',
      description: 'Share your success on social media or thank your team.',
      action: 'Share this win →',
      nav: null,
      color: '#8B5CF6',
      onClick: function() { showToast('🎉 Keep up the great work!', 'success'); }
    });
  }
  
  // ========== ACTION 4: Funnel not customized ==========
  const hasCustomFunnel = stats.funnel_template !== 'classic' || stats.funnel_logo_url;
  if (!hasCustomFunnel && stats.visits > 5) {
    actions.push({
      priority: PRIORITY.NORMAL,
      icon: '🎨',
      title: 'Your funnel looks generic',
      description: 'Branded funnels convert 18% better. Add your logo and colours.',
      action: 'Customise your funnel →',
      nav: 'funnel-studio',
      color: '#8B5CF6'
    });
  }
  
  // ========== ACTION 5: Pro upgrade value (locked feature preview) ==========
  const hasPro = stats.subscription_active && (stats.plan_type === 'pro' || stats.plan_type === 'agency');
  if (!hasPro && stats.visits > 20) {
    const estimatedTimeSaved = Math.round(stats.positive * 2.5);
    actions.push({
      priority: PRIORITY.LOW,
      icon: '✨',
      title: 'Pro would save you ' + estimatedTimeSaved + ' minutes',
      description: 'AI replies and SMS campaigns automate your workflow.',
      action: 'See what you\'re missing →',
      nav: 'billing',
      color: '#6A9E7F',
      isLocked: true
    });
  }
  
  // ========== ACTION 6: Smart Send recommendation ==========
  if (stats.sms_sent_this_month > 0 || stats.email_sent_this_month > 0) {
    const bestChannel = stats.sms_sent_this_month > stats.email_sent_this_month ? 'SMS' : 'Email';
    const bestTime = '2 hours after appointments';
    actions.push({
      priority: PRIORITY.LOW,
      icon: '🧠',
      title: bestChannel + ' works best for you',
      description: 'Based on your data, ' + bestChannel + ' gets higher conversion. Send at ' + bestTime + '.',
      action: 'Send a test →',
      nav: 'campaigns',
      color: '#C8A96E'
    });
  }
  
  // Sort by priority (urgent first)
  actions.sort(function(a, b) { return a.priority - b.priority; });
  
  // Render actions
  if (actions.length === 0) {
    container.innerHTML = `
      <div class="actions-empty">
        <div class="actions-empty-icon">✅</div>
        <div class="actions-empty-title">All caught up!</div>
        <div class="actions-empty-text">Everything looks great. Check back later for new insights.</div>
      </div>
    `;
    return;
  }
  
  const priorityColors = {
    1: { bg: 'rgba(212, 137, 124, 0.1)', border: '#D4897C', badge: '🔴 Urgent' },
    2: { bg: 'rgba(245, 158, 11, 0.1)', border: '#F59E0B', badge: '🟠 High priority' },
    3: { bg: 'rgba(139, 92, 246, 0.1)', border: '#8B5CF6', badge: '🔵 Suggested' },
    4: { bg: 'rgba(234, 231, 220, 0.05)', border: 'var(--border)', badge: '⚪ Good to know' }
  };
  
  let html = '';
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const priorityStyle = priorityColors[action.priority];
    html += `
      <div class="action-card" data-nav="${action.nav || ''}" data-has-click="${action.onClick ? 'true' : 'false'}" style="border-left-color: ${priorityStyle.border}; background: ${priorityStyle.bg};">
        <div class="action-icon">${action.icon}</div>
        <div class="action-content">
          <div class="action-header">
            <span class="action-title">${action.title}</span>
            <span class="action-badge" style="color: ${priorityStyle.border}">${priorityStyle.badge}</span>
          </div>
          <div class="action-description">${action.description}</div>
          <button class="action-btn" data-nav="${action.nav || ''}" style="color: ${priorityStyle.border}">
            ${action.action}
          </button>
          ${action.isLocked ? '<span class="action-locked-badge">🔒 Pro feature</span>' : ''}
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Attach click handlers
  const actionCards = document.querySelectorAll('.action-card');
  for (let i = 0; i < actionCards.length; i++) {
    const card = actionCards[i];
    const nav = card.dataset.nav;
    const hasClick = card.dataset.hasClick === 'true';
    
    card.addEventListener('click', function(e) {
      e.stopPropagation();
      if (hasClick && actions[i] && actions[i].onClick) {
        actions[i].onClick();
      } else if (nav) {
        navigateTo(nav);
      }
    });
    
    const actionBtn = card.querySelector('.action-btn');
    if (actionBtn) {
      actionBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (hasClick && actions[i] && actions[i].onClick) {
          actions[i].onClick();
        } else if (nav) {
          navigateTo(nav);
        }
      });
    }
  }
}

export { generateActionQueue };