const supabase = require("../config/database");

async function markConversions() {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: sends } = await supabase
    .from("events")
    .select("id, business_slug, sent_at")
    .in("event_type", ["sms_sent", "email_sent"])
    .is("converted", null)
    .gte("sent_at", fortyEightHoursAgo);

  if (!sends || sends.length === 0) return { marked: 0 };

  let count = 0;
  for (const send of sends) {
    const sentDate = new Date(send.sent_at);
    const cutoffDate = new Date(sentDate.getTime() + 48 * 60 * 60 * 1000).toISOString();
    const nowCheck = new Date();

    if (nowCheck > new Date(sentDate.getTime() + 48 * 60 * 60 * 1000)) {
      const { data: responses } = await supabase
        .from("events")
        .select("id")
        .eq("business_slug", send.business_slug)
        .in("event_type", ["positive", "negative"])
        .gte("created_at", send.sent_at)
        .lte("created_at", cutoffDate)
        .limit(1);

      await supabase.from("events").update({ converted: responses && responses.length > 0 }).eq("id", send.id);
      count++;
    }
  }

  return { marked: count };
}

module.exports = markConversions;