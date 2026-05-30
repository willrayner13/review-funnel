// SMS limits
const SMS_TRIAL_LIMIT = 50;
const SMS_MONTHLY_LIMIT = 300;

// Milestones
const MILESTONES = [10, 25, 50, 100, 250, 500];

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

// HTML pages
const HTML_PAGES = [
  "admin", "login", "for-business", "lapsed", "success", "cancel",
  "thanks", "bad", "landing", "demo", "billing", "settings",
  "about", "contact", "blog", "partner"
];

module.exports = {
  SMS_TRIAL_LIMIT,
  SMS_MONTHLY_LIMIT,
  MILESTONES,
  INDUSTRY_DEFAULTS,
  HTML_PAGES,
};