import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.PORTAL_CONFIG || {};
const app = document.getElementById('app');

if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
  app.innerHTML =
    '<div class="center-screen"><div class="auth-card card grad-top">Missing Supabase config in config.js.</div></div>';
  throw new Error('Missing PORTAL_CONFIG');
}

const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = toISO(new Date());
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // Monday-first
const DOW1 = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WD_PLURAL = ['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays'];

const KIND_LABEL = { in: 'In office', vacation: 'On vacation', sick: 'Off sick' };
const KIND_EMOJI = { in: '🏢', vacation: '🌴', sick: '🤒' };
const KIND_RANK = { in: 0, vacation: 1, sick: 2 };
const kindOf = (a) => a.kind || 'in';

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Someone';

function shortName(name) {
  const p = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return 'Someone';
  if (p.length === 1) return p[0];
  return `${p[0]} ${p[p.length - 1][0]}.`;
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function personColor(name) {
  let h = 0;
  const s = name || '';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}

function avatarHTML(name, isMe, cls = '', url = null) {
  if (url) {
    return `<span class="avatar img${isMe ? ' me' : ''} ${cls}" style="background-image:url('${esc(url)}')" title="${esc(name)}"></span>`;
  }
  const bg = isMe ? 'var(--accent)' : personColor(name);
  return `<span class="avatar${isMe ? ' me' : ''} ${cls}" style="background:${bg}" title="${esc(name)}">${esc(initials(name))}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function workdaysInMonth(y, m) {
  let c = 0;
  const days = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const wd = new Date(y, m, d).getDay();
    if (wd !== 0 && wd !== 6) c++;
  }
  return c;
}

// 42-cell Monday-first month grid
function gridCells(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return cells;
}

// Monday of the week containing d (Date or ISO).
function weekStartISO(d = new Date()) {
  const x = typeof d === 'string' ? new Date(`${d}T00:00:00`) : new Date(d);
  const off = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - off);
  return toISO(x);
}

// Inclusive count of calendar weeks spanned by two days.
function diffWeeks(aISO, bISO) {
  const a = new Date(`${weekStartISO(aISO)}T00:00:00`);
  const b = new Date(`${weekStartISO(bISO)}T00:00:00`);
  return Math.max(1, Math.round((b - a) / (7 * 86400000)) + 1);
}

// "Jun 8 – 14" (or "Jun 29 – Jul 5" across a month boundary) for a week's Monday.
function fmtWeekRange(ws) {
  const a = new Date(`${ws}T00:00:00`);
  const b = new Date(a); b.setDate(b.getDate() + 6);
  const aS = a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const sameMonth = a.getMonth() === b.getMonth();
  const bS = b.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
  return `${aS} – ${bS}`;
}
function weekTitle(ws) {
  return `Week of ${fmtWeekRange(ws)}, ${new Date(`${ws}T00:00:00`).getFullYear()}`;
}
function relWeekLabel(ws) {
  const cur = weekStartISO();
  if (ws === cur) return 'This week';
  if (ws === addDaysISO(cur, -7)) return 'Last week';
  return fmtWeekRange(ws);
}
// [primary, secondary] labels for a week, e.g. ["This week", "Jun 8 – 14, 2026"]
// or ["May 18 – 24", "2026"] when there's no relative label to add.
function weekLabelParts(ws) {
  const rel = relWeekLabel(ws);
  const range = fmtWeekRange(ws);
  const yr = new Date(`${ws}T00:00:00`).getFullYear();
  return rel === range ? [range, `${yr}`] : [rel, `${range}, ${yr}`];
}
function ratingTier(n) { return n <= 4 ? 'low' : n <= 7 ? 'mid' : 'high'; }

// ---- Time formatting (values arrive as "HH:MM" or "HH:MM:SS") ----
const hhmm = (t) => String(t || '').slice(0, 5);
function fmt12(t) {
  const [H, M] = hhmm(t).split(':').map(Number);
  const ap = H < 12 ? 'AM' : 'PM';
  const h = H % 12 === 0 ? 12 : H % 12;
  return `${h}:${pad(M)} ${ap}`;
}
function fmtCompact(t) {
  const [H, M] = hhmm(t).split(':').map(Number);
  const ap = H < 12 ? 'a' : 'p';
  const h = H % 12 === 0 ? 12 : H % 12;
  return M ? `${h}:${pad(M)}${ap}` : `${h}${ap}`;
}
const isOvernight = (s, e) => hhmm(e) <= hhmm(s);
const fmtRange = (s, e) => `${fmt12(s)} – ${fmt12(e)}${isOvernight(s, e) ? ' <span class="muted-mini">(next day)</span>' : ''}`;
const fmtRangePlain = (s, e) => `${fmt12(s)} – ${fmt12(e)}${isOvernight(s, e) ? ' (next day)' : ''}`;
const fmtCompactRange = (s, e) => `${fmtCompact(s)}–${fmtCompact(e)}`;

// Hours worked for an in-office entry (overnight wraps to the next day).
function entryHours(r) {
  if (kindOf(r) !== 'in' || !r.start_time || !r.end_time) return 0;
  const [sh, sm] = hhmm(r.start_time).split(':').map(Number);
  const [eh, em] = hhmm(r.end_time).split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}
function fmtHours(h) {
  const m = Math.round(h * 60);
  const H = Math.floor(m / 60);
  const M = m % 60;
  if (!H) return `${M}m`;
  return M ? `${H}h ${M}m` : `${H}h`;
}

// ---- Icons (feather-style strokes) ----
function icon(name, cls = 'ic') {
  const paths = {
    dash: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    team: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    gear: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    edit: '<path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    tasks: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/>',
  };
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

// Flat "person at a desk" illustration for the welcome card.
const HERO_ART = `
<svg class="hero-art" viewBox="0 0 300 190" aria-hidden="true">
  <circle cx="150" cy="88" r="74" fill="#fdeaec"/>
  <rect x="55" y="28" width="9" height="9" rx="2" fill="#f6b63b" transform="rotate(18 60 32)"/>
  <rect x="244" y="86" width="8" height="8" rx="2" fill="#0d9488" transform="rotate(-14 248 90)"/>
  <rect x="40" y="96" width="7" height="7" rx="2" fill="#e11d2b" opacity=".6" transform="rotate(30 44 100)"/>
  <circle cx="235" cy="38" r="14" fill="#fff" stroke="#e7eaf2" stroke-width="3"/>
  <path d="M235 31v8l5 3" stroke="#e11d2b" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="150" cy="62" r="16" fill="#f1bf9b"/>
  <path d="M134 62 A16 16 0 0 1 166 62 Z" fill="#4a3a33"/>
  <path d="M116 124 Q150 96 184 124 L184 136 H116 Z" fill="#e11d2b"/>
  <rect x="122" y="100" width="56" height="32" rx="5" fill="#2b3445"/>
  <circle cx="150" cy="116" r="4" fill="#fff" opacity=".85"/>
  <rect x="114" y="130" width="72" height="7" rx="3.5" fill="#1f2733"/>
  <rect x="55" y="137" width="190" height="9" rx="4.5" fill="#dbe1ee"/>
  <rect x="68" y="146" width="8" height="36" rx="3" fill="#c8d0e2"/>
  <rect x="224" y="146" width="8" height="36" rx="3" fill="#c8d0e2"/>
  <path d="M87 121 q-12 -16 -2 -27 q9 11 7 27 z" fill="#1ca14d"/>
  <path d="M90 122 q3 -17 16 -19 q-2 13 -12 20 z" fill="#23c45f"/>
  <path d="M76 137 h24 l-3 -16 h-18 z" fill="#e8604c"/>
  <rect x="206" y="125" width="13" height="12" rx="3" fill="#0d9488"/>
</svg>`;

// Decorative diagonal stripes (bottom of the sidebar).
const STRIPES = `
<svg class="stripes" viewBox="0 0 140 110" aria-hidden="true">
  <path d="M6 110 L42 38 H62 L26 110 Z" fill="#f6b63b"/>
  <path d="M44 110 L80 38 H100 L64 110 Z" fill="#e11d2b"/>
  <path d="M82 110 L118 56 H136 L102 110 Z" fill="#f78f1e"/>
</svg>`;

// ---------------------------------------------------------------------------
// State + routing
// ---------------------------------------------------------------------------
let me = null;
let lastUserId = undefined;
let clockTimer = null;
const ui = { view: 'dashboard', search: '', teamUser: null };
const reviews = { weekStart: weekStartISO() };

async function fetchProfile(userId) {
  for (let i = 0; i < 4; i++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, status, created_at, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

async function routeForSession(session) {
  if (!session) {
    me = null;
    lastUserId = undefined;
    renderAuth();
    return;
  }
  if (session.user.id === lastUserId && me) return;
  lastUserId = session.user.id;
  try {
    me = await fetchProfile(session.user.id);
  } catch (err) {
    renderFatal(err.message);
    return;
  }
  if (!me) {
    renderFatal('Your profile could not be loaded. Make sure supabase/schema.sql has been run.');
    return;
  }
  rerenderCurrent();
}

function rerenderCurrent() {
  if (me.role === 'admin' || me.status === 'approved') renderShell();
  else renderStatus();
}

supabase.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => routeForSession(session), 0);
});

async function fetchDays(from, to) {
  const { data, error } = await supabase
    .from('office_days')
    .select('day, user_id, display_name, avatar_url, start_time, end_time, kind')
    .gte('day', from)
    .lte('day', to)
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Profile pictures (Supabase Storage: public "avatars" bucket)
// ---------------------------------------------------------------------------
function pickImageFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = () => resolve(inp.files && inp.files[0] ? inp.files[0] : null);
    inp.click();
  });
}

async function uploadAvatar(uid, file) {
  const path = `${uid}/avatar`;
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`; // cache-bust so the new photo shows immediately
  const { error: pErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', uid);
  if (pErr) throw pErr;
  await supabase.from('office_days').update({ avatar_url: url }).eq('user_id', uid);
  return url;
}

async function removeAvatar(uid) {
  await supabase.storage.from('avatars').remove([`${uid}/avatar`]);
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', uid);
  if (error) throw error;
  await supabase.from('office_days').update({ avatar_url: null }).eq('user_id', uid);
  if (uid === me.id) me.avatar_url = null;
}

// Pick a file and upload it as `uid`'s avatar. onDone(url) runs on success.
async function changeAvatar(uid, onDone) {
  const file = await pickImageFile();
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Please choose an image file.'); return; }
  if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5 MB.'); return; }
  try {
    const url = await uploadAvatar(uid, file);
    if (uid === me.id) me.avatar_url = url;
    toast('Photo updated');
    if (onDone) onDone(url);
  } catch (e) {
    toast(e.message || 'Upload failed');
  }
}

// ---------------------------------------------------------------------------
// Auth view
// ---------------------------------------------------------------------------
function renderAuth() {
  clearInterval(clockTimer);
  app.innerHTML = `
    <div class="center-screen">
      <div class="auth-card card grad-top">
        <div style="text-align:center; margin-bottom:22px;">
          <img class="auth-logo" src="./assets/logo.png" alt="Redline" />
          <div class="brand" style="justify-content:center;"><span class="name">RED<span>LINE</span></span></div>
          <p class="subtitle" style="margin-top:6px;">EMPLOYEE PORTAL</p>
        </div>
        <div class="tabs">
          <button id="tab-login" class="active" type="button">Sign in</button>
          <button id="tab-signup" type="button">Create account</button>
        </div>
        <div id="message" class="msg"></div>
        <form id="login-form" class="stack">
          <div><label>Email</label><input id="li-email" type="email" required autocomplete="email" /></div>
          <div><label>Password</label><input id="li-pass" type="password" required autocomplete="current-password" /></div>
          <button class="btn primary full" type="submit">Sign in</button>
        </form>
        <form id="signup-form" class="stack" style="display:none;">
          <div><label>Full name</label><input id="su-name" type="text" required autocomplete="name" /></div>
          <div><label>Email</label><input id="su-email" type="email" required autocomplete="email" /></div>
          <div><label>Password <span style="opacity:.7">(min 8 characters)</span></label><input id="su-pass" type="password" required minlength="8" autocomplete="new-password" /></div>
          <button class="btn primary full" type="submit">Request access</button>
          <p class="subtitle" style="margin:4px 0 0; font-size:0.82rem;">New accounts need admin approval before you can sign in.</p>
        </form>
      </div>
    </div>`;

  const message = document.getElementById('message');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const showMsg = (t, type = 'error') => { message.textContent = t; message.className = `msg show ${type}`; };
  const clearMsg = () => { message.className = 'msg'; };
  const selectTab = (login) => {
    tabLogin.classList.toggle('active', login);
    tabSignup.classList.toggle('active', !login);
    loginForm.style.display = login ? '' : 'none';
    signupForm.style.display = login ? 'none' : '';
    clearMsg();
  };
  tabLogin.onclick = () => selectTab(true);
  tabSignup.onclick = () => selectTab(false);

  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    clearMsg();
    const btn = loginForm.querySelector('button');
    btn.disabled = true;
    const { error } = await supabase.auth.signInWithPassword({
      email: document.getElementById('li-email').value.trim(),
      password: document.getElementById('li-pass').value,
    });
    if (error) { showMsg(error.message || 'Invalid email or password.'); btn.disabled = false; }
  };

  signupForm.onsubmit = async (e) => {
    e.preventDefault();
    clearMsg();
    const btn = signupForm.querySelector('button');
    btn.disabled = true;
    const { data, error } = await supabase.auth.signUp({
      email: document.getElementById('su-email').value.trim(),
      password: document.getElementById('su-pass').value,
      options: { data: { full_name: document.getElementById('su-name').value.trim() } },
    });
    btn.disabled = false;
    if (error) { showMsg(error.message); return; }
    if (data.session) return;
    signupForm.reset();
    selectTab(true);
    showMsg('Account created! Check your email to confirm, then wait for admin approval.', 'success');
  };
}

// ---------------------------------------------------------------------------
// Edit-profile modal (photo + display name) + small chrome helpers
// ---------------------------------------------------------------------------
function openProfileModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card pad">
      <h2 style="margin-bottom:4px;">Edit profile</h2>
      <p class="subtitle" style="margin-bottom:18px;">Your photo and name appear on the schedule.</p>
      <div class="modal-avatar">
        <div id="pm-avatar">${avatarHTML(me.full_name || me.email, true, 'xl', me.avatar_url)}</div>
        <div class="modal-avatar-actions">
          <button class="btn ghost sm" id="pm-upload" type="button">Upload photo</button>
          <button class="btn ghost sm" id="pm-remove" type="button"${me.avatar_url ? '' : ' style="display:none"'}>Remove</button>
        </div>
      </div>
      <div id="nm-msg" class="msg"></div>
      <label>Display name</label>
      <input id="nm-input" type="text" maxlength="60" value="${esc(me.full_name || '')}" />
      <div style="display:flex; gap:10px; margin-top:18px; justify-content:flex-end;">
        <button class="btn ghost" id="nm-cancel" type="button">Cancel</button>
        <button class="btn primary" id="nm-save" type="button">Save</button>
      </div>
      <div class="modal-signout"><button class="btn danger full" id="nm-signout" type="button">Sign out</button></div>
    </div>`;
  document.body.appendChild(overlay);

  let dirty = false;
  const close = () => { overlay.remove(); if (dirty) rerenderCurrent(); };
  const input = overlay.querySelector('#nm-input');
  const msg = overlay.querySelector('#nm-msg');
  const saveBtn = overlay.querySelector('#nm-save');
  const avBox = overlay.querySelector('#pm-avatar');
  const rmBtn = overlay.querySelector('#pm-remove');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#nm-cancel').onclick = close;
  input.focus();
  input.select();

  const refreshAvatar = () => {
    avBox.innerHTML = avatarHTML(me.full_name || me.email, true, 'xl', me.avatar_url);
    rmBtn.style.display = me.avatar_url ? '' : 'none';
  };

  overlay.querySelector('#pm-upload').onclick = () => changeAvatar(me.id, () => { dirty = true; refreshAvatar(); });
  rmBtn.onclick = async () => {
    rmBtn.disabled = true;
    try { await removeAvatar(me.id); dirty = true; refreshAvatar(); toast('Photo removed'); }
    catch (e) { toast(e.message || 'Could not remove photo'); }
    rmBtn.disabled = false;
  };

  const save = async () => {
    const name = input.value.trim();
    if (name.length < 1) { msg.textContent = 'Name cannot be empty.'; msg.className = 'msg show error'; return; }
    saveBtn.disabled = true;
    if (name !== (me.full_name || '')) {
      const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', me.id);
      if (error) { msg.textContent = error.message; msg.className = 'msg show error'; saveBtn.disabled = false; return; }
      await supabase.from('office_days').update({ display_name: name }).eq('user_id', me.id);
      me.full_name = name;
      dirty = true;
    }
    close();
  };
  saveBtn.onclick = save;
  input.onkeydown = (e) => { if (e.key === 'Enter') save(); };
  overlay.querySelector('#nm-signout').onclick = async () => { overlay.remove(); await supabase.auth.signOut(); };
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

function renderStatus() {
  clearInterval(clockTimer);
  const pending = me.status === 'pending';
  app.innerHTML = `
    <div class="center-screen">
      <div class="auth-card card grad-top" style="text-align:center;">
        <img class="auth-logo" src="./assets/logo.png" alt="Redline" style="height:46px" />
        <div><span class="badge ${esc(me.status)}" style="font-size:0.85rem; margin:10px 0 14px;">${esc(me.status)}</span></div>
        <h1>${pending ? 'Your account is awaiting approval' : 'Account not approved'}</h1>
        <p class="subtitle" style="margin-top:8px;">
          ${pending
            ? 'An admin needs to approve your account before you can schedule office days. Check back soon!'
            : 'Your access request was denied. If you think this is a mistake, contact your administrator.'}
        </p>
        <button id="signout" class="btn ghost full" type="button" style="margin-top:14px;">Sign out</button>
      </div>
    </div>`;
  document.getElementById('signout').onclick = async () => { await supabase.auth.signOut(); };
}

function renderFatal(msg) {
  clearInterval(clockTimer);
  app.innerHTML = `
    <div class="center-screen"><div class="auth-card card grad-top" style="text-align:center">
      <img class="auth-logo" src="./assets/logo.png" alt="Redline" />
      <h2>Something went wrong</h2>
      <p class="subtitle">${esc(msg)}</p>
      <button id="signout" class="btn ghost full" type="button">Sign out</button>
    </div></div>`;
  const so = document.getElementById('signout');
  if (so) so.onclick = async () => { await supabase.auth.signOut(); };
}

// ===========================================================================
// App shell — sidebar + topbar + view container
// ===========================================================================
function renderShell() {
  clearInterval(clockTimer);
  const isAdmin = me.role === 'admin';
  app.innerHTML = `
    <div class="frame">
      <aside class="sidebar">
        <div class="side-brand">
          <img class="logo" src="./assets/logo.png" alt="Redline" />
          <div>
            <div class="name">RED<span>LINE</span></div>
            <div class="side-sub">EMPLOYEE PORTAL</div>
          </div>
        </div>
        <nav class="s-nav">
          <button class="nav-item" data-view="dashboard" type="button">${icon('dash')}<span class="txt">Dashboard</span></button>
          <button class="nav-item" data-view="schedule" type="button">${icon('cal')}<span class="txt">Schedule</span></button>
          <button class="nav-item" data-view="tasks" type="button">${icon('tasks')}<span class="txt">Tasks</span><span class="nav-badge" id="nav-tasks" style="display:none"></span></button>
          ${isAdmin ? `<button class="nav-item" data-view="team" type="button">${icon('team')}<span class="txt">Team</span><span class="nav-badge" id="nav-pending" style="display:none"></span></button>` : ''}
          ${isAdmin ? `<button class="nav-item" data-view="reviews" type="button">${icon('star')}<span class="txt">Reviews</span></button>` : ''}
          <button class="nav-item" id="nav-settings" type="button">${icon('gear')}<span class="txt">Settings</span></button>
        </nav>
        ${STRIPES}
      </aside>
      <div class="main">
        <div class="topbar">
          <label class="search">${icon('search', 'ic sm')}<input id="search-input" type="text" placeholder="Search people…" value="${esc(ui.search)}" /></label>
          <div class="now" id="now-text"></div>
          <button class="icon-btn" id="bell" type="button" title="Notifications">${icon('bell')}<span class="bell-badge" id="bell-badge" style="display:none"></span></button>
          <div class="avatar-stack tb-stack" id="tb-avatars" title="In the office today"></div>
          <button class="add-btn" id="quick-add" type="button" title="Schedule a day">${icon('plus')}</button>
        </div>
        <div id="view"></div>
      </div>
    </div>`;

  document.querySelectorAll('.nav-item[data-view]').forEach((b) => {
    b.onclick = () => { ui.teamUser = null; setView(b.dataset.view); };
  });
  document.getElementById('nav-settings').onclick = openProfileModal;
  document.getElementById('quick-add').onclick = () => gotoDay(TODAY);
  document.getElementById('bell').onclick = () => {
    if (isAdmin) { ui.teamUser = null; setView('team'); }
    else toast("You're all caught up 🎉");
  };

  const sin = document.getElementById('search-input');
  sin.oninput = () => {
    ui.search = sin.value.trim().toLowerCase();
    if (ui.view !== 'schedule') setView('schedule');
    else { renderCalendar(); renderPanel(); }
  };
  sin.onkeydown = (e) => {
    if (e.key === 'Escape') { sin.value = ''; ui.search = ''; if (ui.view === 'schedule') { renderCalendar(); renderPanel(); } }
  };

  startClock();
  setView(ui.view || 'dashboard');
  refreshTaskBadge();
}

function startClock() {
  const tick = () => {
    const el = document.getElementById('now-text');
    if (!el) return;
    const d = new Date();
    el.textContent =
      d.toLocaleDateString(undefined, { weekday: 'long' }) + ', ' +
      d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };
  tick();
  clockTimer = setInterval(tick, 30000);
}

function setView(v) {
  if ((v === 'team' || v === 'reviews') && me.role !== 'admin') v = 'dashboard';
  ui.view = v;
  document.querySelectorAll('.nav-item[data-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === v);
  });
  const view = document.getElementById('view');
  if (!view) return;
  if (v === 'dashboard') viewDashboard(view);
  else if (v === 'team') viewTeam(view);
  else if (v === 'reviews') viewReviews(view);
  else if (v === 'tasks') viewTasks(view);
  else viewSchedule(view);
}

function gotoDay(iso) {
  const [y, m] = iso.split('-').map(Number);
  sched.view = { year: y, month: m - 1 };
  sched.pendingSelect = iso;
  setView('schedule');
}

function updateBell(count) {
  const b = document.getElementById('bell-badge');
  if (b) {
    b.textContent = count;
    b.style.display = count > 0 ? '' : 'none';
  }
  const n = document.getElementById('nav-pending');
  if (n) {
    n.textContent = count;
    n.style.display = count > 0 ? '' : 'none';
  }
}

function updateTopStack(rows) {
  const el = document.getElementById('tb-avatars');
  if (!el) return;
  const seen = new Set();
  const list = [];
  for (const r of rows || []) {
    if (r.day !== TODAY || kindOf(r) !== 'in' || seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    list.push(r);
  }
  list.sort((a, b) => (a.user_id === me.id ? -1 : b.user_id === me.id ? 1 : 0));
  el.innerHTML =
    list.slice(0, 4).map((r) => avatarHTML(r.display_name, r.user_id === me.id, 'sm', r.avatar_url)).join('') +
    (list.length > 4 ? `<span class="avatar sm more">+${list.length - 4}</span>` : '');
}

// ===========================================================================
// Dashboard view
// ===========================================================================
const dash = {
  view: (() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; })(),
  gridRows: [],
  upRows: [],
};

function viewDashboard(view) {
  const n = new Date();
  dash.view = { year: n.getFullYear(), month: n.getMonth() };
  const isAdmin = me.role === 'admin';

  view.innerHTML = `
    <div class="dash">
      <div class="dash-main">
        <div class="card hero">
          <div class="hero-text">
            <h1>Welcome, <span class="hl">${esc(firstName(me.full_name || me.email))}</span></h1>
            <p>Plan your office days, see who's around, and keep your week on track — all from one place.</p>
            <button class="btn primary" id="hero-cta" type="button">Schedule office day</button>
          </div>
          ${HERO_ART}
        </div>
        <div class="dash-grid">
          <div class="dash-col">
            <div class="card pad profile-card">
              <button class="edit-fab" id="prof-edit" type="button" title="Edit your profile">${icon('edit', 'ic sm')}</button>
              <div class="prof-head">
                <button class="av-btn" id="prof-avatar" type="button" title="Change photo">${avatarHTML(me.full_name || me.email, true, 'lg', me.avatar_url)}</button>
                <div>
                  <div class="prof-name">${esc(me.full_name || '(no name)')}</div>
                  <span class="badge ${esc(me.role)}">${esc(me.role)}</span>
                </div>
              </div>
              <div class="prof-rows">
                <div><span>Email</span><strong>${esc(me.email)}</strong></div>
                <div><span>Joined</span><strong>${fmtDate((me.created_at || '').slice(0, 10)) || '—'}</strong></div>
                <div><span>Status</span><strong style="text-transform:capitalize">${esc(me.status)}</strong></div>
              </div>
            </div>
            <div class="card pad month-card">
              <div class="card-head"><h3>This month</h3></div>
              <div class="month-big"><span id="mc-count">–</span><span class="muted-mini" id="mc-of"></span></div>
              <div class="bar"><i id="mc-bar" style="width:0%"></i></div>
              <div class="mc-foot">
                <div class="avatar-stack" id="mc-stack"></div>
                <span class="muted-mini" id="mc-note"></span>
              </div>
            </div>
          </div>
          <div class="card pad upcoming-card">
            <div class="card-head">
              <h3>My schedule</h3>
              <button class="link-btn" id="see-cal" type="button">View calendar</button>
            </div>
            <div id="up-list"><div class="spinner">Loading…</div></div>
          </div>
        </div>
      </div>
      <aside class="dash-side">
        <div class="card pad review-card" id="review-card">
          <div class="card-head"><h3>Your latest review</h3></div>
          <div id="rc-body"><div class="spinner">Loading…</div></div>
        </div>
        <div class="card pad mini-card">
          <div class="mini-head">
            <strong id="mini-title"></strong>
            <span class="mini-nav">
              <button id="mini-prev" type="button" aria-label="Previous month">‹</button>
              <button id="mini-next" type="button" aria-label="Next month">›</button>
            </span>
          </div>
          <div class="mini-grid" id="mini-grid"></div>
        </div>
        <div class="card pad today-card">
          <div class="card-head"><h3>Who's in today</h3></div>
          <div id="today-list"><div class="spinner">Loading…</div></div>
        </div>
        ${isAdmin ? `
        <div class="card pad pending-card">
          <div class="card-head"><h3>Pending approvals</h3></div>
          <div id="pend-box"><div class="spinner">Loading…</div></div>
        </div>` : ''}
      </aside>
    </div>`;

  document.getElementById('hero-cta').onclick = () => gotoDay(TODAY);
  document.getElementById('see-cal').onclick = () => setView('schedule');
  document.getElementById('prof-edit').onclick = openProfileModal;
  document.getElementById('prof-avatar').onclick = openProfileModal;
  document.getElementById('mini-prev').onclick = () => shiftMini(-1);
  document.getElementById('mini-next').onclick = () => shiftMini(1);

  loadDashboard();
}

async function loadDashboard() {
  const cells = gridCells(dash.view.year, dash.view.month);
  try {
    [dash.gridRows, dash.upRows] = await Promise.all([
      fetchDays(toISO(cells[0]), toISO(cells[41])),
      fetchDays(TODAY, addDaysISO(TODAY, 60)),
    ]);
  } catch (err) {
    const el = document.getElementById('up-list');
    if (el) el.innerHTML = `<div class="empty">Couldn't load schedule: ${esc(err.message)}</div>`;
    return;
  }
  renderMini();
  renderUpcoming();
  renderTodayCard();
  renderMonthCard();
  updateTopStack(dash.upRows);
  loadMyReviewCard();
  if (me.role === 'admin') loadPendingCard();
}

// Show the signed-in user their own latest weekly review (employees can read
// their own rows via RLS). Admins only see this card if they've been reviewed.
async function loadMyReviewCard() {
  const card = document.getElementById('review-card');
  if (!card) return;
  const body = card.querySelector('#rc-body');
  const { data, error } = await supabase
    .from('weekly_reviews')
    .select('week_start, rating, note')
    .eq('user_id', me.id)
    .order('week_start', { ascending: false });

  if (error) { card.remove(); return; }
  const revs = data || [];
  if (!revs.length) {
    if (me.role === 'admin') { card.remove(); return; }
    body.innerHTML = '<div class="empty" style="padding:6px 2px">No reviews yet — weekly feedback from your manager will show up here.</div>';
    return;
  }

  const latest = revs[0];
  const [lp, ls] = weekLabelParts(latest.week_start);
  body.innerHTML = `
    <div class="rc-top">
      <span class="rating-badge lg ${ratingTier(latest.rating)}">${latest.rating}<span class="rc-outof">/10</span></span>
      <div class="rc-meta">
        <div class="rc-week">${esc(lp)}</div>
        <div class="muted-mini">${esc(ls)}</div>
      </div>
    </div>
    <div class="rc-note">${latest.note ? esc(latest.note) : '<span class="muted-mini">No note left.</span>'}</div>
    <button class="link-btn" id="rc-all" type="button">${revs.length > 1 ? `View all ${revs.length} reviews` : 'Read full review'}</button>`;

  const all = body.querySelector('#rc-all');
  if (all) all.onclick = () => openMyReviewsModal(revs);
}

// Read-only history of the signed-in user's own reviews.
function openMyReviewsModal(revs) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card pad">
      <h2 style="margin-bottom:4px;">Your reviews</h2>
      <p class="subtitle" style="margin-bottom:16px;">Weekly feedback from your manager.</p>
      <div class="myr-list">
        ${revs.map((r) => {
          const [lp, ls] = weekLabelParts(r.week_start);
          return `
            <div class="myr-row">
              <div class="myr-head">
                <span class="rating-badge ${ratingTier(r.rating)}">${r.rating}</span>
                <div class="myr-week">${esc(lp)} <span class="muted-mini">· ${esc(ls)}</span></div>
              </div>
              <p class="myr-note${r.note ? '' : ' muted-mini'}">${r.note ? esc(r.note) : 'No note left.'}</p>
            </div>`;
        }).join('')}
      </div>
      <div class="modal-foot"><button class="btn primary" id="myr-close" type="button">Done</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#myr-close').onclick = close;
}

async function shiftMini(delta) {
  let m = dash.view.month + delta;
  let y = dash.view.year;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  dash.view = { year: y, month: m };
  const cells = gridCells(y, m);
  try {
    dash.gridRows = await fetchDays(toISO(cells[0]), toISO(cells[41]));
  } catch { dash.gridRows = []; }
  renderMini();
}

function renderMini() {
  const title = document.getElementById('mini-title');
  const grid = document.getElementById('mini-grid');
  if (!title || !grid) return;
  title.textContent = `${MONTHS[dash.view.month].slice(0, 3)} ${dash.view.year}`;

  const byDay = new Map();
  for (const r of dash.gridRows) {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day).push(r);
  }

  let html = DOW1.map((d) => `<span class="mini-dow">${d}</span>`).join('');
  for (const d of gridCells(dash.view.year, dash.view.month)) {
    const iso = toISO(d);
    const inMonth = d.getMonth() === dash.view.month;
    const list = byDay.get(iso) || [];
    const meHas = list.some((r) => r.user_id === me.id);
    const cls = ['mini-day'];
    if (!inMonth) cls.push('out');
    if (iso === TODAY) cls.push('today');
    html += `<button type="button" class="${cls.join(' ')}" data-day="${iso}">${d.getDate()}${
      list.length ? `<span class="dt${meHas ? '' : ' other'}"></span>` : ''
    }</button>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.mini-day').forEach((b) => {
    b.onclick = () => gotoDay(b.dataset.day);
  });
}

function renderUpcoming() {
  const el = document.getElementById('up-list');
  if (!el) return;
  const mine = dash.upRows
    .filter((r) => r.user_id === me.id)
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(0, 5);

  if (!mine.length) {
    el.innerHTML = `
      <div class="empty" style="padding:14px 2px;">Nothing scheduled yet.</div>
      <button class="btn ghost full" id="up-add" type="button">+ Schedule a day</button>`;
    const b = document.getElementById('up-add');
    if (b) b.onclick = () => gotoDay(TODAY);
    return;
  }

  el.innerHTML = mine.map((r) => {
    const d = new Date(`${r.day}T00:00:00`);
    const k = kindOf(r);
    const title = k === 'in' ? 'In office' : k === 'vacation' ? 'Vacation' : 'Sick day';
    const sub = k === 'in'
      ? (r.start_time ? fmtRangePlain(r.start_time, r.end_time) : 'no hours set')
      : d.toLocaleDateString(undefined, { weekday: 'long' });
    const pill = k === 'in' ? 'IN' : k === 'vacation' ? 'VACATION' : 'SICK';
    return `
      <button class="up-row" data-day="${r.day}" type="button">
        <span class="up-date"><span class="up-num">${d.getDate()}</span><span class="up-mon">${MONTHS[d.getMonth()].slice(0, 3).toUpperCase()} ${d.getFullYear()}</span></span>
        <span class="up-info"><span class="up-title">${title}</span><span class="up-sub">${sub}</span></span>
        <span class="pill ${k}">${pill}</span>
      </button>`;
  }).join('');

  el.querySelectorAll('.up-row').forEach((b) => {
    b.onclick = () => gotoDay(b.dataset.day);
  });
}

function renderTodayCard() {
  const el = document.getElementById('today-list');
  if (!el) return;
  const today = dash.upRows.filter((r) => r.day === TODAY).sort(entrySort);
  const ins = today.filter((r) => kindOf(r) === 'in');
  const outs = today.filter((r) => kindOf(r) !== 'in');

  const inHTML = ins.length
    ? ins.slice(0, 6).map((r) => {
        const meFlag = r.user_id === me.id;
        return `<div class="att">${avatarHTML(r.display_name, meFlag, '', r.avatar_url)}<span class="att-name">${esc(r.display_name || 'Someone')}${meFlag ? ' <span class="muted-mini">(you)</span>' : ''}</span>${
          r.start_time ? `<span class="att-hours">${esc(fmtCompactRange(r.start_time, r.end_time))}</span>` : ''
        }</div>`;
      }).join('') + (ins.length > 6 ? `<div class="muted-mini" style="padding:4px 2px">+${ins.length - 6} more</div>` : '')
    : '<div class="empty" style="padding:8px 2px;">No one yet — be the first!</div>';

  const outHTML = outs.length
    ? `<div class="out-line">${outs.map((r) => `${KIND_EMOJI[kindOf(r)]} ${esc(shortName(r.display_name))}`).join(' · ')}</div>`
    : '';

  el.innerHTML = inHTML + outHTML;
}

function renderMonthCard() {
  const count = document.getElementById('mc-count');
  if (!count) return;
  const n = new Date();
  const y = n.getFullYear(), m = n.getMonth();
  const monthRows = dash.gridRows.filter((r) => {
    const [ry, rm] = r.day.split('-').map(Number);
    return ry === y && rm - 1 === m;
  });
  const myIn = monthRows.filter((r) => r.user_id === me.id && kindOf(r) === 'in').length;
  const wd = workdaysInMonth(y, m);

  count.textContent = myIn;
  document.getElementById('mc-of').textContent = ` of ${wd} workdays in office`;
  document.getElementById('mc-bar').style.width = `${Math.min(100, Math.round((myIn / wd) * 100))}%`;

  const seen = new Set();
  const mates = [];
  for (const r of monthRows) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    mates.push(r);
  }
  mates.sort((a, b) => (a.user_id === me.id ? -1 : b.user_id === me.id ? 1 : 0));
  document.getElementById('mc-stack').innerHTML =
    mates.slice(0, 5).map((r) => avatarHTML(r.display_name, r.user_id === me.id, 'sm', r.avatar_url)).join('') +
    (mates.length > 5 ? `<span class="avatar sm more">+${mates.length - 5}</span>` : '');
  document.getElementById('mc-note').textContent = mates.length
    ? `${mates.length} ${mates.length === 1 ? 'person' : 'people'} active this month`
    : 'no activity yet this month';
}

async function loadPendingCard() {
  const box = document.getElementById('pend-box');
  if (!box) return;
  const { data, count, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url', { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(3);
  if (error) { box.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }

  updateBell(count || 0);
  if (!count) {
    box.innerHTML = '<div class="empty" style="padding:8px 2px;">No pending requests 🎉</div>';
    return;
  }
  box.innerHTML = `
    <div class="pend-count"><span class="big">${count}</span><span class="muted-mini">waiting for approval</span></div>
    ${data.map((u) => `<div class="att">${avatarHTML(u.full_name || u.email, false, '', u.avatar_url)}<span class="att-name">${esc(u.full_name || u.email)}</span></div>`).join('')}
    <button class="btn primary full sm" id="pend-review" type="button" style="margin-top:12px;">Review requests</button>`;
  const b = document.getElementById('pend-review');
  if (b) b.onclick = () => { ui.teamUser = null; setView('team'); };
}

// ===========================================================================
// Schedule view — office-day scheduling
// ===========================================================================
const sched = {
  view: (() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; })(),
  cells: [],
  rows: [],
  byDay: new Map(),
  selectedDay: null,
  pendingSelect: null,
  selection: [],   // ISO days picked via drag (length > 1 => bulk mode)
};
// Drag-to-select controller. Mouse: press-drag. Touch: press-and-hold, then drag.
const drag = { anchor: null, active: false, pointerType: null, startX: 0, startY: 0, timer: null };
let pointerWired = false;
let panelEditing = false; // showing the entry form for an already-marked day?

function entrySort(a, b) {
  if (a.user_id === me.id) return -1;
  if (b.user_id === me.id) return 1;
  const ka = KIND_RANK[kindOf(a)], kb = KIND_RANK[kindOf(b)];
  if (ka !== kb) return ka - kb;
  if (kindOf(a) === 'in') return hhmm(a.start_time).localeCompare(hhmm(b.start_time));
  return (a.display_name || '').localeCompare(b.display_name || '');
}

function viewSchedule(view) {
  panelEditing = false;
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Office schedule</h1>
        <p class="subtitle" style="margin:2px 0 0;">Tap a day to mark yourself in, on vacation, or off sick — or drag across days (press &amp; hold first on a phone) to book several at once.</p>
      </div>
    </div>
    <div id="stats" class="stats"></div>
    <div class="cal-toolbar">
      <div class="cal-month-title" id="cal-title"></div>
      <div class="cal-nav">
        <button class="btn ghost sm" id="prev" type="button" aria-label="Previous month">‹</button>
        <button class="btn ghost sm" id="today-btn" type="button">Today</button>
        <button class="btn ghost sm" id="next" type="button" aria-label="Next month">›</button>
      </div>
    </div>
    <div class="sched">
      <div class="cal-card card">
        <div class="cal-grid dow-row">${DOW.map((d) => `<div class="dow">${d}</div>`).join('')}</div>
        <div class="cal-grid month-grid" id="grid"><div class="spinner" style="grid-column:1/-1">Loading…</div></div>
      </div>
      <div id="day-panel"></div>
    </div>`;
  document.getElementById('prev').onclick = () => shiftMonth(-1);
  document.getElementById('next').onclick = () => shiftMonth(1);
  document.getElementById('today-btn').onclick = () => {
    const n = new Date();
    sched.view = { year: n.getFullYear(), month: n.getMonth() };
    sched.pendingSelect = TODAY;
    loadSchedule();
  };
  document.getElementById('grid').addEventListener('pointerdown', onGridPointerDown);
  if (!pointerWired) {
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', cancelDrag);
    // Reliably stop the page from scrolling while a touch drag-select is active.
    document.addEventListener('touchmove', (e) => {
      if (drag.active && drag.pointerType === 'touch') e.preventDefault();
    }, { passive: false });
    pointerWired = true;
  }
  loadSchedule();
}

// ---- Drag-to-select multiple days ----------------------------------------
function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest('.cell') : null;
}

// Selectable (today or later) ISO days between two cells, in calendar order.
function rangeIsos(anchorIso, currentIso) {
  const isos = sched.cells.map(toISO);
  const ai = isos.indexOf(anchorIso), ci = isos.indexOf(currentIso);
  if (ai < 0 || ci < 0) return [anchorIso].filter((d) => d >= TODAY);
  const [lo, hi] = ai <= ci ? [ai, ci] : [ci, ai];
  return isos.slice(lo, hi + 1).filter((d) => d >= TODAY);
}

function paintSelection() {
  const grid = document.getElementById('grid');
  if (!grid) return;
  const multi = sched.selection.length > 1;
  const set = new Set(sched.selection);
  grid.querySelectorAll('.cell').forEach((c) => {
    c.classList.toggle('range', multi && set.has(c.dataset.iso));
  });
}

function cancelDrag() {
  clearTimeout(drag.timer);
  drag.timer = null;
  drag.anchor = null;
  drag.active = false;
  const grid = document.getElementById('grid');
  if (grid) grid.style.touchAction = '';
}

function onGridPointerDown(e) {
  const cell = e.target.closest('.cell');
  if (!cell || e.button === 1 || e.button === 2) return;
  const iso = cell.dataset.iso;
  drag.anchor = iso;
  drag.pointerType = e.pointerType;
  drag.startX = e.clientX;
  drag.startY = e.clientY;
  drag.active = false;
  clearTimeout(drag.timer);
  sched.selection = [];
  paintSelection();

  if (e.pointerType === 'touch') {
    // Press-and-hold to begin a selection (so a normal swipe still scrolls).
    drag.timer = setTimeout(() => {
      drag.active = true;
      sched.selection = rangeIsos(iso, iso);
      paintSelection();
      const grid = document.getElementById('grid');
      if (grid) grid.style.touchAction = 'none';
      if (navigator.vibrate) navigator.vibrate(12);
    }, 300);
  } else {
    drag.active = true; // mouse/pen: start immediately
  }
}

function onPointerMove(e) {
  if (!drag.anchor) return;
  if (!drag.active) {
    // touch, pre-hold: a real move means the user is scrolling, so bail out
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 10) cancelDrag();
    return;
  }
  if (drag.pointerType === 'touch') e.preventDefault();
  const cell = cellFromPoint(e.clientX, e.clientY);
  if (!cell || !cell.dataset.iso) return;
  const next = rangeIsos(drag.anchor, cell.dataset.iso);
  if (next.length !== sched.selection.length || next[next.length - 1] !== sched.selection[sched.selection.length - 1]) {
    sched.selection = next;
    paintSelection();
  }
}

function onPointerUp() {
  if (!drag.anchor) return;
  const anchor = drag.anchor;
  const wasActive = drag.active;
  cancelDrag();
  if (wasActive && sched.selection.length > 1) {
    renderPanel(); // bulk panel
  } else {
    sched.selection = [];
    selectDay(anchor); // plain click / tap → single day
  }
}

function indexRows() {
  const m = new Map();
  for (const r of sched.rows) {
    if (!m.has(r.day)) m.set(r.day, []);
    m.get(r.day).push(r);
  }
  sched.byDay = m;
}

function shiftMonth(delta) {
  let m = sched.view.month + delta;
  let y = sched.view.year;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  sched.view = { year: y, month: m };
  loadSchedule();
}

async function loadSchedule() {
  sched.selection = [];
  cancelDrag();
  sched.cells = gridCells(sched.view.year, sched.view.month);
  const from = toISO(sched.cells[0]);
  const to = toISO(sched.cells[sched.cells.length - 1]);

  let data;
  try {
    data = await fetchDays(from, to);
  } catch (err) {
    const grid = document.getElementById('grid');
    if (grid) grid.innerHTML = `<div class="empty" style="grid-column:1/-1">Couldn't load schedule: ${esc(err.message)}</div>`;
    return;
  }
  sched.rows = data;
  indexRows();

  const todayInView = new Date().getFullYear() === sched.view.year && new Date().getMonth() === sched.view.month;
  sched.selectedDay = sched.pendingSelect || (todayInView ? TODAY : toISO(new Date(sched.view.year, sched.view.month, 1)));
  sched.pendingSelect = null;
  renderAll();
}

function renderAll() {
  renderStats();
  renderCalendar();
  renderPanel();
  updateTopStack(sched.rows);
}

function statCard(label, value, sub, id) {
  const open = id ? ` id="stat-${id}" style="cursor:pointer"` : '';
  return `<div class="stat"${open}>
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;
}

function renderStats() {
  const el = document.getElementById('stats');
  if (!el) return;

  const monthRows = sched.rows.filter((r) => {
    const [y, m] = r.day.split('-').map(Number);
    return y === sched.view.year && m - 1 === sched.view.month;
  });
  const myInMonth = monthRows.filter((r) => r.user_id === me.id && kindOf(r) === 'in').length;
  const todayAll = sched.byDay.get(TODAY) || [];
  const todayIn = todayAll.filter((a) => kindOf(a) === 'in');
  const todayVac = todayAll.filter((a) => kindOf(a) === 'vacation').length;
  const todaySick = todayAll.filter((a) => kindOf(a) === 'sick').length;

  const dow = [0, 0, 0, 0, 0, 0, 0];
  for (const r of monthRows) if (kindOf(r) === 'in') dow[new Date(`${r.day}T00:00:00`).getDay()]++;
  let bestWd = -1, bestN = 0;
  for (let i = 0; i < 7; i++) if (dow[i] > bestN) { bestN = dow[i]; bestWd = i; }

  const todayAvatars =
    todayIn.slice(0, 5).map((a) => avatarHTML(a.display_name, a.user_id === me.id, 'sm', a.avatar_url)).join('') +
    (todayIn.length > 5 ? `<span class="avatar sm more">+${todayIn.length - 5}</span>` : '');
  const outTotal = todayVac + todaySick;

  el.innerHTML = `
    ${statCard('In office today', todayIn.length, `<div class="avatar-stack">${todayAvatars || '<span class="muted-mini">No one yet — be the first</span>'}</div>`, 'today')}
    ${statCard('Out today', outTotal, `<span class="muted-mini">${outTotal ? `${todayVac} on vacation · ${todaySick} sick` : 'everyone\'s in'}</span>`)}
    ${statCard('You this month', myInMonth, `<span class="muted-mini">in-office day${myInMonth === 1 ? '' : 's'}</span>`)}
    ${statCard('Most popular', bestWd >= 0 ? WD_PLURAL[bestWd] : '—', bestWd >= 0 ? `<span class="muted-mini">${bestN} in-office visit${bestN === 1 ? '' : 's'}</span>` : '<span class="muted-mini">no bookings yet</span>')}`;

  const tc = document.getElementById('stat-today');
  if (tc) tc.onclick = () => {
    const n = new Date();
    if (n.getFullYear() !== sched.view.year || n.getMonth() !== sched.view.month) {
      sched.view = { year: n.getFullYear(), month: n.getMonth() };
      sched.pendingSelect = TODAY;
      loadSchedule();
    } else selectDay(TODAY);
  };
}

const matchesSearch = (a) =>
  !ui.search || (a.display_name || '').toLowerCase().includes(ui.search);

function renderCalendar() {
  const title = document.getElementById('cal-title');
  if (title) title.textContent = `${MONTHS[sched.view.month]} ${sched.view.year}`;
  const grid = document.getElementById('grid');
  if (!grid) return;

  grid.innerHTML = '';
  const multi = sched.selection.length > 1;
  const selSet = new Set(multi ? sched.selection : []);
  for (const d of sched.cells) {
    const iso = toISO(d);
    const inMonth = d.getMonth() === sched.view.month;
    const list = sched.byDay.get(iso) || [];
    const mine = list.some((a) => a.user_id === me.id);

    const cell = document.createElement('div');
    cell.dataset.iso = iso;
    cell.className = 'cell'
      + (inMonth ? '' : ' muted')
      + (iso === TODAY ? ' today' : '')
      + (iso < TODAY ? ' past' : '')
      + (mine ? ' mine' : '')
      + (multi && selSet.has(iso) ? ' range' : '')
      + (!multi && iso === sched.selectedDay ? ' selected' : '');

    const ordered = list.slice().sort(entrySort);
    const chips = ordered.slice(0, 3).map((a) => {
      const meFlag = a.user_id === me.id;
      const k = kindOf(a);
      const label = meFlag ? 'You' : shortName(a.display_name);
      const dot = k === 'in'
        ? (meFlag ? 'var(--accent)' : personColor(a.display_name))
        : (k === 'vacation' ? 'var(--vac)' : 'var(--amber)');
      let body, tip;
      if (k === 'in') {
        const t = a.start_time ? `<span class="evt-t">${esc(fmtCompactRange(a.start_time, a.end_time))}</span> ` : '';
        body = `${t}${esc(label)}`;
        tip = a.start_time ? `${a.display_name} · ${fmtRangePlain(a.start_time, a.end_time)}` : a.display_name;
      } else {
        body = `${KIND_EMOJI[k]} ${esc(label)}`;
        tip = `${a.display_name} · ${KIND_LABEL[k]}`;
      }
      const dim = matchesSearch(a) ? '' : ' dim';
      return `<span class="evt ${k}${meFlag ? ' me' : ''}${dim}" title="${esc(tip)}"><span class="dot" style="background:${dot}"></span><span class="evt-body">${body}</span></span>`;
    }).join('');
    const more = list.length > 3 ? `<span class="evt more"><span class="evt-body">+${list.length - 3}</span></span>` : '';

    cell.innerHTML = `
      <div class="cell-top"><span class="num">${d.getDate()}</span></div>
      <div class="evts">${chips}${more}</div>`;
    grid.appendChild(cell);
  }
}

function selectDay(iso) {
  panelEditing = false;
  sched.selection = [];
  const [y, m] = iso.split('-').map(Number);
  if (y !== sched.view.year || m - 1 !== sched.view.month) {
    sched.view = { year: y, month: m - 1 };
    sched.pendingSelect = iso;
    loadSchedule();
    return;
  }
  sched.selectedDay = iso;
  renderCalendar();
  renderPanel();
}

function renderPanel() {
  const panel = document.getElementById('day-panel');
  if (!panel) return;
  if (sched.selection.length > 1) return renderBulkPanel(panel);
  const iso = sched.selectedDay;
  const dObj = new Date(`${iso}T00:00:00`);
  const isPast = iso < TODAY;
  const isToday = iso === TODAY;
  const list = (sched.byDay.get(iso) || []).slice().sort(entrySort);
  const myRow = list.find((a) => a.user_id === me.id);
  const mine = !!myRow;
  const inCount = list.filter((a) => kindOf(a) === 'in').length;
  const outCount = list.length - inCount;

  const attendeeHTML = list.length
    ? list.map((a) => {
        const meFlag = a.user_id === me.id;
        const k = kindOf(a);
        let detail;
        if (k === 'in') {
          detail = a.start_time
            ? `<span class="att-hours">${esc(fmtRangePlain(a.start_time, a.end_time))}</span>`
            : '<span class="att-hours muted-mini">no hours set</span>';
        } else {
          detail = `<span class="att-tag ${k}">${KIND_EMOJI[k]} ${KIND_LABEL[k]}</span>`;
        }
        const dim = matchesSearch(a) ? '' : ' dim';
        return `<div class="att${dim}">${avatarHTML(a.display_name, meFlag, '', a.avatar_url)}<span class="att-name">${esc(a.display_name || 'Someone')}${meFlag ? ' <span class="muted-mini">(you)</span>' : ''}</span>${detail}</div>`;
      }).join('')
    : '<div class="empty" style="padding:10px 2px">Nobody scheduled yet.</div>';

  let actionHTML;
  if (isPast) {
    actionHTML = '<button class="btn ghost full" type="button" disabled>This day has passed</button>';
  } else if (!mine || panelEditing) {
    const curKind = (panelEditing && myRow) ? kindOf(myRow) : 'in';
    const ds = myRow && myRow.start_time ? hhmm(myRow.start_time) : '09:00';
    const de = myRow && myRow.end_time ? hhmm(myRow.end_time) : '17:00';
    actionHTML = `
      <div class="entry-form">
        <div class="kind-select">
          <button type="button" class="kind-opt${curKind === 'in' ? ' active' : ''}" data-kind="in">🏢 In</button>
          <button type="button" class="kind-opt${curKind === 'vacation' ? ' active' : ''}" data-kind="vacation">🌴 Vacation</button>
          <button type="button" class="kind-opt${curKind === 'sick' ? ' active' : ''}" data-kind="sick">🤒 Sick</button>
        </div>
        <div class="hours-wrap"${curKind === 'in' ? '' : ' style="display:none"'}>
          <div class="hours-row">
            <div><label>From</label><input type="time" id="h-start" value="${ds}"></div>
            <div><label>To</label><input type="time" id="h-end" value="${de}"></div>
          </div>
          <div class="presets">
            <button type="button" class="chip-btn" data-preset="09:00|17:00">9–5</button>
            <button type="button" class="chip-btn" data-preset="08:00|16:00">8–4</button>
            <button type="button" class="chip-btn" data-preset="00:00|23:59">All day</button>
          </div>
          <p class="muted-mini" style="margin:8px 0 0;">Open 24/7 — any hours, overnight too.</p>
        </div>
        <div id="h-msg" class="msg"></div>
        <div class="form-actions">
          ${mine ? '<button class="btn ghost" type="button" id="h-cancel">Cancel</button>' : ''}
          <button class="btn primary" type="button" id="h-save">Save</button>
        </div>
      </div>`;
  } else {
    const k = kindOf(myRow);
    const summary = k === 'in'
      ? `You're in <strong>${fmtRange(myRow.start_time, myRow.end_time)}</strong>`
      : `${KIND_EMOJI[k]} You're <strong>${k === 'vacation' ? 'on vacation' : 'off sick'}</strong>`;
    actionHTML = `
      <div class="your-booking">
        <div class="yb-hours yb-${k}">${summary}</div>
        <div class="form-actions">
          <button class="btn ghost" type="button" id="edit-hours">Change</button>
          <button class="btn danger" type="button" id="remove-me">Remove me</button>
        </div>
      </div>`;
  }

  panel.innerHTML = `
    <div class="card pad panel">
      <div class="panel-head">
        <div>
          <div class="panel-weekday">${dObj.toLocaleDateString(undefined, { weekday: 'long' })} ${isToday ? '<span class="badge today-badge">Today</span>' : ''}</div>
          <div class="panel-date">${dObj.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        </div>
        <div class="panel-count"><span class="big">${inCount}</span><span class="muted-mini">in office${outCount ? ` · ${outCount} out` : ''}</span></div>
      </div>
      ${actionHTML}
      <div class="att-list">${attendeeHTML}</div>
    </div>`;

  panel.querySelectorAll('.kind-opt').forEach((b) => {
    b.onclick = () => {
      panel.querySelectorAll('.kind-opt').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      const hw = panel.querySelector('.hours-wrap');
      if (hw) hw.style.display = b.dataset.kind === 'in' ? '' : 'none';
    };
  });
  panel.querySelectorAll('.chip-btn').forEach((b) => {
    b.onclick = () => {
      const [s, e] = b.dataset.preset.split('|');
      panel.querySelector('#h-start').value = s;
      panel.querySelector('#h-end').value = e;
    };
  });
  const saveBtn = panel.querySelector('#h-save');
  if (saveBtn) saveBtn.onclick = () => {
    const kind = panel.querySelector('.kind-opt.active').dataset.kind;
    const msg = panel.querySelector('#h-msg');
    if (kind === 'in') {
      const s = panel.querySelector('#h-start').value;
      const e = panel.querySelector('#h-end').value;
      if (!s || !e) { msg.textContent = 'Please choose both a start and end time.'; msg.className = 'msg show error'; return; }
      if (s === e) { msg.textContent = "Start and end times can't be the same."; msg.className = 'msg show error'; return; }
      saveEntry(iso, 'in', s, e);
    } else {
      saveEntry(iso, kind, null, null);
    }
  };
  const cancelBtn = panel.querySelector('#h-cancel');
  if (cancelBtn) cancelBtn.onclick = () => { panelEditing = false; renderPanel(); };
  const editBtn = panel.querySelector('#edit-hours');
  if (editBtn) editBtn.onclick = () => { panelEditing = true; renderPanel(); };
  const rmBtn = panel.querySelector('#remove-me');
  if (rmBtn) rmBtn.onclick = () => removeMe(iso);
}

// Bulk scheduler shown when more than one day is selected via drag.
function renderBulkPanel(panel) {
  const sel = sched.selection.slice().sort();
  const n = sel.length;
  const first = new Date(`${sel[0]}T00:00:00`);
  const last = new Date(`${sel[n - 1]}T00:00:00`);
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  const firstS = first.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const lastS = last.toLocaleDateString(undefined, sameMonth ? { weekday: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });
  const mineCount = sel.filter((iso) => (sched.byDay.get(iso) || []).some((a) => a.user_id === me.id)).length;

  panel.innerHTML = `
    <div class="card pad panel">
      <div class="panel-head">
        <div>
          <div class="panel-weekday">${n} days selected</div>
          <div class="panel-date">${firstS} – ${lastS}</div>
        </div>
        <button class="btn ghost sm" id="bulk-clear" type="button">Clear</button>
      </div>
      <div class="entry-form">
        <div class="kind-select">
          <button type="button" class="kind-opt active" data-kind="in">🏢 In</button>
          <button type="button" class="kind-opt" data-kind="vacation">🌴 Vacation</button>
          <button type="button" class="kind-opt" data-kind="sick">🤒 Sick</button>
        </div>
        <div class="hours-wrap">
          <div class="hours-row">
            <div><label>From</label><input type="time" id="h-start" value="09:00"></div>
            <div><label>To</label><input type="time" id="h-end" value="17:00"></div>
          </div>
          <div class="presets">
            <button type="button" class="chip-btn" data-preset="09:00|17:00">9–5</button>
            <button type="button" class="chip-btn" data-preset="08:00|16:00">8–4</button>
            <button type="button" class="chip-btn" data-preset="00:00|23:59">All day</button>
          </div>
          <p class="muted-mini" style="margin:8px 0 0;">Applied to all ${n} selected days.</p>
        </div>
        <div id="h-msg" class="msg"></div>
        <div class="form-actions">
          <button class="btn primary" type="button" id="bulk-save">Save ${n} days</button>
        </div>
        ${mineCount ? `<button class="btn ghost full" type="button" id="bulk-remove" style="margin-top:8px;">Remove me from ${mineCount} of these</button>` : ''}
      </div>
    </div>`;

  panel.querySelectorAll('.kind-opt').forEach((b) => {
    b.onclick = () => {
      panel.querySelectorAll('.kind-opt').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      const hw = panel.querySelector('.hours-wrap');
      if (hw) hw.style.display = b.dataset.kind === 'in' ? '' : 'none';
    };
  });
  panel.querySelectorAll('.chip-btn').forEach((b) => {
    b.onclick = () => {
      const [s, e] = b.dataset.preset.split('|');
      panel.querySelector('#h-start').value = s;
      panel.querySelector('#h-end').value = e;
    };
  });
  panel.querySelector('#bulk-clear').onclick = () => clearSelection();
  panel.querySelector('#bulk-save').onclick = () => {
    const kind = panel.querySelector('.kind-opt.active').dataset.kind;
    const msg = panel.querySelector('#h-msg');
    if (kind === 'in') {
      const s = panel.querySelector('#h-start').value;
      const e = panel.querySelector('#h-end').value;
      if (!s || !e) { msg.textContent = 'Please choose both a start and end time.'; msg.className = 'msg show error'; return; }
      if (s === e) { msg.textContent = "Start and end times can't be the same."; msg.className = 'msg show error'; return; }
      bulkSave(kind, s, e);
    } else {
      bulkSave(kind, null, null);
    }
  };
  const rm = panel.querySelector('#bulk-remove');
  if (rm) rm.onclick = () => bulkRemove();
}

function clearSelection() {
  const first = sched.selection[0];
  sched.selection = [];
  if (first) sched.selectedDay = first;
  renderCalendar();
  renderPanel();
}

async function bulkSave(kind, start, end) {
  const days = sched.selection.slice();
  if (!days.length) return;
  const rows = days.map((iso) => ({
    day: iso,
    user_id: me.id,
    display_name: me.full_name || me.email,
    avatar_url: me.avatar_url || null,
    kind,
    start_time: kind === 'in' ? start : null,
    end_time: kind === 'in' ? end : null,
  }));
  const daySet = new Set(days);
  const snapshot = sched.rows;
  sched.rows = sched.rows.filter((r) => !(r.user_id === me.id && daySet.has(r.day))).concat(rows);
  sched.selection = [];
  sched.selectedDay = days[0];
  indexRows();
  renderAll();

  const { error } = await supabase.from('office_days').upsert(rows, { onConflict: 'user_id,day' });
  if (error) {
    sched.rows = snapshot;
    indexRows();
    renderAll();
    alert(error.message);
    return;
  }
  toast(`Scheduled ${days.length} day${days.length === 1 ? '' : 's'}`);
}

async function bulkRemove() {
  const days = sched.selection.slice();
  const daySet = new Set(days);
  const removed = sched.rows.filter((r) => r.user_id === me.id && daySet.has(r.day));
  if (!removed.length) return;
  const snapshot = sched.rows;
  sched.rows = sched.rows.filter((r) => !(r.user_id === me.id && daySet.has(r.day)));
  sched.selection = [];
  sched.selectedDay = days[0];
  indexRows();
  renderAll();

  const { error } = await supabase.from('office_days').delete().eq('user_id', me.id).in('day', days);
  if (error) {
    sched.rows = snapshot;
    indexRows();
    renderAll();
    alert(error.message);
    return;
  }
  toast(`Removed you from ${removed.length} day${removed.length === 1 ? '' : 's'}`);
}

async function saveEntry(iso, kind, start, end) {
  panelEditing = false;
  const wasMine = (sched.byDay.get(iso) || []).some((a) => a.user_id === me.id);
  const row = {
    day: iso,
    user_id: me.id,
    display_name: me.full_name || me.email,
    avatar_url: me.avatar_url || null,
    kind,
    start_time: kind === 'in' ? start : null,
    end_time: kind === 'in' ? end : null,
  };
  const snapshot = sched.rows;
  sched.rows = wasMine
    ? sched.rows.map((r) => (r.day === iso && r.user_id === me.id) ? { ...r, ...row } : r)
    : sched.rows.concat([row]);
  indexRows();
  renderAll();

  const payload = { kind, start_time: row.start_time, end_time: row.end_time, display_name: row.display_name, avatar_url: row.avatar_url };
  let error;
  if (wasMine) {
    ({ error } = await supabase.from('office_days').update(payload).eq('user_id', me.id).eq('day', iso));
  } else {
    ({ error } = await supabase.from('office_days').insert(row));
    if (error && error.code === '23505') {
      ({ error } = await supabase.from('office_days').update(payload).eq('user_id', me.id).eq('day', iso));
    }
  }
  if (error) {
    sched.rows = snapshot;
    indexRows();
    renderAll();
    alert(error.message);
  }
}

async function removeMe(iso) {
  const prev = (sched.byDay.get(iso) || []).find((a) => a.user_id === me.id);
  sched.rows = sched.rows.filter((r) => !(r.day === iso && r.user_id === me.id));
  indexRows();
  renderAll();

  const { error } = await supabase.from('office_days').delete().eq('user_id', me.id).eq('day', iso);
  if (error && prev) {
    sched.rows = sched.rows.concat([prev]);
    indexRows();
    renderAll();
    alert(error.message);
  }
}

// ===========================================================================
// Team view (admin) — list + individual user detail
// ===========================================================================
function viewTeam(view) {
  if (ui.teamUser) { viewTeamDetail(view, ui.teamUser); return; }
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Team</h1>
        <p class="subtitle" style="margin:2px 0 0;">Review access requests, open a profile for details, and manage employees.</p>
      </div>
    </div>
    <div id="admin-msg" class="msg"></div>
    <div class="section" style="margin-top:18px;">
      <div class="section-head"><h2 style="margin:0">Pending approvals <span id="pending-count" class="count-pill"></span></h2></div>
      <div class="card pad"><div id="pending"><div class="spinner">Loading…</div></div></div>
    </div>
    <div class="section">
      <div class="section-head"><h2 style="margin:0">All employees</h2></div>
      <div class="card pad" style="overflow-x:auto">
        <table>
          <thead><tr><th>Name</th><th class="hide-sm">Email</th><th>Role</th><th>Status</th><th class="hide-sm">Joined</th><th>Actions</th></tr></thead>
          <tbody id="users-body"><tr><td colspan="6" class="spinner">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>`;
  loadUsers();
}

function refreshTeam() {
  const v = document.getElementById('view');
  if (!v || ui.view !== 'team') return;
  if (ui.teamUser) viewTeamDetail(v, ui.teamUser);
  else loadUsers();
}

function adminFlash(text, type = 'success') {
  const m = document.getElementById('admin-msg');
  if (!m) { toast(text); return; }
  m.textContent = text;
  m.className = `msg show ${type}`;
  setTimeout(() => { m.className = 'msg'; }, 3500);
}

async function loadUsers() {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, status, created_at, avatar_url')
    .order('created_at', { ascending: false });

  const pendingEl = document.getElementById('pending');
  const usersBody = document.getElementById('users-body');
  if (!pendingEl || !usersBody) return;
  if (error) {
    pendingEl.innerHTML = `<div class="empty">Couldn't load users: ${esc(error.message)}</div>`;
    usersBody.innerHTML = `<tr><td colspan="6" class="empty">${esc(error.message)}</td></tr>`;
    return;
  }

  const pending = users.filter((u) => u.status === 'pending');
  updateBell(pending.length);
  document.getElementById('pending-count').textContent = pending.length ? `(${pending.length})` : '';
  pendingEl.innerHTML = pending.length
    ? pending.map((u) => `
        <div class="pending-row">
          <button class="row-user" type="button" data-view-user="${esc(u.id)}">
            ${avatarHTML(u.full_name || u.email, false, '', u.avatar_url)}
            <div style="text-align:left">
              <div style="font-weight:600">${esc(u.full_name) || '(no name)'}</div>
              <div class="who">${esc(u.email)} · requested ${fmtDate(u.created_at)}</div>
            </div>
          </button>
          <div class="actions">
            <button class="btn green sm" data-act="approve" data-id="${esc(u.id)}">Approve</button>
            <button class="btn danger sm" data-act="deny" data-id="${esc(u.id)}">Deny</button>
          </div>
        </div>`).join('')
    : '<div class="empty">No pending requests. You\'re all caught up. 🎉</div>';

  usersBody.innerHTML = users.map((u) => {
    const isSelf = u.id === me.id;
    const roleToggle = u.role === 'admin'
      ? `<button class="btn ghost sm" data-act="make-employee" data-id="${esc(u.id)}" ${isSelf ? 'disabled' : ''}>Make employee</button>`
      : `<button class="btn ghost sm" data-act="make-admin" data-id="${esc(u.id)}">Make admin</button>`;
    const statusActions = u.status === 'approved'
      ? (isSelf ? '' : `<button class="btn danger sm" data-act="deny" data-id="${esc(u.id)}">Revoke</button>`)
      : `<button class="btn green sm" data-act="approve" data-id="${esc(u.id)}">Approve</button>` +
        (u.status === 'pending' ? `<button class="btn danger sm" data-act="deny" data-id="${esc(u.id)}">Deny</button>` : '');
    return `
      <tr>
        <td><button class="row-user" type="button" data-view-user="${esc(u.id)}">${avatarHTML(u.full_name || u.email, isSelf, '', u.avatar_url)}<span>${esc(u.full_name) || '(no name)'}${isSelf ? ' <span class="who">(you)</span>' : ''}</span></button></td>
        <td class="hide-sm">${esc(u.email)}</td>
        <td><span class="badge ${esc(u.role)}">${esc(u.role)}</span></td>
        <td><span class="badge ${esc(u.status)}">${esc(u.status)}</span></td>
        <td class="hide-sm">${fmtDate(u.created_at)}</td>
        <td><div class="actions"><button class="btn ghost sm" data-view-user="${esc(u.id)}">Details</button>${statusActions}${roleToggle}</div></td>
      </tr>`;
  }).join('');

  app.querySelectorAll('[data-view-user]').forEach((b) => {
    b.onclick = () => { ui.teamUser = b.dataset.viewUser; setView('team'); };
  });
}

// ---- Individual user detail (analytics + editable schedule + photo) ----
async function viewTeamDetail(view, uid) {
  view.innerHTML = `
    <button class="link-btn" id="td-back" type="button">‹ Back to team</button>
    <div class="spinner">Loading…</div>`;
  view.querySelector('#td-back').onclick = () => { ui.teamUser = null; setView('team'); };

  let profile, days, revs;
  try {
    const [pRes, dRes, rRes] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, role, status, created_at, avatar_url').eq('id', uid).maybeSingle(),
      supabase.from('office_days').select('day, start_time, end_time, kind').eq('user_id', uid).order('day', { ascending: true }),
      supabase.from('weekly_reviews').select('week_start, rating, note').eq('user_id', uid).order('week_start', { ascending: false }),
    ]);
    if (pRes.error) throw pRes.error;
    if (dRes.error) throw dRes.error;
    if (rRes.error) throw rRes.error;
    profile = pRes.data;
    days = dRes.data || [];
    revs = rRes.data || [];
  } catch (e) {
    view.innerHTML = `
      <button class="link-btn" id="td-back2" type="button">‹ Back to team</button>
      <div class="card pad"><div class="empty">Couldn't load this user: ${esc(e.message)}</div></div>`;
    view.querySelector('#td-back2').onclick = () => { ui.teamUser = null; setView('team'); };
    return;
  }
  if (!profile) {
    view.innerHTML = `
      <button class="link-btn" id="td-back3" type="button">‹ Back to team</button>
      <div class="card pad"><div class="empty">User not found.</div></div>`;
    view.querySelector('#td-back3').onclick = () => { ui.teamUser = null; setView('team'); };
    return;
  }
  renderTeamDetail(view, profile, days, revs);
}

function renderTeamDetail(view, p, days, revs) {
  const isSelf = p.id === me.id;
  const inRows = days.filter((r) => kindOf(r) === 'in');
  const ws = weekStartISO();
  const we = addDaysISO(ws, 6);
  const ty = new Date().getFullYear(), tm = new Date().getMonth();
  const inWeek = inRows.filter((r) => r.day >= ws && r.day <= we);
  const inMonth = inRows.filter((r) => { const [y, m] = r.day.split('-').map(Number); return y === ty && m - 1 === tm; });
  const hoursMonth = inMonth.reduce((s, r) => s + entryHours(r), 0);
  const hoursAll = inRows.reduce((s, r) => s + entryHours(r), 0);

  let avgDays = 0, avgHours = 0, weeks = 0;
  if (inRows.length) {
    const first = inRows[0].day, last = inRows[inRows.length - 1].day;
    const spanEnd = last > TODAY ? last : TODAY;
    weeks = diffWeeks(first, spanEnd);
    avgDays = inRows.length / weeks;
    avgHours = hoursAll / weeks;
  }

  const roleToggle = p.role === 'admin'
    ? `<button class="btn ghost sm" data-act="make-employee" data-id="${esc(p.id)}"${isSelf ? ' disabled' : ''}>Make employee</button>`
    : `<button class="btn ghost sm" data-act="make-admin" data-id="${esc(p.id)}">Make admin</button>`;
  const statusActions = p.status === 'approved'
    ? (isSelf ? '' : `<button class="btn danger sm" data-act="deny" data-id="${esc(p.id)}">Revoke access</button>`)
    : `<button class="btn green sm" data-act="approve" data-id="${esc(p.id)}">Approve</button>` +
      (p.status === 'pending' ? `<button class="btn danger sm" data-act="deny" data-id="${esc(p.id)}">Deny</button>` : '');

  const metric = (label, value, sub) =>
    `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub"><span class="muted-mini">${sub}</span></div></div>`;

  const sorted = days.slice().sort((a, b) => b.day.localeCompare(a.day));
  const scheduleHTML = sorted.length
    ? sorted.map((r) => {
        const d = new Date(`${r.day}T00:00:00`);
        const k = kindOf(r);
        const when = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        const detail = k === 'in'
          ? (r.start_time ? `${fmtRangePlain(r.start_time, r.end_time)} · ${fmtHours(entryHours(r))}` : 'no hours set')
          : KIND_LABEL[k];
        return `
          <div class="sched-row${r.day < TODAY ? ' past' : ''}">
            <div class="sched-when">
              <span class="pill ${k}">${k === 'in' ? 'IN' : k === 'vacation' ? 'VAC' : 'SICK'}</span>
              <div><div class="sched-date">${when}</div><div class="muted-mini">${esc(detail)}</div></div>
            </div>
            <div class="actions">
              <button class="btn ghost sm" data-edit-day="${esc(r.day)}">Edit</button>
              <button class="btn danger sm" data-del-day="${esc(r.day)}">Remove</button>
            </div>
          </div>`;
      }).join('')
    : '<div class="empty">No scheduled days yet.</div>';

  const curWs = weekStartISO();
  const reviewedThisWeek = revs.some((r) => r.week_start === curWs);
  const reviewsHTML = revs.length
    ? revs.map((r) => `
        <div class="sched-row">
          <div class="sched-when">
            <span class="rating-badge ${ratingTier(r.rating)}">${r.rating}</span>
            <div>
              <div class="sched-date">${esc(relWeekLabel(r.week_start))} <span class="muted-mini">· ${new Date(`${r.week_start}T00:00:00`).getFullYear()}</span></div>
              <div class="muted-mini rv-note-line">${r.note ? esc(r.note) : 'No note'}</div>
            </div>
          </div>
          <div class="actions"><button class="btn ghost sm" data-review-week="${esc(r.week_start)}">Edit</button></div>
        </div>`).join('')
    : '<div class="empty">No reviews yet.</div>';

  view.innerHTML = `
    <button class="link-btn" id="td-back" type="button">‹ Back to team</button>
    <div class="card pad detail-head">
      <div class="dh-avatar">
        ${avatarHTML(p.full_name || p.email, isSelf, 'xl', p.avatar_url)}
        <button class="dh-upload" id="td-photo" type="button" title="Upload photo">${icon('camera', 'ic sm')}</button>
      </div>
      <div class="dh-info">
        <h1>${esc(p.full_name) || '(no name)'} ${isSelf ? '<span class="who">(you)</span>' : ''}</h1>
        <div class="dh-meta">${esc(p.email)} · joined ${fmtDate((p.created_at || '').slice(0, 10)) || '—'}</div>
        <div class="dh-badges"><span class="badge ${esc(p.role)}">${esc(p.role)}</span><span class="badge ${esc(p.status)}">${esc(p.status)}</span></div>
      </div>
      <div class="dh-actions">${statusActions}${roleToggle}</div>
    </div>

    <div class="section">
      <div class="section-head"><h2 style="margin:0">Attendance</h2></div>
      <div class="stats metric-grid">
        ${metric('Days this week', inWeek.length, 'in office')}
        ${metric('Days this month', inMonth.length, `${fmtHours(hoursMonth)} total`)}
        ${metric('Days all time', inRows.length, `${fmtHours(hoursAll)} total`)}
        ${metric('Avg days / week', avgDays ? avgDays.toFixed(1) : '0', weeks ? `over ${weeks} week${weeks === 1 ? '' : 's'}` : 'no data yet')}
        ${metric('Avg hours / week', avgHours ? fmtHours(avgHours) : '0h', weeks ? `over ${weeks} week${weeks === 1 ? '' : 's'}` : 'no data yet')}
        ${metric('Hours this month', fmtHours(hoursMonth), `across ${inMonth.length} day${inMonth.length === 1 ? '' : 's'}`)}
        ${metric('Hours all time', fmtHours(hoursAll), `across ${inRows.length} day${inRows.length === 1 ? '' : 's'}`)}
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2 style="margin:0">Weekly reviews</h2>
        <button class="btn primary sm" id="td-review" type="button">${reviewedThisWeek ? "Edit this week's" : 'Review this week'}</button>
      </div>
      <div class="card pad"><div class="sched-list">${reviewsHTML}</div></div>
    </div>

    <div class="section">
      <div class="section-head"><h2 style="margin:0">Scheduled days</h2><button class="btn primary sm" id="td-add" type="button">+ Add day</button></div>
      <div class="card pad"><div class="sched-list">${scheduleHTML}</div></div>
    </div>`;

  view.querySelector('#td-back').onclick = () => { ui.teamUser = null; setView('team'); };
  view.querySelector('#td-photo').onclick = () => changeAvatar(p.id, () => refreshTeam());
  view.querySelector('#td-review').onclick = () =>
    openReviewModal(p, curWs, revs.find((r) => r.week_start === curWs) || null, () => refreshTeam());
  view.querySelectorAll('[data-review-week]').forEach((b) => {
    b.onclick = () => openReviewModal(p, b.dataset.reviewWeek, revs.find((r) => r.week_start === b.dataset.reviewWeek) || null, () => refreshTeam());
  });
  view.querySelector('#td-add').onclick = () => openAdminEntryModal(p, null);
  view.querySelectorAll('[data-edit-day]').forEach((b) => {
    b.onclick = () => openAdminEntryModal(p, days.find((r) => r.day === b.dataset.editDay) || null);
  });
  view.querySelectorAll('[data-del-day]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      const { error } = await supabase.from('office_days').delete().eq('user_id', p.id).eq('day', b.dataset.delDay);
      if (error) { toast(error.message); b.disabled = false; return; }
      toast('Day removed');
      refreshTeam();
    };
  });
}

// Admin: add or edit a specific user's office day (date + kind + hours).
function openAdminEntryModal(profile, row) {
  const editing = !!(row && row.kind);
  const dayVal = row && row.day ? row.day : TODAY;
  const kind = editing ? kindOf(row) : 'in';
  const s = row && row.start_time ? hhmm(row.start_time) : '09:00';
  const e = row && row.end_time ? hhmm(row.end_time) : '17:00';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card pad">
      <h2 style="margin-bottom:4px;">${editing ? 'Edit day' : 'Add a day'}</h2>
      <p class="subtitle" style="margin-bottom:16px;">For ${esc(profile.full_name || profile.email)}.</p>
      <label>Date</label>
      <input type="date" id="ae-date" value="${dayVal}"${editing ? ' disabled' : ''} />
      <div class="kind-select" style="margin-top:14px;">
        <button type="button" class="kind-opt${kind === 'in' ? ' active' : ''}" data-kind="in">🏢 In</button>
        <button type="button" class="kind-opt${kind === 'vacation' ? ' active' : ''}" data-kind="vacation">🌴 Vacation</button>
        <button type="button" class="kind-opt${kind === 'sick' ? ' active' : ''}" data-kind="sick">🤒 Sick</button>
      </div>
      <div class="hours-wrap"${kind === 'in' ? '' : ' style="display:none"'}>
        <div class="hours-row">
          <div><label>From</label><input type="time" id="ae-start" value="${s}"></div>
          <div><label>To</label><input type="time" id="ae-end" value="${e}"></div>
        </div>
        <div class="presets">
          <button type="button" class="chip-btn" data-preset="09:00|17:00">9–5</button>
          <button type="button" class="chip-btn" data-preset="08:00|16:00">8–4</button>
          <button type="button" class="chip-btn" data-preset="00:00|23:59">All day</button>
        </div>
      </div>
      <div id="ae-msg" class="msg"></div>
      <div class="modal-foot">
        ${editing ? '<button class="btn danger" id="ae-remove" type="button" style="margin-right:auto;">Remove</button>' : ''}
        <button class="btn ghost" id="ae-cancel" type="button">Cancel</button>
        <button class="btn primary" id="ae-save" type="button">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  const msg = overlay.querySelector('#ae-msg');
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
  overlay.querySelector('#ae-cancel').onclick = close;

  overlay.querySelectorAll('.kind-opt').forEach((b) => {
    b.onclick = () => {
      overlay.querySelectorAll('.kind-opt').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      overlay.querySelector('.hours-wrap').style.display = b.dataset.kind === 'in' ? '' : 'none';
    };
  });
  overlay.querySelectorAll('.chip-btn').forEach((b) => {
    b.onclick = () => {
      const [a, c] = b.dataset.preset.split('|');
      overlay.querySelector('#ae-start').value = a;
      overlay.querySelector('#ae-end').value = c;
    };
  });

  const rm = overlay.querySelector('#ae-remove');
  if (rm) rm.onclick = async () => {
    rm.disabled = true;
    const { error } = await supabase.from('office_days').delete().eq('user_id', profile.id).eq('day', dayVal);
    if (error) { msg.textContent = error.message; msg.className = 'msg show error'; rm.disabled = false; return; }
    close(); toast('Day removed'); refreshTeam();
  };

  overlay.querySelector('#ae-save').onclick = async () => {
    const day = overlay.querySelector('#ae-date').value;
    if (!day) { msg.textContent = 'Please choose a date.'; msg.className = 'msg show error'; return; }
    const k = overlay.querySelector('.kind-opt.active').dataset.kind;
    let st = null, en = null;
    if (k === 'in') {
      st = overlay.querySelector('#ae-start').value;
      en = overlay.querySelector('#ae-end').value;
      if (!st || !en) { msg.textContent = 'Please choose both a start and end time.'; msg.className = 'msg show error'; return; }
      if (st === en) { msg.textContent = "Start and end times can't be the same."; msg.className = 'msg show error'; return; }
    }
    const payload = {
      user_id: profile.id, day,
      display_name: profile.full_name || profile.email,
      avatar_url: profile.avatar_url || null,
      kind: k, start_time: st, end_time: en,
    };
    const saveBtn = overlay.querySelector('#ae-save');
    saveBtn.disabled = true;
    const { error } = await supabase.from('office_days').upsert(payload, { onConflict: 'user_id,day' });
    if (error) { msg.textContent = error.message; msg.className = 'msg show error'; saveBtn.disabled = false; return; }
    close(); toast('Saved'); refreshTeam();
  };
}

// ===========================================================================
// Weekly reviews (admin) — rate each employee 1–10 + a note, once per week
// ===========================================================================
function viewReviews(view) {
  reviews.weekStart = weekStartISO(); // always open on the current week
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Weekly reviews</h1>
        <p class="subtitle" style="margin:2px 0 0;">Rate each employee 1–10 and leave a note — once a week, any time during the week.</p>
      </div>
    </div>
    <div class="cal-toolbar">
      <div class="cal-month-title" id="rv-title"></div>
      <div class="cal-nav">
        <button class="btn ghost sm" id="rv-prev" type="button" aria-label="Previous week">‹</button>
        <button class="btn ghost sm" id="rv-this" type="button">This week</button>
        <button class="btn ghost sm" id="rv-next" type="button" aria-label="Next week">›</button>
      </div>
    </div>
    <div id="rv-stats" class="rv-stats"></div>
    <div class="card pad"><div id="rv-list"><div class="spinner">Loading…</div></div></div>`;

  view.querySelector('#rv-prev').onclick = () => { reviews.weekStart = addDaysISO(reviews.weekStart, -7); loadReviews(); };
  view.querySelector('#rv-next').onclick = () => {
    if (reviews.weekStart >= weekStartISO()) return; // can't review a future week
    reviews.weekStart = addDaysISO(reviews.weekStart, 7); loadReviews();
  };
  view.querySelector('#rv-this').onclick = () => { reviews.weekStart = weekStartISO(); loadReviews(); };
  loadReviews();
}

async function loadReviews() {
  const ws = reviews.weekStart;
  const title = document.getElementById('rv-title');
  if (title) {
    const rel = relWeekLabel(ws);
    title.textContent = rel === fmtWeekRange(ws) ? weekTitle(ws) : `${rel} · ${fmtWeekRange(ws)}`;
  }
  const nextBtn = document.getElementById('rv-next');
  if (nextBtn) nextBtn.disabled = ws >= weekStartISO();

  const listEl = document.getElementById('rv-list');
  const [uRes, rRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, avatar_url').eq('status', 'approved').order('full_name', { ascending: true }),
    supabase.from('weekly_reviews').select('user_id, rating, note').eq('week_start', ws),
  ]);
  if (uRes.error || rRes.error) {
    if (listEl) listEl.innerHTML = `<div class="empty">Couldn't load reviews: ${esc((uRes.error || rRes.error).message)}</div>`;
    return;
  }
  const employees = uRes.data || [];
  const rows = rRes.data || [];
  const byUser = new Map(rows.map((r) => [r.user_id, r]));
  const reviewed = rows.length;
  const total = employees.length;
  const avg = reviewed ? rows.reduce((s, r) => s + r.rating, 0) / reviewed : 0;

  const statsEl = document.getElementById('rv-stats');
  if (statsEl) statsEl.innerHTML =
    statCard('Reviewed', `${reviewed}/${total}`, '<span class="muted-mini">employees</span>') +
    statCard('Average rating', reviewed ? avg.toFixed(1) : '—', '<span class="muted-mini">out of 10</span>') +
    statCard('Still to review', total - reviewed, `<span class="muted-mini">${total - reviewed === 0 ? 'all done 🎉' : 'remaining'}</span>`);

  if (!listEl) return;
  if (!total) { listEl.innerHTML = '<div class="empty">No approved employees to review yet.</div>'; return; }

  listEl.innerHTML = employees.map((u) => {
    const r = byUser.get(u.id);
    const meFlag = u.id === me.id;
    const status = r
      ? (r.note ? esc(r.note) : '<span class="muted-mini">No note</span>')
      : '<span class="muted-mini">Not reviewed yet</span>';
    return `
      <div class="rv-row">
        <div class="rv-person">
          ${avatarHTML(u.full_name || u.email, meFlag, '', u.avatar_url)}
          <div class="rv-person-text">
            <div class="rv-name">${esc(u.full_name || u.email)}${meFlag ? ' <span class="muted-mini">(you)</span>' : ''}</div>
            <div class="rv-note">${status}</div>
          </div>
        </div>
        <div class="rv-action">
          ${r ? `<span class="rating-badge ${ratingTier(r.rating)}">${r.rating}</span>` : ''}
          <button class="btn ${r ? 'ghost' : 'primary'} sm" type="button" data-review="${esc(u.id)}">${r ? 'Edit' : 'Review'}</button>
        </div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('[data-review]').forEach((b) => {
    b.onclick = () => {
      const u = employees.find((e) => e.id === b.dataset.review);
      openReviewModal(u, ws, byUser.get(u.id) || null, loadReviews);
    };
  });
}

// Rate 1–10 + note for one employee for one week. onSaved() runs after save/delete.
function openReviewModal(profile, ws, existing, onSaved) {
  let rating = existing ? existing.rating : 0;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card pad">
      <h2 style="margin-bottom:4px;">Weekly review</h2>
      <p class="subtitle" style="margin-bottom:16px;">${esc(profile.full_name || profile.email)} · ${weekTitle(ws)}</p>
      <label>Performance rating</label>
      <div class="rating-scale" id="rv-scale">
        ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) =>
          `<button type="button" class="rate-btn${n === rating ? ` active ${ratingTier(n)}` : ''}" data-n="${n}">${n}</button>`).join('')}
      </div>
      <div class="rating-hint"><span>1 · Needs work</span><span>Excellent · 10</span></div>
      <label style="margin-top:14px;">Note</label>
      <textarea id="rv-note" rows="4" maxlength="2000" placeholder="What went well, what to improve…">${esc(existing ? existing.note : '')}</textarea>
      <div id="rv-msg" class="msg"></div>
      <div class="modal-foot">
        ${existing ? '<button class="btn danger" id="rv-remove" type="button" style="margin-right:auto;">Delete</button>' : ''}
        <button class="btn ghost" id="rv-cancel" type="button">Cancel</button>
        <button class="btn primary" id="rv-save" type="button">Save review</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  const msg = overlay.querySelector('#rv-msg');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#rv-cancel').onclick = close;

  overlay.querySelectorAll('.rate-btn').forEach((b) => {
    b.onclick = () => {
      rating = Number(b.dataset.n);
      overlay.querySelectorAll('.rate-btn').forEach((x) => { x.className = 'rate-btn'; });
      b.className = `rate-btn active ${ratingTier(rating)}`;
    };
  });

  const rm = overlay.querySelector('#rv-remove');
  if (rm) rm.onclick = async () => {
    rm.disabled = true;
    const { error } = await supabase.from('weekly_reviews').delete().eq('user_id', profile.id).eq('week_start', ws);
    if (error) { msg.textContent = error.message; msg.className = 'msg show error'; rm.disabled = false; return; }
    close(); toast('Review deleted'); if (onSaved) onSaved();
  };

  overlay.querySelector('#rv-save').onclick = async () => {
    if (!rating) { msg.textContent = 'Please pick a rating from 1 to 10.'; msg.className = 'msg show error'; return; }
    const note = overlay.querySelector('#rv-note').value.trim();
    const saveBtn = overlay.querySelector('#rv-save');
    saveBtn.disabled = true;
    const payload = {
      user_id: profile.id, week_start: ws, rating, note,
      reviewer_id: me.id, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('weekly_reviews').upsert(payload, { onConflict: 'user_id,week_start' });
    if (error) { msg.textContent = error.message; msg.className = 'msg show error'; saveBtn.disabled = false; return; }
    close(); toast('Review saved'); if (onSaved) onSaved();
  };
}

// ===========================================================================
// Tasks — admins assign work; everyone has a Tasks tab for their own
// ===========================================================================
const taskState = { items: [] };
const TASK_GROUPS = [['todo', 'To do'], ['in_progress', 'In progress'], ['done', 'Done']];
const PRIORITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High' };

async function refreshTaskBadge() {
  const badge = document.getElementById('nav-tasks');
  if (!badge) return;
  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assignee_id', me.id)
    .neq('status', 'done');
  if (error || !count) { badge.style.display = 'none'; return; }
  badge.textContent = count;
  badge.style.display = '';
}

function viewTasks(view) {
  const isAdmin = me.role === 'admin';
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${isAdmin ? 'Tasks' : 'Your tasks'}</h1>
        <p class="subtitle" style="margin:2px 0 0;">${isAdmin
          ? 'Assign work to the team and track how it’s going.'
          : 'Work assigned to you. Update the status as you go.'}</p>
      </div>
      ${isAdmin ? '<button class="btn primary" id="task-assign" type="button">+ Assign task</button>' : ''}
    </div>
    <div id="task-list"><div class="spinner">Loading…</div></div>`;
  if (isAdmin) document.getElementById('task-assign').onclick = () => openTaskModal(null);
  loadTasks();
}

async function loadTasks() {
  const listEl = document.getElementById('task-list');
  let q = supabase
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (me.role !== 'admin') q = q.eq('assignee_id', me.id);
  const { data, error } = await q;
  if (error) {
    if (listEl) listEl.innerHTML = `<div class="empty">Couldn't load tasks: ${esc(error.message)}</div>`;
    return;
  }
  taskState.items = data || [];
  renderTaskList();
  refreshTaskBadge();
}

function taskCardHTML(t, isAdmin) {
  const overdue = t.due_date && t.due_date < TODAY && t.status !== 'done';
  const opt = (v, label) => `<option value="${v}"${t.status === v ? ' selected' : ''}>${label}</option>`;
  const meta = isAdmin
    ? `<div class="task-who">${avatarHTML(t.assignee_name || '?', t.assignee_id === me.id, 'sm', t.assignee_avatar)}<span>${esc(t.assignee_name || 'Someone')}</span></div>`
    : `<span class="muted-mini">Assigned by ${esc(t.assigned_by_name || 'your admin')}</span>`;
  return `
    <div class="task-card${t.status === 'done' ? ' done' : ''}">
      <div class="task-main">
        <div class="task-top">
          <span class="prio ${t.priority}">${PRIORITY_LABEL[t.priority] || 'Normal'}</span>
          ${t.due_date ? `<span class="task-due${overdue ? ' overdue' : ''}">Due ${fmtDate(t.due_date)}</span>` : ''}
        </div>
        <div class="task-title">${esc(t.title)}</div>
        ${t.description ? `<div class="task-desc">${esc(t.description)}</div>` : ''}
        <div class="task-meta">${meta}</div>
      </div>
      <div class="task-actions">
        <select class="task-status" data-id="${esc(t.id)}" aria-label="Status">
          ${opt('todo', 'To do')}${opt('in_progress', 'In progress')}${opt('done', 'Done')}
        </select>
        ${isAdmin ? `<div class="task-admin-btns">
          <button class="btn ghost sm" data-task-edit="${esc(t.id)}" type="button">Edit</button>
          <button class="btn danger sm" data-task-del="${esc(t.id)}" type="button">Delete</button>
        </div>` : ''}
      </div>
    </div>`;
}

function renderTaskList() {
  const el = document.getElementById('task-list');
  if (!el) return;
  const isAdmin = me.role === 'admin';
  if (!taskState.items.length) {
    el.innerHTML = `<div class="card pad"><div class="empty" style="padding:8px 2px">${isAdmin
      ? 'No tasks yet. Use “Assign task” to create one.'
      : 'Nothing assigned to you right now. 🎉'}</div></div>`;
    return;
  }
  el.innerHTML = TASK_GROUPS.map(([key, label]) => {
    const items = taskState.items.filter((t) => t.status === key);
    if (!items.length) return '';
    return `<div class="task-group">
      <div class="task-group-head">${label} <span class="count-pill">${items.length}</span></div>
      <div class="card pad task-cards">${items.map((t) => taskCardHTML(t, isAdmin)).join('')}</div>
    </div>`;
  }).join('');

  el.querySelectorAll('.task-status').forEach((s) => {
    s.onchange = () => updateTaskStatus(s.dataset.id, s.value);
  });
  el.querySelectorAll('[data-task-edit]').forEach((b) => {
    b.onclick = () => openTaskModal(taskState.items.find((t) => t.id === b.dataset.taskEdit) || null);
  });
  el.querySelectorAll('[data-task-del]').forEach((b) => {
    b.onclick = () => deleteTask(b.dataset.taskDel);
  });
}

async function updateTaskStatus(id, status) {
  const t = taskState.items.find((x) => x.id === id);
  if (!t || t.status === status) return;
  const prev = t.status;
  t.status = status;
  renderTaskList();
  refreshTaskBadge();
  const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
  if (error) {
    t.status = prev;
    renderTaskList();
    refreshTaskBadge();
    toast(error.message);
  }
}

async function deleteTask(id) {
  const t = taskState.items.find((x) => x.id === id);
  if (!t) return;
  if (!window.confirm(`Delete task “${t.title}”?`)) return;
  const snapshot = taskState.items;
  taskState.items = taskState.items.filter((x) => x.id !== id);
  renderTaskList();
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) {
    taskState.items = snapshot;
    renderTaskList();
    toast(error.message);
    return;
  }
  toast('Task deleted');
}

// Admin: create or edit a task.
async function openTaskModal(existing) {
  const { data: emps, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .eq('status', 'approved')
    .order('full_name', { ascending: true });
  if (error) { toast(error.message); return; }
  if (!emps || !emps.length) { toast('No approved employees to assign to yet.'); return; }

  const prio = existing ? existing.priority : 'normal';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card pad">
      <h2 style="margin-bottom:4px;">${existing ? 'Edit task' : 'Assign a task'}</h2>
      <p class="subtitle" style="margin-bottom:16px;">${existing ? 'Update the details below.' : 'Give someone something to work on.'}</p>
      <label>Assign to</label>
      <select id="t-assignee" class="select">
        ${emps.map((e) => `<option value="${esc(e.id)}"${existing && existing.assignee_id === e.id ? ' selected' : ''}>${esc(e.full_name || e.email)}</option>`).join('')}
      </select>
      <label style="margin-top:12px;">Title</label>
      <input id="t-title" type="text" maxlength="120" value="${esc(existing ? existing.title : '')}" placeholder="e.g. Finish the Q3 report" />
      <label style="margin-top:12px;">Details <span style="opacity:.7">(optional)</span></label>
      <textarea id="t-desc" rows="3" maxlength="2000" placeholder="Any context or steps…">${esc(existing ? existing.description : '')}</textarea>
      <div class="t-row">
        <div><label>Priority</label><select id="t-prio" class="select">
          <option value="low"${prio === 'low' ? ' selected' : ''}>Low</option>
          <option value="normal"${prio === 'normal' ? ' selected' : ''}>Normal</option>
          <option value="high"${prio === 'high' ? ' selected' : ''}>High</option>
        </select></div>
        <div><label>Due date <span style="opacity:.7">(optional)</span></label><input type="date" id="t-due" value="${existing && existing.due_date ? existing.due_date : ''}" /></div>
      </div>
      <div id="t-msg" class="msg"></div>
      <div class="modal-foot">
        ${existing ? '<button class="btn danger" id="t-delete" type="button" style="margin-right:auto;">Delete</button>' : ''}
        <button class="btn ghost" id="t-cancel" type="button">Cancel</button>
        <button class="btn primary" id="t-save" type="button">${existing ? 'Save' : 'Assign task'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  const msg = overlay.querySelector('#t-msg');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#t-cancel').onclick = close;

  const del = overlay.querySelector('#t-delete');
  if (del) del.onclick = () => { close(); deleteTask(existing.id); };

  overlay.querySelector('#t-save').onclick = async () => {
    const title = overlay.querySelector('#t-title').value.trim();
    if (!title) { msg.textContent = 'Please give the task a title.'; msg.className = 'msg show error'; return; }
    const assigneeId = overlay.querySelector('#t-assignee').value;
    const emp = emps.find((e) => e.id === assigneeId);
    const payload = {
      title,
      description: overlay.querySelector('#t-desc').value.trim(),
      assignee_id: assigneeId,
      assignee_name: emp.full_name || emp.email,
      assignee_avatar: emp.avatar_url || null,
      priority: overlay.querySelector('#t-prio').value,
      due_date: overlay.querySelector('#t-due').value || null,
    };
    const saveBtn = overlay.querySelector('#t-save');
    saveBtn.disabled = true;
    let err;
    if (existing) {
      ({ error: err } = await supabase.from('tasks').update(payload).eq('id', existing.id));
    } else {
      payload.assigned_by = me.id;
      payload.assigned_by_name = me.full_name || me.email;
      payload.status = 'todo';
      ({ error: err } = await supabase.from('tasks').insert(payload));
    }
    if (err) { msg.textContent = err.message; msg.className = 'msg show error'; saveBtn.disabled = false; return; }
    close();
    toast(existing ? 'Task updated' : 'Task assigned');
    loadTasks();
  };
}

app.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn || !me) return;
  const { act, id } = btn.dataset;
  if (id === me.id && (act === 'deny' || act === 'make-employee')) {
    adminFlash("You can't change your own admin access.", 'error');
    return;
  }
  btn.disabled = true;
  let error;
  if (act === 'approve') ({ error } = await supabase.from('profiles').update({ status: 'approved' }).eq('id', id));
  else if (act === 'deny') ({ error } = await supabase.from('profiles').update({ status: 'denied' }).eq('id', id));
  else if (act === 'make-admin') ({ error } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', id));
  else if (act === 'make-employee') ({ error } = await supabase.from('profiles').update({ role: 'employee' }).eq('id', id));

  if (error) { adminFlash(error.message, 'error'); btn.disabled = false; return; }
  adminFlash('Updated.');
  refreshTeam();
});
