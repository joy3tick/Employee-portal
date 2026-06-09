// Auth routes: signup, login, logout, and "who am I".
import { Router } from 'express';
import { supabaseReady } from '../config.js';
import { supabaseAdmin, supabaseAuth } from '../supabaseClients.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ensureConfigured(res) {
  if (!supabaseReady) {
    res.status(503).json({ error: 'Server is not configured with Supabase yet. See README.md.' });
    return false;
  }
  return true;
}

// Shape the profile we expose to the browser (never leak more than needed).
function publicProfile(p) {
  return p && { id: p.id, email: p.email, fullName: p.full_name, role: p.role, status: p.status };
}

// POST /api/auth/signup  { name, email, password }
// Creates a confirmed auth user that lands in "pending" until an admin approves.
router.post('/signup', async (req, res, next) => {
  if (!ensureConfigured(res)) return;
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!name) return res.status(400).json({ error: 'Please enter your name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // email_confirm: true => no confirmation email; the admin approval IS the gate.
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (error) {
      const msg = /already.*registered|exists/i.test(error.message)
        ? 'An account with that email already exists.'
        : error.message;
      return res.status(400).json({ error: msg });
    }

    res.status(201).json({
      ok: true,
      message: 'Account created! An admin will review your request shortly.',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login  { email, password }
router.post('/login', async (req, res, next) => {
  if (!ensureConfigured(res)) return;
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Verify credentials against Supabase Auth (does not establish our session).
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, status')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile) {
      return res.status(403).json({ error: 'Your account is not set up. Contact an admin.' });
    }
    if (profile.status === 'pending') {
      return res.status(403).json({ error: 'Your account is awaiting admin approval.', status: 'pending' });
    }
    if (profile.status === 'denied') {
      return res.status(403).json({ error: 'Your account request was denied.', status: 'denied' });
    }

    // Approved — establish the session. Regenerate to avoid session fixation.
    req.session.regenerate((regenErr) => {
      if (regenErr) return next(regenErr);
      req.session.userId = profile.id;
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.json({ ok: true, user: publicProfile(profile) });
      });
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me  -> { user } (user is null when signed out)
router.get('/me', (req, res) => {
  res.json({ user: publicProfile(req.profile) });
});

export default router;
