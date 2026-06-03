// weekly-digest.js - Cron job for Monday morning digest emails
const supabase = require("../config/database");
const emailService = require("../services/emailService");

async function sendWeeklyDigests() {
  console.log("Starting weekly digest job...");
  
  // Get all businesses that have opted into weekly reports
  const { data: businesses, error } = await supabase
    .from("businesses")
    .select("slug, name, email, industry, weekly_digest_enabled")
    .eq("weekly_digest_enabled", true)
    .eq("subscription_active", true);
  
  if (error) {
    console.error("Error fetching businesses:", error);
    return { error: error.message };
  }
  
  if (!businesses || businesses.length === 0) {
    console.log("No businesses opted into weekly digests");
    return { sent: 0 };
  }
  
  let sent = 0;
  let failed = 0;
  
  for (const business of businesses) {
    try {
      // Get last week's stats
      const now = new Date();
      const lastWeekStart = new Date(now);
      lastWeekStart.setDate(now.getDate() - 7);
      const twoWeeksStart = new Date(now);
      twoWeeksStart.setDate(now.getDate() - 14);
      
      // Get events from last week
      const { data: events } = await supabase
        .from("events")
        .select("event_type, created_at, rating")
        .eq("business_slug", business.slug)
        .gte("created_at", lastWeekStart.toISOString());
      
      // Get events from previous week for comparison
      const { data: previousEvents } = await supabase
        .from("events")
        .select("event_type, created_at")
        .eq("business_slug", business.slug)
        .gte("created_at", twoWeeksStart.toISOString())
        .lt("created_at", lastWeekStart.toISOString());
      
      const stats = {
        visits: (events || []).filter(e => e.event_type === "visit").length,
        positive: (events || []).filter(e => e.event_type === "positive").length,
        negative: (events || []).filter(e => e.event_type === "negative").length,
        reviews: (events || []).filter(e => e.event_type === "review_click").length,
        rating_avg: (() => {
          const ratings = (events || []).filter(e => e.rating).map(e => e.rating);
          return ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : 0;
        })(),
        last_week_visits: (previousEvents || []).filter(e => e.event_type === "visit").length,
        last_week_positive: (previousEvents || []).filter(e => e.event_type === "positive").length,
      };
      
      // Generate recommendations based on stats
      const recommendations = [];
      
      if (stats.visits > 0 && stats.positive === 0 && stats.negative === 0) {
        recommendations.push({
          icon: "📢",
          text: "You had visitors but no one left feedback. Share your review link more prominently.",
          action: "Copy review link",
          link: "/for-business#assets"
        });
      }
      
      if (stats.negative > stats.positive && stats.negative > 0) {
        recommendations.push({
          icon: "💬",
          text: `You received ${stats.negative} piece${stats.negative > 1 ? 's' : ''} of private feedback. Read and respond to turn things around.`,
          action: "View feedback",
          link: "/for-business#customers"
        });
      }
      
      if (stats.reviews === 0 && stats.visits > 5) {
        recommendations.push({
          icon: "📱",
          text: "Your conversion rate is low. Try sending a campaign to recent customers.",
          action: "Send campaign",
          link: "/for-business#campaigns"
        });
      }
      
      if (stats.reviews > 0 && stats.reviews % 5 === 0 && stats.reviews <= 50) {
        recommendations.push({
          icon: "🎉",
          text: `You've collected ${stats.reviews} reviews this month! Share your success on social media.`,
          action: "Share this win",
          link: "/for-business#overview"
        });
      }
      
      // Check for milestone
      let milestone = null;
      const { count: totalPositive } = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("business_slug", business.slug)
        .eq("event_type", "positive");
      
      const milestones = [10, 25, 50, 100, 250, 500];
      const reachedMilestone = milestones.find(m => m === totalPositive);
      
      if (reachedMilestone) {
        milestone = {
          count: reachedMilestone,
          message: `🎉 Amazing! You've reached ${reachedMilestone} Google reviews!`
        };
      }
      
      // Send email
      await emailService.sendWeeklyDigest(
        business.email,
        business.name,
        stats,
        recommendations,
        milestone
      );
      
      sent++;
      console.log(`Sent weekly digest to ${business.email}`);
      
    } catch (err) {
      console.error(`Failed to send digest to ${business.email}:`, err.message);
      failed++;
    }
  }
  
  console.log(`Weekly digest complete: ${sent} sent, ${failed} failed`);
  return { sent, failed };
}

module.exports = sendWeeklyDigests;