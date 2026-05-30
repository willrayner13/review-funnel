/**
 * PDF Service - Generates professional PDF reports for agencies
 * Uses PDFKit for document generation
 * 
 * @module services/pdfService
 */

const PDFDocument = require("pdfkit");

// Colour constants matching brand
const COLORS = {
  BACKGROUND: "#121210",
  SURFACE: "#1E1E1C",
  ACCENT: "#C8A96E",
  TEXT_PRIMARY: "#EAE7DC",
  TEXT_SECONDARY: "#CCCCCC",
  TEXT_DIM: "#888888",
  SUCCESS: "#6A9E7F",
  DANGER: "#D4897C",
  BORDER: "rgba(200,169,110,0.15)",
};

/**
 * Generate a monthly reputation report PDF
 * @param {object} businessData - Business information
 * @param {object} metrics - Performance metrics
 * @param {Array} recentFeedback - Recent feedback messages
 * @param {object} options - Additional options
 * @returns {PDFDocument} PDFKit document instance (pipe to response)
 */
function generateMonthlyReport(businessData, metrics, recentFeedback, options = {}) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const now = new Date();
  const monthLabel = now.toLocaleString("en-GB", { month: "long", year: "numeric" });
  const brandName = businessData.agency_name || businessData.name;
  const industry = businessData.industry || "local business";

  // ─── HEADER SECTION ──────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 120).fill(COLORS.BACKGROUND);
  doc.rect(0, 0, doc.page.width, 4).fill(COLORS.ACCENT);
  
  doc.fillColor(COLORS.ACCENT)
     .fontSize(26)
     .font("Helvetica-Bold")
     .text(brandName, 50, 25);
  
  doc.fillColor(COLORS.TEXT_PRIMARY)
     .fontSize(13)
     .font("Helvetica")
     .text("Monthly Reputation Report", 50, 56);
  
  doc.fillColor("rgba(234,231,220,0.45)")
     .fontSize(9)
     .font("Helvetica")
     .text(`${monthLabel}  ·  ${industry.charAt(0).toUpperCase() + industry.slice(1)}  ·  Confidential`, 50, 76);

  // ─── METRICS GRID ────────────────────────────────────────────────────────────
  const cardW = 145, cardH = 78, startX = 50, startY = 145, gap = 12;
  
  const metricsCards = [
    { value: String(metrics.reviewsCollected), label: "Reviews collected", sub: "this month", color: COLORS.ACCENT },
    { value: String(metrics.feedbackCaptured), label: "Feedback captured", sub: "kept private", color: COLORS.DANGER },
    { value: metrics.avgRating, label: "Average rating", sub: "this month", color: COLORS.TEXT_PRIMARY },
    { value: String(metrics.reviewClicks), label: "Review clicks", sub: "sent to Google", color: COLORS.SUCCESS },
    { value: String(metrics.totalVisits), label: "Total visits", sub: "all time", color: COLORS.TEXT_PRIMARY },
    {
      value: metrics.trend,
      label: "vs last month",
      sub: `was ${metrics.lastMonthReviews} reviews`,
      color: metrics.isPositiveTrend ? COLORS.SUCCESS : COLORS.DANGER,
    },
  ];

  metricsCards.forEach((card, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = startX + col * (cardW + gap);
    const y = startY + row * (cardH + gap);

    // Card background
    doc.rect(x, y, cardW, cardH).fill(COLORS.SURFACE);
    doc.rect(x, y, cardW, cardH).stroke(COLORS.BORDER);

    doc.fillColor(card.color)
       .fontSize(26)
       .font("Helvetica-Bold")
       .text(card.value, x + 14, y + 10);
    
    doc.fillColor(COLORS.TEXT_SECONDARY)
       .fontSize(8.5)
       .font("Helvetica")
       .text(card.label, x + 14, y + 42);
    
    doc.fillColor(COLORS.TEXT_DIM)
       .fontSize(7)
       .font("Helvetica")
       .text(card.sub, x + 14, y + 56);
  });

  // ─── RECENT FEEDBACK SECTION ─────────────────────────────────────────────────
  const feedbackY = startY + 2 * (cardH + gap) + 30;
  doc.fillColor(COLORS.ACCENT)
     .fontSize(11)
     .font("Helvetica-Bold")
     .text("RECENT FEEDBACK", 50, feedbackY);
  
  doc.moveTo(50, feedbackY + 18)
     .lineTo(545, feedbackY + 18)
     .stroke(COLORS.BORDER);

  if (recentFeedback && recentFeedback.length > 0) {
    let yPos = feedbackY + 35;
    const maxFeedback = Math.min(recentFeedback.length, 4);
    
    for (let i = 0; i < maxFeedback; i++) {
      const feedback = recentFeedback[i];
      const message = feedback.message || feedback;
      const truncated = message.length > 150 ? message.substring(0, 147) + "..." : message;
      
      doc.rect(50, yPos - 4, 495, 38).fill(COLORS.SURFACE).stroke("rgba(234,231,220,0.06)");
      doc.fillColor(COLORS.TEXT_SECONDARY)
         .fontSize(8.5)
         .font("Helvetica")
         .text(`"${truncated}"`, 62, yPos + 3, { width: 470 });
      
      yPos += 46;
    }
  } else {
    doc.fillColor(COLORS.TEXT_DIM)
       .fontSize(9)
       .font("Helvetica")
       .text("No private feedback captured this month.", 50, feedbackY + 35);
  }

  // ─── SUMMARY SECTION ─────────────────────────────────────────────────────────
  const insightY = feedbackY + (recentFeedback?.length > 0 ? Math.min(recentFeedback.length, 4) * 46 + 40 : 80);
  
  doc.fillColor(COLORS.ACCENT)
     .fontSize(11)
     .font("Helvetica-Bold")
     .text("SUMMARY", 50, insightY);
  
  doc.moveTo(50, insightY + 18)
     .lineTo(545, insightY + 18)
     .stroke(COLORS.BORDER);

  let summaryText = `This month, ${brandName} collected ${metrics.reviewsCollected} review${metrics.reviewsCollected !== 1 ? "s" : ""}`;
  
  if (metrics.feedbackCaptured > 0) {
    summaryText += ` and captured ${metrics.feedbackCaptured} private feedback message${metrics.feedbackCaptured !== 1 ? "s" : ""} before ${metrics.feedbackCaptured === 1 ? "it went" : "they went"} public`;
  }
  
  summaryText += `. Total funnel visits: ${metrics.totalVisits}.`;
  
  if (metrics.reviewsCollected > 0 && metrics.reviewClicks > 0) {
    summaryText += ` ${metrics.reviewClicks} customer${metrics.reviewClicks !== 1 ? "s" : ""} clicked through to leave a review.`;
  }

  doc.fillColor(COLORS.TEXT_SECONDARY)
     .fontSize(9)
     .font("Helvetica")
     .text(summaryText, 50, insightY + 30, { width: 495 });

  // ─── FOOTER ──────────────────────────────────────────────────────────────────
  const footerY = doc.page.height - 40;
  doc.fillColor(COLORS.TEXT_DIM)
     .fontSize(7)
     .font("Helvetica")
     .text(`Generated by ReviewLift  ·  ${now.toLocaleDateString("en-GB")}  ·  For internal use`, 50, footerY, { align: "center" });

  return doc;
}

/**
 * Generate a client report PDF (for agencies to send to their clients)
 * @param {object} clientData - Client business information
 * @param {object} metrics - Performance metrics
 * @param {Array} recentFeedback - Recent feedback messages
 * @param {object} agencyData - Agency branding information
 * @returns {PDFDocument} PDFKit document instance
 */
function generateClientReport(clientData, metrics, recentFeedback, agencyData = {}) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const now = new Date();
  const monthLabel = now.toLocaleString("en-GB", { month: "long", year: "numeric" });
  
  const brandName = agencyData.agency_name || clientData.name;
  const logoUrl = agencyData.agency_logo_url;

  // ─── HEADER WITH AGENCY BRANDING ─────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 100).fill(COLORS.BACKGROUND);
  doc.rect(0, 0, doc.page.width, 3).fill(COLORS.ACCENT);
  
  if (logoUrl) {
    // Attempt to add logo (would need to fetch image or accept buffer)
    // For now, just text branding
    doc.fillColor(COLORS.ACCENT)
       .fontSize(22)
       .font("Helvetica-Bold")
       .text(brandName, 50, 25);
  } else {
    doc.fillColor(COLORS.ACCENT)
       .fontSize(22)
       .font("Helvetica-Bold")
       .text(brandName, 50, 25);
  }
  
  doc.fillColor(COLORS.TEXT_PRIMARY)
     .fontSize(12)
     .font("Helvetica")
     .text("Client Reputation Report", 50, 52);
  
  doc.fillColor("rgba(234,231,220,0.45)")
     .fontSize(8)
     .font("Helvetica")
     .text(`${clientData.name}  ·  ${monthLabel}`, 50, 68);

  // ─── KEY METRICS ─────────────────────────────────────────────────────────────
  const metricsY = 130;
  
  doc.fillColor(COLORS.TEXT_PRIMARY)
     .fontSize(10)
     .font("Helvetica-Bold")
     .text("Key Metrics", 50, metricsY);
  
  doc.moveTo(50, metricsY + 15).lineTo(545, metricsY + 15).stroke(COLORS.BORDER);
  
  const metricLabels = [
    { label: "Reviews", value: metrics.reviewsCollected },
    { label: "Avg Rating", value: metrics.avgRating },
    { label: "Response Rate", value: `${metrics.responseRate || 0}%` },
    { label: "Funnel Visits", value: metrics.totalVisits },
  ];
  
  let xPos = 50;
  metricLabels.forEach((metric, i) => {
    doc.fillColor(COLORS.TEXT_SECONDARY)
       .fontSize(8)
       .font("Helvetica")
       .text(metric.label, xPos, metricsY + 25);
    
    doc.fillColor(COLORS.ACCENT)
       .fontSize(18)
       .font("Helvetica-Bold")
       .text(String(metric.value), xPos, metricsY + 40);
    
    xPos += 120;
  });

  // ─── RECENT POSITIVE REVIEWS ─────────────────────────────────────────────────
  const positiveY = metricsY + 90;
  doc.fillColor(COLORS.TEXT_PRIMARY)
     .fontSize(10)
     .font("Helvetica-Bold")
     .text("Recent Customer Feedback", 50, positiveY);
  
  doc.moveTo(50, positiveY + 15).lineTo(545, positiveY + 15).stroke(COLORS.BORDER);

  if (recentFeedback && recentFeedback.length > 0) {
    let yPos = positiveY + 35;
    for (let i = 0; i < Math.min(recentFeedback.length, 5); i++) {
      const feedback = recentFeedback[i];
      const message = feedback.message || feedback;
      const truncated = message.length > 200 ? message.substring(0, 197) + "..." : message;
      
      doc.fillColor(COLORS.TEXT_SECONDARY)
         .fontSize(8.5)
         .font("Helvetica")
         .text(`• "${truncated}"`, 60, yPos, { width: 485 });
      
      yPos += 28;
      
      // Check for page break
      if (yPos > doc.page.height - 80) {
        doc.addPage();
        yPos = 50;
      }
    }
  } else {
    doc.fillColor(COLORS.TEXT_DIM)
       .fontSize(9)
       .font("Helvetica")
       .text("No feedback collected this month.", 50, positiveY + 35);
  }

  // ─── FOOTER ──────────────────────────────────────────────────────────────────
  const footerY = doc.page.height - 40;
  doc.fillColor(COLORS.TEXT_DIM)
     .fontSize(7)
     .font("Helvetica")
     .text(`Report generated by ${brandName} · Powered by ReviewLift`, 50, footerY, { align: "center" });

  return doc;
}

/**
 * Generate a CSV export of review data
 * @param {Array} reviews - Array of review objects
 * @returns {string} CSV string
 */
function generateReviewsCSV(reviews) {
  const headers = ["Date", "Rating", "Message", "Type"];
  const rows = reviews.map(review => [
    new Date(review.created_at).toLocaleDateString("en-GB"),
    review.rating || "N/A",
    `"${(review.message || "").replace(/"/g, '""')}"`,
    review.event_type || "review",
  ]);
  
  const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
  return csvContent;
}

module.exports = {
  generateMonthlyReport,
  generateClientReport,
  generateReviewsCSV,
  COLORS,
};