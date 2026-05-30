const express = require("express");
const supabase = require("../config/database");
const emailService = require("../services/emailService");
const smsService = require("../services/smsService");
const { smsLimiter } = require("../middleware/rateLimit");
const { hasProAccess } = require("../utils/helpers");
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

    const funnelUrl = `${process.env.BASE_URL}/r/${slug}`;
    await smsService.sendReviewRequestSMS(phone, data.name, funnelUrl);

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
    console.log("SMS error:", err.code, err.message);
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

    await emailService.sendReviewRequestEmail(business.name, business.email, email, reviewUrl);

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

  const funnelUrl = `${process.env.BASE_URL}/r/${slug}`;
  await smsService.sendReviewRequestSMS(phone, data.name, funnelUrl);
  res.json({ success: true });
});

// Webhook for automated review request
router.post("/api/hook/:slug", async (req, res) => {
  const { slug } = req.params;
  const { customer_name, customer_phone, service, staff_name, appointment_time } = req.body;

  if (!customer_name || !customer_phone) {
    return res.status(400).json({ error: "customer_name and customer_phone are required" });
  }

  try {
    const { data: business, error } = await supabase
      .from("businesses")
      .select("name, industry, plan_type, review_link")
      .eq("slug", slug)
      .single();

    if (error || !business) {
      return res.status(404).json({ error: "Business not found" });
    }

    if (business.plan_type !== "pro" && business.plan_type !== "agency") {
      return res.status(403).json({
        error: "Webhook access requires Pro or Agency plan. Upgrade at /billing",
      });
    }

    const funnelUrl = `${process.env.BASE_URL}/r/${slug}`;

    // Generate personalised message using AI service
    let message = await aiService.generatePersonalisedRequest(
      business.name,
      business.industry || "local service",
      customer_name,
      service || "their appointment",
      staff_name || null
    );

    message = message.replace("[LINK]", funnelUrl);

    if (message.length > 160) {
      message = message.substring(0, 157) + "...";
    }

    await smsService.sendSMS(customer_phone, message);

    const hookNow = new Date();
    const apptDate = appointment_time ? new Date(appointment_time) : hookNow;
    await supabase.from("events").insert({
      business_slug: slug,
      event_type: "sms_sent",
      channel: "sms",
      sent_at: hookNow.toISOString(),
      appointment_hour: apptDate.getHours(),
      appointment_day: apptDate.getDay(),
      service_type: service || null,
      message: `Webhook: ${service || "appointment"} for ${customer_name}`,
      created_at: hookNow.toISOString(),
    });

    res.json({ success: true, message });
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).json({ error: "Could not send review request. Please check your webhook configuration." });
  }
});

// Invoice webhook
router.post("/api/invoice-hook/:slug", async (req, res) => {
  const { slug } = req.params;
  const { customer_name, customer_email, invoice_number, total_amount, status } = req.body;

  if (!customer_email || !customer_name) {
    return res.status(400).json({ error: "customer_name and customer_email are required" });
  }

  if (!status || status.toLowerCase() !== "paid") {
    return res.status(200).json({ skipped: true, reason: "Not a paid invoice" });
  }

  try {
    const { data: business, error } = await supabase
      .from("businesses")
      .select("name, review_link, plan_type, subscription_active")
      .eq("slug", slug)
      .single();

    if (error || !business) return res.status(404).json({ error: "Business not found" });

    const isProOrAgency = business.subscription_active && (business.plan_type === "pro" || business.plan_type === "agency");
    if (!isProOrAgency) {
      return res.status(403).json({ error: "Pro or Agency plan required" });
    }

    const QRCode = require("qrcode");
    const qrBuffer = await QRCode.toBuffer(business.review_link);
    const qrBase64 = qrBuffer.toString("base64");

    // Send invoice email with QR code using email service (would need to extend emailService)
    // For now, using inline email with QR code
    const resend = require("../config/resend");
    await resend.emails.send({
      from: `Reviews <reviews@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
      to: customer_email,
      subject: `Thank you for your payment, ${customer_name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
          <h2>Thank you, ${customer_name}.</h2>
          <p>We've received your payment${invoice_number ? ' for invoice ' + invoice_number : ''}${total_amount ? ' (' + total_amount + ')' : ''}.</p>
          <p>If we did a great job, we'd love a quick review — it only takes 30 seconds.</p>
          <div style="text-align:center;margin:20px 0;">
            <img src="data:image/png;base64,${qrBase64}" alt="QR Code" style="width:120px;height:120px;">
          </div>
          <a href="${business.review_link}" style="display:block;background:#C8A96E;color:#1A1A18;text-align:center;padding:12px;border-radius:8px;text-decoration:none;">Leave a review →</a>
        </div>
      `,
    });

    await supabase.from("events").insert({
      business_slug: slug,
      event_type: "invoice_email_sent",
      message: `Invoice ${invoice_number || "N/A"} for ${customer_name}`,
      created_at: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Invoice hook error:", err.message);
    res.status(500).json({ error: "Could not send invoice email." });
  }
});

module.exports = router;