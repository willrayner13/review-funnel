const express = require("express");
const multer = require("multer");
const supabase = require("../config/database");
const resend = require("../config/resend");
const twilioClient = require("../config/twilio");
const openai = require("../config/openai");
const { normalisePhone, hasProAccess } = require("../utils/helpers");
const { MILESTONES } = require("../utils/constants");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Positive event
router.post("/positive", async (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const { data: bizCheck } = await supabase.from("businesses").select("slug").eq("slug", slug).single();
  if (!bizCheck) return res.status(404).json({ error: "Business not found" });

  const { error } = await supabase.from("events").insert({ business_slug: slug, event_type: "positive" });
  if (error) return res.status(500).json(error);

  // ─── MILESTONE CHECK ──────────────────────────────────────────────
  try {
    // Count total positive events
    const { count, error: countError } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("business_slug", slug)
      .eq("event_type", "positive");
    
    if (!countError && count) {
      const milestones = [10, 25, 50, 100, 250, 500];
      const matchedMilestone = milestones.find(m => m === count);
      
      if (matchedMilestone) {
        // Get business data
        const { data: business } = await supabase
          .from("businesses")
          .select("name, email, last_milestone_sent, review_link, plan_type")
          .eq("slug", slug)
          .single();
        
        if (business && matchedMilestone > (business.last_milestone_sent || 0)) {
          // Generate AI congratulation message
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { 
                role: "system", 
                content: "You write short, celebratory messages for small business owners who have just hit a Google review milestone. Enthusiastic but genuine. 2 sentences max. Never use exclamation marks excessively." 
              },
              { 
                role: "user", 
                content: `${business.name} just collected their ${matchedMilestone}th Google review using ReviewLift. Write a congratulations message for the business owner.` 
              }
            ],
            temperature: 0.7,
            max_tokens: 80
          });
          
          const congratsMessage = completion.choices[0].message.content.trim();
          
          // Generate milestone page URL
          const milestoneUrl = `${process.env.BASE_URL}/milestone/${slug}/${matchedMilestone}`;
          
          // Define URLs for email
          const funnelUrl = `${process.env.BASE_URL}/r/${slug}`;
          const dashboardUrl = `${process.env.BASE_URL}/for-business`;
          
          // Send celebration email via Resend
          await resend.emails.send({
            from: `ReviewLift <reviews@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
            to: business.email,
            subject: `🎉 Congratulations! ${matchedMilestone} Google reviews — ${business.name}`,
            html: `
              <!DOCTYPE html>
              <html>
              <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
              <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,Helvetica,sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A18;padding:32px 16px;">
                  <tr><td align="center">
                    <table width="540" cellpadding="0" cellspacing="0" style="background:#242422;border-radius:12px;overflow:hidden;max-width:540px;width:100%;">
                      <tr><td style="background:#1A1A18;padding:20px 32px;">
                        <table cellpadding="0" cellspacing="0"><tr><td style="width:8px;height:8px;background:#C8A96E;border-radius:50%;vertical-align:middle;"></td>
                        <td style="padding-left:8px;font-family:Arial,sans-serif;font-size:16px;font-weight:800;color:#EAE7DC;vertical-align:middle;letter-spacing:-0.3px;">ReviewLift</td></tr></table>
                      </td></tr>
                      <tr><td style="padding:32px 32px 24px;">
                        <h2 style="margin:0 0 16px;font-size:20px;color:#EAE7DC;">${congratsMessage}</h2>
                        <p style="margin:0 0 16px;font-size:14px;color:rgba(234,231,220,0.55);line-height:1.6;">You've collected ${matchedMilestone} Google reviews using ReviewLift.</p>
                        <div style="background:#1A1A18;border:1px solid rgba(200,169,110,0.25);border-radius:10px;padding:16px 20px;text-align:center;margin:20px 0;">
                          <p style="margin:0 0 8px;font-size:12px;color:rgba(234,231,220,0.4);">Share your milestone</p>
                          <p style="margin:0 0 12px;font-family:'Courier New',monospace;font-size:13px;color:#C8A96E;word-break:break-all;">${milestoneUrl}</p>
                        </div>
                        <div style="margin-top:24px;">
                          <a href="${dashboardUrl}" style="display:inline-block;background:#C8A96E;color:#1A1A18;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Go to your dashboard →</a>
                        </div>
                      </td></tr>
                      <tr><td style="padding:16px 32px 20px;border-top:1px solid rgba(234,231,220,0.06);text-align:center;">
                        <p style="margin:0;font-size:11px;color:rgba(234,231,220,0.25);line-height:1.6;">ReviewLift · The review system that runs itself · <a href="https://reviewlift.app" style="color:rgba(200,169,110,0.5);text-decoration:none;">reviewlift.app</a></p>
                      </td></tr>
                    </table>
                   </td></tr>
                </table>
              </body>
              </html>
            `,
          });
          
          // Update last_milestone_sent
          await supabase
            .from("businesses")
            .update({ last_milestone_sent: matchedMilestone })
            .eq("slug", slug);
        }
      }
    }
  } catch (milestoneErr) {
    console.error("Milestone error (non-fatal):", milestoneErr.message);
  }
  
  res.json({ success: true });
});

// Rating event
router.post("/rating", async (req, res) => {
  const { slug, rating } = req.body;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const { data: bizCheck } = await supabase.from("businesses").select("slug").eq("slug", slug).single();
  if (!bizCheck) return res.status(404).json({ error: "Business not found" });

  const { error } = await supabase.from("events").insert({ business_slug: slug, event_type: "rating", rating });
  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

// Review click
router.post("/review-click", async (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const { data: bizCheck } = await supabase.from("businesses").select("slug").eq("slug", slug).single();
  if (!bizCheck) return res.status(404).json({ error: "Business not found" });

  const { error } = await supabase.from("events").insert({ business_slug: slug, event_type: "review_click" });
  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

// Feedback (negative)
router.post("/feedback", async (req, res) => {
  const { business, message } = req.body;
  if (!business) return res.status(400).json({ error: "Missing slug" });

  const { data: bizCheck } = await supabase.from("businesses").select("slug").eq("slug", business).single();
  if (!bizCheck) return res.status(404).json({ error: "Business not found" });

  const { error } = await supabase.from("events").insert({ business_slug: business, event_type: "negative", message });
  if (error) return res.status(500).json(error);

  // Send alerts
  try {
    const { data: businessData } = await supabase
      .from("businesses")
      .select("name, email, alert_enabled, alert_phone")
      .eq("slug", business)
      .single();

    if (businessData && businessData.alert_enabled) {
      const shortMessage = message.length > 200 ? message.substring(0, 197) + "..." : message;
      const businessName = businessData.name || "a customer";
      const dashboardUrl = `${process.env.BASE_URL}/for-business`;

      // Send email alert
      try {
        await resend.emails.send({
          from: `ReviewLift Alerts <alerts@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
          to: businessData.email,
          subject: `⚠️ New complaint received — ${businessName}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"></head>
            <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,sans-serif;">
              <div style="max-width:540px;margin:0 auto;background:#242422;border-radius:12px;padding:32px;">
                <h2 style="color:#D4897C;margin:0 0 8px;">New complaint received</h2>
                <p style="color:rgba(234,231,220,0.55);">${businessName} left private feedback:</p>
                <div style="background:#1A1A18;border-left:3px solid #D4897C;border-radius:8px;padding:16px;margin:16px 0;">
                  <p style="margin:0;color:#EAE7DC;">"${shortMessage.replace(/"/g, '&quot;')}"</p>
                </div>
                <p style="color:rgba(234,231,220,0.4);font-size:12px;">This complaint was captured privately — it never reached Google.</p>
                <a href="${dashboardUrl}" style="display:inline-block;background:#C8A96E;color:#1A1A18;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">View in dashboard →</a>
              </div>
            </body>
            </html>
          `,
        });
      } catch (emailAlertErr) {
        console.error("Alert email failed:", emailAlertErr.message);
      }

      // Send SMS alert
      if (businessData.alert_phone) {
        const normalisedPhone = normalisePhone(businessData.alert_phone);
        const alertText = `⚠️ COMPLAINT from ${businessName}: "${message.substring(0, 97)}..."\n\nLog in to respond: ${process.env.BASE_URL}/for-business`;

        if (normalisedPhone.startsWith("+44")) {
          try {
            await twilioClient.messages.create({
              from: process.env.TWILIO_PHONE,
              to: normalisedPhone,
              body: alertText,
            });
          } catch (smsErr) {
            console.error("Alert SMS failed:", smsErr.message);
          }
        }
      }
    }
  } catch (alertErr) {
    console.error("Alert failed (non-fatal):", alertErr.message);
  }

  res.json({ success: true });
});

// Review growth
router.get("/review-growth/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });

  const { data } = await supabase
    .from("events")
    .select("created_at")
    .eq("business_slug", req.params.slug)
    .eq("event_type", "review_click");

  const months = {};
  (data || []).forEach((e) => {
    const month = new Date(e.created_at).toISOString().slice(0, 7);
    months[month] = (months[month] || 0) + 1;
  });
  res.json(months);
});

// Voice transcription
router.post("/transcribe-voice/:slug", upload.single("audio"), async (req, res) => {
  const { slug } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("plan_type, subscription_active, name, industry")
      .eq("slug", slug)
      .single();

    if (!business) return res.status(404).json({ error: "Business not found" });

    const isProOrAgency = business.subscription_active && (business.plan_type === "pro" || business.plan_type === "agency");
    if (!isProOrAgency) {
      return res.status(403).json({ error: "Pro or Agency plan required" });
    }

    // Send to Whisper
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: new File([req.file.buffer], "audio.webm", { type: req.file.mimetype }),
      language: "en",
      prompt: `This is a customer leaving feedback for ${business.name}, a ${business.industry || 'local'} business. They are speaking casually.`
    });
    
    const text = transcription.text.trim();
    
    if (!text || text.length < 2) {
      return res.json({ 
        sentiment: "unclear", 
        transcription: "(could not understand audio)",
        message: "Please try again"
      });
    }
    
    // Detailed sentiment analysis with business context
    const sentiment = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: `You are analysing customer feedback for ${business.name}, a ${business.industry || 'local'} business. 
          
Classify the sentiment as one of: "very_positive", "positive", "neutral", "negative", "very_negative".

Rules:
- "very_positive": enthusiastic praise, mentions specific good things, says they'll return/recommend
- "positive": generally happy, satisfied, says things were good
- "neutral": mixed or matter-of-fact with no strong emotion either way
- "negative": clearly unhappy, complaining, mentions specific problems
- "very_negative": angry, outraged, says they'll never return, warns others

Reply with JSON only: { "sentiment": "positive", "confidence": "high", "reasoning": "brief explanation in 10 words or less" }`
        },
        { 
          role: "user", 
          content: `Customer said: "${text}"`
        }
      ],
      max_tokens: 150,
      temperature: 0
    });
    
    let result;
    try {
      const cleaned = sentiment.choices[0].message.content.replace(/```json|```/g, '').trim();
      result = JSON.parse(cleaned);
    } catch(e) {
      // Fallback: simple keyword check
      const lowerText = text.toLowerCase();
      const positiveWords = ['great', 'good', 'love', 'excellent', 'happy', 'brilliant', 'fantastic', 'amazing'];
      const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'poor', 'disappointed', 'unhappy', 'rubbish'];
      
      const posCount = positiveWords.filter(w => lowerText.includes(w)).length;
      const negCount = negativeWords.filter(w => lowerText.includes(w)).length;
      
      const isPositive = posCount > negCount;
      result = {
        sentiment: isPositive ? "positive" : "negative",
        confidence: "low",
        reasoning: "Fallback keyword analysis"
      };
    }
    
    const isNegative = result.sentiment === "negative" || result.sentiment === "very_negative";
    
    if (isNegative) {
      // Store as private feedback
      await supabase.from("events").insert({
        business_slug: slug,
        event_type: "negative",
        message: `[Voice note] ${text}`,
        created_at: new Date().toISOString()
      });
      
      return res.json({ 
        sentiment: "negative", 
        transcription: text,
        message: "Feedback saved privately"
      });
    }
    
    // Positive, very_positive, or neutral — send to Google
    res.json({ 
      sentiment: "positive", 
      transcription: text,
      message: "Ready to post as a review"
    });
    
  } catch (err) {
    console.error("Voice transcription error:", err.message);
    res.status(500).json({ error: "Could not transcribe. Please try again." });
  }
});

module.exports = router;