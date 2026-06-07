const express = require('express');
const supabase = require('../config/database');
const PDFDocument = require('pdfkit');

const router = express.Router();

// Generate PDF report for client
router.get('/api/report/:slug/:period', async (req, res) => {
  const { slug, period } = req.params;
  
  const days = period === 'month' ? 30 : period === 'quarter' ? 90 : 365;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Get business info
  const { data: business } = await supabase
    .from('businesses')
    .select('name, industry, agency_name, agency_logo_url')
    .eq('slug', slug)
    .single();
  
  // Get stats
  const { data: queueStats } = await supabase
    .from('review_queue')
    .select('status, created_at, trigger_source')
    .eq('business_slug', slug)
    .gte('created_at', startDate.toISOString());
  
  const { data: events } = await supabase
    .from('events')
    .select('event_type, created_at')
    .eq('business_slug', slug)
    .gte('created_at', startDate.toISOString());
  
  const totalSent = queueStats?.filter(s => s.status === 'sent').length || 0;
  const totalReviews = events?.filter(e => e.event_type === 'review_click').length || 0;
  const conversionRate = totalSent > 0 ? Math.round((totalReviews / totalSent) * 100) : 0;
  
  // Create PDF
  const doc = new PDFDocument({ margin: 50 });
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${slug}-report-${period}.pdf`);
  
  doc.pipe(res);
  
  // Header
  if (business?.agency_logo_url) {
    try {
      doc.image(business.agency_logo_url, 50, 45, { width: 100 });
    } catch(e) {}
  }
  
  doc.fontSize(20).text(`${business?.agency_name || 'ReviewLift'} Report`, 50, 50, { align: 'right' });
  doc.moveDown();
  
  // Title
  doc.fontSize(24).text(`${business?.name || slug}`, { align: 'center' });
  doc.fontSize(12).text(`Performance Report - ${period.charAt(0).toUpperCase() + period.slice(1)}`, { align: 'center' });
  doc.moveDown(2);
  
  // Stats boxes
  const startY = doc.y;
  
  doc.rect(50, startY, 150, 80).stroke();
  doc.fontSize(10).text('Requests Sent', 60, startY + 10);
  doc.fontSize(24).text(totalSent.toString(), 60, startY + 30);
  
  doc.rect(220, startY, 150, 80).stroke();
  doc.fontSize(10).text('Reviews Received', 230, startY + 10);
  doc.fontSize(24).text(totalReviews.toString(), 230, startY + 30);
  
  doc.rect(390, startY, 150, 80).stroke();
  doc.fontSize(10).text('Conversion Rate', 400, startY + 10);
  doc.fontSize(24).text(`${conversionRate}%`, 400, startY + 30);
  
  doc.moveDown(4);
  
  // Industry benchmark
  doc.fontSize(14).text('Industry Benchmark', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Your conversion rate: ${conversionRate}%`);
  doc.text(`Industry average: ${business?.industry === 'plumbing' ? '22%' : '21%'}`);
  
  if (conversionRate > 22) {
    doc.text('✓ Performing above industry average!', { color: 'green' });
  } else {
    doc.text('⚠️ Room for improvement - consider adjusting your send timing.', { color: 'orange' });
  }
  
  doc.moveDown(2);
  
  // Footer
  doc.fontSize(8).text(`Generated on ${new Date().toLocaleDateString()}`, 50, doc.page.height - 50, { align: 'center' });
  doc.text('Powered by ReviewLift', { align: 'center' });
  
  doc.end();
});

module.exports = router;