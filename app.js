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
    check: '<polyline points="20 6 9 17 4 12"/>',
    board: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
    'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    chevron: '<polyline points="6 9 12 15 18 9"/>',
    comment: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
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
// filter   = 'all' | 'mine' (the Everyone/Just me segment; decided per-role on first open)
// assignee = 'all' | a user id   |  label = 'all' | a label key  |  due = see dueMatches()
// checklist/comments/attachments = { [card_id]: [...] }, loaded alongside the cards.
const tasks = { rows: [], filter: null, assignee: 'all', label: 'all', due: 'all', checklist: {}, comments: {}, attachments: {} };
const TASK_STAGES = ['inbound', 'in_progress', 'awaiting_review', 'completed'];
const TASK_LABEL = { inbound: 'Inbound', in_progress: 'In progress', awaiting_review: 'Awaiting review', completed: 'Completed' };
// Preset card labels (admins tag cards with these; they render as colored pills).
const CARD_LABELS = {
  urgent:   { label: 'Urgent',    color: 'var(--accent)' },
  blocked:  { label: 'Blocked',   color: 'var(--amber)' },
  design:   { label: 'Design',    color: 'var(--event)' },
  feature:  { label: 'Feature',   color: 'var(--vac)' },
  research: { label: 'Research',  color: 'var(--info)' },
  quick:    { label: 'Quick win', color: 'var(--green)' },
};
let taskDragId = null; // id of the card being dragged (desktop drag-and-drop)
let attachBusyCard = null; // id of the card whose attachments are mid-upload
const expandedTasks = new Set(); // ids of cards expanded inline on the board
const ATTACH_BUCKET = 'card-attachments';
const ATTACH_MAX = 10;                 // max attachments per card
const ATTACH_MAX_MB = 50;              // max size per file (MB)
const ATTACH_MAX_BYTES = ATTACH_MAX_MB * 1024 * 1024;

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
  await supabase.from('board_cards').update({ assignee_avatar: url }).eq('assignee_id', uid);
  return url;
}

async function removeAvatar(uid) {
  await supabase.storage.from('avatars').remove([`${uid}/avatar`]);
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', uid);
  if (error) throw error;
  await supabase.from('board_cards').update({ assignee_avatar: null }).eq('assignee_id', uid);
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
      await supabase.from('board_cards').update({ assignee_name: name }).eq('assignee_id', me.id);
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
          <button class="nav-item" data-view="board" type="button">${icon('board')}<span class="txt">Board</span></button>
          <button class="nav-item" data-view="outreach" type="button">${icon('target')}<span class="txt">Outreach</span></button>
          ${isAdmin ? `<button class="nav-item" data-view="team" type="button">${icon('team')}<span class="txt">Team</span><span class="nav-badge" id="nav-pending" style="display:none"></span></button>` : ''}
          <button class="nav-item" id="nav-settings" type="button">${icon('gear')}<span class="txt">Settings</span></button>
        </nav>
        ${STRIPES}
      </aside>
      <div class="main">
        <div class="topbar">
          <div class="now" id="now-text" style="margin-right:auto"></div>
          <button class="icon-btn" id="bell" type="button" title="Notifications">${icon('bell')}<span class="bell-badge" id="bell-badge" style="display:none"></span></button>
        </div>
        <div id="view"></div>
      </div>
    </div>`;

  document.querySelectorAll('.nav-item[data-view]').forEach((b) => {
    b.onclick = () => { ui.teamUser = null; setView(b.dataset.view); };
  });
  document.getElementById('nav-settings').onclick = openProfileModal;
  document.getElementById('bell').onclick = () => {
    if (isAdmin) { ui.teamUser = null; setView('team'); }
    else toast("You're all caught up 🎉");
  };

  startClock();
  setView(ui.view || 'dashboard');
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
  if (v === 'team' && me.role !== 'admin') v = 'dashboard';
  if (ui.view === 'outreach' && v !== 'outreach') unsubscribeOutreach(); // leave the live feed
  ui.view = v;
  document.querySelectorAll('.nav-item[data-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === v);
  });
  const view = document.getElementById('view');
  if (!view) return;
  if (v === 'dashboard') viewDashboard(view);
  else if (v === 'board') viewBoard(view);
  else if (v === 'outreach') viewOutreach(view);
  else if (v === 'team') viewTeam(view);
  else viewDashboard(view);
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

// ===========================================================================
// Dashboard view
// ===========================================================================
function viewDashboard(view) {
  const isAdmin = me.role === 'admin';

  view.innerHTML = `
    <div class="dash">
      <div class="dash-main">
        <div class="card hero">
          <div class="hero-text">
            <h1>Welcome, <span class="hl">${esc(firstName(me.full_name || me.email))}</span></h1>
            <p>Work your board, track your outreach, and keep your day on track — all from one place.</p>
            <button class="btn primary" id="hero-cta" type="button">Open the board</button>
          </div>
          ${HERO_ART}
        </div>
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
      </div>
      <aside class="dash-side">
        <div class="card pad board-card" id="board-card">
          <div class="card-head"><h3>Your board</h3><button class="link-btn" id="tc-all" type="button">Open board</button></div>
          <div id="tc-body"><div class="spinner">Loading…</div></div>
        </div>
        ${isAdmin ? `
        <div class="card pad pending-card">
          <div class="card-head"><h3>Pending approvals</h3></div>
          <div id="pend-box"><div class="spinner">Loading…</div></div>
        </div>` : ''}
      </aside>
    </div>`;

  document.getElementById('hero-cta').onclick = () => setView('board');
  document.getElementById('prof-edit').onclick = openProfileModal;
  document.getElementById('prof-avatar').onclick = openProfileModal;
  document.getElementById('tc-all').onclick = () => setView('board');

  loadDashboard();
}

function loadDashboard() {
  loadMyTasksCard();
  if (me.role === 'admin') loadPendingCard();
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

// A small stat tile (shared by the Reviews page and the Board). id => clickable.
function statCard(label, value, sub, id) {
  const open = id ? ` id="stat-${id}" style="cursor:pointer"` : '';
  return `<div class="stat"${open}>
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;
}

// ===========================================================================
// Outreach tracker — a shared, gamified counter. Tap once per person you reach
// out to; everyone sees the leaderboard by day / week / month / all time.
// ===========================================================================
const outreach = { window: 'day', rows: [] };
const OUTREACH_WINDOWS = [['day', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time']];
const outreachWinLabel = (w) => (OUTREACH_WINDOWS.find((x) => x[0] === w) || [null, ''])[1];

function outreachInWindow(r, win) {
  if (win === 'all') return true;
  if (win === 'day') return r.day === TODAY;
  if (win === 'week') return r.day >= weekStartISO() && r.day <= TODAY;
  if (win === 'month') return r.day.slice(0, 7) === TODAY.slice(0, 7);
  return true;
}

// Per-user totals for a window, highest first (only people with a count show).
function outreachBoard(win) {
  const by = new Map();
  for (const r of outreach.rows) {
    if (!outreachInWindow(r, win)) continue;
    const cur = by.get(r.user_id) || { user_id: r.user_id, name: r.display_name || 'Someone', avatar: r.avatar_url, count: 0 };
    cur.count += r.count || 0;
    if (r.display_name) cur.name = r.display_name;
    if (r.avatar_url) cur.avatar = r.avatar_url;
    by.set(r.user_id, cur);
  }
  return [...by.values()].filter((u) => u.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function myOutreach(win) {
  let n = 0;
  for (const r of outreach.rows) if (r.user_id === me.id && outreachInWindow(r, win)) n += r.count || 0;
  return n;
}

// Whole-team total for a window.
function teamTotal(win) {
  let n = 0;
  for (const r of outreach.rows) if (outreachInWindow(r, win)) n += r.count || 0;
  return n;
}

// Live updates: when anyone else's counter changes, fold it in and repaint so
// the leaderboard and team totals move in real time.
let outreachChannel = null;
function subscribeOutreach() {
  if (outreachChannel) return;
  outreachChannel = supabase
    .channel('outreach-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'outreach_counts' }, (payload) => {
      const r = payload.new;
      if (!r || !r.user_id || r.user_id === me.id) return; // my own count is optimistic — ignore echoes
      const i = outreach.rows.findIndex((x) => x.user_id === r.user_id && x.day === r.day);
      if (i >= 0) outreach.rows[i] = { ...outreach.rows[i], ...r };
      else outreach.rows.push(r);
      paintOutreach();
    })
    .subscribe();
}
function unsubscribeOutreach() {
  if (outreachChannel) { supabase.removeChannel(outreachChannel); outreachChannel = null; }
}

function viewOutreach(view) {
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Outreach</h1>
        <p class="subtitle" style="margin:2px 0 0;">Tap once for every person you reach out to. See how the whole team's doing 💥</p>
      </div>
      <div class="th-actions">
        <div class="seg" id="or-window">
          ${OUTREACH_WINDOWS.map(([v, l]) => `<button data-w="${v}" class="${outreach.window === v ? 'active' : ''}" type="button">${l}</button>`).join('')}
        </div>
      </div>
    </div>
    <div id="or-wrap"><div class="spinner">Loading…</div></div>`;
  view.querySelectorAll('#or-window button').forEach((b) => {
    b.onclick = () => {
      outreach.window = b.dataset.w;
      view.querySelectorAll('#or-window button').forEach((x) => x.classList.toggle('active', x === b));
      renderOutreach();
    };
  });
  loadOutreach();
  subscribeOutreach();
}

async function loadOutreach() {
  const { data, error } = await supabase
    .from('outreach_counts')
    .select('user_id, day, count, display_name, avatar_url');
  outreach.rows = error ? [] : (data || []);
  renderOutreach();
}

function renderOutreach() {
  const wrap = document.getElementById('or-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="or-top">
      <button class="or-tap" id="or-tap" type="button" aria-label="Add one — I just reached out to someone">
        <span class="or-plus">+1</span>
        <span class="or-emoji" id="or-emoji"></span>
        <span class="or-count" id="or-count">0</span>
        <span class="or-lbl">reached out<br><span class="muted-mini" id="or-winlbl"></span></span>
      </button>
      <div class="or-tap-foot">
        <button class="btn ghost sm" id="or-undo" type="button">− Undo</button>
      </div>
    </div>
    <div class="card pad or-totals">
      <div class="card-head"><h3>Team outreach</h3><span class="muted-mini">everyone combined</span></div>
      <div class="or-totals-grid">
        ${OUTREACH_WINDOWS.map(([w, l]) => `
          <div class="or-total">
            <span class="or-total-n" id="ot-${w}">0</span>
            <span class="or-total-l">${l}</span>
          </div>`).join('')}
      </div>
    </div>
    <div class="card pad or-board">
      <div class="card-head"><h3>Leaderboard <span class="muted-mini" id="or-boardwin"></span></h3></div>
      <div class="or-list" id="or-list"></div>
    </div>`;
  const tap = wrap.querySelector('#or-tap');
  tap.onclick = () => bumpOutreach(1, tap);
  wrap.querySelector('#or-undo').onclick = () => bumpOutreach(-1, tap);
  paintOutreach();
}

// Update numbers + leaderboard in place (no rebuild of the tap button, so rapid
// tapping stays smooth and keeps animating).
function paintOutreach() {
  const win = outreach.window;
  const label = outreachWinLabel(win);
  const mine = myOutreach(win);
  const board = outreachBoard(win);
  const top = board.length ? board[0].count : 0;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('or-count', mine);
  set('or-winlbl', label.toLowerCase());
  set('or-boardwin', `· ${label}`);
  const emo = document.getElementById('or-emoji');
  if (emo) emo.textContent = mine >= 50 ? '🚀' : mine >= 20 ? '🔥' : mine >= 1 ? '💪' : '👋';
  for (const [w] of OUTREACH_WINDOWS) set(`ot-${w}`, teamTotal(w)); // team scoreboard, all windows
  const undo = document.getElementById('or-undo');
  if (undo) undo.disabled = myOutreach('day') <= 0;
  const list = document.getElementById('or-list');
  if (list) list.innerHTML = board.length
    ? board.map((u, i) => outreachRowHTML(u, i, top)).join('')
    : '<div class="empty" style="padding:12px 2px">No outreach yet — tap the button to get the team started! 👆</div>';
}

function outreachRowHTML(u, i, top) {
  const meFlag = u.user_id === me.id;
  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span class="or-rank">${i + 1}</span>`;
  const pct = top ? Math.round((u.count / top) * 100) : 0;
  return `
    <div class="or-row${meFlag ? ' me' : ''}">
      <span class="or-medal">${medal}</span>
      ${avatarHTML(u.name, meFlag, 'sm', u.avatar)}
      <div class="or-who">
        <span class="or-name">${esc(shortName(u.name))}${meFlag ? ' <span class="muted-mini">(you)</span>' : ''}</span>
        <div class="or-bar"><i style="width:${pct}%"></i></div>
      </div>
      <span class="or-num">${u.count}</span>
    </div>`;
}

// Nudge my own counter for TODAY by ±1. Optimistic + rapid-tap friendly; each
// tap fires its own atomic RPC, so many taps in a row just add up.
async function bumpOutreach(delta, tapEl) {
  delta = delta >= 0 ? 1 : -1;
  let row = outreach.rows.find((r) => r.user_id === me.id && r.day === TODAY);
  if (delta < 0 && (!row || (row.count || 0) <= 0)) return; // nothing to undo
  if (!row) {
    row = { user_id: me.id, day: TODAY, count: 0, display_name: me.full_name || me.email || '', avatar_url: me.avatar_url || null };
    outreach.rows.push(row);
  }
  row.count = Math.max(0, (row.count || 0) + delta);
  if (tapEl && delta > 0) { tapEl.classList.remove('pop'); void tapEl.offsetWidth; tapEl.classList.add('pop'); }
  paintOutreach();
  const { error } = await supabase.rpc('adjust_outreach', { p_day: TODAY, p_delta: delta });
  if (error) {
    const r2 = outreach.rows.find((r) => r.user_id === me.id && r.day === TODAY);
    if (r2) r2.count = Math.max(0, (r2.count || 0) - delta);
    paintOutreach();
    toast(error.message);
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

// ---- Individual user detail (profile + access management + photo) ----
async function viewTeamDetail(view, uid) {
  view.innerHTML = `
    <button class="link-btn" id="td-back" type="button">‹ Back to team</button>
    <div class="spinner">Loading…</div>`;
  view.querySelector('#td-back').onclick = () => { ui.teamUser = null; setView('team'); };

  let profile;
  try {
    const { data, error } = await supabase.from('profiles')
      .select('id, email, full_name, role, status, created_at, avatar_url').eq('id', uid).maybeSingle();
    if (error) throw error;
    profile = data;
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
  renderTeamDetail(view, profile);
}

function renderTeamDetail(view, p) {
  const isSelf = p.id === me.id;

  const roleToggle = p.role === 'admin'
    ? `<button class="btn ghost sm" data-act="make-employee" data-id="${esc(p.id)}"${isSelf ? ' disabled' : ''}>Make employee</button>`
    : `<button class="btn ghost sm" data-act="make-admin" data-id="${esc(p.id)}">Make admin</button>`;
  const statusActions = p.status === 'approved'
    ? (isSelf ? '' : `<button class="btn danger sm" data-act="deny" data-id="${esc(p.id)}">Revoke access</button>`)
    : `<button class="btn green sm" data-act="approve" data-id="${esc(p.id)}">Approve</button>` +
      (p.status === 'pending' ? `<button class="btn danger sm" data-act="deny" data-id="${esc(p.id)}">Deny</button>` : '');

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
    </div>`;

  view.querySelector('#td-back').onclick = () => { ui.teamUser = null; setView('team'); };
  view.querySelector('#td-photo').onclick = () => changeAvatar(p.id, () => refreshTeam());
}

// All approved people, for the admin backfill person-picker (admins only).
async function fetchApprovedUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .eq('status', 'approved')
    .order('full_name', { ascending: true });
  if (error) { toast(error.message); return null; }
  return data || [];
}

// ===========================================================================
// Task board — a Trello-style Kanban: Inbound → In progress → Awaiting review
// → Completed. Employees move their own cards through the first three columns;
// only an ADMIN can move a card into (or out of) Completed. Once completed, the
// assignee or an admin can delete it — or just leave it there.
// ===========================================================================
// Who can do what (mirrored by the RLS policies in supabase/schema.sql):
function taskCanMove(t, toStatus) {
  if (!TASK_STAGES.includes(toStatus)) return false;
  if (me.role === 'admin') return true;                       // admins move anything
  if (t.assignee_id !== me.id) return false;                  // only your own cards
  if (t.status === 'completed' || toStatus === 'completed') return false; // completion is admin-gated
  return true;
}
function taskCanDelete(t) {
  return me.role === 'admin' || (t.assignee_id === me.id && t.status === 'completed');
}
function taskCanEdit() {
  return me.role === 'admin'; // only admins edit task content; employees just move cards
}
// Cards are ordered by sort_order (highest first = top of the column); ties fall
// back to most-recently-touched. Drag-to-reorder writes sort_order; a moved card
// gets a fresh high value so it pops to the top of its new column.
function taskSort(a, b) {
  const ao = a.sort_order ?? 0, bo = b.sort_order ?? 0;
  if (ao !== bo) return bo - ao;
  return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '');
}

const groupBy = (arr, key) => {
  const m = {};
  for (const x of arr || []) (m[x[key]] || (m[x[key]] = [])).push(x);
  return m;
};

// Colored label pills (shared by the card face and the read-only modal).
function labelPillsHTML(labels) {
  return (labels || [])
    .filter((k) => CARD_LABELS[k])
    .map((k) => `<span class="kc-label" style="--lc:${CARD_LABELS[k].color}">${esc(CARD_LABELS[k].label)}</span>`)
    .join('');
}

// Does a card match the "Due" filter dropdown?
function dueMatches(t, mode) {
  if (mode === 'none') return !t.due_date;
  if (!t.due_date) return false;
  if (mode === 'overdue') return t.status !== 'completed' && t.due_date < TODAY;
  if (mode === 'today') return t.due_date === TODAY;
  if (mode === 'week') return t.due_date >= TODAY && t.due_date <= addDaysISO(TODAY, 7);
  return true;
}

// The cards visible right now = Everyone/Just-me segment AND the filter dropdowns.
function filteredRows() {
  let rows = tasks.rows;
  if (tasks.filter === 'mine') rows = rows.filter((t) => t.assignee_id === me.id);
  if (tasks.assignee && tasks.assignee !== 'all') rows = rows.filter((t) => t.assignee_id === tasks.assignee);
  if (tasks.label && tasks.label !== 'all') rows = rows.filter((t) => (t.labels || []).includes(tasks.label));
  if (tasks.due && tasks.due !== 'all') rows = rows.filter((t) => dueMatches(t, tasks.due));
  return rows;
}

// Board writes that tolerate the new schema NOT being applied yet, so the board
// can never break if the DB migration hasn't been run. On a "missing column /
// table" error we strip the new fields (labels / sort_order) and retry, so
// creating, moving and editing cards keeps working regardless.
const isMissingSchema = (e) =>
  !!e && (e.code === 'PGRST204' || e.code === 'PGRST205' || e.code === '42703' || e.code === '42P01'
    || /could not find|does not exist|schema cache/i.test(e.message || ''));

async function boardCardsUpdate(id, patch) {
  let { error } = await supabase.from('board_cards').update(patch).eq('id', id);
  if (error && isMissingSchema(error)) {
    const { labels, sort_order, ...safe } = patch;
    ({ error } = await supabase.from('board_cards').update(safe).eq('id', id));
  }
  return { error };
}

async function boardCardsInsert(row) {
  let { error } = await supabase.from('board_cards').insert(row);
  if (error && isMissingSchema(error)) {
    const { labels, sort_order, ...safe } = row;
    ({ error } = await supabase.from('board_cards').insert(safe));
  }
  return { error };
}

function viewBoard(view) {
  const isAdmin = me.role === 'admin';
  // Admins manage the whole board, so they open on "Everyone"; employees on
  // their own cards. (Only set the first time — a manual toggle then sticks.)
  if (tasks.filter === null) tasks.filter = isAdmin ? 'all' : 'mine';
  const dueOpts = [['all', 'Any date'], ['overdue', 'Overdue'], ['today', 'Due today'], ['week', 'Due this week'], ['none', 'No due date']];
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Task board</h1>
        <p class="subtitle" style="margin:2px 0 0;">${isAdmin
          ? 'Assign tasks to the team, then sign off the final ✓ Completed.'
          : 'Work the tasks assigned to you through Inbound → In progress → Awaiting review. An admin signs off the final ✓ Completed.'}</p>
      </div>
      <div class="th-actions">
        <div class="seg" id="task-filter">
          <button data-filter="all" class="${tasks.filter === 'all' ? 'active' : ''}" type="button">Everyone</button>
          <button data-filter="mine" class="${tasks.filter === 'mine' ? 'active' : ''}" type="button">Just me</button>
        </div>
        ${isAdmin ? `<button class="btn primary" id="task-add" type="button">${icon('plus', 'ic sm')}<span>Assign task</span></button>` : ''}
      </div>
    </div>
    <div class="board-filters" id="board-filters">
      <span class="bf-ic">${icon('filter', 'ic sm')}</span>
      ${isAdmin ? `<label class="bf">Assignee <select id="bf-assignee"><option value="all">Everyone</option></select></label>` : ''}
      <label class="bf">Label <select id="bf-label"><option value="all">Any label</option></select></label>
      <label class="bf">Due <select id="bf-due">${dueOpts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <button class="btn ghost sm" id="bf-clear" type="button">Clear</button>
    </div>
    <div id="task-stats" class="stats"></div>
    <div class="kanban" id="kanban"><div class="spinner">Loading…</div></div>`;

  view.querySelectorAll('#task-filter button').forEach((b) => {
    b.onclick = () => {
      tasks.filter = b.dataset.filter;
      view.querySelectorAll('#task-filter button').forEach((x) => x.classList.toggle('active', x === b));
      renderBoard();
    };
  });
  const aSel = view.querySelector('#bf-assignee');
  if (aSel) aSel.onchange = () => { tasks.assignee = aSel.value; renderBoard(); };
  const lSel = view.querySelector('#bf-label');
  if (lSel) lSel.onchange = () => { tasks.label = lSel.value; renderBoard(); };
  const dSel = view.querySelector('#bf-due');
  if (dSel) { dSel.value = tasks.due; dSel.onchange = () => { tasks.due = dSel.value; renderBoard(); }; }
  const clr = view.querySelector('#bf-clear');
  if (clr) clr.onclick = () => {
    tasks.assignee = 'all'; tasks.label = 'all'; tasks.due = 'all';
    if (dSel) dSel.value = 'all';
    populateBoardFilters();
    renderBoard();
  };
  const addBtn = view.querySelector('#task-add');
  if (addBtn) addBtn.onclick = () => openBoardModal(null);
  loadBoard();
}

async function loadBoard() {
  const board = document.getElementById('kanban');
  // Cards, plus their checklist items, comments, and attachments. The extra
  // tables may not exist yet on an older database — treat those errors as
  // "empty" so the board still loads, then run the migration to light them up.
  const [cardsRes, listRes, comRes, attRes] = await Promise.all([
    supabase.from('board_cards').select('*').order('updated_at', { ascending: false }),
    supabase.from('card_checklist_items').select('id, card_id, text, done, sort_order'),
    supabase.from('card_comments').select('id, card_id, author_id, author_name, author_avatar, body, created_at'),
    supabase.from('card_attachments').select('id, card_id, path, name, size, mime, uploader_id, uploader_name, created_at'),
  ]);
  if (cardsRes.error) {
    if (board) board.innerHTML = `<div class="empty">Couldn't load the board: ${esc(cardsRes.error.message)}</div>`;
    return;
  }
  tasks.rows = cardsRes.data || [];
  tasks.checklist = groupBy(listRes.error ? [] : listRes.data, 'card_id');
  tasks.comments = groupBy(comRes.error ? [] : comRes.data, 'card_id');
  tasks.attachments = groupBy(attRes.error ? [] : attRes.data, 'card_id');
  populateBoardFilters();
  renderBoard();
}

// Fill the Assignee + Label dropdowns from whoever/whatever is actually on the
// board right now, keeping the current selection if it's still valid.
function populateBoardFilters() {
  const aSel = document.getElementById('bf-assignee');
  if (aSel) {
    const seen = new Map();
    tasks.rows.forEach((t) => { if (t.assignee_id && !seen.has(t.assignee_id)) seen.set(t.assignee_id, t.assignee_name || 'Unassigned'); });
    if (tasks.assignee !== 'all' && !seen.has(tasks.assignee)) tasks.assignee = 'all';
    aSel.innerHTML = ['<option value="all">Everyone</option>']
      .concat([...seen].map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`)).join('');
    aSel.value = tasks.assignee;
  }
  const lSel = document.getElementById('bf-label');
  if (lSel) {
    const present = new Set();
    tasks.rows.forEach((t) => (t.labels || []).forEach((k) => present.add(k)));
    if (tasks.label !== 'all' && !present.has(tasks.label)) tasks.label = 'all';
    lSel.innerHTML = ['<option value="all">Any label</option>']
      .concat(Object.keys(CARD_LABELS).filter((k) => present.has(k)).map((k) => `<option value="${k}">${esc(CARD_LABELS[k].label)}</option>`)).join('');
    lSel.value = tasks.label;
  }
}

function renderBoard() {
  const board = document.getElementById('kanban');
  if (!board) return;
  const rows = filteredRows();
  renderTaskStats(rows);
  const hint = {
    inbound: me.role === 'admin' ? 'Assign a task to get the ball rolling.' : 'Nothing assigned yet.',
    in_progress: 'Nothing in progress.',
    awaiting_review: 'Nothing waiting on review.',
    completed: 'No completed tasks yet.',
  };
  const isAdmin = me.role === 'admin';
  board.innerHTML = TASK_STAGES.map((s) => {
    const list = rows.filter((t) => t.status === s).sort(taskSort);
    return `
      <div class="kanban-col" data-status="${s}">
        <div class="kcol-head ${s}">
          <span class="kdot"></span>
          <span class="kcol-title">${TASK_LABEL[s]}</span>
          <span class="kcol-count">${list.length}</span>
          ${s === 'inbound' && isAdmin ? `<button class="kcol-add" id="kcol-add" type="button" title="Assign a task">${icon('plus', 'ic sm')}</button>` : ''}
        </div>
        <div class="kcol-body">
          ${list.length ? list.map(boardCardHTML).join('') : `<div class="kcol-empty">${hint[s]}</div>`}
        </div>
      </div>`;
  }).join('');
  wireBoard(board);
}

function renderTaskStats(rows) {
  const el = document.getElementById('task-stats');
  if (!el) return;
  const sub = { inbound: 'to pick up', in_progress: 'underway', awaiting_review: 'need sign-off', completed: 'done & dusted' };
  el.innerHTML = TASK_STAGES.map((s) =>
    statCard(TASK_LABEL[s], rows.filter((t) => t.status === s).length, `<span class="muted-mini">${sub[s]}</span>`)
  ).join('');
}

// Compact due-date pill (overdue in red, due-today in amber).
function fmtDueShort(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
function taskDueHTML(t) {
  if (!t.due_date) return '';
  const done = t.status === 'completed';
  const overdue = !done && t.due_date < TODAY;
  const today = !done && t.due_date === TODAY;
  const cls = overdue ? ' overdue' : today ? ' soon' : '';
  const text = today ? 'Due today' : `${overdue ? 'Overdue' : 'Due'} ${fmtDueShort(t.due_date)}`;
  return `<div class="kc-due${cls}">${icon('cal', 'ic sm')}<span>${esc(text)}</span></div>`;
}

// Small "3/5 checklist" + "2 comments" badges on the card face.
function taskMetaHTML(t) {
  const items = tasks.checklist[t.id] || [];
  const comments = tasks.comments[t.id] || [];
  const parts = [];
  if (items.length) {
    const done = items.filter((i) => i.done).length;
    parts.push(`<span class="kc-meta-i${done === items.length ? ' done' : ''}" title="Checklist">${icon('check', 'ic sm')}${done}/${items.length}</span>`);
  }
  if (comments.length) {
    parts.push(`<span class="kc-meta-i" title="Comments">${icon('comment', 'ic sm')}${comments.length}</span>`);
  }
  const attachments = tasks.attachments[t.id] || [];
  if (attachments.length) {
    parts.push(`<span class="kc-meta-i" title="Attachments">${icon('paperclip', 'ic sm')}${attachments.length}</span>`);
  }
  return parts.length ? `<div class="kc-meta">${parts.join('')}</div>` : '';
}

function boardCardHTML(t) {
  const meFlag = t.assignee_id === me.id;
  const canDrag = me.role === 'admin' || (meFlag && t.status !== 'completed');
  const expanded = expandedTasks.has(t.id);
  const labels = labelPillsHTML(t.labels);
  return `
    <div class="kanban-card status-${t.status}${expanded ? ' expanded' : ''}" data-task="${esc(t.id)}" draggable="${canDrag ? 'true' : 'false'}">
      ${labels ? `<div class="kc-labels">${labels}</div>` : ''}
      <div class="kc-main">
        <div class="kc-title">${esc(t.title)}</div>
        ${t.description ? `<div class="kc-desc">${esc(t.description)}</div>` : ''}
        ${taskDueHTML(t)}
        ${taskMetaHTML(t)}
      </div>
      <div class="kc-foot">
        <div class="kc-assignee" title="${esc(t.assignee_name || 'Unassigned')}">
          ${avatarHTML(t.assignee_name || '?', meFlag, 'sm', t.assignee_avatar)}
          <span class="kc-who">${esc(shortName(t.assignee_name) || 'Unassigned')}${meFlag ? ' <span class="muted-mini">(you)</span>' : ''}</span>
        </div>
        ${taskCardControlsHTML(t)}
      </div>
    </div>`;
}

function taskCardControlsHTML(t) {
  const i = TASK_STAGES.indexOf(t.status);
  const prev = TASK_STAGES[i - 1];
  const next = TASK_STAGES[i + 1];
  const parts = [];
  if (t.description) {
    const exp = expandedTasks.has(t.id);
    parts.push(`<button class="kc-btn kc-expand" data-expand type="button" title="${exp ? 'Collapse' : 'Expand'}" aria-label="${exp ? 'Collapse task' : 'Expand task'}">${icon('chevron', 'ic sm')}</button>`);
  }
  if (prev && taskCanMove(t, prev)) {
    parts.push(`<button class="kc-btn" data-move="${prev}" type="button" title="Back to ${TASK_LABEL[prev]}">${icon('arrow-left', 'ic sm')}</button>`);
  }
  if (next === 'completed') {
    if (me.role === 'admin') parts.push(`<button class="kc-btn done" data-move="completed" type="button" title="Approve & complete">${icon('check', 'ic sm')}<span>Complete</span></button>`);
    else if (t.assignee_id === me.id) parts.push('<span class="kc-wait" title="An admin will sign this off">⏳ Admin sign-off</span>');
  } else if (next && taskCanMove(t, next)) {
    parts.push(`<button class="kc-btn" data-move="${next}" type="button" title="Move to ${TASK_LABEL[next]}">${icon('arrow-right', 'ic sm')}</button>`);
  }
  if (taskCanDelete(t)) {
    parts.push(`<button class="kc-btn del" data-del type="button" title="Delete task">${icon('trash', 'ic sm')}</button>`);
  }
  return parts.length ? `<div class="kc-actions">${parts.join('')}</div>` : '';
}

function wireBoard(board) {
  const byId = new Map(tasks.rows.map((t) => [t.id, t]));
  const addBtn = board.querySelector('#kcol-add');
  if (addBtn) addBtn.onclick = () => openBoardModal(null);

  board.querySelectorAll('.kanban-card').forEach((el) => {
    const t = byId.get(el.dataset.task);
    if (!t) return;
    el.querySelectorAll('[data-move]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); moveTask(t, b.dataset.move); };
    });
    const del = el.querySelector('[data-del]');
    if (del) del.onclick = (e) => { e.stopPropagation(); confirmDeleteTask(t); };
    el.querySelector('.kc-main').onclick = () => openBoardModal(t);
    const exp = el.querySelector('[data-expand]');
    if (exp) exp.onclick = (e) => {
      e.stopPropagation();
      const open = el.classList.toggle('expanded');
      if (open) expandedTasks.add(t.id); else expandedTasks.delete(t.id);
      exp.title = open ? 'Collapse' : 'Expand';
    };

    // Native drag-and-drop (desktop pointer). Touch devices use the arrow buttons.
    if (el.getAttribute('draggable') === 'true') {
      el.addEventListener('dragstart', (e) => {
        taskDragId = t.id;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', t.id); } catch (_) {}
      });
      el.addEventListener('dragend', () => {
        taskDragId = null;
        el.classList.remove('dragging');
        board.querySelectorAll('.kanban-col').forEach((c) => c.classList.remove('drop-target'));
        // Reconcile the DOM with the data: if the drag ended without a valid
        // drop, the live-preview move is undone; a successful drop already
        // re-rendered, so this is a harmless repaint.
        renderBoard();
      });
    }
  });

  board.querySelectorAll('.kanban-col').forEach((col) => {
    const body = col.querySelector('.kcol-body');
    col.addEventListener('dragover', (e) => {
      const t = tasks.rows.find((x) => x.id === taskDragId);
      if (!t || !taskCanMove(t, col.dataset.status)) return; // not a valid drop target
      e.preventDefault();
      col.classList.add('drop-target');
      // Live preview: slot the dragged card where it would land, so reordering
      // within a column (and placing it across columns) has real-time feedback.
      const dragging = board.querySelector('.kanban-card.dragging');
      if (dragging && body) {
        const before = dragAfterCard(body, e.clientY);
        if (before == null) body.appendChild(dragging);
        else if (before !== dragging) body.insertBefore(dragging, before);
      }
    });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target'); });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drop-target');
      const t = tasks.rows.find((x) => x.id === taskDragId);
      if (!t || !body) { renderBoard(); return; }
      const order = [...body.querySelectorAll('.kanban-card')].map((el) => el.dataset.task);
      dropTask(t, col.dataset.status, order);
    });
  });
}

// First card whose vertical midpoint is below the pointer => insert before it
// (null means drop at the end). The card being dragged is ignored.
function dragAfterCard(body, y) {
  const els = [...body.querySelectorAll('.kanban-card:not(.dragging)')];
  for (const el of els) {
    const box = el.getBoundingClientRect();
    if (y < box.top + box.height / 2) return el;
  }
  return null;
}

// Drop handler for drag-and-drop: may change a card's column (status) AND its
// position. `order` is the final list of card ids in the destination column
// (taken from the live-previewed DOM). We translate that into a sort_order that
// lands the card between its new neighbors.
async function dropTask(t, toStatus, order) {
  const statusChanged = t.status !== toStatus;
  if (statusChanged && !taskCanMove(t, toStatus)) {
    toast(toStatus === 'completed' ? 'Only an admin can mark a task complete.' : "You can't move that task there.");
    renderBoard();
    return;
  }
  if (!statusChanged && !taskCanMove(t, t.status)) { renderBoard(); return; }

  // Neighbors (excluding the dragged card), keyed by their current sort_order.
  const orderOf = new Map(tasks.rows.filter((x) => x.id !== t.id).map((x) => [x.id, x.sort_order ?? 0]));
  const pos = order.indexOf(t.id);
  const aboveId = order[pos - 1];
  const belowId = order[pos + 1];
  const above = aboveId != null && orderOf.has(aboveId) ? orderOf.get(aboveId) : null;
  const below = belowId != null && orderOf.has(belowId) ? orderOf.get(belowId) : null;
  let newOrder;
  if (above == null && below == null) newOrder = Date.now() / 1000;
  else if (above == null) newOrder = below + 1;   // top of the column
  else if (below == null) newOrder = above - 1;   // bottom of the column
  else newOrder = (above + below) / 2;            // between two cards

  const unchanged = !statusChanged && Math.abs((t.sort_order ?? 0) - newOrder) < 1e-9;
  if (unchanged) { renderBoard(); return; }

  const prev = { status: t.status, sort_order: t.sort_order, updated_at: t.updated_at, completed_at: t.completed_at, completed_by: t.completed_by };
  const nowISO = new Date().toISOString();
  const patch = { sort_order: newOrder, updated_at: nowISO };
  if (statusChanged) {
    patch.status = toStatus;
    if (toStatus === 'completed') { patch.completed_at = nowISO; patch.completed_by = me.id; }
    else { patch.completed_at = null; patch.completed_by = null; }
  }
  Object.assign(t, patch);
  renderBoard();
  const { error } = await boardCardsUpdate(t.id, patch);
  if (error) { Object.assign(t, prev); renderBoard(); toast(error.message); return; }
  if (statusChanged && toStatus === 'completed') toast('🎉 Task completed!');
}

async function moveTask(t, toStatus) {
  if (t.status === toStatus) return;
  if (!taskCanMove(t, toStatus)) {
    toast(toStatus === 'completed' ? 'Only an admin can mark a task complete.' : "You can't move that task there.");
    return;
  }
  const prev = { status: t.status, sort_order: t.sort_order, updated_at: t.updated_at, completed_at: t.completed_at, completed_by: t.completed_by };
  const nowISO = new Date().toISOString();
  // Pop to the top of the destination column.
  const top = Math.max(0, ...tasks.rows.filter((x) => x.status === toStatus && x.id !== t.id).map((x) => x.sort_order ?? 0)) + 1;
  const patch = { status: toStatus, sort_order: top, updated_at: nowISO };
  if (toStatus === 'completed') { patch.completed_at = nowISO; patch.completed_by = me.id; }
  else { patch.completed_at = null; patch.completed_by = null; }
  Object.assign(t, patch);
  renderBoard();
  const { error } = await boardCardsUpdate(t.id, patch);
  if (error) { Object.assign(t, prev); renderBoard(); toast(error.message); return; }
  if (toStatus === 'completed') toast('🎉 Task completed!');
}

function confirmDeleteTask(t) {
  if (!taskCanDelete(t)) { toast("You can't delete that task yet."); return; }
  openConfirm({
    title: 'Delete task?',
    body: `“${t.title}” will be removed for everyone. This can't be undone.`,
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: async () => {
      const snapshot = tasks.rows;
      const attachPaths = (tasks.attachments[t.id] || []).map((a) => a.path).filter(Boolean);
      tasks.rows = tasks.rows.filter((x) => x.id !== t.id);
      renderBoard();
      const { error } = await supabase.from('board_cards').delete().eq('id', t.id);
      if (error) { tasks.rows = snapshot; renderBoard(); toast(error.message); return; }
      // The attachment rows cascade-delete with the card; best-effort remove the
      // stored files too so they don't orphan (ignored if we lack permission).
      if (attachPaths.length) supabase.storage.from(ATTACH_BUCKET).remove(attachPaths).catch(() => {});
      delete tasks.attachments[t.id];
      toast('Task deleted');
    },
  });
}

// Create or view/edit a task. Admins get an assignee picker; the modal is
// read-only for cards you don't own (transparency without edit rights).
async function openBoardModal(existing) {
  const creating = !existing;
  if (creating && me.role !== 'admin') { toast('Only an admin can assign tasks.'); return; }
  const editable = creating || taskCanEdit(existing);
  const isAdmin = me.role === 'admin';
  const users = isAdmin && editable ? await fetchApprovedUsers() : null;
  const curAssigneeId = existing ? existing.assignee_id : me.id;
  const selLabels = new Set(existing && existing.labels ? existing.labels : []);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card pad tk-modal">
      <div class="tk-head">
        <h2 style="margin:0;">${creating ? 'Assign a task' : editable ? 'Edit task' : 'Task'}</h2>
        ${existing ? `<span class="badge stage-${existing.status}">${TASK_LABEL[existing.status]}</span>` : ''}
      </div>
      <label style="margin-top:14px;">Title</label>
      ${editable
        ? `<input id="tk-title" type="text" maxlength="140" placeholder="What needs doing?" value="${esc(existing ? existing.title : '')}" />`
        : `<div class="tk-readonly strong">${esc(existing.title)}</div>`}
      <label style="margin-top:14px;">Details <span style="opacity:.7">(optional)</span></label>
      ${editable
        ? `<textarea id="tk-desc" rows="4" maxlength="2000" placeholder="Context, links, what 'done' looks like…">${esc(existing ? existing.description : '')}</textarea>`
        : `<div class="tk-readonly">${existing.description ? esc(existing.description) : '<span class="muted-mini">No details.</span>'}</div>`}
      ${editable
        ? `<label style="margin-top:14px;">Labels <span style="opacity:.7">(optional)</span></label>
           <div class="tk-labels" id="tk-labels">
             ${Object.entries(CARD_LABELS).map(([k, m]) => `<button type="button" class="lbl-pick${selLabels.has(k) ? ' on' : ''}" data-label="${k}" style="--lc:${m.color}">${esc(m.label)}</button>`).join('')}
           </div>`
        : (existing.labels && existing.labels.length ? `<label style="margin-top:14px;">Labels</label><div class="kc-labels in-modal">${labelPillsHTML(existing.labels)}</div>` : '')}
      ${isAdmin && editable && users ? `
        <label style="margin-top:14px;">Assignee</label>
        <select id="tk-assignee" class="form-select">
          ${users.map((u) => `<option value="${esc(u.id)}"${u.id === curAssigneeId ? ' selected' : ''}>${esc(u.full_name || u.email)}${u.id === me.id ? ' (you)' : ''}</option>`).join('')}
        </select>` : ''}
      ${editable
        ? `<label style="margin-top:14px;">Due date <span style="opacity:.7">(optional)</span></label>
           <input id="tk-due" type="date" value="${existing && existing.due_date ? esc(existing.due_date) : ''}" />`
        : (existing.due_date ? `<label style="margin-top:14px;">Due date</label><div class="tk-readonly">${esc(fmtDate(existing.due_date))}</div>` : '')}
      ${existing && existing.status === 'completed' && existing.completed_at ? `<p class="muted-mini" style="margin:14px 0 0;">✓ Completed ${esc(fmtDate(existing.completed_at.slice(0, 10)))}.</p>` : ''}
      ${existing
        ? '<div id="tk-extras" class="tk-extras"></div>'
        : '<p class="muted-mini" style="margin:16px 0 0;">A checklist, attachments, and comments open up once the task is created.</p>'}
      <div id="tk-msg" class="msg"></div>
      <div class="modal-foot">
        ${existing && taskCanDelete(existing) ? '<button class="btn danger" id="tk-del" type="button" style="margin-right:auto;">Delete</button>' : ''}
        <button class="btn ghost" id="tk-cancel" type="button">${editable ? 'Cancel' : 'Close'}</button>
        ${editable ? `<button class="btn primary" id="tk-save" type="button">${creating ? 'Assign task' : 'Save'}</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  const msg = overlay.querySelector('#tk-msg');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#tk-cancel').onclick = close;
  const titleEl = overlay.querySelector('#tk-title');
  if (titleEl) { titleEl.focus(); titleEl.select(); }

  overlay.querySelectorAll('#tk-labels .lbl-pick').forEach((b) => {
    b.onclick = () => b.classList.toggle('on');
  });
  if (existing) renderCardExtras(overlay, existing);

  const delBtn = overlay.querySelector('#tk-del');
  if (delBtn) delBtn.onclick = () => { close(); confirmDeleteTask(existing); };

  const saveBtn = overlay.querySelector('#tk-save');
  if (saveBtn) saveBtn.onclick = async () => {
    const title = titleEl.value.trim();
    if (!title) { msg.textContent = 'Give the task a title.'; msg.className = 'msg show error'; return; }
    const description = overlay.querySelector('#tk-desc').value.trim();
    const dueEl = overlay.querySelector('#tk-due');
    const due_date = dueEl && dueEl.value ? dueEl.value : null;
    const labels = [...overlay.querySelectorAll('#tk-labels .lbl-pick.on')].map((b) => b.dataset.label);
    const sel = overlay.querySelector('#tk-assignee');
    let assignee = (sel && users) ? users.find((u) => u.id === sel.value) : null;
    if (creating && !assignee) assignee = { id: me.id, full_name: me.full_name, email: me.email, avatar_url: me.avatar_url };
    saveBtn.disabled = true;
    let error;
    if (creating) {
      ({ error } = await boardCardsInsert({
        title, description, status: 'inbound', due_date, labels,
        sort_order: Date.now() / 1000,
        assignee_id: assignee.id,
        assignee_name: assignee.full_name || assignee.email || '',
        assignee_avatar: assignee.avatar_url || null,
        created_by: me.id,
      }));
    } else {
      const patch = { title, description, due_date, labels, updated_at: new Date().toISOString() };
      if (assignee) {
        patch.assignee_id = assignee.id;
        patch.assignee_name = assignee.full_name || assignee.email || '';
        patch.assignee_avatar = assignee.avatar_url || null;
      }
      ({ error } = await boardCardsUpdate(existing.id, patch));
    }
    if (error) { msg.textContent = error.message; msg.className = 'msg show error'; saveBtn.disabled = false; return; }
    close(); toast(creating ? 'Task assigned' : 'Task saved'); loadBoard();
  };
}

// ---------------------------------------------------------------------------
// Card extras: an interactive checklist + a comment thread inside the modal.
// These persist on their own (no "Save" needed) so they work even when the
// card body is read-only for the viewer (e.g. an assignee ticking items off).
// ---------------------------------------------------------------------------
function renderCardExtras(overlay, card) {
  const host = overlay.querySelector('#tk-extras');
  if (!host) return;
  host.innerHTML = `
    <div class="tk-section" id="tk-checklist"></div>
    <div class="tk-section" id="tk-attachments"></div>
    <div class="tk-section" id="tk-comments"></div>`;
  renderChecklist(overlay, card);
  renderAttachments(overlay, card);
  renderComments(overlay, card);
}

function renderChecklist(overlay, card) {
  const host = overlay.querySelector('#tk-checklist');
  if (!host) return;
  const isAdmin = me.role === 'admin';
  const canToggle = isAdmin || card.assignee_id === me.id; // assignee ticks items off
  const items = (tasks.checklist[card.id] || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  host.innerHTML = `
    <div class="tk-sec-head">
      <h3>${icon('check', 'ic sm')} Checklist</h3>
      ${items.length ? `<span class="tk-sec-prog">${done}/${items.length}</span>` : ''}
    </div>
    ${items.length ? `<div class="ck-bar"><span style="width:${pct}%"></span></div>` : ''}
    <div class="ck-list">
      ${items.length ? items.map((i) => `
        <div class="ck-item${i.done ? ' done' : ''}" data-ck="${esc(i.id)}">
          <button type="button" class="ck-box" data-ck-toggle ${canToggle ? '' : 'disabled'} aria-label="Toggle item">${i.done ? icon('check', 'ic sm') : ''}</button>
          <span class="ck-text">${esc(i.text)}</span>
          ${isAdmin ? `<button type="button" class="ck-del" data-ck-del title="Remove item">${icon('trash', 'ic sm')}</button>` : ''}
        </div>`).join('') : `<div class="muted-mini">No checklist items${isAdmin ? ' yet — add the sub-steps below.' : '.'}</div>`}
    </div>
    ${isAdmin ? `
      <div class="ck-add">
        <input type="text" id="ck-new" maxlength="200" placeholder="Add a checklist item…" />
        <button type="button" class="btn ghost sm" id="ck-add-btn">Add</button>
      </div>` : ''}`;
  host.querySelectorAll('.ck-item').forEach((row) => {
    const item = items.find((x) => x.id === row.dataset.ck);
    if (!item) return;
    const tg = row.querySelector('[data-ck-toggle]');
    if (tg && canToggle) tg.onclick = () => toggleChecklistItem(overlay, card, item);
    const dl = row.querySelector('[data-ck-del]');
    if (dl) dl.onclick = () => deleteChecklistItem(overlay, card, item);
  });
  const addBtn = host.querySelector('#ck-add-btn');
  const addInput = host.querySelector('#ck-new');
  if (addBtn && addInput) {
    const add = () => { const v = addInput.value.trim(); if (v) addChecklistItem(overlay, card, v); };
    addBtn.onclick = add;
    addInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  }
}

async function toggleChecklistItem(overlay, card, item) {
  const next = !item.done;
  item.done = next; // optimistic
  renderChecklist(overlay, card); renderBoard();
  const { error } = await supabase.from('card_checklist_items').update({ done: next }).eq('id', item.id);
  if (error) { item.done = !next; renderChecklist(overlay, card); renderBoard(); toast(error.message); }
}

async function addChecklistItem(overlay, card, text) {
  const items = tasks.checklist[card.id] || (tasks.checklist[card.id] = []);
  const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order ?? 0), 0);
  const { data, error } = await supabase.from('card_checklist_items')
    .insert({ card_id: card.id, text, sort_order: maxOrder + 1 })
    .select('id, card_id, text, done, sort_order').single();
  if (error) { toast(error.message); return; }
  items.push(data);
  renderChecklist(overlay, card); renderBoard();
}

async function deleteChecklistItem(overlay, card, item) {
  const items = tasks.checklist[card.id] || [];
  const { error } = await supabase.from('card_checklist_items').delete().eq('id', item.id);
  if (error) { toast(error.message); return; }
  const i = items.indexOf(item); if (i >= 0) items.splice(i, 1);
  renderChecklist(overlay, card); renderBoard();
}

function renderComments(overlay, card) {
  const host = overlay.querySelector('#tk-comments');
  if (!host) return;
  const list = (tasks.comments[card.id] || []).slice().sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  host.innerHTML = `
    <div class="tk-sec-head">
      <h3>${icon('comment', 'ic sm')} Comments</h3>
      ${list.length ? `<span class="tk-sec-prog">${list.length}</span>` : ''}
    </div>
    <div class="cm-list">
      ${list.length ? list.map((c) => `
        <div class="cm-item" data-cm="${esc(c.id)}">
          ${avatarHTML(c.author_name || '?', c.author_id === me.id, 'sm', c.author_avatar)}
          <div class="cm-body">
            <div class="cm-meta"><span class="cm-who">${esc(shortName(c.author_name) || 'Someone')}</span><span class="cm-when">${esc(fmtWhen(c.created_at))}</span></div>
            <div class="cm-text">${esc(c.body)}</div>
          </div>
          ${(c.author_id === me.id || me.role === 'admin') ? `<button type="button" class="cm-del" data-cm-del title="Delete comment">${icon('trash', 'ic sm')}</button>` : ''}
        </div>`).join('') : '<div class="muted-mini">No comments yet — start the discussion.</div>'}
    </div>
    <div class="cm-add">
      <textarea id="cm-new" rows="2" maxlength="2000" placeholder="Write a comment…"></textarea>
      <button type="button" class="btn primary sm" id="cm-send">Comment</button>
    </div>`;
  host.querySelectorAll('.cm-item').forEach((row) => {
    const c = list.find((x) => x.id === row.dataset.cm);
    const dl = row.querySelector('[data-cm-del]');
    if (dl && c) dl.onclick = () => deleteComment(overlay, card, c);
  });
  const send = host.querySelector('#cm-send');
  const input = host.querySelector('#cm-new');
  if (send && input) send.onclick = () => { const v = input.value.trim(); if (v) postComment(overlay, card, v, input, send); };
}

async function postComment(overlay, card, body, input, send) {
  send.disabled = true; input.disabled = true;
  const { data, error } = await supabase.from('card_comments').insert({
    card_id: card.id, author_id: me.id,
    author_name: me.full_name || me.email || '',
    author_avatar: me.avatar_url || null, body,
  }).select('id, card_id, author_id, author_name, author_avatar, body, created_at').single();
  if (error) { send.disabled = false; input.disabled = false; toast(error.message); return; }
  (tasks.comments[card.id] || (tasks.comments[card.id] = [])).push(data);
  renderComments(overlay, card); renderBoard();
}

async function deleteComment(overlay, card, c) {
  const list = tasks.comments[card.id] || [];
  const { error } = await supabase.from('card_comments').delete().eq('id', c.id);
  if (error) { toast(error.message); return; }
  const i = list.indexOf(c); if (i >= 0) list.splice(i, 1);
  renderComments(overlay, card); renderBoard();
}

// ---------------------------------------------------------------------------
// Card attachments — files on a card. Any approved teammate (employees too) can
// add up to 10 per card; the uploader or an admin can remove them. Bytes live
// in the "card-attachments" storage bucket; the card_attachments table holds
// the per-card list (and a trigger enforces the 10-file cap server-side).
// ---------------------------------------------------------------------------
function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function attachUrl(path, downloadName) {
  const { data } = supabase.storage.from(ATTACH_BUCKET)
    .getPublicUrl(path, downloadName ? { download: downloadName } : undefined);
  return data.publicUrl;
}

function renderAttachments(overlay, card) {
  const host = overlay.querySelector('#tk-attachments');
  if (!host) return;
  const items = (tasks.attachments[card.id] || []).slice()
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  const count = items.length;
  const full = count >= ATTACH_MAX;
  const busy = attachBusyCard === card.id;
  const isImg = (a) => (a.mime || '').startsWith('image/');
  host.innerHTML = `
    <div class="tk-sec-head">
      <h3>${icon('paperclip', 'ic sm')} Attachments</h3>
      <span class="tk-sec-prog">${count}/${ATTACH_MAX}</span>
    </div>
    <div class="at-list">
      ${count ? items.map((a) => `
        <div class="at-item" data-at="${esc(a.id)}">
          <a class="at-thumb" href="${esc(attachUrl(a.path))}" target="_blank" rel="noopener">
            ${isImg(a) ? `<img src="${esc(attachUrl(a.path))}" alt="${esc(a.name)}" loading="lazy" />` : icon('file', 'ic')}
          </a>
          <div class="at-body">
            <a class="at-name" href="${esc(attachUrl(a.path))}" target="_blank" rel="noopener" title="${esc(a.name)}">${esc(a.name)}</a>
            <div class="at-meta">${a.size != null ? esc(fmtBytes(a.size)) + ' · ' : ''}${esc(shortName(a.uploader_name) || 'Someone')} · ${esc(fmtWhen(a.created_at))}</div>
          </div>
          <a class="at-act" href="${esc(attachUrl(a.path, a.name || true))}" title="Download">${icon('download', 'ic sm')}</a>
          ${(a.uploader_id === me.id || me.role === 'admin') ? `<button type="button" class="at-act at-del" data-at-del title="Remove attachment">${icon('trash', 'ic sm')}</button>` : ''}
        </div>`).join('') : '<div class="muted-mini">No attachments yet.</div>'}
    </div>
    <div class="at-add">
      <input type="file" id="at-file" multiple hidden />
      <button type="button" class="btn ghost sm" id="at-add-btn"${full || busy ? ' disabled' : ''}>
        ${busy ? 'Uploading…' : full ? `Limit reached (${ATTACH_MAX})` : `${icon('plus', 'ic sm')} Add files`}
      </button>
      ${!full && !busy ? `<span class="at-hint muted-mini">Up to ${ATTACH_MAX} files · ${ATTACH_MAX_MB} MB each</span>` : ''}
    </div>`;
  host.querySelectorAll('.at-item').forEach((row) => {
    const a = items.find((x) => x.id === row.dataset.at);
    const dl = row.querySelector('[data-at-del]');
    if (dl && a) dl.onclick = () => deleteAttachment(overlay, card, a);
  });
  const fileInput = host.querySelector('#at-file');
  const addBtn = host.querySelector('#at-add-btn');
  if (addBtn && fileInput && !full && !busy) {
    addBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => { if (fileInput.files && fileInput.files.length) addAttachments(overlay, card, [...fileInput.files]); };
  }
}

async function uploadCardAttachment(card, file) {
  const safe = ((file.name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+/, '').slice(-80)) || 'file';
  const rnd = (globalThis.crypto && globalThis.crypto.randomUUID)
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${me.id}/${card.id}/${rnd}-${safe}`;
  const { error: upErr } = await supabase.storage.from(ATTACH_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (upErr) return { error: upErr };
  const { data, error } = await supabase.from('card_attachments').insert({
    card_id: card.id, path, name: file.name || safe, size: file.size, mime: file.type || null,
    uploader_id: me.id, uploader_name: me.full_name || me.email || '',
  }).select('id, card_id, path, name, size, mime, uploader_id, uploader_name, created_at').single();
  if (error) {
    // Row rejected (e.g. the cap lost a race) — drop the now-orphaned file.
    await supabase.storage.from(ATTACH_BUCKET).remove([path]).catch(() => {});
    return { error };
  }
  return { data };
}

async function addAttachments(overlay, card, files) {
  const list = tasks.attachments[card.id] || (tasks.attachments[card.id] = []);
  const remaining = ATTACH_MAX - list.length;
  if (remaining <= 0) { toast(`A card can have at most ${ATTACH_MAX} attachments.`); return; }
  let chosen = files;
  if (chosen.length > remaining) {
    toast(`Only ${remaining} more file${remaining === 1 ? '' : 's'} allowed — adding the first ${remaining}.`);
    chosen = chosen.slice(0, remaining);
  }
  attachBusyCard = card.id;
  renderAttachments(overlay, card);
  for (const f of chosen) {
    if (f.size > ATTACH_MAX_BYTES) { toast(`“${f.name}” is over ${ATTACH_MAX_MB} MB — skipped.`); continue; }
    const { data, error } = await uploadCardAttachment(card, f);
    if (error) { toast(error.message); continue; }
    list.push(data);
  }
  attachBusyCard = null;
  renderAttachments(overlay, card);
  renderBoard();
}

async function deleteAttachment(overlay, card, a) {
  const { error } = await supabase.from('card_attachments').delete().eq('id', a.id);
  if (error) { toast(error.message); return; }
  const list = tasks.attachments[card.id] || [];
  const i = list.indexOf(a); if (i >= 0) list.splice(i, 1);
  supabase.storage.from(ATTACH_BUCKET).remove([a.path]).catch(() => {});
  renderAttachments(overlay, card); renderBoard();
}

// Friendly "2h ago" / "3d ago" timestamp for comments.
function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Small reusable confirm dialog.
function openConfirm({ title, body, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card pad" style="max-width:380px;">
      <h2 style="margin-bottom:6px;">${esc(title)}</h2>
      <p class="subtitle" style="margin-bottom:18px;">${esc(body)}</p>
      <div class="modal-foot">
        <button class="btn ghost" id="cf-cancel" type="button">Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" id="cf-ok" type="button">${esc(confirmLabel)}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#cf-cancel').onclick = close;
  overlay.querySelector('#cf-ok').onclick = async () => {
    overlay.querySelector('#cf-ok').disabled = true;
    try { await onConfirm(); } finally { close(); }
  };
}

// Dashboard card: your task counts by stage.
async function loadMyTasksCard() {
  const card = document.getElementById('board-card');
  if (!card) return;
  const body = card.querySelector('#tc-body');
  const { data, error } = await supabase.from('board_cards').select('status').eq('assignee_id', me.id);
  if (error) { card.remove(); return; } // e.g. schema not applied yet
  const list = data || [];
  const count = (s) => list.filter((t) => t.status === s).length;
  if (!list.length) {
    if (me.role === 'admin') {
      body.innerHTML = `
        <div class="empty" style="padding:6px 2px;">Nothing assigned to you. Head to the board to assign work to the team.</div>
        <button class="btn ghost full sm" id="tc-add" type="button" style="margin-top:8px;">Open board</button>`;
      body.querySelector('#tc-add').onclick = () => setView('board');
    } else {
      body.innerHTML = '<div class="empty" style="padding:6px 2px;">Nothing assigned to you yet — your admin will add tasks here.</div>';
    }
    return;
  }
  const review = count('awaiting_review');
  const active = count('inbound') + count('in_progress');
  body.innerHTML = `
    <div class="tk-mini">
      ${TASK_STAGES.map((s) => `<div class="tk-chip stage-${s}"><span class="tk-chip-n">${count(s)}</span><span class="tk-chip-l">${TASK_LABEL[s]}</span></div>`).join('')}
    </div>
    <div class="muted-mini tk-mini-note">${review ? `${review} awaiting an admin sign-off` : active ? `${active} on your plate` : 'all caught up 🎉'}</div>`;
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
