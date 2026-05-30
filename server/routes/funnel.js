const express = require("express");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const supabase = require("../config/database");
const { escapeJS } = require("../utils/helpers");

const router = express.Router();

// QR Download
router.get("/qr-download/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });
  const url = `${process.env.BASE_URL}/r/${req.params.slug}`;
  const qr = await QRCode.toBuffer(url);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", "attachment; filename=review-qr.png");
  res.send(qr);
});

// Review funnel page
router.get("/r/:business", async (req, res) => {
  let slug = req.params.business;

  const host = req.get("host");
  if (host && host !== process.env.BASE_URL?.replace("https://", "")) {
    const { data: domainMatch } = await supabase
      .from("businesses")
      .select("slug")
      .eq("funnel_custom_domain", host)
      .single();
    if (domainMatch) {
      slug = domainMatch.slug;
    }
  }

  const { data, error } = await supabase.from("businesses").select("*").eq("slug", slug).single();
  if (error || !data) return res.status(404).send("Business not found");

  await supabase.from("events").insert({ business_slug: slug, event_type: "visit" });

  const pagePath = path.join(__dirname, "../../public", "index.html");
  let page = fs.readFileSync(pagePath, "utf8");

  let headline = data.funnel_headline || `How was your experience at ${data.name}?`;
  let happyLabel = data.funnel_happy_label || "Great experience!";
  let unhappyLabel = data.funnel_unhappy_label || "Could be better";
  let thankyouMessage = data.funnel_thankyou_message || "Thank you for your feedback — it means a lot to us.";

  if (data.funnel_language && data.funnel_language !== "en") {
    headline = data.funnel_translated_headline || headline;
    happyLabel = data.funnel_translated_happy_label || happyLabel;
    unhappyLabel = data.funnel_translated_unhappy_label || unhappyLabel;
    thankyouMessage = data.funnel_translated_thankyou_message || thankyouMessage;
  }

  res.send(`
    <html>
    <title>${escapeJS(data.name)} — Share your experience</title>
      <script>
        window.businessName        = "${escapeJS(data.name)}";
        window.slug                = "${escapeJS(slug)}";
        window.reviewLink          = "${escapeJS(data.review_link || "")}";
        window.industry            = "${escapeJS(data.industry || "local business")}";
        window.service             = "${escapeJS(req.query.service || "")}";
        window.funnelTemplate      = "${escapeJS(data.funnel_template || "classic")}";
        window.funnelLogoUrl       = "${escapeJS(data.funnel_logo_url || "")}";
        window.funnelAccentColor   = "${escapeJS(data.funnel_accent_color || "#C8A96E")}";
        window.funnelHeadline      = "${escapeJS(headline)}";
        window.funnelHappyLabel    = "${escapeJS(happyLabel)}";
        window.funnelUnhappyLabel  = "${escapeJS(unhappyLabel)}";
        window.funnelThankyouMessage = "${escapeJS(thankyouMessage)}";
        window.funnelLanguage      = "${escapeJS(data.funnel_language || "en")}";
      </script>
      ${page}
    </html>
  `);
});

// Update funnel settings
router.post("/update-funnel", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const {
    funnel_template,
    funnel_logo_url,
    funnel_accent_color,
    funnel_headline,
    funnel_happy_label,
    funnel_unhappy_label,
    funnel_thankyou_message,
    funnel_custom_domain,
    funnel_language,
  } = req.body;

  const slug = req.session.slug;

  const { data: business } = await supabase
    .from("businesses")
    .select("plan_type, subscription_active, name")
    .eq("slug", slug)
    .single();

  const isProOrAgency = business?.subscription_active && (business?.plan_type === "pro" || business?.plan_type === "agency");
  const isAgency = business?.plan_type === "agency";

  if (funnel_language && funnel_language !== "en" && !isProOrAgency) {
    return res.status(403).json({ error: "Language translation requires Pro or Agency plan" });
  }

  if (funnel_custom_domain && !isAgency) {
    return res.status(403).json({ error: "Custom domains require Agency plan" });
  }

  const updateData = {};
  if (funnel_template !== undefined) updateData.funnel_template = funnel_template;
  if (funnel_logo_url !== undefined) updateData.funnel_logo_url = funnel_logo_url;
  if (funnel_accent_color !== undefined) updateData.funnel_accent_color = funnel_accent_color;
  if (funnel_headline !== undefined) updateData.funnel_headline = funnel_headline;
  if (funnel_happy_label !== undefined) updateData.funnel_happy_label = funnel_happy_label;
  if (funnel_unhappy_label !== undefined) updateData.funnel_unhappy_label = funnel_unhappy_label;
  if (funnel_thankyou_message !== undefined) updateData.funnel_thankyou_message = funnel_thankyou_message;
  if (funnel_custom_domain !== undefined && isAgency) updateData.funnel_custom_domain = funnel_custom_domain;
  if (funnel_language !== undefined && isProOrAgency) updateData.funnel_language = funnel_language;

  // Clear translations if switching to English
  if (funnel_language === "en" || (!funnel_language && business?.funnel_language !== "en")) {
    updateData.funnel_translated_headline = null;
    updateData.funnel_translated_happy_label = null;
    updateData.funnel_translated_unhappy_label = null;
    updateData.funnel_translated_thankyou_message = null;
  }

  const { error } = await supabase.from("businesses").update(updateData).eq("slug", slug);
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

module.exports = router;