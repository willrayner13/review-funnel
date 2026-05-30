const Stripe = require("stripe");

let stripe = null;
if (process.env.STRIPE_SECRET) {
  stripe = new Stripe(process.env.STRIPE_SECRET);
} else {
  console.log("Stripe key missing - skipping Stripe init");
}

module.exports = stripe;