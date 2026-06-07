const supabase = require('../config/database');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');

async function processQueue() {
  console.log('[Queue] Processing review queue...');
  
  const { data: pendingItems, error } = await supabase
    .from('review_queue')
    .select('*')
    .eq('status', 'pending')
    .lt('send_at', new Date().toISOString())
    .lt('attempts', 3)
    .limit(50);
  
  if (error) {
    console.error('[Queue] Error fetching:', error);
    return { processed: 0, error: error.message };
  }
  
  if (!pendingItems?.length) {
    console.log('[Queue] No items to process');
    return { processed: 0 };
  }
  
  console.log(`[Queue] Found ${pendingItems.length} items to process`);
  let processed = 0;
  
  for (const item of pendingItems) {
    // Get business settings
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('name, review_link, autopilot_action, slug')
      .eq('slug', item.business_slug)
      .single();
    
    if (bizError || !business?.review_link) {
      console.log(`[Queue] No review link for ${item.business_slug}`);
      await markFailed(item.id, 'No review link configured');
      continue;
    }
    
    const reviewUrl = business.review_link;
    const customerName = item.customer_name || 'there';
    const serviceText = item.service ? `your ${item.service}` : 'your recent visit';
    const message = `Hi ${customerName}, how was ${serviceText}? Please leave us a review: ${reviewUrl}`;
    
    let success = false;
    const action = business.autopilot_action || 'sms';
    
    try {
      if (action === 'sms' || action === 'both') {
        if (item.customer_phone) {
          await smsService.sendSMS(item.customer_phone, message);
          success = true;
          console.log(`[Queue] SMS sent to ${item.customer_phone}`);
        }
      }
      
      if (action === 'email' || action === 'both') {
        if (item.customer_email) {
          await emailService.sendEmail(
            item.customer_email,
            `How was your visit to ${business.name}?`,
            message
          );
          success = true;
          console.log(`[Queue] Email sent to ${item.customer_email}`);
        }
      }
      
      if (success) {
        await supabase
          .from('review_queue')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', item.id);
        processed++;
      } else {
        await markFailed(item.id, 'No customer contact info (phone or email)');
      }
      
    } catch (err) {
      console.error(`[Queue] Failed for ${item.id}:`, err.message);
      await markFailed(item.id, err.message);
    }
  }
  
  console.log(`[Queue] Processed ${processed} items successfully`);
  return { processed };
}

async function markFailed(queueId, errorMsg) {
  const { data: item } = await supabase
    .from('review_queue')
    .select('attempts')
    .eq('id', queueId)
    .single();
  
  const newAttempts = (item?.attempts || 0) + 1;
  
  if (newAttempts >= 3) {
    await supabase
      .from('review_queue')
      .update({ status: 'failed', last_error: errorMsg, attempts: newAttempts })
      .eq('id', queueId);
    console.log(`[Queue] Marked ${queueId} as failed after 3 attempts`);
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
    console.log(`[Queue] Rescheduled ${queueId} for ${newSendAt.toISOString()}`);
  }
}

module.exports = { processQueue };