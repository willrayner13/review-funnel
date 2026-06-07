const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const supabase = require('../config/database');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Upload CSV file
router.post('/api/upload-csv/:slug', upload.single('file'), async (req, res) => {
  const { slug } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const csvString = req.file.buffer.toString('utf8');
  
  Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const customers = results.data;
      let queued = 0;
      let errors = [];
      
      const { data: business } = await supabase
        .from('businesses')
        .select('autopilot_delay_hours, name')
        .eq('slug', slug)
        .single();
      
      const delayHours = business?.autopilot_delay_hours || 2;
      
      for (let i = 0; i < customers.length; i++) {
        const customer = customers[i];
        
        // Try different possible column names
        const phone = customer.phone || customer.mobile || customer.tel || customer.telephone || customer.cell;
        const email = customer.email || customer.email_address;
        const name = customer.name || customer.full_name || customer.customer_name || `${customer.first_name} ${customer.last_name}`.trim();
        const service = customer.service || customer.job_type || customer.appointment_type;
        
        if (!phone && !email) {
          errors.push(`Row ${i + 2}: No phone or email found`);
          continue;
        }
        
        // Stagger sends to avoid spam (1 minute apart)
        const sendAt = new Date();
        sendAt.setHours(sendAt.getHours() + delayHours);
        sendAt.setMinutes(sendAt.getMinutes() + i);
        
        await supabase.from('review_queue').insert({
          business_slug: slug,
          customer_name: name || null,
          customer_phone: phone || null,
          customer_email: email || null,
          service: service || null,
          trigger_source: 'csv',
          send_at: sendAt.toISOString(),
          status: 'pending'
        });
        
        queued++;
      }
      
      await supabase.from('automation_logs').insert({
        business_slug: slug,
        trigger_type: 'csv',
        customer_identifier: `${queued} customers`,
        status: 'queued',
        message: `Bulk import: ${queued} customers from CSV`
      });
      
      res.json({ 
        success: true, 
        queued, 
        total: customers.length,
        errors: errors.length > 0 ? errors : null
      });
    },
    error: (error) => {
      res.status(500).json({ error: error.message });
    }
  });
});

// Get CSV template
router.get('/api/csv-template/:slug', async (req, res) => {
  const template = `name,phone,email,service
John Smith,07123456789,john@example.com,Boiler repair
Jane Doe,07700900123,jane@example.com,Annual service
`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=customer-template.csv');
  res.send(template);
});

module.exports = router;