const rateLimit = require("express-rate-limit");

const smsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts. Please try again in 15 minutes." },
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "Too many requests. Please try again in an hour." },
});

module.exports = { smsLimiter, authLimiter, forgotLimiter };