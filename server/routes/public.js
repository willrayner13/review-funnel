const express = require("express");
const QRCode = require("qrcode");
const supabase = require("../config/database");
const { escapeHtml, getRelativeDate } = require("../utils/helpers");

const router = express.Router();

// Public review wall
router.get("/wall/:slug", async (req, res) => {
  const { slug } = req.params;

  const { data: business } = await supabase
    .from("businesses")
    .select("name, agency_name, agency_logo_url")
    .eq("slug", slug)
    .single();

  if (!business) {
    return res.status(404).send("Business not found");
  }

  const isWhiteLabel = business.agency_name && business.agency_name.trim().length > 0;
  const displayName = isWhiteLabel ? business.agency_name : business.name;
  const footerBrand = isWhiteLabel ? business.agency_name : "ReviewLift";

  const { data: events } = await supabase
    .from("events")
    .select("message, created_at")
    .eq("business_slug", slug)
    .eq("event_type", "positive")
    .not("message", "is", null)
    .gt("message", "")
    .order("created_at", { ascending: false });

  const reviews = (events || [])
    .filter((e) => e.message && e.message.trim().length >= 10)
    .map((e) => ({
      message: e.message.trim(),
      date: e.created_at,
      relativeDate: getRelativeDate(e.created_at),
    }));

  const { count: totalPositive } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("business_slug", slug)
    .eq("event_type", "positive");

  const { data: ratings } = await supabase
    .from("events")
    .select("rating")
    .eq("business_slug", slug)
    .eq("event_type", "rating")
    .not("rating", "is", null);

  let avgRating = 0;
  if (ratings && ratings.length > 0) {
    const sum = ratings.reduce((a, b) => a + (b.rating || 0), 0);
    avgRating = (sum / ratings.length).toFixed(1);
  }

  const hasReviews = reviews.length >= 3;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${displayName} — Customer Reviews</title>
      <meta property="og:title" content="${displayName} — What our customers say">
      <meta property="og:description" content="★ ${avgRating} average from ${totalPositive} real customer reviews">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1A1A18; color: #EAE7DC; line-height: 1.6; }
        .container { max-width: 1100px; margin: 0 auto; padding: 60px 24px; }
        .header { text-align: center; margin-bottom: 48px; }
        .business-name { font-family: 'Syne', sans-serif; font-size: 2.5rem; font-weight: 800; margin-bottom: 8px; }
        .rating-summary { font-size: 1.1rem; color: #C8A96E; margin-top: 8px; }
        .stars { font-size: 1.2rem; letter-spacing: 4px; color: #C8A96E; }
        .review-grid { column-count: 2; column-gap: 24px; }
        .review-card { background: #242422; border: 1px solid rgba(200,169,110,0.15); border-radius: 16px; padding: 24px; margin-bottom: 24px; break-inside: avoid; }
        .review-stars { font-size: 0.9rem; letter-spacing: 3px; color: #C8A96E; margin-bottom: 12px; }
        .review-message { font-size: 0.95rem; color: rgba(234,231,220,0.8); line-height: 1.6; margin-bottom: 12px; }
        .review-date { font-size: 0.7rem; color: rgba(234,231,220,0.35); }
        .footer { text-align: center; margin-top: 48px; padding-top: 24px; border-top: 1px solid rgba(200,169,110,0.1); font-size: 0.75rem; color: rgba(234,231,220,0.3); }
        .footer a { color: #C8A96E; text-decoration: none; }
        @media (max-width: 700px) { .review-grid { column-count: 1; } .business-name { font-size: 1.8rem; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="business-name">${escapeHtml(displayName)}</div>
          <div class="rating-summary"><span class="stars">★★★★★</span> ★ ${avgRating} · ${totalPositive} happy customers</div>
        </div>
        <div class="review-grid">
          ${hasReviews ? reviews.map((review) => `
            <div class="review-card">
              <div class="review-stars">★★★★★</div>
              <div class="review-message">"${escapeHtml(review.message)}"</div>
              <div class="review-date">${review.relativeDate}</div>
            </div>
          `).join("") : '<div style="text-align:center;padding:60px;"><p>Reviews will appear here as customers leave feedback.</p></div>'}
        </div>
        <div class="footer">Powered by <a href="/admin?ref=${slug}">${escapeHtml(footerBrand)}</a></div>
      </div>
    </body>
    </html>
  `);
});

// Wall preview image
router.get("/wall-preview/:slug", async (req, res) => {
  const { slug } = req.params;

  const { data: business } = await supabase.from("businesses").select("name").eq("slug", slug).single();
  const businessName = business?.name || "Our customers";

  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0;background:#1A1A18;display:flex;align-items:center;justify-content:center;width:1200px;height:630px;font-family:sans-serif;">
      <div style="text-align:center;padding:40px;">
        <div style="font-size:0.8rem;letter-spacing:3px;color:#C8A96E;">CUSTOMER REVIEWS</div>
        <div style="font-size:2rem;font-weight:800;color:#EAE7DC;margin:20px 0;">${businessName}</div>
        <div style="font-size:1.5rem;letter-spacing:5px;color:#C8A96E;margin:20px 0;">★★★★★</div>
        <div style="font-size:0.9rem;color:rgba(234,231,220,0.45);">Real feedback from real customers</div>
        <div style="font-size:0.7rem;color:rgba(234,231,220,0.25);margin-top:30px;">Powered by ReviewLift</div>
      </div>
    </body>
    </html>
  `);
});

// Milestone page
router.get("/milestone/:slug/:number", async (req, res) => {
  const { slug, number } = req.params;
  const milestoneNum = parseInt(number);
  const validMilestones = [10, 25, 50, 100, 250, 500];

  if (!validMilestones.includes(milestoneNum)) {
    return res.status(404).send("Milestone not found");
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("name, review_link, agency_name, agency_logo_url")
    .eq("slug", slug)
    .single();

  if (!business) {
    return res.status(404).send("Business not found");
  }

  const isWhiteLabel = business.agency_name && business.agency_name.trim().length > 0;
  const displayName = isWhiteLabel ? business.agency_name : business.name;
  const footerBrand = isWhiteLabel ? business.agency_name : "ReviewLift";
  const reviewLink = business.review_link || `${process.env.BASE_URL}/r/${slug}`;

  const messages = {
    10: "Our first big milestone! Thanks to everyone who took a moment to share their experience.",
    25: "Twenty-five happy customers and counting. Your feedback means the world to us.",
    50: "50 reviews! Every single one helps us serve you better. Thank you.",
    100: "Triple digits! A hundred thank-yous to our amazing community.",
    250: "A quarter of a thousand reviews. We're humbled by your trust.",
    500: "500 reviews! Half a thousand happy customers. We couldn't do it without you.",
  };

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${displayName} — ${milestoneNum} ⭐ Reviews</title>
      <meta property="og:title" content="${displayName} — ${milestoneNum} Google Reviews">
      <meta property="og:description" content="${displayName} has collected ${milestoneNum} 5-star reviews from happy customers.">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1A1A18; color: #EAE7DC; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .container { max-width: 560px; width: 100%; text-align: center; }
        .card { background: #242422; border: 1px solid rgba(200,169,110,0.25); border-radius: 24px; padding: 48px 32px; }
        .milestone-number { font-family: 'Syne', sans-serif; font-size: 5rem; font-weight: 800; color: #C8A96E; line-height: 1; margin-bottom: 8px; }
        .milestone-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 3px; color: rgba(234,231,220,0.45); margin-bottom: 24px; }
        .business-name { font-family: 'Syne', sans-serif; font-size: 1.6rem; font-weight: 700; margin-bottom: 16px; }
        .stars { font-size: 2rem; letter-spacing: 8px; color: #C8A96E; margin: 24px 0; }
        .message { font-size: 1rem; color: rgba(234,231,220,0.65); line-height: 1.7; margin: 24px 0; }
        .btn { display: inline-block; background: #C8A96E; color: #1A1A18; text-decoration: none; font-weight: 700; font-size: 1rem; padding: 14px 32px; border-radius: 40px; transition: transform 0.2s; }
        .btn:hover { background: #D4B87A; transform: translateY(-2px); }
        .footer { margin-top: 24px; font-size: 0.7rem; color: rgba(234,231,220,0.25); }
        .footer a { color: #C8A96E; text-decoration: none; }
        @media (max-width: 500px) { .card { padding: 32px 20px; } .milestone-number { font-size: 3.5rem; } .business-name { font-size: 1.3rem; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="milestone-number">${milestoneNum}</div>
          <div class="milestone-label">⭐ GOOGLE REVIEWS ⭐</div>
          <div class="business-name">${escapeHtml(displayName)}</div>
          <div class="stars">★★★★★</div>
          <div class="message">${messages[milestoneNum]}</div>
          <a href="${reviewLink}" class="btn">Leave a review →</a>
        </div>
        <div class="footer">Powered by <a href="/admin?ref=${slug}">${escapeHtml(footerBrand)}</a></div>
      </div>
    </body>
    </html>
  `);
});

// Milestone preview image
router.get("/milestone-preview/:slug/:number", async (req, res) => {
  const { slug, number } = req.params;
  const milestoneNum = parseInt(number);

  const { data: business } = await supabase.from("businesses").select("name").eq("slug", slug).single();
  const businessName = business?.name || "Our Business";

  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { margin: 0; background: #1A1A18; display: flex; align-items: center; justify-content: center; width: 1200px; height: 630px; font-family: sans-serif; }
      .container { text-align: center; padding: 40px; width: 100%; }
      .milestone { font-family: 'Syne', sans-serif; font-size: 120px; font-weight: 800; color: #C8A96E; line-height: 1; margin-bottom: 16px; }
      .label { font-size: 14px; letter-spacing: 4px; color: rgba(234,231,220,0.45); margin-bottom: 24px; }
      .business { font-family: 'Syne', sans-serif; font-size: 36px; font-weight: 700; color: #EAE7DC; margin-bottom: 24px; }
      .stars { font-size: 28px; letter-spacing: 8px; color: #C8A96E; margin: 24px 0; }
      .powered { font-size: 12px; color: rgba(234,231,220,0.25); margin-top: 40px; }
    </style></head>
    <body>
      <div class="container">
        <div class="milestone">${milestoneNum}</div>
        <div class="label">⭐ GOOGLE REVIEWS ⭐</div>
        <div class="business">${escapeHtml(businessName)}</div>
        <div class="stars">★★★★★</div>
        <div class="powered">Powered by ReviewLift</div>
      </div>
    </body>
    </html>
  `);
});

router.get("/milestone-image/:slug/:number", async (req, res) => {
  res.redirect(`/milestone-preview/${req.params.slug}/${req.params.number}`);
});

// Reputation score
router.get("/reputation/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });

  const slug = req.params.slug;
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: events } = await supabase.from("events").select("event_type, rating, created_at").eq("business_slug", slug);

  if (!events || events.length === 0) {
    const { data: lastScore } = await supabase
      .from("reputation_scores")
      .select("score")
      .eq("business_slug", slug)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .single();

    return res.json({
      score: 0,
      last_month_score: lastScore?.score || null,
      breakdown: { rating: 0, velocity: 0, feedback: 25, activity: 0 },
      message: "Not enough data yet. Start collecting reviews to build your score.",
    });
  }

  const ratings = events.filter((e) => e.rating).map((e) => e.rating);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  const ratingScore = Math.round((avgRating / 5) * 40);

  const thisMonthPos = events.filter((e) => e.event_type === "positive" && e.created_at >= thisMonthStart).length;
  const lastMonthPos = events.filter((e) => e.event_type === "positive" && e.created_at >= lastMonthStart && e.created_at < thisMonthStart).length;
  let velocityScore = 0;
  if (lastMonthPos === 0 && thisMonthPos > 0) velocityScore = 20;
  else if (lastMonthPos === 0 && thisMonthPos === 0) velocityScore = 10;
  else if (thisMonthPos >= lastMonthPos) velocityScore = 20;
  else if (thisMonthPos >= lastMonthPos * 0.5) velocityScore = 10;
  else velocityScore = 0;

  const totalVisits = events.filter((e) => e.event_type === "visit").length || 1;
  const negativeEvents = events.filter((e) => e.event_type === "negative").length;
  const ratio = negativeEvents / totalVisits;
  let feedbackScore = 25;
  if (ratio > 0.15) feedbackScore = 5;
  else if (ratio > 0.05) feedbackScore = 15;

  const recentActivity = events.filter(
    (e) => (e.event_type === "sms_sent" || e.event_type === "invoice_email_sent") && e.created_at >= thirtyDaysAgo
  ).length;
  let activityScore = 0;
  if (recentActivity >= 10) activityScore = 15;
  else if (recentActivity >= 1) activityScore = 8;

  const totalScore = ratingScore + velocityScore + feedbackScore + activityScore;

  const { data: lastScore } = await supabase
    .from("reputation_scores")
    .select("score")
    .eq("business_slug", slug)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .single();

  res.json({
    score: totalScore,
    last_month_score: lastScore?.score || null,
    breakdown: {
      rating: ratingScore,
      velocity: velocityScore,
      feedback: feedbackScore,
      activity: activityScore,
    },
  });
});

module.exports = router;