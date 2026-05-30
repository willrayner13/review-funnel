// Normalise UK phone numbers
function normalisePhone(phone) {
  const digits = phone.replace(/[\s\-\(\)]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("07") && digits.length === 11) return "+44" + digits.slice(1);
  if (digits.startsWith("7") && digits.length === 10) return "+44" + digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  return digits;
}

function isTrialActive(business) {
  if (!business.trial_ends_at) return false;
  return new Date() < new Date(business.trial_ends_at);
}

function hasProAccess(business) {
  return business.subscription_active && (business.plan_type === "pro" || business.plan_type === "agency");
}

function escapeJS(str) {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRelativeDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

module.exports = {
  normalisePhone,
  isTrialActive,
  hasProAccess,
  escapeJS,
  escapeHtml,
  getRelativeDate,
};