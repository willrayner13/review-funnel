const supabase = require("../config/database");

async function runReputationScores() {
  const { data: businesses } = await supabase.from("businesses").select("slug").eq("subscription_active", true);

  if (!businesses) return { saved: 0 };

  let count = 0;
  for (const biz of businesses) {
    const { data: events } = await supabase
      .from("events")
      .select("event_type, rating, created_at")
      .eq("business_slug", biz.slug);

    if (!events || events.length === 0) continue;

    const ratings = events.filter((e) => e.rating).map((e) => e.rating);
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const ratingScore = Math.round((avgRating / 5) * 40);

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    const thisMonthPos = events.filter((e) => e.event_type === "positive" && e.created_at >= thisMonthStart).length;
    const lastMonthPos = events.filter(
      (e) => e.event_type === "positive" && e.created_at >= lastMonthStart && e.created_at < thisMonthStart
    ).length;
    let velocityScore =
      lastMonthPos === 0 && thisMonthPos > 0
        ? 20
        : lastMonthPos === 0
        ? 10
        : thisMonthPos >= lastMonthPos
        ? 20
        : thisMonthPos >= lastMonthPos * 0.5
        ? 10
        : 0;

    const totalVisits = events.filter((e) => e.event_type === "visit").length || 1;
    const negativeEvents = events.filter((e) => e.event_type === "negative").length;
    const ratio = negativeEvents / totalVisits;
    let feedbackScore = ratio > 0.15 ? 5 : ratio > 0.05 ? 15 : 25;

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentActivity = events.filter(
      (e) => (e.event_type === "sms_sent" || e.event_type === "invoice_email_sent") && e.created_at >= thirtyDaysAgo
    ).length;
    let activityScore = recentActivity >= 10 ? 15 : recentActivity >= 1 ? 8 : 0;

    const totalScore = ratingScore + velocityScore + feedbackScore + activityScore;

    await supabase.from("reputation_scores").insert({
      business_slug: biz.slug,
      score: totalScore,
      breakdown: { rating: ratingScore, velocity: velocityScore, feedback: feedbackScore, activity: activityScore },
      recorded_at: new Date().toISOString(),
    });
    count++;
  }

  return { saved: count };
}

module.exports = runReputationScores;