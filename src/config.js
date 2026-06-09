// Loads and validates environment configuration.
// Importing this module also loads variables from a local .env file.
import 'dotenv/config';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((key) => !process.env[key]);

// We don't hard-crash on missing Supabase keys so the app can still boot and
// serve the UI before you've pasted your credentials. Auth endpoints return a
// clear "not configured" error until everything is present.
export const supabaseReady = missing.length === 0;

if (!supabaseReady) {
  console.warn(
    `\n[config] Supabase is not fully configured. Missing: ${missing.join(', ')}.\n` +
      '         Copy .env.example to .env and fill in your keys (see README.md).\n' +
      '         The site will load, but signing up / logging in will fail until then.\n'
  );
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT) || 3000,
  isProd,
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  admin: {
    name: process.env.ADMIN_NAME || 'Redline Admin',
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
  },
};

if (isProd && config.sessionSecret === 'dev-insecure-secret-change-me') {
  console.warn('[config] SESSION_SECRET is unset in production — set a strong secret!');
}
