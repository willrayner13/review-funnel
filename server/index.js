require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const session = require("express-session");
const path = require("path");

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

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.set("trust proxy", 1);
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../public"), { index: false }));

// Session store
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

// ─── ROUTES ────────────────────────────────────────────────────────────────────
app.use(webhookRoutes); // Must come before bodyParser.json() for raw body
app.use(htmlRoutes);
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
  // Import and handle dynamically to avoid circular dependencies
  const campaignsRouter = require("./routes/campaigns");
  const routerLayer = campaignsRouter.stack.find(layer => 
    layer.route && layer.route.path === "/send-sms"
  );
  
  if (routerLayer) {
    // Forward to the campaigns router
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

  // Prepare metrics for pdfService
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

  // Generate PDF using service
  const doc = pdfService.generateMonthlyReport(business, metrics, recentFeedback);
  
  // Set response headers
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${(business.agency_name || business.name).replace(/\s/g, "-")}-Report-${now.toISOString().slice(0, 7)}.pdf`
  );
  
  // Pipe the PDF to the response
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
  // Check if the request is for an API endpoint
  if (req.path.startsWith("/api/") || req.path.startsWith("/cron/")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  // For HTML pages, try to serve the 404 page or redirect to home
  res.status(404).sendFile(path.join(__dirname, "../public", "404.html"), (err) => {
    if (err) res.status(404).send("Page not found");
  });
});

// ─── SERVERLESS EXPORT ────────────────────────────────────────────────────────
const serverless = require("serverless-http");
module.exports = app;
module.exports.handler = serverless(app);