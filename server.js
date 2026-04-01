require("dotenv").config()
const express = require("express")
const bodyParser = require("body-parser")
const cors = require("cors")
const { createClient } = require("@supabase/supabase-js")
const { Resend } = require("resend")
const QRCode = require("qrcode")
const cron = require("node-cron")
const fs = require("fs")
const bcrypt = require("bcrypt")
const session = require("express-session")
const twilio = require("twilio")
const OpenAI = require("openai")
const Stripe = require("stripe")

const stripe = new Stripe(process.env.STRIPE_SECRET)


const twilioClient = twilio(
 process.env.TWILIO_SID,
 process.env.TWILIO_TOKEN
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const app = express()
app.use(cors())
app.use(bodyParser.json())
app.use(express.static("public"))
app.use(session({
 secret: "supersecretkey",
 resave: false,
 saveUninitialized: false,
 cookie: { secure: false }
}))

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

/* ------------------------
VISIT PAGE
------------------------ */
app.get("/r/:business", async (req, res) => {

  const slug = req.params.business

  const { data } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .single()

  if (!data) return res.send("Business not found")

  await supabase.from("events").insert({
    business_slug: slug,
    event_type: "visit"
  })

  const page = fs.readFileSync("./public/index.html", "utf8")

  res.send(`
  <html>

  <script>
    window.businessName="${data.name}"
    window.slug="${slug}"
    window.reviewLink="${data.review_link}"
  </script>

  ${page}

  </html>
  `)

})

/* ------------------------
REVIEW REDIRECT
------------------------ */
app.get("/review/:slug", async (req, res) => {
  const slug = req.params.slug
  const { data } = await supabase.from("businesses").select("review_link").eq("slug", slug).single()
  res.redirect(data.review_link)
})

/* ------------------------
POSITIVE
------------------------ */
app.post("/positive", async (req, res) => {

  console.log("Positive endpoint hit")
  console.log(req.body)

  const { slug } = req.body

  const { error } = await supabase
    .from("events")
    .insert({
      business_slug: slug,
      event_type: "positive"
    })

  if(error){
    console.log("SUPABASE ERROR:", error)
    return res.status(500).json(error)
  }

  res.json({ success: true })

})

/* ------------------------
REVIEW CLICK
------------------------ */
app.post("/review-click", async (req, res) => {

  console.log("Review click endpoint hit")
  console.log(req.body)

  const { slug } = req.body

  const { error } = await supabase
    .from("events")
    .insert({
      business_slug: slug,
      event_type: "review_click"
    })

  if(error){
    console.log("SUPABASE ERROR:", error)
    return res.status(500).json(error)
  }

  res.json({ success: true })

})

/* ------------------------
NEGATIVE FEEDBACK
------------------------ */
app.post("/feedback", async (req, res) => {

  console.log("Feedback endpoint hit")
  console.log(req.body)

  const { business, message } = req.body

  const { data, error } = await supabase
    .from("events")
    .insert({
      business_slug: business,
      event_type: "negative",
      message: message
    })

  if (error) {
    console.log("SUPABASE ERROR:", error)
    return res.status(500).json(error)
  }

  console.log("Feedback saved:", data)

  res.json({ success: true })

})

/* ------------------------
NEGATIVE FEEDBACK MESSAGES (DASHBOARD)
------------------------ */
app.get("/feedback-messages/:slug", async(req,res)=>{

   if(req.session.slug !== req.params.slug)
   return res.status(401).json({error:"Not authorised"})
  const { data } = await supabase.from("events")
    .select("message, created_at")
    .eq("business_slug", req.params.slug)
    .eq("event_type", "negative")
  res.json(data || [])
})

/* ------------------------
ANALYTICS
------------------------ */
app.get("/stats/:slug", async (req, res) => {

   if(req.session.slug !== req.params.slug)
   return res.status(401).json({error:"Not authorised"})
  const { data } = await supabase.from("events").select("event_type").eq("business_slug", req.params.slug)
const stats = { visits: 0, positive: 0, negative: 0, reviews: 0 }

data.forEach(e => {
 if (e.event_type === "visit") stats.visits++
 if (e.event_type === "positive") stats.positive++
 if (e.event_type === "negative") stats.negative++
 if (e.event_type === "review_click") stats.reviews++
})

stats.conversion_rate = stats.visits > 0
 ? ((stats.positive / stats.visits) * 100).toFixed(1)
 : 0

stats.negative_rate = stats.visits > 0
 ? ((stats.negative / stats.visits) * 100).toFixed(1)
 : 0

res.json(stats)
})

/* ------------------------
QR CODE DOWNLOAD
------------------------ */
app.get("/qr-download/:slug", async (req, res) => {

   if(req.session.slug !== req.params.slug)
   return res.status(401).json({error:"Not authorised"})
const url = `${process.env.BASE_URL}/r/${req.params.slug}`
  const qr = await QRCode.toBuffer(url)
  res.setHeader("Content-Type", "image/png")
  res.setHeader("Content-Disposition", "attachment; filename=review-qr.png")
  res.send(qr)
})

/* ------------------------
CREATE BUSINESS WITH PASSWORD
------------------------ */
app.post("/create-business", async(req,res)=>{
  const { name,email,review,password } = req.body
  if(!password || password.length<4) return res.status(400).json({error:"Password required (min 4 characters)"})
  const slug=name.toLowerCase().replace(/[^a-z0-9]/g,"-")
  const hashedPassword = await bcrypt.hash(password, 10)

const { error } = await supabase.from("businesses").insert({
 name,
 email,
 review_link: review,
 slug,
 password: hashedPassword
})
  if(error) return res.status(500).json(error)
  res.json({ success:true, slug })
})

/* ------------------------
VERIFY DASHBOARD LOGIN
------------------------ */
app.post("/verify-login", async(req,res)=>{

 const { slug, password } = req.body

 const { data } = await supabase
   .from("businesses")
   .select("*")
   .eq("slug", slug)
   .single()

 if(!data) return res.json({success:false})

 const valid = await bcrypt.compare(password, data.password)

 if(!valid) return res.json({success:false})

 req.session.slug = slug

 res.json({success:true})

})

/* ------------------------
WEEKLY EMAIL REPORT
------------------------ */
cron.schedule("0 9 * * MON", async () => {
  console.log("Sending weekly reports")
  const { data: businesses } = await supabase.from("businesses").select("*")
  for (const business of businesses) {
    const { data: events } = await supabase.from("events").select("event_type").eq("business_slug", business.slug)
    let visits=0, positive=0, negative=0, reviews=0
    events.forEach(e=>{
      if(e.event_type==="visit") visits++
      if(e.event_type==="positive") positive++
      if(e.event_type==="negative") negative++
      if(e.event_type==="review_click") reviews++
    })
    await resend.emails.send({
      from:"reports@yourdomain.com",
      to: business.email,
      subject:"Your Weekly Review Report",
      html:`
        <h2>${business.name} Review Report</h2>
        <p>Visits: ${visits}</p>
        <p>Happy customers: ${positive}</p>
        <p>Negative feedback: ${negative}</p>
        <p>Review clicks: ${reviews}</p>
      `
    })
  }
})

/* ------------------------
SEND SMS REVIEW REQUEST
------------------------ */
/* ------------------------
SEND SMS REVIEW REQUEST
------------------------ */
app.post("/send-sms", async(req,res)=>{
  const { phone, slug } = req.body
  try {
    const { data } = await supabase.from("businesses").select("*").eq("slug", slug).single()
    if(!data) return res.status(404).json({error:"Business not found"})

    const message = `Hi! Thanks for visiting ${data.name} today. If you had a great experience, we’d really appreciate a review: ${process.env.BASE_URL}/${slug}`

    await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE,
      to: phone,
      body: message
    })

    res.json({success:true})
  } catch(err){
    console.log(err)
    res.status(500).json({error:err.message})
  }
})

/* ------------------------
AI FEEDBACK SUMMARY
------------------------ */
app.get("/ai-feedback/:slug", async(req,res)=>{

 if(req.session.slug !== req.params.slug)
  return res.status(401).json({error:"Not authorised"})

 const { data } = await supabase
   .from("events")
   .select("message")
   .eq("business_slug", req.params.slug)
   .eq("event_type","negative")

 if(!data || data.length===0)
  return res.json({summary:"No feedback yet."})

 const messages = data.map(m=>m.message).join("\n")

 const response = await openai.chat.completions.create({
   model:"gpt-4o-mini",
   messages:[
     {
      role:"system",
      content:"Summarise customer complaints into key issues."
     },
     {
      role:"user",
      content:messages
     }
   ]
 })

 res.json({
  summary:response.choices[0].message.content
 })

})

app.post("/create-checkout", async(req,res)=>{
  const { slug } = req.body
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items:[{price:process.env.PRICE_STARTER, quantity:1}],
    mode:"subscription",
    success_url:`${process.env.BASE_URL}/success.html`,
    cancel_url:`${process.env.BASE_URL}/cancel.html`,
    metadata:{slug}
  })
  res.json({url:session.url})
})

app.post("/stripe-webhook",
 express.raw({type:"application/json"}),
 async(req,res)=>{
   const sig = req.headers["stripe-signature"]
   let event
   try{
     event = stripe.webhooks.constructEvent(req.body,sig,process.env.STRIPE_WEBHOOK_SECRET)
   }catch(err){return res.status(400).send("Webhook error")}
   
   if(event.type==="checkout.session.completed"){
     const session = event.data.object
     const slug = session.metadata.slug
     await supabase.from("businesses").update({subscription_active:true}).eq("slug",slug)
   }
   res.json({received:true})
 })

app.post("/generate-reply", async(req,res)=>{
  const { review } = req.body
  try{
    const response = await openai.chat.completions.create({
      model:"gpt-4o-mini",
      messages:[
        {role:"system", content:"Write a short professional reply to a customer review for a local business."},
        {role:"user", content: review}
      ]
    })
    res.json({reply: response.choices[0].message.content})
  }catch(err){
    console.log(err)
    res.status(500).json({error:"AI error"})
  }
})

/* ------------------------
START SERVER
------------------------ */
app.listen(3000,()=>{console.log("Server running on port 3000")})