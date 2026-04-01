require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const twilio = require("twilio");
const OpenAI = require("openai");
const Stripe = require("stripe");
const rateLimit = require("express-rate-limit")

const smsLimiter = rateLimit({
windowMs:60*1000,
max:5
})

let stripe;
if (process.env.STRIPE_SECRET) {
  stripe = new Stripe(process.env.STRIPE_SECRET);
} else {
  console.log("Stripe key missing - skipping Stripe init");
}

const twilioClient = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_TOKEN
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(session({
  secret: "supersecretkey",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// List of HTML pages for pretty URLs
const htmlPages = [
  "admin",
  "for-business",
  "success",
  "cancel",
  "thanks",
  "bad"
];

// Create a route for each page
htmlPages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.resolve("public", `${page}.html`));
  });
});


const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);



/* ------------------------
VISIT PAGE
------------------------ */
app.get("/r/:business", async (req, res) => {
  const slug = req.params.business;

  const { data } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!data) return res.send("Business not found");

  await supabase.from("events").insert({
    business_slug: slug,
    event_type: "visit"
  });

  const pagePath = path.join(__dirname, "public", "index.html");
  const page = fs.readFileSync(pagePath, "utf8");

  res.send(`
  <html>
    <script>
      window.businessName="${data.name}";
      window.slug="${slug}";
      window.reviewLink="${data.review_link}";
    </script>
    ${page}
  </html>
  `);
});

/* ------------------------
POSITIVE
------------------------ */
app.post("/positive", async (req, res) => {
  const { slug } = req.body;
  const { error } = await supabase
    .from("events")
    .insert({ business_slug: slug, event_type: "positive" });

  if (error) return res.status(500).json(error);

  res.json({ success: true });
});

/* ------------------------
RATING
------------------------ */
app.post("/rating", async (req, res) => {
  const { slug, rating } = req.body;

  const { error } = await supabase
    .from("events")
    .insert({
      business_slug: slug,
      event_type: "rating",
      rating
    });

  if (error) return res.status(500).json(error);

  res.json({ success: true });
});

/* ------------------------
REVIEW CLICK
------------------------ */
app.post("/review-click", async (req, res) => {
  const { slug } = req.body;
  const { error } = await supabase
    .from("events")
    .insert({ business_slug: slug, event_type: "review_click" });

  if (error) return res.status(500).json(error);

  res.json({ success: true });
});

/* ------------------------
NEGATIVE FEEDBACK
------------------------ */
app.post("/feedback", async (req, res) => {
  const { business, message } = req.body;
  const { error } = await supabase
    .from("events")
    .insert({
      business_slug: business,
      event_type: "negative",
      message
    });

  if (error) return res.status(500).json(error);

  res.json({ success: true });
});

/* ------------------------
ANALYTICS WITH RATING + SUBSCRIPTION STATUS
------------------------ */
app.get("/stats/:slug", async (req, res) => {
  if (req.session.slug !== req.params.slug) return res.status(401).json({ error: "Not authorised" });

  // Fetch business info (subscription status)
  const { data: businessData } = await supabase
    .from("businesses")
    .select("subscription_active, plan_type")
    .eq("slug", req.params.slug)
    .single();

  if (!businessData) return res.status(404).json({ error: "Business not found" });

  const { data } = await supabase.from("events")
    .select("event_type, rating")
    .eq("business_slug", req.params.slug);

  const stats = { visits: 0, positive: 0, negative: 0, reviews: 0, rating_avg: 0, rating_count: 0, rating_distribution: {}, subscription_active: businessData.subscription_active, plan_type: businessData.plan_type };

  let ratingTotal = 0;
  const ratingDist = {1:0,2:0,3:0,4:0,5:0};

  data.forEach(e => {
    if (e.event_type === "visit") stats.visits++;
    if (e.event_type === "positive") stats.positive++;
    if (e.event_type === "negative") stats.negative++;
    if (e.event_type === "review_click") stats.reviews++;
    if (e.event_type === "rating" && e.rating) {
      ratingTotal += e.rating;
      stats.rating_count++;
      ratingDist[e.rating] = (ratingDist[e.rating] || 0) + 1;
    }
  });

  stats.rating_avg = stats.rating_count ? (ratingTotal / stats.rating_count).toFixed(2) : 0;
  stats.rating_distribution = ratingDist;

  stats.conversion_rate = stats.visits ? ((stats.positive / stats.visits) * 100).toFixed(1) : 0;
  stats.negative_rate = stats.visits ? ((stats.negative / stats.visits) * 100).toFixed(1) : 0;

  res.json(stats);
});

/* ------------------------
DASHBOARD FEEDBACK
------------------------ */
app.get("/feedback-messages/:slug", async(req,res)=>{
   if(req.session.slug !== req.params.slug) return res.status(401).json({error:"Not authorised"});

   const { data } = await supabase.from("events")
    .select("message, created_at")
    .eq("business_slug", req.params.slug)
    .eq("event_type", "negative");

   res.json(data || []);
});

/* ------------------------
AI FEEDBACK SUMMARY
------------------------ */
app.get("/ai-feedback/:slug", async(req,res)=>{
 if(req.session.slug !== req.params.slug) return res.status(401).json({error:"Not authorised"});

 const { data } = await supabase
   .from("events")
   .select("message")
   .eq("business_slug", req.params.slug)
   .eq("event_type","negative");

 if(!data || data.length===0) return res.json({summary:"No feedback yet."});

 const messages = data.map(m=>m.message).join("\n");

 const response = await openai.chat.completions.create({
   model:"gpt-4o-mini",
   messages:[
     { role:"system", content:"Summarise customer complaints into key issues." },
     { role:"user", content:messages }
   ]
 });

 res.json({ summary: response.choices[0].message.content });
});

/* ------------------------
AI REVIEW REPLY
------------------------ */
app.post("/generate-reply", async(req,res)=>{
 const { review } = req.body;
 try{
   const response = await openai.chat.completions.create({
     model:"gpt-4o-mini",
     messages:[
       {role:"system", content:"Write a short professional reply to a customer review for a local business."},
       {role:"user", content: review}
     ]
   });
   res.json({reply: response.choices[0].message.content});
 }catch(err){
   console.log(err);
   res.status(500).json({error:"AI error"});
 }
});

/* ------------------------
CREATE BUSINESS
------------------------ */
app.post("/create-business", async(req,res)=>{
  try {
    const { name,email,review,password } = req.body;

    if(!password || password.length<4)
      return res.status(400).json({error:"Password required (min 4 characters)"});

    const slug = name.toLowerCase().replace(/[^a-z0-9]/g,"-") + "-" + Math.floor(Math.random()*10000);
    const hashedPassword = await bcrypt.hash(password, 10);

    const { error } = await supabase.from("businesses").insert({
      name,
      email,
      review_link:review,
      slug,
      password:hashedPassword,
      plan_type:'starter',
      subscription_active:false
    });

    if(error){
      console.log("Supabase error:", error);
      return res.status(500).json(error);
    }

    // ✅ Set session immediately
    req.session.slug = slug;

    res.json({ success:true, slug });
  } catch(err) {
    console.log("Server error:", err);
    res.status(500).json({error: err.message});
  }
});

/* ------------------------
VERIFY LOGIN
------------------------ */
app.post("/verify-login", async(req,res)=>{
 const { slug,password } = req.body;

 const { data } = await supabase.from("businesses")
   .select("*")
   .eq("slug", slug)
   .single();

 if(!data) return res.json({success:false});
 const valid = await bcrypt.compare(password, data.password);
 if(!valid) return res.json({success:false});

 req.session.slug = slug;
 res.json({success:true});
});

/* ------------------------
QR CODE DOWNLOAD
------------------------ */
app.get("/qr-download/:slug", async(req,res)=>{
   if(req.session.slug !== req.params.slug) return res.status(401).json({error:"Not authorised"});
   const url = `${process.env.BASE_URL}/r/${req.params.slug}`;
   const qr = await QRCode.toBuffer(url);
   res.setHeader("Content-Type","image/png");
   res.setHeader("Content-Disposition","attachment; filename=review-qr.png");
   res.send(qr);
});

/* ------------------------
SEND SMS
------------------------ */
app.post("/send-sms", smsLimiter, async(req,res)=>{
  const { phone, slug } = req.body;
  try{
    const { data } = await supabase.from("businesses").select("*").eq("slug", slug).single();
    if(!data) return res.status(404).json({error:"Business not found"});

    const message = `Hi! Thanks for visiting ${data.name} today. Please leave a review: ${process.env.BASE_URL}/r/${slug}`;

    await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE,
      to: phone,
      body: message
    });

    res.json({success:true});
  }catch(err){
    console.log(err);
    res.status(500).json({error:err.message});
  }
});

/* ------------------------
STRIPE CHECKOUT
------------------------ */
app.post("/create-checkout", async(req,res)=>{
  const { slug, plan } = req.body;
  const priceId = plan === 'pro' ? process.env.PRICE_PRO : process.env.PRICE_STARTER;

  const session = await stripe.checkout.sessions.create({
    payment_method_types:["card"],
    line_items:[{price:priceId, quantity:1}],
    mode:"subscription",
    success_url:`${process.env.BASE_URL}/success`,
    cancel_url:`${process.env.BASE_URL}/cancel`,
    metadata:{
slug: slug
}
  });

  res.json({url:session.url});
});

/* ------------------------
STRIPE WEBHOOK
------------------------ */
app.post("/stripe-webhook", express.raw({type:'application/json'}), async (req,res)=>{

const sig = req.headers["stripe-signature"]

let event

try{

event = stripe.webhooks.constructEvent(
req.body,
sig,
process.env.STRIPE_WEBHOOK_SECRET
)

}catch(err){

console.log("Webhook error:",err.message)
return res.status(400).send("Webhook error")

}

if(event.type === "checkout.session.completed"){

const session = event.data.object
const slug = session.metadata.slug

await supabase
.from("businesses")
.update({subscription_active:true})
.eq("slug",slug)
}

res.json({received:true})

})

const serverless = require("serverless-http");
module.exports = app;
module.exports.handler = serverless(app);