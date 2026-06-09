// Office-day scheduling. Approved employees mark which days they're in the
// office and can see who else is in. Approved-only.
import { Router } from 'express';
import { supabaseAdmin } from '../supabaseClients.js';
import { requireApproved } from '../middleware/auth.js';

const router = Router();
router.use(requireApproved);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDay(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// GET /api/office-days?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns everyone's bookings in the range so the calendar can show who's in.
router.get('/', async (req, res, next) => {
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!isValidDay(from) || !isValidDay(to)) {
      return res.status(400).json({ error: 'from and to must be YYYY-MM-DD dates.' });
    }
    if (from > to) return res.status(400).json({ error: '"from" must be on or before "to".' });

    const { data, error } = await supabaseAdmin
      .from('office_days')
      .select('day, user_id, profiles(full_name)')
      .gte('day', from)
      .lte('day', to)
      .order('day', { ascending: true });

    if (error) return next(error);

    const days = data.map((row) => ({
      day: row.day,
      userId: row.user_id,
      name: row.profiles?.full_name || 'Unknown',
      isMe: row.user_id === req.profile.id,
    }));
    res.json({ days });
  } catch (err) {
    next(err);
  }
});

// POST /api/office-days  { day: 'YYYY-MM-DD' }  -> books the day for the caller.
router.post('/', async (req, res, next) => {
  try {
    const day = String(req.body?.day || '');
    if (!isValidDay(day)) return res.status(400).json({ error: 'day must be a YYYY-MM-DD date.' });

    const { error } = await supabaseAdmin
      .from('office_days')
      .upsert({ user_id: req.profile.id, day }, { onConflict: 'user_id,day' });

    if (error) return next(error);
    res.status(201).json({ ok: true, day });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/office-days/:day  -> cancels the caller's booking for that day.
router.delete('/:day', async (req, res, next) => {
  try {
    const day = String(req.params.day || '');
    if (!isValidDay(day)) return res.status(400).json({ error: 'day must be a YYYY-MM-DD date.' });

    const { error } = await supabaseAdmin
      .from('office_days')
      .delete()
      .eq('user_id', req.profile.id)
      .eq('day', day);

    if (error) return next(error);
    res.json({ ok: true, day });
  } catch (err) {
    next(err);
  }
});

export default router;
