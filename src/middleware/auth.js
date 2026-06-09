// Authorization middleware. Sessions store only the Supabase user id; on each
// request we load the fresh profile (so a revoked/denied user loses access
// immediately) and attach it as req.profile.
import { supabaseAdmin } from '../supabaseClients.js';

export async function loadProfile(req, _res, next) {
  req.profile = null;
  const userId = req.session?.userId;
  if (!userId || !supabaseAdmin) return next();

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, role, status')
    .eq('id', userId)
    .maybeSingle();

  if (error) return next(error);

  if (!data) {
    // Profile vanished (e.g. user deleted) — clear the stale session.
    req.session.destroy(() => {});
  } else {
    req.profile = data;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.profile) return res.status(401).json({ error: 'Not signed in.' });
  next();
}

export function requireApproved(req, res, next) {
  if (!req.profile) return res.status(401).json({ error: 'Not signed in.' });
  if (req.profile.status !== 'approved') {
    return res.status(403).json({ error: 'Your account is not approved yet.' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.profile) return res.status(401).json({ error: 'Not signed in.' });
  if (req.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only.' });
  }
  next();
}
