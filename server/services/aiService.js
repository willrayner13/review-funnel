/**
 * AI Service - Handles all OpenAI interactions
 * Provides sentiment analysis, reply generation, competitor analysis, and translations
 * 
 * @module services/aiService
 */

const openai = require("../config/openai");

// Available AI models
const MODELS = {
  GPT4_MINI: "gpt-4o-mini",
  GPT4: "gpt-4o",
  WHISPER: "whisper-1",
};

/**
 * Generate three different reply styles for a customer review
 * @param {string} reviewText - The customer review to reply to
 * @param {string} businessName - Name of the business
 * @returns {Promise<object>} Object with professional, warm, and punchy replies
 */
async function generateReviewReplies(reviewText, businessName) {
  const completion = await openai.chat.completions.create({
    model: MODELS.GPT4_MINI,
    messages: [
      {
        role: "system",
        content: `You are a reputation manager for ${businessName}. Generate three different replies to this customer review. Return JSON only, no markdown, in this format: { "professional": "...", "warm": "...", "punchy": "..." }

professional: formal, polished, 2-3 sentences. Warm and respectful but professional tone.
warm: friendly and personal, feels like a real human wrote it, 2-3 sentences. Use conversational British English.
punchy: short, confident, 1-2 sentences max. Casual and direct.

Do not start any reply with "Thank you for your review". Be specific and genuine.`
      },
      {
        role: "user",
        content: `Customer review: "${reviewText}"`
      }
    ],
    temperature: 0.8,
    max_tokens: 400,
  });
  
  const content = completion.choices[0].message.content.trim();
  
  try {
    const cleaned = content.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Failed to parse AI reply JSON:", error.message);
    // Return fallback replies
    return {
      professional: "Thank you for your feedback. We appreciate you taking the time to share your experience.",
      warm: "Thanks so much for your review! We're really glad you had a good experience with us.",
      punchy: "Thanks for the review! Really appreciate your support."
    };
  }
}

/**
 * Analyse sentiment of customer feedback
 * @param {string} text - The customer's feedback text
 * @param {string} businessName - Name of the business
 * @param {string} industry - Industry of the business (optional)
 * @returns {Promise<object>} Sentiment analysis result
 */
async function analyseSentiment(text, businessName, industry = "local business") {
  const completion = await openai.chat.completions.create({
    model: MODELS.GPT4_MINI,
    messages: [
      {
        role: "system",
        content: `You are analysing customer feedback for ${businessName}, a ${industry} business. 
        
Classify the sentiment as one of: "very_positive", "positive", "neutral", "negative", "very_negative".

Rules:
- "very_positive": enthusiastic praise, mentions specific good things, says they'll return/recommend
- "positive": generally happy, satisfied, says things were good
- "neutral": mixed or matter-of-fact with no strong emotion either way
- "negative": clearly unhappy, complaining, mentions specific problems  
- "very_negative": angry, outraged, says they'll never return, warns others

Key guidance:
- If the customer says anything indicating satisfaction (good, great, happy, loved, recommend, return), classify as at least "positive"
- Only classify as negative if there is clear dissatisfaction or a complaint
- "Neutral" is for truly mixed feedback with equal positive and negative elements
- Casual positive language like "loved it", "defo coming back", "spot on" = very_positive
- Casual negative language like "not great", "bit rubbish", "wasn't impressed" = negative

Reply with JSON only: { "sentiment": "positive", "confidence": "high", "reasoning": "brief explanation in 10 words or less" }`
      },
      {
        role: "user",
        content: `Customer said: "${text}"`
      }
    ],
    max_tokens: 150,
    temperature: 0,
  });
  
  const content = completion.choices[0].message.content.trim();
  
  try {
    const cleaned = content.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Failed to parse sentiment JSON:", error.message);
    // Fallback: simple keyword analysis
    return fallbackSentimentAnalysis(text);
  }
}

/**
 * Fallback sentiment analysis using keyword matching
 * @param {string} text - Customer feedback text
 * @returns {object} Sentiment result
 */
function fallbackSentimentAnalysis(text) {
  const lowerText = text.toLowerCase();
  const positiveWords = ['great', 'good', 'love', 'excellent', 'happy', 'brilliant', 'fantastic', 'amazing', 'wonderful', 'best', 'perfect', 'recommend', 'defo', 'definitely', 'outstanding', 'spot on', 'class', 'sound', 'pleased', 'satisfied', 'impressed', 'coming back', 'return'];
  const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'poor', 'disappointed', 'unhappy', 'rubbish', 'worst', 'hate', 'never again', 'avoid', 'complaint', 'not good', 'not happy', 'not great', 'wasn\'t', 'wouldn\'t', 'couldn\'t', 'didn\'t'];
  
  const posCount = positiveWords.filter(w => lowerText.includes(w)).length;
  const negCount = negativeWords.filter(w => lowerText.includes(w)).length;
  
  let sentiment = "neutral";
  if (posCount > negCount && posCount >= 2) sentiment = "positive";
  if (posCount > negCount && posCount >= 3) sentiment = "very_positive";
  if (negCount > posCount && negCount >= 2) sentiment = "negative";
  if (negCount > posCount && negCount >= 3) sentiment = "very_negative";
  
  return {
    sentiment: sentiment,
    confidence: "low",
    reasoning: "Fallback keyword analysis"
  };
}

/**
 * Summarise common complaints from customer feedback
 * @param {string[]} feedbackMessages - Array of customer feedback messages
 * @returns {Promise<string>} Summarised complaints
 */
async function summariseComplaints(feedbackMessages) {
  if (!feedbackMessages.length) {
    return "No feedback to analyse.";
  }
  
  const feedback = feedbackMessages.join("\n\n");
  
  const completion = await openai.chat.completions.create({
    model: MODELS.GPT4_MINI,
    messages: [
      {
        role: "system",
        content: "Summarize the most common complaints from this customer feedback in 2-3 concise bullet points. Be specific and actionable."
      },
      {
        role: "user",
        content: feedback
      }
    ],
    max_tokens: 200,
    temperature: 0.5,
  });
  
  return completion.choices[0].message.content;
}

/**
 * Analyse competitor reviews and identify strengths/weaknesses/opportunities
 * @param {string} reviewsText - Competitor reviews text
 * @param {string} competitorName - Name of the competitor (optional)
 * @returns {Promise<object>} Analysis results
 */
async function analyseCompetitor(reviewsText, competitorName = null) {
  const completion = await openai.chat.completions.create({
    model: MODELS.GPT4_MINI,
    messages: [
      {
        role: "system",
        content: `You are a competitive intelligence analyst for a small business. Analyse these customer reviews for a competitor${competitorName ? ' called ' + competitorName : ''}. Identify: 1) What customers love about them (top 2 strengths). 2) What customers complain about (top 2 weaknesses). 3) One specific, actionable opportunity for our client to win customers from them. Return JSON only: { "strengths": ["...","..."], "weaknesses": ["...","..."], "opportunity": "..." }`
      },
      {
        role: "user",
        content: reviewsText.substring(0, 3000)
      }
    ],
    temperature: 0.7,
    max_tokens: 400,
  });
  
  const content = completion.choices[0].message.content.trim();
  
  try {
    const cleaned = content.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Failed to parse competitor analysis:", error.message);
    return {
      strengths: ["Unable to analyse - please try again"],
      weaknesses: ["Unable to analyse - please try again"],
      opportunity: "Try pasting more review text for better analysis."
    };
  }
}

/**
 * Generate a suggested review for a customer (Copy & Go feature)
 * @param {number} rating - Star rating (1-5)
 * @param {string} businessName - Name of the business
 * @param {string} industry - Industry type
 * @param {string} service - Service provided (optional)
 * @returns {Promise<string>} Suggested review text
 */
async function generateSuggestedReview(rating, businessName, industry, service = null) {
  const completion = await openai.chat.completions.create({
    model: MODELS.GPT4_MINI,
    messages: [
      {
        role: "system",
        content: "You write short, authentic-sounding Google reviews on behalf of customers. Write in first person. Sound like a real person, not marketing copy. 2-3 sentences max. Never use words like fantastic, amazing, or incredible. Sound natural and specific. Use British English."
      },
      {
        role: "user",
        content: `Write a ${rating}-star Google review for a customer who visited ${businessName}, a ${industry || 'local'} business.${service ? ' The service they had was: ' + service + '.' : ''} Make it sound genuine, conversational, and specific.`
      }
    ],
    temperature: 0.8,
    max_tokens: 150,
  });
  
  return completion.choices[0].message.content.trim();
}

/**
 * Translate funnel content to another language
 * @param {string} headline - The headline to translate
 * @param {string} happyLabel - The happy button label
 * @param {string} unhappyLabel - The unhappy button label
 * @param {string} thankyouMessage - The thank you message
 * @param {string} targetLang - Target language code (es, fr, de, pl, ur, pa, ar, it, pt, nl, tr, ro)
 * @returns {Promise<object|null>} Translated content
 */
async function translateFunnelContent(headline, happyLabel, unhappyLabel, thankyouMessage, targetLang) {
  const langNames = {
    'es': 'Spanish', 'fr': 'French', 'de': 'German', 'pl': 'Polish',
    'ur': 'Urdu', 'pa': 'Punjabi', 'ar': 'Arabic', 'it': 'Italian',
    'pt': 'Portuguese', 'nl': 'Dutch', 'tr': 'Turkish', 'ro': 'Romanian'
  };
  
  const langName = langNames[targetLang] || targetLang;
  
  try {
    const completion = await openai.chat.completions.create({
      model: MODELS.GPT4_MINI,
      messages: [
        {
          role: "system",
          content: `You are a translator for a review funnel tool. Translate the following text into ${langName} (${targetLang}). Keep the tone natural and conversational. Return JSON only: { "headline": "...", "happy_label": "...", "unhappy_label": "...", "thankyou_message": "..." }`
        },
        {
          role: "user",
          content: JSON.stringify({
            headline: headline || "How was your experience?",
            happy_label: happyLabel,
            unhappy_label: unhappyLabel,
            thankyou_message: thankyouMessage || "Thank you for your feedback — it means a lot to us."
          })
        }
      ],
      temperature: 0.5,
      max_tokens: 300,
    });
    
    const cleaned = completion.choices[0].message.content.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Translation error:", error.message);
    return null;
  }
}

/**
 * Generate personalised review request message (for webhook automation)
 * @param {string} businessName - Name of the business
 * @param {string} industry - Industry type
 * @param {string} customerName - Customer's name
 * @param {string} service - Service provided
 * @param {string} staffName - Staff member name (optional)
 * @returns {Promise<string>} Personalised message
 */
async function generatePersonalisedRequest(businessName, industry, customerName, service, staffName = null) {
  const completion = await openai.chat.completions.create({
    model: MODELS.GPT4_MINI,
    messages: [
      {
        role: "system",
        content: "You write friendly, human-sounding SMS review requests on behalf of small businesses. Keep it under 160 characters. Sound like the business owner wrote it personally, not a marketing tool. Never use exclamation marks excessively. Always end with a short review link placeholder: [LINK]. Use British English spelling."
      },
      {
        role: "user",
        content: `Write an SMS from a ${industry} business called ${businessName} to a customer called ${customerName} who just had '${service || "their appointment"}' done${staffName ? " by " + staffName : ""}. Ask them to leave a review.`
      }
    ],
    temperature: 0.8,
    max_tokens: 100,
  });
  
  return completion.choices[0].message.content.trim();
}

/**
 * Generate a congratulations message for a review milestone
 * @param {string} businessName - Name of the business
 * @param {number} milestoneCount - Number of reviews collected
 * @returns {Promise<string>} Congratulations message
 */
async function generateMilestoneMessage(businessName, milestoneCount) {
  const completion = await openai.chat.completions.create({
    model: MODELS.GPT4_MINI,
    messages: [
      {
        role: "system",
        content: "You write short, celebratory messages for small business owners who have just hit a Google review milestone. Enthusiastic but genuine. 2 sentences max. Never use exclamation marks excessively."
      },
      {
        role: "user",
        content: `${businessName} just collected their ${milestoneCount}th Google review using ReviewLift. Write a congratulations message for the business owner.`
      }
    ],
    temperature: 0.7,
    max_tokens: 80,
  });
  
  return completion.choices[0].message.content.trim();
}

/**
 * Transcribe audio using Whisper API
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} mimetype - Audio file mimetype
 * @param {string} businessName - Name of the business (for context)
 * @param {string} industry - Industry type
 * @returns {Promise<string>} Transcribed text
 */
async function transcribeAudio(audioBuffer, mimetype, businessName, industry) {
  const file = new File([audioBuffer], 'audio.webm', { type: mimetype });
  
  const transcription = await openai.audio.transcriptions.create({
    model: MODELS.WHISPER,
    file: file,
    language: "en",
    prompt: `This is a customer leaving feedback for ${businessName}, a ${industry || 'local'} business. They are speaking casually.`
  });
  
  return transcription.text.trim();
}

// Generate AI insights for Send Intelligence
async function generateChannelInsights(businessName, industry, sendCount, smsRate, emailRate) {
  const completion = await openai.chat.completions.create({
    model: MODELS.GPT4_MINI,
    messages: [
      {
        role: "system",
        content: "You are a marketing analytics expert. Provide one short, actionable insight about review request timing and channel selection for a small business. Be specific and data-driven. Return only the insight text, no JSON."
      },
      {
        role: "user",
        content: `${businessName} is a ${industry} business. They've sent ${sendCount} review requests. SMS conversion rate: ${smsRate}%, Email conversion rate: ${emailRate}%. Based on this, what's one specific recommendation for improving their review collection?`
      }
    ],
    temperature: 0.7,
    max_tokens: 100,
  });
  
  return completion.choices[0].message.content.trim();
}

module.exports = {
  generateReviewReplies,
  analyseSentiment,
  summariseComplaints,
  analyseCompetitor,
  generateSuggestedReview,
  translateFunnelContent,
  generatePersonalisedRequest,
  generateMilestoneMessage,
  transcribeAudio,
  generateChannelInsights,
  MODELS,
};