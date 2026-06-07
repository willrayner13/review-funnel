import Chart from 'chart.js/auto';

let analyticsChart = null;

export async function initAnalytics(slug) {
  await loadAnalytics(slug);
  bindAnalyticsEvents(slug);
}

async function loadAnalytics(slug, period = '30d') {
  const res = await fetch(`/api/analytics/${slug}?period=${period}`);
  const data = await res.json();
  
  // Update stats
  document.getElementById('analyticsTotalVisits').innerText = data.totals.visits;
  document.getElementById('analyticsTotalSent').innerText = data.totals.sent;
  document.getElementById('analyticsTotalReviews').innerText = data.totals.reviews;
  document.getElementById('analyticsConversionRate').innerText = `${data.totals.conversionRate}%`;
  
  // Update chart
  if (analyticsChart) analyticsChart.destroy();
  
  const ctx = document.getElementById('analyticsChart').getContext('2d');
  analyticsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.chartData.map(d => d.date),
      datasets: [
        {
          label: 'Visits',
          data: data.chartData.map(d => d.visits),
          borderColor: '#C8A96E',
          backgroundColor: 'transparent',
          tension: 0.3
        },
        {
          label: 'Reviews',
          data: data.chartData.map(d => d.reviews),
          borderColor: '#6A9E7F',
          backgroundColor: 'transparent',
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#EAE7DC' } }
      },
      scales: {
        x: { ticks: { color: '#EAE7DC' }, grid: { color: 'rgba(234,231,220,0.1)' } },
        y: { ticks: { color: '#EAE7DC' }, grid: { color: 'rgba(234,231,220,0.1)' } }
      }
    }
  });
}

function bindAnalyticsEvents(slug) {
  document.getElementById('analyticsPeriod30d')?.addEventListener('click', () => loadAnalytics(slug, '30d'));
  document.getElementById('analyticsPeriod90d')?.addEventListener('click', () => loadAnalytics(slug, '90d'));
  document.getElementById('analyticsPeriod12m')?.addEventListener('click', () => loadAnalytics(slug, '12m'));
}