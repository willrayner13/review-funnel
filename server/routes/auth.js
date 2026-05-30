const express = require("express");
const bcrypt = require("bcrypt");
const supabase = require("../config/database");
const resend = require("../config/resend");
const { authLimiter, forgotLimiter } = require("../middleware/rateLimit");

const router = express.Router();

// Verify login
router.post("/verify-login", authLimiter, async (req, res) => {
  const { email, password } = req.body;
  const { data } = await supabase.from("businesses").select("*").eq("email", email).single();
  if (!data) return res.json({ success: false });

  const valid = await bcrypt.compare(password, data.password);
  if (!valid) return res.json({ success: false });

  req.session.slug = data.slug;
  req.session.save();

  res.json({ success: true, slug: data.slug, subscription_active: data.subscription_active });
});

// Get session
router.get("/session", (req, res) => {
  if (!req.session.slug) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, slug: req.session.slug });
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// Forgot password
router.post("/forgot-password", forgotLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: true });

  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("email, name")
      .eq("email", email)
      .single();

    if (business) {
      await resend.emails.send({
        from: `ReviewLift <reviews@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
        to: email,
        subject: "Reset your ReviewLift password",
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="UTF-8"></head>
          <body style="margin:0;padding:0;background:#1A1A18;font-family:Arial,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A18;padding:32px 16px;">
              <tr><td align="center">
                <table width="500" cellpadding="0" cellspacing="0" style="background:#242422;border-radius:12px;">
                  <tr><td style="background:#1E1E1C;padding:22px 32px;">
                    <p style="margin:0;font-size:16px;font-weight:bold;color:#C8A96E;">⭐ ReviewLift</p>
                  </td></tr>
                  <tr><td style="padding:32px;">
                    <h2 style="color:#EAE7DC;margin:0 0 16px;">Password reset request</h2>
                    <p style="color:rgba(234,231,220,0.55);margin-bottom:16px;">Hi ${business.name || "there"},</p>
                    <p style="color:rgba(234,231,220,0.55);margin-bottom:24px;">Someone requested a password reset for your ReviewLift account. If this was you, reply to this email and we'll sort it manually within a few hours.</p>
                    <div style="background:#1A1A18;border:1px solid rgba(200,169,110,0.25);border-radius:8px;padding:16px;margin-bottom:24px;">
                      <p style="margin:0;font-size:12px;color:rgba(234,231,220,0.35);">Simply reply to this email with:</p>
                      <p style="margin:8px 0 0;font-family:monospace;font-size:12px;color:#C8A96E;">"I need to reset my password"</p>
                    </div>
                    <p style="color:rgba(234,231,220,0.4);font-size:12px;margin-bottom:8px;">If you didn't request this, you can safely ignore this email.</p>
                    <p style="color:rgba(234,231,220,0.3);font-size:11px;">— The ReviewLift team</p>
                  </td></td>
                  <tr><td style="padding:16px 32px 20px;border-top:1px solid rgba(234,231,220,0.06);text-align:center;">
                    <p style="margin:0;font-size:11px;color:rgba(234,231,220,0.25);">ReviewLift · The review system that runs itself · <a href="https://reviewlift.app" style="color:rgba(200,169,110,0.5);text-decoration:none;">reviewlift.app</a></p>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </body>
          </html>
        `,
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.json({ success: true });
  }
});

module.exports = router;