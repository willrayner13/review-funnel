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

app.get("/:business", (req, res) => {
  const business = businesses[req.params.business]

  if (!business) {
    return res.send("Business not found")
  }

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

app.listen(3000, () => {
  console.log("Server running")
})