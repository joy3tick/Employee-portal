// Public Supabase config for the browser.
//
// The anon key is DESIGNED to be exposed in client-side code — it only grants
// whatever your Row Level Security policies allow. Your data is protected by the
// RLS rules in supabase/schema.sql, not by hiding this key. (Never put the
// service_role key here.)
window.PORTAL_CONFIG = {
  SUPABASE_URL: 'https://dhvgqwrazdykkgszlhlr.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRodmdxd3JhemR5a2tnc3psaGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDYzMzYsImV4cCI6MjA5NjU4MjMzNn0.IPu50AASi8K4BGM5K5d6cnUWja4q-r2g9Wtat_iCe_Q',
};
