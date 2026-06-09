// Two Supabase clients with distinct jobs:
//
//   supabaseAdmin — uses the service_role key. Full database access, bypasses
//                   RLS. Used for every read/write the backend performs and for
//                   creating users via the Auth Admin API.
//
//   supabaseAuth  — uses the public anon key. Used ONLY to verify a user's
//                   email + password at login time (signInWithPassword).
//
// Both disable session persistence: this is a stateless server, we never want a
// client instance to hold on to a logged-in session between requests.
import { createClient } from '@supabase/supabase-js';
import { config, supabaseReady } from './config.js';

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };

export const supabaseAdmin = supabaseReady
  ? createClient(config.supabase.url, config.supabase.serviceRoleKey, authOptions)
  : null;

export const supabaseAuth = supabaseReady
  ? createClient(config.supabase.url, config.supabase.anonKey, authOptions)
  : null;
