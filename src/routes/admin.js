// Admin routes: list users and approve / deny / set-role. Admin-only.
import { Router } from 'express';
import { supabaseAdmin } from '../supabaseClients.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAdmin);

function publicProfile(p) {
  return {
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    role: p.role,
    status: p.status,
    createdAt: p.created_at,
  };
}

// GET /api/admin/users?status=pending|approved|denied (status optional)
router.get('/users', async (req, res, next) => {
  try {
    let query = supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, status, created_at')
      .order('created_at', { ascending: false });

    const status = req.query.status;
    if (status && ['pending', 'approved', 'denied'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) return next(error);
    res.json({ users: data.map(publicProfile) });
  } catch (err) {
    next(err);
  }
});

async function setStatus(req, res, next, status) {
  try {
    const { id } = req.params;
    // Guard: an admin can't deny/lock themselves out.
    if (id === req.profile.id && status !== 'approved') {
      return res.status(400).json({ error: "You can't change your own approval status." });
    }
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ status })
      .eq('id', id)
      .select('id, email, full_name, role, status, created_at')
      .maybeSingle();

    if (error) return next(error);
    if (!data) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true, user: publicProfile(data) });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/users/:id/approve
router.post('/users/:id/approve', (req, res, next) => setStatus(req, res, next, 'approved'));

// POST /api/admin/users/:id/deny
router.post('/users/:id/deny', (req, res, next) => setStatus(req, res, next, 'denied'));

// POST /api/admin/users/:id/role  { role: 'employee' | 'admin' }
router.post('/users/:id/role', async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = String(req.body?.role || '');
    if (!['employee', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "employee" or "admin".' });
    }
    if (id === req.profile.id && role !== 'admin') {
      return res.status(400).json({ error: "You can't remove your own admin role." });
    }
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ role })
      .eq('id', id)
      .select('id, email, full_name, role, status, created_at')
      .maybeSingle();

    if (error) return next(error);
    if (!data) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true, user: publicProfile(data) });
  } catch (err) {
    next(err);
  }
});

export default router;
