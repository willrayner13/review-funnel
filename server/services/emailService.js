/**
 * Email Service - Handles all email communications
 * Uses Resend for email delivery with professional HTML templates
 * 
 * @module services/emailService
 */

const resend = require("../config/resend");

// Email configuration
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || "reviewlift.app";
const FROM_EMAIL = `ReviewLift <reviews@${EMAIL_DOMAIN}>`;
const ALERTS_FROM = `ReviewLift Alerts <alerts@${EMAIL_DOMAIN}>`;
const ORDERS_FROM = `ReviewLift Orders <orders@${EMAIL_DOMAIN}>`;

/**
 * Email template: Welcome message for new business users
 */
async function sendWelcomeEmail(email, name, funnelUrl, dashboardUrl) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to ReviewLift</title>
      <style>
        @media only screen and (max-width: 600px) {
          .container { width: 100% !important; }
          .inner-padding { padding: 24px !important; }
          .button { display: block !important; width: 100% !important; text-align: center !important; }
        }
      </style>
    </head>
    <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A18;padding:40px 16px;">
        <tr>
          <td align="center">
            <table class="container" width="540" cellpadding="0" cellspacing="0" style="background:#242422;border-radius:16px;overflow:hidden;max-width:540px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.3);">
              <!-- Header -->
              <tr>
                <td style="background:#1A1A18;padding:24px 32px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="width:8px;height:8px;background:#C8A96E;border-radius:50%;vertical-align:middle;"></td>
                      <td style="padding-left:10px;font-family:'Syne',Arial,sans-serif;font-size:20px;font-weight:800;color:#EAE7DC;letter-spacing:-0.5px;">ReviewLift</td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td class="inner-padding" style="padding:36px 32px 28px;">
                  <h2 style="margin:0 0 16px;font-size:24px;color:#EAE7DC;font-weight:700;">You're in, ${escapeHtml(name)}.</h2>
                  
                  <p style="margin:0 0 20px;font-size:15px;color:rgba(234,231,220,0.6);line-height:1.6;">
                    Your review funnel for <strong style="color:#C8A96E;">${escapeHtml(name)}</strong> is live and ready to collect feedback.
                  </p>
                  
                  <!-- Funnel Link Box -->
                  <div style="background:#1A1A18;border:1px solid rgba(200,169,110,0.25);border-radius:12px;padding:20px;text-align:center;margin:24px 0;">
                    <p style="margin:0 0 8px;font-size:12px;color:rgba(234,231,220,0.4);letter-spacing:1px;">YOUR REVIEW FUNNEL LINK</p>
                    <p style="margin:0 0 12px;font-family:'Courier New',monospace;font-size:14px;color:#C8A96E;word-break:break-all;">${escapeHtml(funnelUrl)}</p>
                    <p style="margin:0;font-size:11px;color:rgba(234,231,220,0.35);">Share this link anywhere — WhatsApp, invoices, your website, or a QR code</p>
                  </div>
                  
                  <p style="margin:0 0 8px;font-size:13px;color:rgba(234,231,220,0.45);">Your first review could come in today.</p>
                  
                  <div style="margin-top:28px;">
                    <a href="${escapeHtml(dashboardUrl)}" class="button" style="display:inline-block;background:#C8A96E;color:#1A1A18;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;transition:background 0.2s;">Go to your dashboard →</a>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding:20px 32px 24px;border-top:1px solid rgba(234,231,220,0.06);text-align:center;">
                  <p style="margin:0;font-size:11px;color:rgba(234,231,220,0.25);line-height:1.6;">
                    ReviewLift · The review system that runs itself<br>
                    <a href="https://reviewlift.app" style="color:rgba(200,169,110,0.5);text-decoration:none;">reviewlift.app</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Your review funnel is live, ${name} — share this link to start`,
      html,
    });
  } catch (error) {
    console.error("Welcome email failed:", error);
    throw error;
  }
}

/**
 * Email template: Welcome message for agency partners
 */
async function sendAgencyWelcomeEmail(email, name, dashboardUrl) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to ReviewLift Agency Program</title>
    </head>
    <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A18;padding:40px 16px;">
        <tr>
          <td align="center">
            <table width="540" cellpadding="0" cellspacing="0" style="background:#242422;border-radius:16px;overflow:hidden;">
              <tr><td style="background:#1A1A18;padding:24px 32px;">
                <table><tr><td style="width:8px;height:8px;background:#C8A96E;border-radius:50%;"></td>
                <td style="padding-left:10px;font-size:20px;font-weight:800;color:#EAE7DC;">ReviewLift</td></tr></table>
              </td></tr>
              <tr><td style="padding:32px;">
                <h2 style="color:#C8A96E;margin:0 0 16px;">Welcome to the Agency Program, ${escapeHtml(name)}!</h2>
                <p style="color:#EAE7DC;margin-bottom:20px;">You've created your agency account. Here's what you can do next:</p>
                <ul style="color:rgba(234,231,220,0.7);margin-bottom:24px;padding-left:20px;">
                  <li style="margin-bottom:8px;">Get your unique referral link</li>
                  <li style="margin-bottom:8px;">Earn 30% recurring commission on every client you refer</li>
                  <li>Upgrade to Agency Pro (£79/mo) for white-label and client management</li>
                </ul>
                <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#C8A96E;color:#1A1A18;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;">Go to your dashboard →</a>
              </td></tr>
              <tr><td style="padding:20px 32px;border-top:1px solid rgba(234,231,220,0.06);text-align:center;">
                <p style="margin:0;font-size:11px;color:rgba(234,231,220,0.25);">ReviewLift · The review system that runs itself</p>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Welcome to ReviewLift Agency Program, ${name}`,
      html,
    });
  } catch (error) {
    console.error("Agency welcome email failed:", error);
    throw error;
  }
}

/**
 * Email template: Alert when a customer leaves negative feedback
 */
async function sendAlertEmail(email, businessName, message, dashboardUrl) {
  const shortMessage = message.length > 200 ? message.substring(0, 197) + "..." : message;
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A18;padding:32px 16px;">
        <tr><td align="center">
          <table width="540" cellpadding="0" cellspacing="0" style="background:#242422;border-radius:12px;overflow:hidden;">
            <tr><td style="background:#1A1A18;padding:20px 32px;">
              <table><tr><td style="width:8px;height:8px;background:#C8A96E;border-radius:50%;"></td>
              <td style="padding-left:8px;font-size:16px;font-weight:800;color:#EAE7DC;">⚠️ Alert</td></tr></table>
            </td></tr>
            <tr><td style="padding:32px 32px 24px;">
              <h2 style="margin:0 0 8px;color:#D4897C;font-size:20px;">New complaint received</h2>
              <p style="margin:0 0 16px;font-size:14px;color:rgba(234,231,220,0.55);">${escapeHtml(businessName)} left private feedback:</p>
              <div style="background:#1A1A18;border-left:3px solid #D4897C;border-radius:8px;padding:18px;margin:8px 0 20px;">
                <p style="margin:0;font-size:14px;color:#EAE7DC;line-height:1.6;">"${escapeHtml(shortMessage).replace(/"/g, '&quot;')}"</p>
              </div>
              <p style="margin:0 0 20px;font-size:12px;color:rgba(234,231,220,0.4);">This complaint was captured privately — it never reached Google.</p>
              <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#C8A96E;color:#1A1A18;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">View in dashboard →</a>
            </td></tr>
            <tr><td style="padding:16px 32px 20px;border-top:1px solid rgba(234,231,220,0.06);text-align:center;">
              <p style="margin:0;font-size:11px;color:rgba(234,231,220,0.25);">ReviewLift · The review system that runs itself</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  try {
    return await resend.emails.send({
      from: ALERTS_FROM,
      to: email,
      subject: `⚠️ New complaint received — ${businessName}`,
      html,
    });
  } catch (error) {
    console.error("Alert email failed:", error);
    throw error;
  }
}

/**
 * Email template: Congratulations on reaching a review milestone
 */
async function sendMilestoneEmail(email, businessName, milestoneCount, milestoneUrl, dashboardUrl, congratsMessage) {
  const milestoneMessages = {
    10: "First big milestone!",
    25: "Twenty-five happy customers and counting.",
    50: "50 reviews! Every single one helps.",
    100: "Triple digits! A hundred thank-yous.",
    250: "A quarter of a thousand reviews.",
    500: "500 reviews! Half a thousand happy customers.",
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A18;padding:32px 16px;">
        <tr><td align="center">
          <table width="540" cellpadding="0" cellspacing="0" style="background:#242422;border-radius:16px;overflow:hidden;">
            <tr><td style="background:#1A1A18;padding:24px 32px;">
              <table><tr><td style="width:8px;height:8px;background:#C8A96E;border-radius:50%;"></td>
              <td style="padding-left:10px;font-size:20px;font-weight:800;color:#EAE7DC;">ReviewLift</td></tr></table>
            </td></tr>
            <tr><td style="padding:36px 32px 28px;text-align:center;">
              <div style="font-size:64px;margin-bottom:16px;">🎉</div>
              <h2 style="margin:0 0 12px;font-size:28px;color:#C8A96E;font-weight:800;">${milestoneCount} Google Reviews!</h2>
              <p style="margin:0 0 8px;font-size:16px;color:#EAE7DC;">${congratsMessage || milestoneMessages[milestoneCount] || "Congratulations on this amazing milestone!"}</p>
              <p style="margin:0 0 24px;font-size:14px;color:rgba(234,231,220,0.5);">You've collected ${milestoneCount} Google reviews using ReviewLift.</p>
              
              <div style="background:#1A1A18;border:1px solid rgba(200,169,110,0.25);border-radius:12px;padding:20px;margin:20px 0;">
                <p style="margin:0 0 8px;font-size:12px;color:rgba(234,231,220,0.4);letter-spacing:1px;">SHARE YOUR MILESTONE</p>
                <p style="margin:0;font-family:'Courier New',monospace;font-size:13px;color:#C8A96E;word-break:break-all;">${escapeHtml(milestoneUrl)}</p>
              </div>
              
              <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#C8A96E;color:#1A1A18;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;">Go to your dashboard →</a>
            </td></tr>
            <tr><td style="padding:20px 32px 24px;border-top:1px solid rgba(234,231,220,0.06);text-align:center;">
              <p style="margin:0;font-size:11px;color:rgba(234,231,220,0.25);">ReviewLift · The review system that runs itself</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  try {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `🎉 Congratulations! ${milestoneCount} Google reviews — ${businessName}`,
      html,
    });
  } catch (error) {
    console.error("Milestone email failed:", error);
    throw error;
  }
}

/**
 * Email template: Review request sent from dashboard
 */
async function sendReviewRequestEmail(businessName, businessEmail, customerEmail, reviewUrl) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A18;padding:32px 16px;">
        <tr><td align="center">
          <table width="540" cellpadding="0" cellspacing="0" style="background:#242422;border-radius:12px;overflow:hidden;">
            <tr><td style="background:#1A1A18;padding:20px 32px;">
              <table><tr><td style="width:8px;height:8px;background:#C8A96E;border-radius:50%;"></td>
              <td style="padding-left:8px;font-size:16px;font-weight:800;color:#EAE7DC;">${escapeHtml(businessName)}</td></tr></table>
            </td></tr>
            <tr><td style="padding:32px 32px 24px;">
              <h2 style="margin:0 0 14px;font-size:22px;color:#EAE7DC;">How was your recent experience?</h2>
              <p style="margin:0 0 10px;font-size:15px;color:rgba(234,231,220,0.55);line-height:1.6;">Thanks for choosing us — we hope you had a great experience.</p>
              <p style="margin:0 0 24px;font-size:15px;color:rgba(234,231,220,0.55);line-height:1.6;">Your feedback helps us improve. It only takes <strong>30 seconds</strong>.</p>
              <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#C8A96E;color:#1A1A18;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">Share your experience →</a>
            </td></tr>
            <tr><td style="padding:20px 32px 24px;border-top:1px solid rgba(234,231,220,0.06);text-align:center;">
              <p style="margin:0;font-size:11px;color:rgba(234,231,220,0.25);">Sent by ${escapeHtml(businessName)} · Powered by ReviewLift</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  try {
    return await resend.emails.send({
      from: `${businessName} <reviews@${EMAIL_DOMAIN}>`,
      to: customerEmail,
      subject: `How was your visit to ${businessName}?`,
      html,
    });
  } catch (error) {
    console.error("Review request email failed:", error);
    throw error;
  }
}

/**
 * Email template: NFC card order confirmation
 */
async function sendNFCShippingConfirmation(email, businessName, trackingNumber) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A18;padding:32px 16px;">
        <tr><td align="center">
          <table width="540" cellpadding="0" cellspacing="0" style="background:#242422;border-radius:12px;overflow:hidden;">
            <tr><td style="background:#1A1A18;padding:24px 32px;">
              <table><tr><td style="width:8px;height:8px;background:#C8A96E;border-radius:50%;"></td>
              <td style="padding-left:10px;font-size:20px;font-weight:800;color:#EAE7DC;">ReviewLift</td></tr></table>
            </td></tr>
            <tr><td style="padding:36px 32px 28px;text-align:center;">
              <div style="font-size:48px;margin-bottom:16px;">📮</div>
              <h2 style="margin:0 0 12px;color:#C8A96E;">Your NFC card has shipped!</h2>
              <p style="margin:0 0 16px;color:rgba(234,231,220,0.55);line-height:1.6;">Your ReviewLift tap-to-review card is on its way to you.</p>
              ${trackingNumber ? `<p><strong style="color:#C8A96E;">Tracking number:</strong> ${escapeHtml(trackingNumber)}</p>` : ''}
              <div style="background:#1A1A18;border-radius:10px;padding:16px;margin:24px 0;">
                <p style="margin:0;font-size:13px;color:rgba(234,231,220,0.45);">💡 <strong style="color:#EAE7DC;">Pro tip:</strong> Pair your NFC card with the QR code on your dashboard for maximum review collection.</p>
              </div>
              <a href="https://www.reviewlift.app/for-business" style="display:inline-block;background:#C8A96E;color:#1A1A18;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;">Go to Dashboard →</a>
            </td></tr>
            <tr><td style="padding:20px 32px 24px;border-top:1px solid rgba(234,231,220,0.06);text-align:center;">
              <p style="margin:0;font-size:11px;color:rgba(234,231,220,0.25);">ReviewLift · The review system that runs itself</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  try {
    return await resend.emails.send({
      from: ORDERS_FROM,
      to: email,
      subject: `📮 Your ReviewLift NFC card is on its way!`,
      html,
    });
  } catch (error) {
    console.error("NFC shipping email failed:", error);
    throw error;
  }
}

/**
 * Email template: Contact form submission to admin
 */
async function sendContactNotification(name, email, message) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;padding:24px;">
      <h3 style="margin:0 0 16px;color:#1E1E1C;">New contact form message</h3>
      <p style="margin:0 0 8px;"><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p style="margin:0 0 8px;"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
      <p style="margin:0 0 16px;"><strong>Message:</strong></p>
      <div style="background:#f5f5f3;padding:16px;border-radius:8px;font-size:14px;line-height:1.7;color:#333;">${escapeHtml(message).replace(/\n/g, "<br>")}</div>
      <p style="margin:16px 0 0;font-size:12px;color:#999;">Hit reply to respond directly to ${escapeHtml(name)}.</p>
    </div>
  `;

  try {
    return await resend.emails.send({
      from: `ReviewLift Contact <reviews@${EMAIL_DOMAIN}>`,
      to: "billy@reviewlift.app",
      reply_to: email,
      subject: `New enquiry from ${name} — ReviewLift`,
      html,
    });
  } catch (error) {
    console.error("Contact notification failed:", error);
    throw error;
  }
}

/**
 * Email template: Weekly digest (sent every Monday)
 */
async function sendWeeklyDigest(email, businessName, stats, recommendations, milestone) {
  const visits = stats.visits || 0;
  const positive = stats.positive || 0;
  const negative = stats.negative || 0;
  const reviews = stats.reviews || 0;
  const avgRating = stats.rating_avg || 0;
  const conversionRate = visits ? Math.round((positive / visits) * 100) : 0;
  
  // Calculate week-over-week change
  const lastWeekVisits = stats.last_week_visits || 0;
  const visitsChange = visits - lastWeekVisits;
  const visitsTrend = visitsChange > 0 ? `↑ ${visitsChange}` : visitsChange < 0 ? `↓ ${Math.abs(visitsChange)}` : '→ same';
  
  const lastWeekPositive = stats.last_week_positive || 0;
  const positiveChange = positive - lastWeekPositive;
  const positiveTrend = positiveChange > 0 ? `↑ ${positiveChange}` : positiveChange < 0 ? `↓ ${Math.abs(positiveChange)}` : '→ same';
  
  // Build recommendations HTML
  let recommendationsHtml = '';
  if (recommendations && recommendations.length > 0) {
    recommendationsHtml = `
      <div style="margin: 24px 0; padding: 20px; background: rgba(200,169,110,0.08); border-radius: 12px;">
        <p style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #C8A96E;">✨ THIS WEEK'S RECOMMENDATIONS</p>
        ${recommendations.map(rec => `
          <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 16px;">${rec.icon}</span>
            <div style="flex: 1;">
              <p style="margin: 0; font-size: 13px; color: #EAE7DC;">${rec.text}</p>
              <a href="${rec.link}" style="font-size: 11px; color: #C8A96E;">${rec.action} →</a>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  // Milestone celebration
  let milestoneHtml = '';
  if (milestone) {
    milestoneHtml = `
      <div style="text-align: center; margin: 24px 0; padding: 24px; background: linear-gradient(135deg, rgba(200,169,110,0.1) 0%, rgba(200,169,110,0.02) 100%); border-radius: 16px;">
        <div style="font-size: 48px; margin-bottom: 8px;">🎉</div>
        <p style="margin: 0 0 4px; font-size: 18px; font-weight: 700; color: #C8A96E;">${milestone.message}</p>
        <p style="margin: 0; font-size: 12px; color: rgba(234,231,220,0.5);">You've reached ${milestone.count} Google reviews!</p>
      </div>
    `;
  }
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your weekly review report</title>
      <style>
        @media only screen and (max-width: 600px) {
          .container { width: 100% !important; }
          .inner-padding { padding: 24px !important; }
          .stats-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
        }
      </style>
    </head>
    <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A18;padding:32px 16px;">
        <tr>
          <td align="center">
            <table class="container" width="560" cellpadding="0" cellspacing="0" style="background:#242422;border-radius:20px;overflow:hidden;max-width:560px;width:100%;">
              
              <!-- Header -->
              <tr>
                <td style="background:#1A1A18;padding:24px 32px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="width:8px;height:8px;background:#C8A96E;border-radius:50%;"></td>
                      <td style="padding-left:10px;font-family:'Syne',Arial,sans-serif;font-size:20px;font-weight:800;color:#EAE7DC;">ReviewLift</td>
                    </tr>
                  </table>
                 </td>
               </tr>
              
              <!-- Hero -->
              <tr>
                <td class="inner-padding" style="padding:32px 32px 20px;">
                  <h2 style="margin:0 0 8px;font-size:24px;color:#EAE7DC;">Your weekly report, ${escapeHtml(businessName)}</h2>
                  <p style="margin:0;font-size:14px;color:rgba(234,231,220,0.45);">Here's how your reputation performed last week.</p>
                 </td>
               </tr>
              
              <!-- Stats Grid -->
              <tr>
                <td style="padding:0 32px;">
                  <div class="stats-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;">
                    <div style="background:#2E2E2B;border-radius:12px;padding:16px;text-align:center;">
                      <div style="font-size:28px;font-weight:800;color:#C8A96E;">${visits}</div>
                      <div style="font-size:11px;color:rgba(234,231,220,0.45);">Funnel visits</div>
                      <div style="font-size:10px;color:${visitsChange >= 0 ? '#6A9E7F' : '#D4897C'};">${visitsTrend} from last week</div>
                    </div>
                    <div style="background:#2E2E2B;border-radius:12px;padding:16px;text-align:center;">
                      <div style="font-size:28px;font-weight:800;color:#8EC9A8;">${positive}</div>
                      <div style="font-size:11px;color:rgba(234,231,220,0.45);">5-star ratings</div>
                      <div style="font-size:10px;color:${positiveChange >= 0 ? '#6A9E7F' : '#D4897C'};">${positiveTrend} from last week</div>
                    </div>
                    <div style="background:#2E2E2B;border-radius:12px;padding:16px;text-align:center;">
                      <div style="font-size:28px;font-weight:800;color:#D4897C;">${negative}</div>
                      <div style="font-size:11px;color:rgba(234,231,220,0.45);">Private feedback</div>
                    </div>
                    <div style="background:#2E2E2B;border-radius:12px;padding:16px;text-align:center;">
                      <div style="font-size:28px;font-weight:800;color:#C8A96E;">${reviews}</div>
                      <div style="font-size:11px;color:rgba(234,231,220,0.45);">Reviews collected</div>
                      <div style="font-size:10px;color:rgba(234,231,220,0.45);">${conversionRate}% conversion rate</div>
                    </div>
                  </div>
                 </td>
               </tr>
              
              <!-- Rating -->
              <tr>
                <td class="inner-padding" style="padding:20px 32px 0;">
                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                    <div>
                      <div style="font-size:12px;color:rgba(234,231,220,0.45);">Average rating</div>
                      <div style="font-size:32px;font-weight:800;color:#C8A96E;">${avgRating} ★</div>
                    </div>
                    <div>
                      <div style="font-size:12px;color:rgba(234,231,220,0.45);">Industry average</div>
                      <div style="font-size:16px;color:rgba(234,231,220,0.6);">4.6 ★</div>
                    </div>
                  </div>
                 </td>
               </tr>
              
              ${milestoneHtml}
              ${recommendationsHtml}
              
              <!-- CTA -->
              <tr>
                <td class="inner-padding" style="padding:20px 32px 32px;">
                  <a href="${process.env.BASE_URL}/for-business" style="display:block;background:#C8A96E;color:#1A1A18;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;">View full dashboard →</a>
                  <p style="margin:16px 0 0;font-size:11px;color:rgba(234,231,220,0.25);text-align:center;">
                    You're receiving this because you opted into weekly reports. 
                    <a href="${process.env.BASE_URL}/settings" style="color:rgba(200,169,110,0.5);">Unsubscribe here</a>
                  </p>
                 </td>
               </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
  
  try {
    return await resend.emails.send({
      from: `ReviewLift Reports <reports@${EMAIL_DOMAIN}>`,
      to: email,
      subject: `📊 Your weekly review report — ${businessName}`,
      html,
    });
  } catch (error) {
    console.error("Weekly digest email failed:", error);
    throw error;
  }
}

// Add to exports at the bottom


/**
 * Helper: Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  sendWelcomeEmail,
  sendAgencyWelcomeEmail,
  sendAlertEmail,
  sendMilestoneEmail,
  sendReviewRequestEmail,
  sendNFCShippingConfirmation,
  sendContactNotification,
  sendWeeklyDigest,  // ← ADD THIS
};

