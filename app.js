import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.PORTAL_CONFIG || {};
const app = document.getElementById('app');

if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
  app.innerHTML =
    '<div class="center-screen"><div class="auth-card card">Missing Supabase config in config.js.</div></div>';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Someone';

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const BRAND = '<span class="brand"><span class="mark"></span><span class="name">RED<span>LINE</span></span></span>';

// ---------------------------------------------------------------------------
// State + routing
// ---------------------------------------------------------------------------
let me = null; // current profile { id, email, full_name, role, status }
let calView = (() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; })();
let lastUserId = undefined;

async function fetchProfile(userId) {
  // The DB trigger creates the profile; on a brand-new signup it may take a
  // moment, so retry a couple of times.
  for (let i = 0; i < 4; i++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, status')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
    await sleep(400);
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
  // Avoid re-rendering on token refreshes for the same user.
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
  if (me.role === 'admin') renderAdmin();
  else if (me.status === 'approved') renderPortal();
  else renderStatus();
}

supabase.auth.onAuthStateChange((_event, session) => {
  // Defer out of the callback: calling supabase methods (which need the auth
  // lock to attach the JWT) directly inside this callback can deadlock.
  setTimeout(() => routeForSession(session), 0);
});

// ---------------------------------------------------------------------------
// Auth view (sign in / create account)
// ---------------------------------------------------------------------------
function renderAuth() {
  app.innerHTML = `
    <div class="center-screen">
      <div class="auth-card card">
        <div style="text-align:center; margin-bottom:22px;">
          <span class="brand" style="justify-content:center;"><span class="mark"></span><span class="name">RED<span>LINE</span></span></span>
          <p class="subtitle" style="margin-top:8px;">Employee Portal</p>
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
    // On success, onAuthStateChange routes us onward.
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
    if (data.session) {
      // Email confirmation is off → we're signed in; routing handles the rest.
      return;
    }
    // Email confirmation is on → no session yet.
    signupForm.reset();
    selectTab(true);
    showMsg('Account created! Check your email to confirm, then wait for admin approval.', 'success');
  };
}

// ---------------------------------------------------------------------------
// Pending / denied view
// ---------------------------------------------------------------------------
function topbar(extraRight = '') {
  return `
    <div class="topbar">
      ${BRAND}
      <div class="right">
        <span class="who">Signed in as <strong>${esc(firstName(me.full_name))}</strong></span>
        ${extraRight}
        <button id="signout" class="btn ghost sm" type="button">Sign out</button>
      </div>
    </div>`;
}

function wireSignout() {
  const b = document.getElementById('signout');
  if (b) b.onclick = async () => { await supabase.auth.signOut(); };
}

function renderStatus() {
  const pending = me.status === 'pending';
  app.innerHTML = `
    ${topbar()}
    <div class="container">
      <div class="card pad" style="max-width:560px; margin:40px auto; text-align:center;">
        <div class="badge ${esc(me.status)}" style="font-size:0.85rem; margin-bottom:14px;">${esc(me.status)}</div>
        <h1>${pending ? 'Your account is awaiting approval' : 'Account not approved'}</h1>
        <p class="subtitle" style="margin-top:8px;">
          ${pending
            ? 'An admin needs to approve your account before you can schedule office days. Check back soon!'
            : 'Your access request was denied. If you think this is a mistake, contact your administrator.'}
        </p>
      </div>
    </div>`;
  wireSignout();
}

function renderFatal(msg) {
  app.innerHTML = `
    <div class="center-screen"><div class="auth-card card" style="text-align:center">
      <h2>Something went wrong</h2>
      <p class="subtitle">${esc(msg)}</p>
      <button id="signout" class="btn ghost full" type="button">Sign out</button>
    </div></div>`;
  wireSignout();
}

// ---------------------------------------------------------------------------
// Employee portal — office-day calendar
// ---------------------------------------------------------------------------
function renderPortal() {
  const adminBtn = me.role === 'admin'
    ? '<button id="go-admin" class="btn ghost sm" type="button">Admin</button>' : '';
  app.innerHTML = `${topbar(adminBtn)}<div class="container"><div id="cal"></div></div>`;
  wireSignout();
  const ga = document.getElementById('go-admin');
  if (ga) ga.onclick = () => renderAdmin();
  renderCalendar();
}

function buildGrid() {
  const first = new Date(calView.year, calView.month, 1);
  const offset = (first.getDay() + 6) % 7; // days from Monday
  const start = new Date(calView.year, calView.month, 1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

function shiftMonth(delta) {
  let m = calView.month + delta;
  let y = calView.year;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  calView = { year: y, month: m };
  renderCalendar();
}

async function renderCalendar() {
  const root = document.getElementById('cal');
  if (!root) return;
  root.innerHTML = `
    <div class="card pad">
      <div class="cal-head">
        <div class="cal-title">${MONTHS[calView.month]} ${calView.year}</div>
        <div class="cal-nav">
          <button class="btn ghost sm" id="prev" type="button">‹ Prev</button>
          <button class="btn ghost sm" id="today-btn" type="button">Today</button>
          <button class="btn ghost sm" id="next" type="button">Next ›</button>
        </div>
      </div>
      <div class="legend">
        <span><i style="background:var(--accent)"></i>You're in</span>
        <span><i style="background:var(--surface-2)"></i>Colleague in office</span>
        <span><i style="background:var(--bg-2);border:1px solid var(--accent)"></i>Today</span>
      </div>
      <div class="cal-grid" style="margin-top:14px;">${DOW.map((d) => `<div class="dow">${d}</div>`).join('')}</div>
      <div class="cal-grid" id="grid" style="margin-top:8px;">
        <div class="spinner" style="grid-column:1/-1">Loading schedule…</div>
      </div>
    </div>`;

  document.getElementById('prev').onclick = () => shiftMonth(-1);
  document.getElementById('next').onclick = () => shiftMonth(1);
  document.getElementById('today-btn').onclick = () => {
    const n = new Date(); calView = { year: n.getFullYear(), month: n.getMonth() }; renderCalendar();
  };

  const cells = buildGrid();
  const from = toISO(cells[0]);
  const to = toISO(cells[cells.length - 1]);

  const { data, error } = await supabase
    .from('office_days')
    .select('day, user_id, display_name')
    .gte('day', from)
    .lte('day', to)
    .order('day', { ascending: true });

  const grid = document.getElementById('grid');
  if (error) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">Couldn't load schedule: ${esc(error.message)}</div>`;
    return;
  }

  const byDay = new Map();
  for (const row of data) {
    if (!byDay.has(row.day)) byDay.set(row.day, []);
    byDay.get(row.day).push(row);
  }

  grid.innerHTML = '';
  for (const d of cells) {
    const iso = toISO(d);
    const inMonth = d.getMonth() === calView.month;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const isPast = iso < TODAY;
    const attendees = byDay.get(iso) || [];
    const mine = attendees.some((a) => a.user_id === me.id);
    const others = attendees.filter((a) => a.user_id !== me.id);

    const cell = document.createElement('div');
    cell.className = 'cell';
    if (!inMonth) cell.classList.add('muted');
    if (isWeekend) cell.classList.add('weekend');
    if (iso === TODAY) cell.classList.add('today');
    if (isPast) cell.classList.add('past');
    if (mine) cell.classList.add('mine');

    const chips = [];
    if (mine) chips.push('<span class="chip" style="background:var(--accent);color:#fff">You</span>');
    others.slice(0, mine ? 2 : 3).forEach((a) => chips.push(`<span class="chip">${esc(firstName(a.display_name))}</span>`));
    const shown = (mine ? 1 : 0) + Math.min(others.length, mine ? 2 : 3);
    const remaining = attendees.length - shown;
    if (remaining > 0) chips.push(`<span class="chip more">+${remaining}</span>`);

    cell.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="num">${d.getDate()}</span>
        ${attendees.length ? `<span class="count-pill">${attendees.length} in</span>` : ''}
      </div>
      <span class="me-flag">✓ You're in</span>
      <div class="attendees">${chips.join('')}</div>`;

    if (inMonth && !isPast) {
      cell.addEventListener('click', () => toggleDay(iso, mine, cell));
    } else {
      cell.style.cursor = 'default';
    }
    grid.appendChild(cell);
  }
}

async function toggleDay(iso, currentlyMine, cell) {
  cell.style.pointerEvents = 'none';
  let error;
  if (currentlyMine) {
    ({ error } = await supabase.from('office_days').delete().eq('user_id', me.id).eq('day', iso));
  } else {
    ({ error } = await supabase
      .from('office_days')
      .insert({ user_id: me.id, day: iso, display_name: me.full_name || me.email }));
    // 23505 = already booked (race / double-click); treat as success.
    if (error && error.code === '23505') error = null;
  }
  if (error) {
    alert(error.message);
    cell.style.pointerEvents = '';
    return;
  }
  renderCalendar();
}

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------
function renderAdmin() {
  app.innerHTML = `
    ${topbar('<button id="go-portal" class="btn ghost sm" type="button">My schedule</button>')}
    <div class="container">
      <h1>Admin dashboard</h1>
      <p class="subtitle">Review access requests and manage employees.</p>
      <div id="admin-msg" class="msg"></div>
      <div class="section">
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
      </div>
    </div>`;
  wireSignout();
  document.getElementById('go-portal').onclick = () => renderPortal();
  loadUsers();
}

function adminFlash(text, type = 'success') {
  const m = document.getElementById('admin-msg');
  if (!m) return;
  m.textContent = text;
  m.className = `msg show ${type}`;
  setTimeout(() => { m.className = 'msg'; }, 3500);
}

async function loadUsers() {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, status, created_at')
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
  document.getElementById('pending-count').textContent = pending.length ? `(${pending.length})` : '';
  pendingEl.innerHTML = pending.length
    ? pending.map((u) => `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 2px; border-bottom:1px solid var(--border);">
          <div>
            <div style="font-weight:600">${esc(u.full_name) || '(no name)'}</div>
            <div class="who">${esc(u.email)} · requested ${fmtDate(u.created_at)}</div>
          </div>
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
        <td>${esc(u.full_name) || '(no name)'} ${isSelf ? '<span class="who">(you)</span>' : ''}</td>
        <td class="hide-sm">${esc(u.email)}</td>
        <td><span class="badge ${esc(u.role)}">${esc(u.role)}</span></td>
        <td><span class="badge ${esc(u.status)}">${esc(u.status)}</span></td>
        <td class="hide-sm">${fmtDate(u.created_at)}</td>
        <td><div class="actions">${statusActions}${roleToggle}</div></td>
      </tr>`;
  }).join('');
}

// Event delegation for admin action buttons.
app.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
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
  loadUsers();
});
