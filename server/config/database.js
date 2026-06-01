const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    auth: {
      persistSession: false,   // Critical for serverless
      autoRefreshToken: false,
    },
    db: {
      schema: 'public',
    },
  }
);

module.exports = supabase;