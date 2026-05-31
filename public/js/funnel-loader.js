// funnel-loader.js - Loads funnel with mode detection (live or demo)

const FunnelMode = {
  LIVE: 'live',
  DEMO: 'demo'
};

let currentMode = FunnelMode.LIVE;

function initFunnel(mode = FunnelMode.LIVE, options = {}) {
  currentMode = mode;
  
  if (mode === FunnelMode.DEMO) {
    window.demoMode = true;
    window.slug = options.slug || 'demo-business';
    window.businessName = options.businessName || 'Your Business';
    window.reviewLink = '#';
    window.funnelTemplate = options.template || 'classic';
    window.funnelAccentColor = options.accentColor || '#C8A96E';
    
    // Override API calls for demo
    overrideAPIsForDemo();
  }
  
  // Update the main headline with business name
  setTimeout(function() {
    const mainHeadline = document.getElementById('mainHeadline');
    if (mainHeadline && window.businessName) {
      mainHeadline.textContent = `How was your experience at ${window.businessName}?`;
    }
  }, 100);
  
  // Load the funnel script
  const script = document.createElement('script');
  script.src = '/js/funnel.js';
  document.body.appendChild(script);
}

// Function to update business name dynamically (for demo input)
window.updateDemoBusinessName = function(name) {
  if (currentMode === FunnelMode.DEMO) {
    window.businessName = name;
    const mainHeadline = document.getElementById('mainHeadline');
    if (mainHeadline) {
      mainHeadline.textContent = `How was your experience at ${name}?`;
    }
  }
};

function overrideAPIsForDemo() {
  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    if (url.includes('/suggest-review/')) {
      return Promise.resolve({
        json: () => Promise.resolve({ 
          suggestion: `Great experience at ${window.businessName}! The team was friendly and professional. Highly recommend!` 
        })
      });
    }
    if (url.includes('/rating') || url.includes('/positive') || url.includes('/feedback')) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true }) });
    }
    if (url.includes('/transcribe-voice/')) {
      return Promise.resolve({
        json: () => Promise.resolve({ 
          sentiment: 'positive', 
          transcription: 'This is a demo. The service was excellent!' 
        })
      });
    }
    return originalFetch(url, options);
  };
}

// Expose globally
window.initFunnel = initFunnel;