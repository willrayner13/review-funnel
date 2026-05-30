const express = require("express");
const supabase = require("../config/database");
const twilioClient = require("../config/twilio");
const resend = require("../config/resend");
const { smsLimiter } = require("../middleware/rateLimit");
const { hasProAccess, normalisePhone } = require("../utils/helpers");
const { SMS_TRIAL_LIMIT, SMS_MONTHLY_LIMIT } = require("../utils/constants");

const router = express.Router();

// Send SMS
router.post("/send-sms", smsLimiter, async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const { phone } = req.body;
  const slug = req.session.slug;

  try {
    const { data } = await supabase.from("businesses").select("*").eq("slug", slug).single();

    if (!hasProAccess(data)) {
      return res.status(403).json({ error: "Pro plan required to send SMS." });
    }

    const now = new Date();
    const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
    const inTrial = trialEnd && now < trialEnd;

    let smsCount = 0;
    if (inTrial) {
      const { count } = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("business_slug", slug)
        .eq("event_type", "sms_sent");
      smsCount = count || 0;
      if (smsCount >= SMS_TRIAL_LIMIT) {
        return res.status(429).json({
          error: "You've reached the SMS limit for your trial. Upgrade to a paid Pro plan to continue sending review requests.",
          limit_reached: true,
        });
      }
    } else {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count } = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("business_slug", slug)
        .eq("event_type", "sms_sent")
        .gte("created_at", monthStart);
      smsCount = count || 0;
      if (smsCount >= SMS_MONTHLY_LIMIT) {
        return res.status(429).json({
          error: "You've sent a lot of review requests this month — get in touch at billy@reviewlift.app to discuss higher volume options.",
          limit_reached: true,
        });
      }
    }

    const normalisedPhone = normalisePhone(phone);
    if (!normalisedPhone.startsWith("+44")) {
      return res.status(400).json({
        error: "SMS is currently available for UK numbers only. We're working on international support.",
      });
    }

    const message = `Hi! Thanks for visiting ${data.name} today. We'd love to know how it went - takes 30 seconds: ${process.env.BASE_URL}/r/${slug}`;
    await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE,
      to: normalisedPhone,
      body: message,
    });

    await supabase.from("events").insert({
      business_slug: slug,
      event_type: "sms_sent",
      channel: "sms",
      sent_at: now.toISOString(),
      appointment_hour: now.getHours(),
      appointment_day: now.getDay(),
    });

    res.json({ success: true });
  } catch (err) {
    console.log("Twilio error:", err.code, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send email
router.post("/send-email", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const { email } = req.body;
  const slug = req.session.slug;

  try {
    const { data: business, error } = await supabase.from("businesses").select("*").eq("slug", slug).single();
    if (error || !business) return res.status(404).json({ error: "Business not found" });
    if (!hasProAccess(business)) return res.status(403).json({ error: "Pro plan required" });

    const reviewUrl = `${process.env.BASE_URL}/r/${slug}`;

    await resend.emails.send({
      from: `${business.name} <reviews@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
      to: email,
      subject: `How was your visit to ${business.name}?`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,Helvetica,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A18;padding:32px 16px;">
            <tr><td align="center">
              <table width="540" cellpadding="0" cellspacing="0" style="background:#242422;border-radius:12px;">
                <tr><td style="background:#1A1A18;padding:20px 32px;">
                  <table cellpadding="0" cellspacing="0"><tr><td style="width:8px;height:8px;background:#C8A96E;border-radius:50%;vertical-align:middle;"></td><td style="padding-left:8px;font-family:Arial,sans-serif;font-size:16px;font-weight:800;color:#EAE7DC;vertical-align:middle;">${business.name}</td></tr></table>
                </td>
                </tr>
                <tr><td style="padding:32px 32px 24px;">
                  <h2 style="margin:0 0 14px;font-size:20px;color:#EAE7DC;">How was your recent visit?</h2>
                  <p style="margin:0 0 24px;font-size:14px;color:rgba(234,231,220,0.55);line-height:1.65;">Thanks for coming in — we hope you had a great experience. It only takes 30 seconds.</p>
                  <a href="${reviewUrl}" style="display:inline-block;background:#C8A96E;color:#1A1A18;text-decoration:none;font-weight:bold;font-size:14px;padding:14px 32px;border-radius:8px;">Share how it went →</a>
                </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
      `,
    });

    const now = new Date();
    await supabase.from("events").insert({
      business_slug: slug,
      event_type: "email_sent",
      channel: "email",
      sent_at: now.toISOString(),
      appointment_hour: now.getHours(),
      appointment_day: now.getDay(),
    });

    res.json({ success: true });
  } catch (err) {
    console.log("Email error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Auto review SMS (webhook endpoint)
router.post("/auto-review", async (req, res) => {
  const { phone, slug } = req.body;
  const { data } = await supabase.from("businesses").select("*").eq("slug", slug).single();
  if (!data) return res.status(404).json({ error: "Business not found" });

  const message = `Thanks for visiting ${data.name}! We'd love to hear how it went — takes 30 seconds: ${process.env.BASE_URL}/r/${slug}`;
  await twilioClient.messages.create({
    from: process.env.TWILIO_PHONE,
    to: normalisePhone(phone),
    body: message,
  });
  res.json({ success: true });
});

module.exports = router;