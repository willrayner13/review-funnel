const express = require('express');
const supabase = require('../config/database');

const router = express.Router();

// Get analytics data for dashboard
router.get('/api/analytics/:slug', async (req, res) => {
  const { slug } = req.params;
  const { period = '30d' } = req.query;
  
  const days = period === '90d' ? 90 : period === '12m' ? 365 : 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Get queue stats
  const { data: queueStats } = await supabase
    .from('review_queue')
    .select('status, created_at, trigger_source')
    .eq('business_slug', slug)
    .gte('created_at', startDate.toISOString());
  
  // Get funnel events
  const { data: events } = await supabase
    .from('events')
    .select('event_type, created_at')
    .eq('business_slug', slug)
    .gte('created_at', startDate.toISOString());
  
  // Calculate daily totals
  const dailyData = {};
  for (let i = 0; i <= days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    dailyData[dateStr] = { visits: 0, positive: 0, reviews: 0, sent: 0 };
  }
  
  events?.forEach(event => {
    const dateStr = event.created_at.split('T')[0];
    if (dailyData[dateStr]) {
      if (event.event_type === 'visit') dailyData[dateStr].visits++;
      if (event.event_type === 'positive') dailyData[dateStr].positive++;
      if (event.event_type === 'review_click') dailyData[dateStr].reviews++;
    }
  });
  
  queueStats?.forEach(item => {
    const dateStr = item.created_at.split('T')[0];
    if (dailyData[dateStr] && item.status === 'sent') {
      dailyData[dateStr].sent++;
    }
  });
  
  // Calculate conversion rate over time
  const chartData = Object.entries(dailyData).map(([date, data]) => ({
    date,
    visits: data.visits,
    positive: data.positive,
    reviews: data.reviews,
    sent: data.sent,
    conversion: data.visits > 0 ? Math.round((data.reviews / data.visits) * 100) : 0
  }));
  
  // Calculate totals
  const totalVisits = queueStats?.length || 0;
  const totalSent = queueStats?.filter(s => s.status === 'sent').length || 0;
  const totalReviews = events?.filter(e => e.event_type === 'review_click').length || 0;
  const conversionRate = totalSent > 0 ? Math.round((totalReviews / totalSent) * 100) : 0;
  
  // Get trigger source breakdown
  const triggerBreakdown = {};
  queueStats?.forEach(item => {
    const source = item.trigger_source || 'unknown';
    triggerBreakdown[source] = (triggerBreakdown[source] || 0) + 1;
  });
  
  res.json({
    chartData,
    totals: {
      visits: totalVisits,
      sent: totalSent,
      reviews: totalReviews,
      conversionRate
    },
    triggerBreakdown,
    period
  });
});

// Get funnel performance metrics
router.get('/api/funnel-metrics/:slug', async (req, res) => {
  const { slug } = req.params;
  
  const { data: events } = await supabase
    .from('events')
    .select('event_type')
    .eq('business_slug', slug);
  
  const visits = events?.filter(e => e.event_type === 'visit').length || 0;
  const ratings = events?.filter(e => e.event_type === 'positive' || e.event_type === 'negative').length || 0;
  const reviews = events?.filter(e => e.event_type === 'review_click').length || 0;
  
  res.json({
    funnel: {
      visits,
      ratings,
      reviews,
      ratingRate: visits > 0 ? Math.round((ratings / visits) * 100) : 0,
      conversionRate: ratings > 0 ? Math.round((reviews / ratings) * 100) : 0,
      overallRate: visits > 0 ? Math.round((reviews / visits) * 100) : 0
    }
  });
});

module.exports = router;