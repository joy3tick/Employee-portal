// On startup, make sure an admin account exists. If none does, create (or
// promote) the ADMIN_EMAIL account and mark it approved + admin. Safe to run on
// every boot — it no-ops once any admin exists. Never throws; logs and moves on.
import { config, supabaseReady } from './config.js';
import { supabaseAdmin } from './supabaseClients.js';

export async function seedAdmin() {
  if (!supabaseReady) return;
  const { name, email, password } = config.admin;
  if (!email || !password) {
    console.log('[seed] ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin bootstrap.');
    return;
  }

  try {
    // If any admin already exists, leave everything as-is.
    const { data: admins, error: adminErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1);
    if (adminErr) {
      console.warn('[seed] Could not query profiles (is the schema applied?):', adminErr.message);
      return;
    }
    if (admins.length > 0) return;

    // Find an existing profile for the admin email (e.g. they signed up already).
    let { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    // Otherwise create the auth user; the DB trigger creates its profile.
    if (!existing) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });
      if (error && !/already.*registered|exists/i.test(error.message)) {
        console.warn('[seed] Could not create admin user:', error.message);
        return;
      }
      existing = data?.user ? { id: data.user.id } : null;
      if (!existing) {
        const { data: again } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', email.toLowerCase())
          .maybeSingle();
        existing = again;
      }
    }

    if (!existing) {
      console.warn('[seed] Admin profile not found after creation — skipping.');
      return;
    }

    const { error: upErr } = await supabaseAdmin
      .from('profiles')
      .update({ role: 'admin', status: 'approved', full_name: name })
      .eq('id', existing.id);

    if (upErr) console.warn('[seed] Could not promote admin:', upErr.message);
    else console.log(`[seed] Admin account ready: ${email}`);
  } catch (err) {
    console.warn('[seed] Admin bootstrap skipped due to error:', err.message);
  }
}
