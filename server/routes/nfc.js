const express = require("express");
const stripe = require("../config/stripe");
const supabase = require("../config/database");
const emailService = require("../services/emailService");

const router = express.Router();

// Create NFC checkout
router.post("/create-nfc-checkout", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not logged in" });

  const { shipping_address } = req.body;
  const slug = req.session.slug;

  if (!shipping_address || shipping_address.trim().length < 10) {
    return res.status(400).json({ error: "Please enter a full shipping address" });
  }

  const priceId = process.env.NFC_CARD_PRICE_ID;
  if (!priceId) {
    console.error("Missing NFC_CARD_PRICE_ID env var");
    return res.status(500).json({ error: "Pricing configuration error" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      success_url: `${process.env.BASE_URL}/nfc-success?slug=${slug}`,
      cancel_url: `${process.env.BASE_URL}/for-business`,
      metadata: {
        slug: slug,
        shipping_address: shipping_address,
        product: "nfc_card",
      },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("NFC checkout error:", err.message);
    res.status(500).json({ error: "Could not create checkout" });
  }
});

// NFC success page
router.get("/nfc-success", async (req, res) => {
  const { slug } = req.query;

  if (!slug) {
    return res.redirect("/for-business");
  }

  await supabase
    .from("businesses")
    .update({
      nfc_card_ordered: true,
      nfc_card_order_date: new Date().toISOString(),
      shipping_address: req.body?.shipping_address || null,
    })
    .eq("slug", slug);

  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("name, shipping_address, email")
      .eq("slug", slug)
      .single();

    const resend = require("../config/resend");
    await resend.emails.send({
      from: `ReviewLift Orders <orders@${process.env.EMAIL_DOMAIN || "reviewlift.app"}>`,
      to: "billy@reviewlift.app",
      subject: `📦 New NFC Card Order — ${business?.name || slug}`,
      html: `
        <h2>📦 New NFC Card Order</h2>
        <p><strong>Business:</strong> ${business?.name || slug}</p>
        <p><strong>Slug:</strong> ${slug}</p>
        <p><strong>Email:</strong> ${business?.email || "Not found"}</p>
        <p><strong>Shipping address:</strong> ${business?.shipping_address || "Not saved"}</p>
      `,
    });
  } catch (emailErr) {
    console.error("NFC order notification email failed:", emailErr.message);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>NFC Card Ordered</title><link rel="stylesheet" href="/style.css"></head>
    <body style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">
      <div style="max-width:480px;text-align:center;background:var(--surface);border-radius:20px;padding:40px;">
        <span style="font-size:3rem;">📦</span>
        <h2>NFC Card Ordered!</h2>
        <p>Your tap-to-review card will be shipped within 2 business days.</p>
        <a href="/for-business" style="display:inline-block;background:var(--accent);color:#1A1A18;padding:12px 28px;border-radius:8px;">Back to Dashboard →</a>
      </div>
    </body>
    </html>
  `);
});

// Update shipping address
router.post("/update-shipping-address", async (req, res) => {
  if (!req.session.slug) return res.status(401).json({ error: "Not logged in" });

  const { shipping_address } = req.body;
  const slug = req.session.slug;

  if (!shipping_address || shipping_address.trim().length < 10) {
    return res.status(400).json({ error: "Please enter a full shipping address" });
  }

  const { error } = await supabase.from("businesses").update({ shipping_address: shipping_address.trim() }).eq("slug", slug);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

// Admin: Mark card as shipped
router.post("/admin/mark-card-shipped", async (req, res) => {
  const { admin_key, slug, tracking_number } = req.body;

  if (admin_key !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { error } = await supabase.from("businesses").update({ nfc_card_tracking_number: tracking_number }).eq("slug", slug);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  try {
    const { data: business } = await supabase.from("businesses").select("name, email").eq("slug", slug).single();

    if (business && business.email) {
      await emailService.sendNFCShippingConfirmation(business.email, business.name, tracking_number);
    }
  } catch (emailErr) {
    console.error("Shipping notification email failed:", emailErr.message);
  }

  res.json({ success: true });
});

// Admin NFC orders page
router.get("/admin-nfc", (req, res) => {
  const { key } = req.query;
  if (key !== process.env.ADMIN_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>NFC Card Orders</title><style>
      body { background:#1A1A18; color:#EAE7DC; font-family:sans-serif; padding:40px; }
      table { width:100%; border-collapse:collapse; }
      th, td { padding:12px; text-align:left; border-bottom:1px solid #333; }
      th { color:#C8A96E; }
      .btn-ship { background:#C8A96E; color:#1A1A18; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; }
    </style></head>
    <body>
      <h1>NFC Card Orders</h1>
      <div id="orders"></div>
      <script>
        async function load() {
          const res = await fetch('/admin/nfc-orders?key=${key}');
          const data = await res.json();
          let html = '<table><tr><th>Business</th><th>Email</th><th>Address</th><th>Tracking</th><th>Action</th></tr>';
          data.orders.forEach(o => {
            html += \`<tr>
              <td>\${o.name}</td>
              <td>\${o.email}</td>
              <td>\${o.shipping_address || ''}</td>
              <td><input id="tracking_\${o.slug}" value="\${o.tracking_number || ''}"></td>
              <td><button onclick="markShipped('\${o.slug}')">✈️ Mark Shipped</button></td>
            </tr>\`;
          });
          html += '</table>';
          document.getElementById('orders').innerHTML = html;
        }
        async function markShipped(slug) {
          const tracking = document.getElementById('tracking_' + slug).value;
          await fetch('/admin/mark-card-shipped', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ admin_key: '${key}', slug, tracking_number: tracking })
          });
          load();
        }
        load();
      </script>
    </body>
    </html>
  `);
});

// API endpoint for NFC orders
router.get("/admin/nfc-orders", async (req, res) => {
  const { key } = req.query;
  if (key !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { data: orders, error } = await supabase
    .from("businesses")
    .select("slug, name, email, shipping_address, nfc_card_ordered, nfc_card_order_date, nfc_card_tracking_number")
    .eq("nfc_card_ordered", true)
    .order("nfc_card_order_date", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  let totalRevenue = 0;
  let pending = 0;
  let shipped = 0;

  const processedOrders = orders.map((order) => {
    const hasTracking = order.nfc_card_tracking_number && order.nfc_card_tracking_number.length > 0;
    if (hasTracking) shipped++;
    else pending++;
    totalRevenue += 9.99;

    return {
      slug: order.slug,
      name: order.name,
      email: order.email,
      shipping_address: order.shipping_address,
      order_date: order.nfc_card_order_date,
      tracking_number: order.nfc_card_tracking_number,
    };
  });

  res.json({
    total: orders.length,
    pending,
    shipped,
    total_revenue: totalRevenue.toFixed(2),
    orders: processedOrders,
  });
});

module.exports = router;