// Industry benchmarks for optimal review request timing

const INDUSTRY_BENCHMARKS = {
  'plumbing': { optimal_delay: 4, conversion_rate: 22, best_time: 'Evening' },
  'salon': { optimal_delay: 1, conversion_rate: 31, best_time: 'After appointment' },
  'barber': { optimal_delay: 1, conversion_rate: 29, best_time: 'Same day' },
  'dental': { optimal_delay: 12, conversion_rate: 24, best_time: 'Next morning' },
  'physio': { optimal_delay: 2, conversion_rate: 27, best_time: '2 hours after' },
  'electrician': { optimal_delay: 4, conversion_rate: 23, best_time: 'Evening' },
  'builder': { optimal_delay: 48, conversion_rate: 18, best_time: '2 days after' },
  'restaurant': { optimal_delay: 0, conversion_rate: 33, best_time: 'Immediately' },
  'hotel': { optimal_delay: 1, conversion_rate: 28, best_time: 'Checkout day' },
  'hairdresser': { optimal_delay: 1, conversion_rate: 30, best_time: 'After appointment' },
  'mechanic': { optimal_delay: 4, conversion_rate: 21, best_time: 'Evening' },
  'accountant': { optimal_delay: 24, conversion_rate: 16, best_time: 'Next day' },
  'solicitor': { optimal_delay: 24, conversion_rate: 18, best_time: 'Next day' },
  'estate agent': { optimal_delay: 48, conversion_rate: 15, best_time: '2 days after' },
  'gym': { optimal_delay: 1, conversion_rate: 25, best_time: 'After class' },
  'default': { optimal_delay: 2, conversion_rate: 21, best_time: '2 hours after' }
};

function getIndustryRecommendation(industry) {
  if (!industry) return INDUSTRY_BENCHMARKS.default;
  const key = industry.toLowerCase().trim();
  return INDUSTRY_BENCHMARKS[key] || INDUSTRY_BENCHMARKS.default;
}

// Get delay options with conversion rate display text
function getDelayOptions(industry) {
  const rec = getIndustryRecommendation(industry);
  return [
    { value: 0, label: 'Immediately', conversion: '33%' },
    { value: 1, label: '1 hour later', conversion: '29%' },
    { value: 2, label: '2 hours later', conversion: '27%', recommended: rec.optimal_delay === 2 },
    { value: 4, label: '4 hours later', conversion: '23%', recommended: rec.optimal_delay === 4 },
    { value: 12, label: '12 hours later', conversion: '24%', recommended: rec.optimal_delay === 12 },
    { value: 24, label: 'Next day', conversion: '20%', recommended: rec.optimal_delay === 24 },
    { value: 48, label: '2 days later', conversion: '18%', recommended: rec.optimal_delay === 48 }
  ];
}

module.exports = { 
  INDUSTRY_BENCHMARKS, 
  getIndustryRecommendation,
  getDelayOptions 
};