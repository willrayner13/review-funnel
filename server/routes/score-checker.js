const express = require('express');
const supabase = require('../config/database');

const router = express.Router();

// Google Places API key from environment
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Calculate reputation score
function calculateScore(rating, reviewCount, velocity) {
  // Base score from rating (0-50 points)
  const ratingScore = (rating / 5) * 50;
  
  // Review count score (0-30 points)
  let countScore = 0;
  if (reviewCount >= 200) countScore = 30;
  else if (reviewCount >= 100) countScore = 25;
  else if (reviewCount >= 50) countScore = 20;
  else if (reviewCount >= 20) countScore = 15;
  else if (reviewCount >= 10) countScore = 10;
  else if (reviewCount >= 5) countScore = 5;
  else countScore = 0;
  
  // Velocity score (0-20 points)
  let velocityScore = 0;
  if (velocity >= 20) velocityScore = 20;
  else if (velocity >= 15) velocityScore = 15;
  else if (velocity >= 10) velocityScore = 12;
  else if (velocity >= 5) velocityScore = 8;
  else if (velocity >= 2) velocityScore = 4;
  else velocityScore = 0;
  
  return Math.round(ratingScore + countScore + velocityScore);
}

// Calculate review velocity (reviews per month)
function calculateVelocity(reviewCount, yearsInBusiness = 2) {
  return Math.round(reviewCount / (yearsInBusiness * 12));
}

// Get missing reviews based on industry average
function getMissingReviews(reviewCount, industry) {
  const industryAverages = {
    'plumber': 25,
    'salon': 45,
    'dental': 35,
    'gym': 30,
    'restaurant': 50,
    'default': 30
  };
  const average = industryAverages[industry] || industryAverages.default;
  return Math.max(0, average - reviewCount);
}

// Check if business needs more reviews
function getRecommendation(score, reviewCount) {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'average';
  if (reviewCount < 10) return 'start';
  return 'needs_work';
}

// Main endpoint: search business by name
router.get('/api/search-business', async (req, res) => {
  const { query } = req.query;
  
  if (!query || query.length < 3) {
    return res.status(400).json({ error: 'Please enter at least 3 characters' });
  }
  
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_PLACES_API_KEY}`
    );
    const data = await response.json();
    
    if (data.status !== 'OK') {
      return res.status(404).json({ error: 'Business not found. Try a different name.' });
    }
    
    const businesses = data.results.slice(0, 5).map(place => ({
      place_id: place.place_id,
      name: place.name,
      address: place.formatted_address,
      vicinity: place.vicinity
    }));
    
    res.json({ businesses });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Main endpoint: get review score
router.post('/api/review-score', async (req, res) => {
  const { placeId, email, businessName, industry } = req.body;
  
  if (!placeId || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    // Fetch place details from Google
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,formatted_address,reviews&key=${GOOGLE_PLACES_API_KEY}`
    );
    const data = await response.json();
    
    if (data.status !== 'OK' || !data.result) {
      return res.status(404).json({ error: 'Could not fetch business data' });
    }
    
    const place = data.result;
    const rating = place.rating || 0;
    const reviewCount = place.user_ratings_total || 0;
    const velocity = calculateVelocity(reviewCount);
    const score = calculateScore(rating, reviewCount, velocity);
    const missingReviews = getMissingReviews(reviewCount, industry);
    const recommendation = getRecommendation(score, reviewCount);
    
    // Store lead in database
    await supabase.from('review_score_leads').insert({
      business_name: place.name,
      business_place_id: placeId,
      business_address: place.formatted_address,
      email: email,
      score: score,
      rating: rating,
      review_count: reviewCount,
      velocity: velocity
    });
    
    // Return results
    res.json({
      success: true,
      business: {
        name: place.name,
        address: place.formatted_address,
        rating: rating,
        review_count: reviewCount,
        velocity: velocity,
        score: score,
        missing_reviews: missingReviews,
        recommendation: recommendation
      }
    });
    
  } catch (error) {
    console.error('Score error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;