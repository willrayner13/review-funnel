// Queue processing service - runs every 5 minutes
const supabase = require('../config/database');
const smsService = require('./smsService');
const emailService = require('./emailService');

async function processQueue() {
  console.log('[Queue] Processing review queue...');
  
  const { data: pendingItems, error } = await supabase
    .from('review_queue')
    .select('*')
    .eq('status', 'pending')
    .lt('send_at', new Date().toISOString())
    .lt('attempts', 3)
    .limit(50);
  
  if (error || !pendingItems?.length) {
    console.log('[Queue] No items to process');
    return { processed: 0 };
  }
  
  let processed = 0;
  
  for (const item of pendingItems) {
    // Get business settings
    const { data: business } = await supabase
      .from('businesses')
      .select('name, autopilot_action, review_link, slug')
      .eq('slug', item.business_slug)
      .single();
    
    if (!business?.review_link) {
      await markFailed(item.id, 'No review link configured');
      continue;
    }
    
    const reviewUrl = business.review_link;
    const messageTemplate = `Hi ${item.customer_name || 'there'}, how was your ${item.service || 'recent visit'}? Please leave us a review: ${reviewUrl}`;
    
    let success = false;
    
    try {
      const action = business.autopilot_action || 'sms';
      
      if (action === 'sms' || action === 'both') {
        if (item.customer_phone) {
          await smsService.sendSMS(item.customer_phone, messageTemplate);
          success = true;
        }
      }
      
      if (action === 'email' || action === 'both') {
        if (item.customer_email) {
          await emailService.sendEmail(
            item.customer_email,
            `How was your ${item.service || 'visit'} at ${business.name}?`,
            messageTemplate
          );
          success = true;
        }
      }
      
      if (success) {
        await supabase
          .from('review_queue')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', item.id);
        
        await logAutomation(item.business_slug, item.trigger_source, 
          item.customer_phone || item.customer_email, 'sent');
        
        processed++;
      } else {
        await markFailed(item.id, 'No customer contact info');
      }
      
    } catch (err) {
      console.error(`[Queue] Failed to send for ${item.id}:`, err.message);
      await markFailed(item.id, err.message);
    }
  }
  
  return { processed };
}

async function markFailed(queueId, errorMsg) {
  const { data: item } = await supabase
    .from('review_queue')
    .select('attempts, business_slug, trigger_source, customer_phone, customer_email')
    .eq('id', queueId)
    .single();
  
  const newAttempts = (item?.attempts || 0) + 1;
  
  if (newAttempts >= 3) {
    await supabase
      .from('review_queue')
      .update({ status: 'failed', last_error: errorMsg, attempts: newAttempts })
      .eq('id', queueId);
  } else {
    // Reschedule for 30 minutes later
    const newSendAt = new Date();
    newSendAt.setMinutes(newSendAt.getMinutes() + 30);
    
    await supabase
      .from('review_queue')
      .update({ 
        send_at: newSendAt.toISOString(), 
        attempts: newAttempts,
        last_error: errorMsg
      })
      .eq('id', queueId);
  }
  
  await logAutomation(item?.business_slug, item?.trigger_source, 
    item?.customer_phone || item?.customer_email, 'failed', errorMsg);
}

async function logAutomation(businessSlug, triggerType, customerId, status, message = null) {
  await supabase
    .from('automation_logs')
    .insert({
      business_slug: businessSlug,
      trigger_type: triggerType,
      customer_identifier: customerId?.substring(0, 50),
      status: status,
      message: message
    });
}

module.exports = { processQueue, markFailed, logAutomation };