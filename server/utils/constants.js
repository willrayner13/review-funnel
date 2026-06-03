// SMS limits
const SMS_TRIAL_LIMIT = 50;
const SMS_MONTHLY_LIMIT = 300;

// Milestones
const MILESTONES = [10, 25, 50, 100, 250, 500];

// HTML pages served directly
const HTML_PAGES = [
  "admin", "login", "for-business", "lapsed", "success", "cancel",
  "thanks", "bad", "demo", "billing", "settings",
  "about", "contact", "blog", "partner"
];

// Industry defaults for send intelligence
const INDUSTRY_DEFAULTS = {
  dentist: { bestChannel: "sms", bestWindow: "10am-12pm, next day", smsRate: 22, emailRate: 8 },
  plumber: { bestChannel: "email", bestWindow: "8am-10am, next morning", smsRate: 18, emailRate: 14 },
  electrician: { bestChannel: "sms", bestWindow: "8am-10am, next day", smsRate: 20, emailRate: 10 },
  salon: { bestChannel: "sms", bestWindow: "2pm-4pm, same day", smsRate: 24, emailRate: 7 },
  builder: { bestChannel: "email", bestWindow: "2-3 days after completion", smsRate: 12, emailRate: 16 },
  restaurant: { bestChannel: "sms", bestWindow: "6pm-8pm, same evening", smsRate: 19, emailRate: 5 },
  gym: { bestChannel: "sms", bestWindow: "6pm-8pm, same day", smsRate: 21, emailRate: 9 },
  cleaner: { bestChannel: "sms", bestWindow: "10am-12pm, next day", smsRate: 20, emailRate: 8 },
  accountant: { bestChannel: "email", bestWindow: "2pm-4pm, next day", smsRate: 10, emailRate: 15 },
  solicitor: { bestChannel: "email", bestWindow: "10am-12pm, next day", smsRate: 8, emailRate: 14 },
  "estate-agent": { bestChannel: "email", bestWindow: "2pm-4pm, next day", smsRate: 11, emailRate: 13 },
  vet: { bestChannel: "sms", bestWindow: "10am-12pm, next day", smsRate: 22, emailRate: 9 },
  physio: { bestChannel: "sms", bestWindow: "2pm-4pm, same day", smsRate: 21, emailRate: 10 },
  other: { bestChannel: "sms", bestWindow: "10am-2pm, next day", smsRate: 18, emailRate: 10 },
};

// Industry benchmarks for analytics
const INDUSTRY_BENCHMARKS = {
  dentist: {
    avgRating: 4.7,
    conversionRate: 32,
    reviewVelocity: 12,
    responseRate: 68,
    description: "Dental practices"
  },
  plumber: {
    avgRating: 4.5,
    conversionRate: 24,
    reviewVelocity: 8,
    responseRate: 52,
    description: "Plumbing & heating businesses"
  },
  electrician: {
    avgRating: 4.6,
    conversionRate: 26,
    reviewVelocity: 9,
    responseRate: 58,
    description: "Electrical services"
  },
  salon: {
    avgRating: 4.8,
    conversionRate: 38,
    reviewVelocity: 15,
    responseRate: 72,
    description: "Hair & beauty salons"
  },
  builder: {
    avgRating: 4.4,
    conversionRate: 22,
    reviewVelocity: 6,
    responseRate: 48,
    description: "Construction & building"
  },
  restaurant: {
    avgRating: 4.6,
    conversionRate: 28,
    reviewVelocity: 18,
    responseRate: 45,
    description: "Restaurants & cafés"
  },
  gym: {
    avgRating: 4.7,
    conversionRate: 30,
    reviewVelocity: 10,
    responseRate: 55,
    description: "Gyms & fitness centres"
  },
  cleaner: {
    avgRating: 4.8,
    conversionRate: 35,
    reviewVelocity: 11,
    responseRate: 62,
    description: "Cleaning services"
  },
  accountant: {
    avgRating: 4.6,
    conversionRate: 28,
    reviewVelocity: 5,
    responseRate: 70,
    description: "Accounting firms"
  },
  solicitor: {
    avgRating: 4.5,
    conversionRate: 26,
    reviewVelocity: 4,
    responseRate: 65,
    description: "Legal services"
  },
  "estate-agent": {
    avgRating: 4.4,
    conversionRate: 24,
    reviewVelocity: 7,
    responseRate: 50,
    description: "Estate agents"
  },
  vet: {
    avgRating: 4.8,
    conversionRate: 34,
    reviewVelocity: 10,
    responseRate: 66,
    description: "Veterinary practices"
  },
  physio: {
    avgRating: 4.8,
    conversionRate: 36,
    reviewVelocity: 12,
    responseRate: 68,
    description: "Physiotherapy & health"
  },
  other: {
    avgRating: 4.6,
    conversionRate: 28,
    reviewVelocity: 8,
    responseRate: 55,
    description: "Similar businesses"
  }
};

// Add to exports at the bottom
module.exports = {
  SMS_TRIAL_LIMIT,
  SMS_MONTHLY_LIMIT,
  MILESTONES,
  HTML_PAGES,
  INDUSTRY_DEFAULTS,
  INDUSTRY_BENCHMARKS  // ← ADD THIS
};

