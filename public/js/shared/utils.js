// ===== UTILS MODULE =====
// Shared utility functions

function showToast(message, type) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  toast.textContent = type === 'success' ? '✓ ' + message : '✕ ' + message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 4000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMins = Math.floor((now - date) / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  showToast('Copied!', 'success');
}

// Expose for global use
window.showToast = showToast;
window.escapeHtml = escapeHtml;
window.getRelativeTime = getRelativeTime;
window.copyToClipboard = copyToClipboard;

export { showToast, escapeHtml, getRelativeTime, copyToClipboard };