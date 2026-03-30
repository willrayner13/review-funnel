const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_KEY
)

require("dotenv").config()

const express = require("express")
const bodyParser = require("body-parser")
const cors = require("cors")
const { Resend } = require("resend")

const app = express()
const resend = new Resend(process.env.RESEND_API_KEY)

app.use(cors())
app.use(bodyParser.json())
app.use(express.static("public"))

const businesses = {
  "emmas-salon": {
    review: "https://g.page/r/REVIEW_LINK/review",
    email: "owner@email.com"
  }
}

app.get("/:business", async (req,res)=>{

const slug = req.params.business

const { data } = await supabase
.from("businesses")
.select("*")
.eq("slug",slug)
.single()

if(!data){
return res.send("Business not found")
}

await supabase.from("events").insert({
business_slug: slug,
event_type:"visit"
})

res.sendFile(__dirname + "/public/index.html")

})

app.post("/feedback", async (req, res) => {

  const { business, message } = req.body

  const data = await resend.emails.send({
    from: "feedback@yourdomain.com",
    to: businesses[business].email,
    subject: "Customer Feedback",
    html: `<p>${message}</p>`
  })

  res.json({ success: true })
})

app.post("/positive", async (req,res)=>{

const { slug } = req.body

await supabase.from("events").insert({
business_slug:slug,
event_type:"positive"
})

res.json({success:true})

})

app.post("/review-click", async (req,res)=>{

const { slug } = req.body

await supabase.from("events").insert({
business_slug:slug,
event_type:"review_click"
})

res.json({success:true})

})

await supabase.from("events").insert({
business_slug:business,
event_type:"negative"
})

app.get("/stats/:slug", async(req,res)=>{

const { data } = await supabase
.from("events")
.select("event_type")
.eq("business_slug",req.params.slug)

const stats = {
visits:0,
positive:0,
negative:0,
reviews:0
}

data.forEach(e=>{
if(e.event_type==="visit") stats.visits++
if(e.event_type==="positive") stats.positive++
if(e.event_type==="negative") stats.negative++
if(e.event_type==="review_click") stats.reviews++
})

res.json(stats)

})

const QRCode = require("qrcode")

app.get("/qr/:slug", async(req,res)=>{

const url = `https://yourdomain.com/${req.params.slug}`

const qr = await QRCode.toDataURL(url)

res.send(`<img src="${qr}" />`)

})

app.listen(3000, () => {
  console.log("Server running")
})

app.post("/create-business", async (req,res)=>{

const { name, email, review } = req.body

const slug = name
.toLowerCase()
.replace(/[^a-z0-9]/g,"-")

const { data, error } = await supabase
.from("businesses")
.insert({
name,
email,
review_link: review,
slug
})

if(error){
return res.status(500).json(error)
}

res.json({
success:true,
slug
})

})