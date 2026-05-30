/**
 * SMS Service - Handles all SMS communications via Twilio
 * Supports UK phone numbers only (for now)
 * 
 * @module services/smsService
 */

const twilioClient = require("../config/twilio");
const { normalisePhone } = require("../utils/helpers");

// SMS length limits
const MAX_SMS_LENGTH = 160;
const ALERT_SMS_LENGTH = 160;

/**
 * Send a standard SMS message
 * @param {string} phone - UK phone number (supports 07..., 7..., +44..., 00...)
 * @param {string} message - Message body (will be truncated to 160 chars)
 * @returns {Promise<object>} Twilio message object
 */
async function sendSMS(phone, message) {
  const normalisedPhone = normalisePhone(phone);
  
  // Validate UK number
  if (!normalisedPhone.startsWith("+44")) {
    throw new Error("SMS is currently available for UK numbers only. We're working on international support.");
  }
  
  // Truncate to SMS length limit
  const truncatedMessage = message.length > MAX_SMS_LENGTH 
    ? message.substring(0, MAX_SMS_LENGTH - 3) + "..."
    : message;
  
  try {
    const result = await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE,
      to: normalisedPhone,
      body: truncatedMessage,
    });
    
    console.log(`SMS sent to ${normalisedPhone}`, { sid: result.sid });
    return result;
  } catch (error) {
    console.error("SMS sending failed:", error.code, error.message);
    throw error;
  }
}

/**
 * Send a review request SMS to a customer
 * @param {string} customerPhone - Customer's phone number
 * @param {string} businessName - Name of the business
 * @param {string} funnelUrl - Review funnel URL
 * @returns {Promise<object>} Twilio message object
 */
async function sendReviewRequestSMS(customerPhone, businessName, funnelUrl) {
  const message = `Hi! Thanks for visiting ${businessName} today. We'd love to know how it went - takes 30 seconds: ${funnelUrl}`;
  return await sendSMS(customerPhone, message);
}

/**
 * Send an alert SMS to a business owner about a complaint
 * @param {string} ownerPhone - Business owner's phone number
 * @param {string} businessName - Name of the business
 * @param {string} complaintMessage - Customer's complaint message
 * @param {string} dashboardUrl - URL to the dashboard
 * @returns {Promise<object>} Twilio message object
 */
async function sendAlertSMS(ownerPhone, businessName, complaintMessage, dashboardUrl) {
  const truncatedMessage = complaintMessage.length > 60 
    ? complaintMessage.substring(0, 57) + "..."
    : complaintMessage;
  
  const message = `⚠️ COMPLAINT from ${businessName}: "${truncatedMessage}"\n\nLog in to respond: ${dashboardUrl}`;
  
  // Alert SMS has priority - don't truncate further
  if (message.length > ALERT_SMS_LENGTH) {
    console.warn(`Alert SMS for ${businessName} exceeds length limit (${message.length}/${ALERT_SMS_LENGTH})`);
  }
  
  return await sendSMS(ownerPhone, message);
}

/**
 * Send an automated review request via webhook
 * @param {string} customerPhone - Customer's phone number
 * @param {string} businessName - Name of the business
 * @param {string} customerName - Customer's name
 * @param {string} service - Service provided (optional)
 * @param {string} staffName - Staff member name (optional)
 * @param {string} funnelUrl - Review funnel URL
 * @returns {Promise<object>} Twilio message object
 */
async function sendAutomatedReviewRequest(customerPhone, businessName, customerName, service, staffName, funnelUrl) {
  // Build personalized message
  let message = `Hi ${customerName}, thanks for choosing ${businessName}`;
  
  if (service) {
    message += ` for your ${service}`;
  }
  
  if (staffName) {
    message += ` with ${staffName}`;
  }
  
  message += `. We'd love your feedback - takes 30 seconds: ${funnelUrl}`;
  
  // Ensure message fits in SMS length
  if (message.length > MAX_SMS_LENGTH) {
    // Try shorter version without staff name
    message = `Hi ${customerName}, thanks for choosing ${businessName}${service ? ` for your ${service}` : ''}. Share your feedback: ${funnelUrl}`;
  }
  
  if (message.length > MAX_SMS_LENGTH) {
    // Final fallback - ultra short
    message = `Hi ${customerName}, how was your experience? Leave a review: ${funnelUrl}`;
  }
  
  return await sendSMS(customerPhone, message);
}

/**
 * Check if a phone number is a valid UK mobile
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid UK mobile
 */
function isValidUKMobile(phone) {
  const normalised = normalisePhone(phone);
  // UK mobile pattern: +44 followed by 10 digits (starting with 7)
  const ukMobilePattern = /^\+447[0-9]{9}$/;
  return ukMobilePattern.test(normalised);
}

/**
 * Get SMS usage statistics for a business
 * @param {string} slug - Business slug
 * @param {object} supabase - Supabase client instance
 * @returns {Promise<object>} Usage statistics
 */
async function getSMSUsageStats(slug, supabase) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  
  const { data: business } = await supabase
    .from("businesses")
    .select("trial_ends_at, plan_type")
    .eq("slug", slug)
    .single();
  
  const trialEnd = business?.trial_ends_at ? new Date(business.trial_ends_at) : null;
  const inTrial = trialEnd && now < trialEnd;
  
  // Get count of SMS sent in current period
  const { count: smsCount } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("business_slug", slug)
    .eq("event_type", "sms_sent")
    .gte("created_at", monthStart);
  
  return {
    sent_this_month: smsCount || 0,
    trial_active: inTrial,
    plan_type: business?.plan_type || "starter",
  };
}

module.exports = {
  sendSMS,
  sendReviewRequestSMS,
  sendAlertSMS,
  sendAutomatedReviewRequest,
  isValidUKMobile,
  getSMSUsageStats,
  MAX_SMS_LENGTH,
};