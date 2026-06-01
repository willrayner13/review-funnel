require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const fs = require("fs");

// ─── SERVICES ───────────────────────────────────────────────────────────────────
const emailService = require("./services/emailService");
const smsService = require("./services/smsService");
const aiService = require("./services/aiService");
const pdfService = require("./services/pdfService");

// Config
const supabase = require("./config/database");

// Middleware
const SupabaseSessionStore = require("./middleware/sessionStore");

// Routes
const htmlRoutes = require("./routes/html");
const authRoutes = require("./routes/auth");
const businessRoutes = require("./routes/business");
const funnelRoutes = require("./routes/funnel");
const eventsRoutes = require("./routes/events");
const billingRoutes = require("./routes/billing");
const campaignsRoutes = require("./routes/campaigns");
const aiRoutes = require("./routes/ai");
const agencyRoutes = require("./routes/agency");
const webhookRoutes = require("./routes/webhooks");
const nfcRoutes = require("./routes/nfc");
const affiliateRoutes = require("./routes/affiliate");
const publicRoutes = require("./routes/public");

// Cron jobs
const runReputationScores = require("./cron/reputation-scores");
const markConversions = require("./cron/mark-conversions");

const app = express();

// ─── HELPER FUNCTION FOR ESCAPING ──────────────────────────────────────────────
function escapeJS(str) {
  if (!str) return '';
return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')   // ← add the dot
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.set("trust proxy", 1);
app.use(cors());

// Add this right after app.set("trust proxy", 1)
// BEFORE any other routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "landing.html"));
});

// Webhook MUST come before bodyParser.json() - THIS IS CRITICAL
app.use("/stripe-webhook", webhookRoutes);

// THEN bodyParser for all other routes
app.use(bodyParser.json());

// Session store AFTER bodyParser
app.use(
  session({
    store: new SupabaseSessionStore(),
    secret: process.env.SESSION_SECRET || "supersecretkey-change-this",
    resave: false,
    saveUninitialized: false,
    name: "rl_sid",
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── REVIEW FUNNEL ROUTE (must come before other routes) ───────────────────────
app.get("/r/:business", async (req, res) => {
  let slug = req.params.business;
  
  // Check if this is a custom domain request
  const host = req.get('host');
  if (host && host !== process.env.BASE_URL?.replace('https://', '')) {
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

  // Record visit event
  await supabase.from("events").insert({ business_slug: slug, event_type: "visit" });

  // Get translated content if language is set
  let headline = data.funnel_headline || `How was your experience at ${data.name}?`;
  let happyLabel = data.funnel_happy_label || 'Great experience!';
  let unhappyLabel = data.funnel_unhappy_label || 'Could be better';
  let thankyouMessage = data.funnel_thankyou_message || 'Thank you for your feedback — it means a lot to us.';
  
  if (data.funnel_language && data.funnel_language !== 'en') {
    headline = data.funnel_translated_headline || headline;
    happyLabel = data.funnel_translated_happy_label || happyLabel;
    unhappyLabel = data.funnel_translated_unhappy_label || unhappyLabel;
    thankyouMessage = data.funnel_translated_thankyou_message || thankyouMessage;
  }

  // Read the funnel loader HTML template
  const loaderPath = path.join(__dirname, "../public", "funnel-loader-template.html");
  let loaderHtml = fs.readFileSync(loaderPath, "utf8");
  
  // Inject business data into the page
  const injectedHtml = loaderHtml.replace('</body>', `
    <script>
      window.serverSlug = "${escapeJS(slug)}";
      window.serverBusinessName = "${escapeJS(data.name)}";
      window.serverReviewLink = "${escapeJS(data.review_link || '')}";
      window.serverFunnelTemplate = "${escapeJS(data.funnel_template || 'classic')}";
      window.serverFunnelAccentColor = "${escapeJS(data.funnel_accent_color || '#C8A96E')}";
      window.serverFunnelLogoUrl = "${escapeJS(data.funnel_logo_url || '')}";
      window.serverFunnelHeadline = "${escapeJS(headline)}";
      window.serverFunnelHappyLabel = "${escapeJS(happyLabel)}";
      window.serverFunnelUnhappyLabel = "${escapeJS(unhappyLabel)}";
      window.serverFunnelThankyouMessage = "${escapeJS(thankyouMessage)}";
      window.isLapsed = ${!data.subscription_active};
    </script>
  </body>`);
  
  res.send(injectedHtml);
});

// ─── ROUTES ────────────────────────────────────────────────────────────────────
// Webhook must come before bodyParser.json()
app.use(authRoutes);
app.use(businessRoutes);
app.use(funnelRoutes);
app.use(eventsRoutes);
app.use(billingRoutes);
app.use(campaignsRoutes);
app.use(aiRoutes);
app.use(agencyRoutes);
app.use(nfcRoutes);
app.use(affiliateRoutes);
app.use(publicRoutes);

app.use("/css", express.static(path.join(__dirname, "../public/css")));
app.use("/js", express.static(path.join(__dirname, "../public/js")));
app.use("/images", express.static(path.join(__dirname, "../public/images")));
app.use("/components", express.static(path.join(__dirname, "../public/components")));
app.use("/blog", express.static(path.join(__dirname, "../public/blog")));
app.use("/funnel", express.static(path.join(__dirname, "../public/funnel")));
app.use(express.static(path.join(__dirname, "../public")));

// ─── CRON ENDPOINTS (for Vercel cron jobs) ────────────────────────────────────
app.get("/cron/reputation-scores", async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const result = await runReputationScores();
  res.json(result);
});

app.get("/cron/mark-conversions", async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const result = await markConversions();
  res.json(result);
});

// ─── API WEBHOOKS ──────────────────────────────────────────────────────────────
app.post("/api/hook/:slug", async (req, res) => {
  const campaignsRouter = require("./routes/campaigns");
  const routerLayer = campaignsRouter.stack.find(layer => 
    layer.route && layer.route.path === "/send-sms"
  );
  
  if (routerLayer) {
    campaignsRouter(req, res);
  } else {
    res.status(404).json({ error: "Webhook endpoint not found" });
  }
});

app.post("/api/invoice-hook/:slug", async (req, res) => {
  const campaignsRouter = require("./routes/campaigns");
  campaignsRouter(req, res);
});

// ─── PDF REPORT (Agency only) - Using pdfService ───────────────────────────────
app.get("/report/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });

  const { data: business } = await supabase
    .from("businesses")
    .select("name, plan_type, subscription_active, agency_name, agency_logo_url, industry")
    .eq("slug", req.params.slug)
    .single();

  if (!business || business.plan_type !== "agency") {
    return res.status(403).json({ error: "Agency plan required" });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const { data: events } = await supabase
    .from("events")
    .select("event_type, rating, message, created_at")
    .eq("business_slug", req.params.slug)
    .order("created_at", { ascending: false });

  const thisMonthEvents = (events || []).filter((e) => e.created_at >= monthStart);
  const lastMonthEvents = (events || []).filter((e) => e.created_at >= lastMonthStart && e.created_at < monthStart);

  const thisPos = thisMonthEvents.filter((e) => e.event_type === "positive").length;
  const thisNeg = thisMonthEvents.filter((e) => e.event_type === "negative").length;
  const thisClicks = thisMonthEvents.filter((e) => e.event_type === "review_click").length;
  const lastPos = lastMonthEvents.filter((e) => e.event_type === "positive").length;
  const totalVisits = (events || []).filter((e) => e.event_type === "visit").length;

  const ratings = thisMonthEvents.filter((e) => e.rating).map((e) => e.rating);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "N/A";
  const recentFeedback = thisMonthEvents.filter((e) => e.event_type === "negative" && e.message).slice(0, 4);

  const metrics = {
    reviewsCollected: thisPos,
    feedbackCaptured: thisNeg,
    reviewClicks: thisClicks,
    totalVisits: totalVisits,
    avgRating: avgRating,
    lastMonthReviews: lastPos,
    trend: thisPos - lastPos >= 0 ? `+${thisPos - lastPos}` : `${thisPos - lastPos}`,
    isPositiveTrend: thisPos >= lastPos,
  };

  const doc = pdfService.generateMonthlyReport(business, metrics, recentFeedback);
  
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${(business.agency_name || business.name).replace(/\s/g, "-")}-Report-${now.toISOString().slice(0, 7)}.pdf`
  );
  
  doc.pipe(res);
  doc.end();
});

// ─── LAPSED REDIRECT ──────────────────────────────────────────────────────────
app.get("/lapsed-redirect/:slug", async (req, res) => {
  const { slug } = req.params;
  res.redirect(`/lapsed?slug=${slug}`);
});

// ─── 404 HANDLER (catch-all for unmatched routes) ─────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/cron/")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  res.status(404).sendFile(path.join(__dirname, "../public", "404.html"), (err) => {
    if (err) res.status(404).send("Page not found");
  });
});

// ─── SERVERLESS EXPORT ────────────────────────────────────────────────────────
const serverless = require("serverless-http");
module.exports = app;
module.exports.handler = serverless(app);