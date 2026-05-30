const express = require("express");
const bcrypt = require("bcrypt");
const supabase = require("../config/database");
const resend = require("../config/resend");

const router = express.Router();

// Get agency clients
router.get("/agency/clients", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const agencySlug = req.session.slug;

  const { data: agency } = await supabase
    .from("businesses")
    .select("plan_type, subscription_active, agency_name")
    .eq("slug", agencySlug)
    .single();

  if (!agency || agency.plan_type !== "agency" || !agency.subscription_active) {
    return res.status(403).json({ error: "Agency plan required" });
  }

  const { data: clients, error } = await supabase
    .from("agency_clients")
    .select(
      `
      client_slug,
      status,
      created_at,
      businesses:client_slug (
        name,
        email,
        plan_type,
        subscription_active,
        created_at
      )
    `
    )
    .eq("agency_slug", agencySlug)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const clientsWithStats = await Promise.all(
    (clients || []).map(async (client) => {
      const slug = client.client_slug;
      const biz = client.businesses;

      const { data: events } = await supabase
        .from("events")
        .select("event_type, created_at")
        .eq("business_slug", slug)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      const positiveCount = (events || []).filter((e) => e.event_type === "positive").length;
      const visitCount = (events || []).filter((e) => e.event_type === "visit").length;
      const conversionRate = visitCount > 0 ? Math.round((positiveCount / visitCount) * 100) : 0;

      return {
        slug: slug,
        name: biz?.name || slug,
        email: biz?.email,
        plan: biz?.plan_type || "starter",
        status: client.status,
        active_subscription: biz?.subscription_active || false,
        joined: client.created_at,
        positive_count: positiveCount,
        conversion_rate: conversionRate,
      };
    })
  );

  const { count: totalClients } = await supabase
    .from("agency_clients")
    .select("*", { count: "exact", head: true })
    .eq("agency_slug", agencySlug);

  const { count: activeClients } = await supabase
    .from("agency_clients")
    .select("*", { count: "exact", head: true })
    .eq("agency_slug", agencySlug)
    .eq("status", "active");

  const remainingSlots = Math.max(0, 10 - (totalClients || 0));

  res.json({
    agency: {
      name: agency.agency_name || agencySlug,
      slug: agencySlug,
      total_clients: totalClients || 0,
      active_clients: activeClients || 0,
      remaining_slots: remainingSlots,
    },
    clients: clientsWithStats,
  });
});

// Create client under agency
router.post("/agency/create-client", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const agencySlug = req.session.slug;
  const { name, email, review_link } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Business name and email required" });
  }

  const { data: agency } = await supabase
    .from("businesses")
    .select("plan_type, subscription_active, agency_name")
    .eq("slug", agencySlug)
    .single();

  if (!agency || agency.plan_type !== "agency" || !agency.subscription_active) {
    return res.status(403).json({ error: "Agency plan required" });
  }

  const { count: currentClients } = await supabase
    .from("agency_clients")
    .select("*", { count: "exact", head: true })
    .eq("agency_slug", agencySlug);

  if ((currentClients || 0) >= 10) {
    return res.status(403).json({
      error: "Client limit reached (10). Please contact support to upgrade.",
    });
  }

  let slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.floor(Math.random() * 10000);

  let slugExists = true;
  while (slugExists) {
    const { data: existing } = await supabase.from("businesses").select("slug").eq("slug", slug).single();
    if (!existing) {
      slugExists = false;
    } else {
      slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.floor(Math.random() * 10000);
    }
  }

  const tempPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-4);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  const { data: newClient, error: clientError } = await supabase
    .from("businesses")
    .insert({
      name: name.trim(),
      email: email.trim(),
      review_link: review_link || "",
      slug: slug,
      password: hashedPassword,
      plan_type: "starter",
      subscription_active: false,
      trial_ends_at: trialEnd.toISOString(),
      referred_by: agencySlug,
    })
    .select()
    .single();

  if (clientError) {
    console.error("Client creation error:", clientError);
    return res.status(500).json({ error: clientError.message });
  }

  const { error: relationError } = await supabase.from("agency_clients").insert({
    agency_slug: agencySlug,
    client_slug: slug,
    status: "active",
    created_at: new Date().toISOString(),
  });

  if (relationError) {
    await supabase.from("businesses").delete().eq("slug", slug);
    return res.status(500).json({ error: relationError.message });
  }

  try {
    const funnelUrl = `${process.env.BASE_URL}/r/${slug}`;
    const dashboardUrl = `${process.env.BASE_URL}/login`;
    const agencyName = agency.agency_name || agencySlug;

    await resend.emails.send({
      from: `${agencyName} <reviews@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
      to: email,
      subject: `${name} — Your review funnel is ready`,
      html: `
        <h2>Your review funnel is ready</h2>
        <p>${agencyName} has set up your ReviewLift account.</p>
        <p><strong>Dashboard:</strong> <a href="${dashboardUrl}">${dashboardUrl}</a></p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Temporary Password:</strong> <code>${tempPassword}</code></p>
        <p><strong>Your funnel link:</strong> <a href="${funnelUrl}">${funnelUrl}</a></p>
      `,
    });
  } catch (emailErr) {
    console.error("Welcome email failed:", emailErr.message);
  }

  res.json({
    success: true,
    client: {
      slug: slug,
      name: name,
      email: email,
      temporary_password: tempPassword,
    },
  });
});

// Switch to client view
router.post("/agency/switch-client/:clientSlug", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const agencySlug = req.session.slug;
  const { clientSlug } = req.params;

  const { data: relation, error } = await supabase
    .from("agency_clients")
    .select("status")
    .eq("agency_slug", agencySlug)
    .eq("client_slug", clientSlug)
    .single();

  if (error || !relation) {
    return res.status(403).json({ error: "Not authorized to access this client" });
  }

  req.session.agency_mode = true;
  req.session.original_slug = agencySlug;
  req.session.slug = clientSlug;

  await new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  res.json({ success: true, client_slug: clientSlug, message: "Switched to client view" });
});

// Exit client mode
router.post("/agency/exit-client-mode", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  if (req.session.agency_mode && req.session.original_slug) {
    req.session.slug = req.session.original_slug;
    req.session.agency_mode = false;
    delete req.session.original_slug;

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ success: true, message: "Returned to agency view" });
  } else {
    res.json({ success: false, message: "Not in client mode" });
  }
});

// Remove client
router.delete("/agency/remove-client/:clientSlug", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const agencySlug = req.session.slug;
  const { clientSlug } = req.params;

  const { data: relation, error } = await supabase
    .from("agency_clients")
    .select("id")
    .eq("agency_slug", agencySlug)
    .eq("client_slug", clientSlug)
    .single();

  if (error || !relation) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const { error: updateError } = await supabase
    .from("agency_clients")
    .update({ status: "inactive" })
    .eq("agency_slug", agencySlug)
    .eq("client_slug", clientSlug);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  res.json({ success: true, message: "Client removed" });
});

// Agency earnings
router.get("/agency/earnings", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const agencySlug = req.session.slug;

  const { data: agency } = await supabase
    .from("businesses")
    .select("plan_type, subscription_active")
    .eq("slug", agencySlug)
    .single();

  if (!agency || agency.plan_type !== "agency") {
    return res.status(403).json({ error: "Agency plan required" });
  }

  const { data: clients } = await supabase
    .from("agency_clients")
    .select(
      `
      client_slug,
      businesses:client_slug (
        plan_type,
        subscription_active
      )
    `
    )
    .eq("agency_slug", agencySlug)
    .eq("status", "active");

  const payingClients = (clients || []).filter((c) => c.businesses?.subscription_active === true);

  const monthlyEarnings = payingClients.reduce((sum, c) => {
    const plan = c.businesses?.plan_type || "starter";
    let price = plan === "pro" ? 24.99 : plan === "agency" ? 79 : 9.99;
    return sum + price;
  }, 0);

  const { data: referrals } = await supabase
    .from("businesses")
    .select("plan_type, subscription_active")
    .eq("referred_by", agencySlug);

  const referralEarnings = (referrals || []).reduce((sum, r) => {
    if (r.subscription_active) {
      let price = r.plan_type === "pro" ? 24.99 : r.plan_type === "agency" ? 79 : 9.99;
      return sum + price * 0.3;
    }
    return sum;
  }, 0);

  res.json({
    agency_slug: agencySlug,
    managed_clients: payingClients.length,
    referral_clients: (referrals || []).length,
    monthly_managed_earnings: monthlyEarnings,
    monthly_referral_earnings: referralEarnings,
    total_monthly_earnings: monthlyEarnings + referralEarnings,
  });
});

// Update agency settings (white-label)
router.post("/update-agency-settings", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not authorised" });

  const { agency_name, agency_logo_url } = req.body;
  const { error } = await supabase
    .from("businesses")
    .update({ agency_name: agency_name || null, agency_logo_url: agency_logo_url || null })
    .eq("slug", req.session.slug);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;