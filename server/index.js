require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const PDFDocument = require("pdfkit");

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

// ─── API WEBHOOKS (these need to be separate routes) ───────────────────────────
app.post("/api/hook/:slug", async (req, res) => {
  const campaignsRouter = require("./routes/campaigns");
  const routerInstance = campaignsRouter.stack.find(layer => layer.route && layer.route.path === "/api/hook/:slug");
  if (routerInstance) {
    routerInstance.route.stack[0].handle(req, res);
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

app.post("/api/invoice-hook/:slug", async (req, res) => {
  const campaignsRouter = require("./routes/campaigns");
  const routerInstance = campaignsRouter.stack.find(layer => layer.route && layer.route.path === "/api/invoice-hook/:slug");
  if (routerInstance) {
    routerInstance.route.stack[0].handle(req, res);
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

// ─── PDF REPORT (Agency only) ──────────────────────────────────────────────────
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
  const monthLabel = now.toLocaleString("en-GB", { month: "long", year: "numeric" });
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

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${(business.agency_name || business.name).replace(/\s/g, "-")}-Report-${now.toISOString().slice(0, 7)}.pdf`
  );
  doc.pipe(res);

  const brandName = business.agency_name || business.name;
  const industry = business.industry || "local business";

  // Header
  doc.rect(0, 0, doc.page.width, 120).fill("#121210");
  doc.rect(0, 0, doc.page.width, 4).fill("#C8A96E");
  doc.fill("#C8A96E").fontSize(26).font("Helvetica-Bold").text(brandName, 50, 25);
  doc.fill("#EAE7DC").fontSize(13).font("Helvetica").text("Monthly Reputation Report", 50, 56);
  doc
    .fill("rgba(234,231,220,0.45)")
    .fontSize(9)
    .font("Helvetica")
    .text(`${monthLabel}  ·  ${industry.charAt(0).toUpperCase() + industry.slice(1)}  ·  Confidential`, 50, 76);

  // Metrics grid
  const cardW = 145,
    cardH = 78,
    startX = 50,
    startY = 145,
    gap = 12;

  const metrics = [
    { value: String(thisPos), label: "Reviews collected", sub: "this month", color: "#C8A96E" },
    { value: String(thisNeg), label: "Feedback captured", sub: "kept private", color: "#D4897C" },
    { value: avgRating, label: "Average rating", sub: "this month", color: "#EAE7DC" },
    { value: String(thisClicks), label: "Review clicks", sub: "sent to Google", color: "#6A9E7F" },
    { value: String(totalVisits), label: "Total visits", sub: "all time", color: "#EAE7DC" },
    {
      value: (() => {
        const c = thisPos - lastPos;
        return c >= 0 ? "+" + c : String(c);
      })(),
      label: "vs last month",
      sub: `was ${lastPos} reviews`,
      color: thisPos >= lastPos ? "#6A9E7F" : "#D4897C",
    },
  ];

  metrics.forEach((m, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = startX + col * (cardW + gap);
    const y = startY + row * (cardH + gap);

    doc.rect(x, y, cardW, cardH).fill("#1E1E1C");
    doc.rect(x, y, cardW, cardH).stroke("rgba(200,169,110,0.15)");

    doc.fill(m.color).fontSize(26).font("Helvetica-Bold").text(m.value, x + 14, y + 10);
    doc.fill("#CCCCCC").fontSize(8.5).font("Helvetica").text(m.label, x + 14, y + 42);
    doc.fill("#888888").fontSize(7).font("Helvetica").text(m.sub, x + 14, y + 56);
  });

  // Recent feedback
  const feedbackY = startY + 2 * (cardH + gap) + 30;
  doc.fill("#C8A96E").fontSize(11).font("Helvetica-Bold").text("RECENT FEEDBACK", 50, feedbackY);
  doc.moveTo(50, feedbackY + 18).lineTo(545, feedbackY + 18).stroke("rgba(200,169,110,0.2)");

  if (recentFeedback.length > 0) {
    let yPos = feedbackY + 35;
    recentFeedback.forEach((f) => {
      doc.rect(50, yPos - 4, 495, 38).fill("#1E1E1C").stroke("rgba(234,231,220,0.06)");
      doc.fill("#BBBBBB").fontSize(8.5).font("Helvetica").text(
        `"${f.message.substring(0, 150)}${f.message.length > 150 ? "..." : ""}"`,
        62,
        yPos + 3,
        { width: 470 }
      );
      yPos += 46;
    });
  } else {
    doc.fill("#888888").fontSize(9).font("Helvetica").text("No private feedback captured this month.", 50, feedbackY + 35);
  }

  // Summary
  const insightY = feedbackY + (recentFeedback.length > 0 ? recentFeedback.length * 46 + 40 : 80);
  doc.fill("#C8A96E").fontSize(11).font("Helvetica-Bold").text("SUMMARY", 50, insightY);
  doc.moveTo(50, insightY + 18).lineTo(545, insightY + 18).stroke("rgba(200,169,110,0.2)");

  let summaryText = `This month, ${brandName} collected ${thisPos} review${thisPos !== 1 ? "s" : ""}`;
  if (thisNeg > 0)
    summaryText += ` and captured ${thisNeg} private feedback message${thisNeg !== 1 ? "s" : ""} before ${thisNeg === 1 ? "it went" : "they went"} public`;
  summaryText += `. Total funnel visits: ${totalVisits}.`;
  if (thisPos > 0 && thisClicks > 0)
    summaryText += ` ${thisClicks} customer${thisClicks !== 1 ? "s" : ""} clicked through to leave a review.`;

  doc.fill("#AAAAAA").fontSize(9).font("Helvetica").text(summaryText, 50, insightY + 30, { width: 495 });

  // Footer
  doc
    .fill("#666666")
    .fontSize(7)
    .font("Helvetica")
    .text(`Generated by ReviewLift  ·  ${now.toLocaleDateString("en-GB")}  ·  For internal use`, 50, doc.page.height - 40, {
      align: "center",
    });

  doc.end();
});

// ─── LAPSED REDIRECT ──────────────────────────────────────────────────────────
app.get("/lapsed-redirect/:slug", async (req, res) => {
  const { slug } = req.params;
  res.redirect(`/lapsed?slug=${slug}`);
});

// ─── SERVERLESS EXPORT ────────────────────────────────────────────────────────
const serverless = require("serverless-http");
module.exports = app;
module.exports.handler = serverless(app);