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
const WD_PLURAL = ['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays'];

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'Someone';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic color per person, so each colleague keeps the same avatar hue.
function avatarColor(name) {
  let h = 0;
  const s = name || '';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 52% 42%)`;
}

function avatarHTML(name, isMe, cls = '') {
  const bg = isMe ? 'var(--accent)' : avatarColor(name);
  return `<span class="avatar${isMe ? ' me' : ''} ${cls}" style="background:${bg}" title="${esc(name)}">${esc(initials(name))}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const LOGO = '<img class="logo" src="./assets/logo.png" alt="Redline" />';
const BRAND = `<span class="brand">${LOGO}<span class="name">RED<span>LINE</span></span></span>`;

// ---------------------------------------------------------------------------
// State + routing
// ---------------------------------------------------------------------------
let me = null;
let lastUserId = undefined;

async function fetchProfile(userId) {
  for (let i = 0; i < 4; i++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, status')
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
  if (me.role === 'admin') renderAdmin();
  else if (me.status === 'approved') renderPortal();
  else renderStatus();
}

supabase.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => routeForSession(session), 0);
});

// ---------------------------------------------------------------------------
// Auth view
// ---------------------------------------------------------------------------
function renderAuth() {
  app.innerHTML = `
    <div class="center-screen">
      <div class="auth-card card">
        <div style="text-align:center; margin-bottom:22px;">
          <img class="auth-logo" src="./assets/logo.png" alt="Redline" />
          <div class="brand" style="justify-content:center;"><span class="name">RED<span>LINE</span></span></div>
          <p class="subtitle" style="margin-top:6px;">Employee Portal</p>
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
    if (data.session) return; // signed in → routing takes over
    signupForm.reset();
    selectTab(true);
    showMsg('Account created! Check your email to confirm, then wait for admin approval.', 'success');
  };
}

// ---------------------------------------------------------------------------
// Shared chrome
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
        <img class="auth-logo" src="./assets/logo.png" alt="Redline" style="height:46px" />
        <div class="badge ${esc(me.status)}" style="font-size:0.85rem; margin:10px 0 14px;">${esc(me.status)}</div>
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
      <img class="auth-logo" src="./assets/logo.png" alt="Redline" />
      <h2>Something went wrong</h2>
      <p class="subtitle">${esc(msg)}</p>
      <button id="signout" class="btn ghost full" type="button">Sign out</button>
    </div></div>`;
  wireSignout();
}

// ===========================================================================
// Employee portal — office-day scheduling
// ===========================================================================
const sched = {
  view: (() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; })(),
  cells: [],
  rows: [],
  byDay: new Map(),
  maxCount: 0,
  selectedDay: null,
  pendingSelect: null,
};

function renderPortal() {
  const adminBtn = me.role === 'admin'
    ? '<button id="go-admin" class="btn ghost sm" type="button">Admin</button>' : '';
  app.innerHTML = `
    ${topbar(adminBtn)}
    <div class="container">
      <div class="page-head">
        <div>
          <h1>Office schedule</h1>
          <p class="subtitle" style="margin:2px 0 0;">Tap any day to see who's in, then add or remove yourself.</p>
        </div>
      </div>
      <div id="stats" class="stats"></div>
      <div class="cal-toolbar">
        <div class="cal-month-title" id="cal-title"></div>
        <div class="cal-nav">
          <button class="btn ghost sm" id="prev" type="button">‹</button>
          <button class="btn ghost sm" id="today-btn" type="button">Today</button>
          <button class="btn ghost sm" id="next" type="button">›</button>
        </div>
      </div>
      <div class="sched">
        <div class="card pad">
          <div class="cal-grid dow-row">${DOW.map((d) => `<div class="dow">${d}</div>`).join('')}</div>
          <div class="cal-grid" id="grid"><div class="spinner" style="grid-column:1/-1">Loading…</div></div>
          <div class="heat-legend" id="heat-legend"></div>
        </div>
        <div id="day-panel"></div>
      </div>
    </div>`;
  wireSignout();
  const ga = document.getElementById('go-admin');
  if (ga) ga.onclick = () => renderAdmin();
  document.getElementById('prev').onclick = () => shiftMonth(-1);
  document.getElementById('next').onclick = () => shiftMonth(1);
  document.getElementById('today-btn').onclick = () => {
    const n = new Date();
    sched.view = { year: n.getFullYear(), month: n.getMonth() };
    sched.pendingSelect = TODAY;
    loadSchedule();
  };
  loadSchedule();
}

function buildGrid() {
  const first = new Date(sched.view.year, sched.view.month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(sched.view.year, sched.view.month, 1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

function indexRows() {
  const m = new Map();
  let mx = 0;
  for (const r of sched.rows) {
    if (!m.has(r.day)) m.set(r.day, []);
    m.get(r.day).push(r);
  }
  for (const [, list] of m) mx = Math.max(mx, list.length);
  sched.byDay = m;
  sched.maxCount = mx;
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
  sched.cells = buildGrid();
  const from = toISO(sched.cells[0]);
  const to = toISO(sched.cells[sched.cells.length - 1]);

  const { data, error } = await supabase
    .from('office_days')
    .select('day, user_id, display_name')
    .gte('day', from)
    .lte('day', to)
    .order('day', { ascending: true });

  if (error) {
    const grid = document.getElementById('grid');
    if (grid) grid.innerHTML = `<div class="empty" style="grid-column:1/-1">Couldn't load schedule: ${esc(error.message)}</div>`;
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
  const myMonth = monthRows.filter((r) => r.user_id === me.id).length;
  const teamMonth = monthRows.length;
  const todayList = sched.byDay.get(TODAY) || [];

  const dow = [0, 0, 0, 0, 0, 0, 0];
  for (const r of monthRows) dow[new Date(`${r.day}T00:00:00`).getDay()]++;
  let bestWd = -1, bestN = 0;
  for (let i = 0; i < 7; i++) if (dow[i] > bestN) { bestN = dow[i]; bestWd = i; }

  const todayAvatars =
    todayList.slice(0, 5).map((a) => avatarHTML(a.display_name, a.user_id === me.id, 'sm')).join('') +
    (todayList.length > 5 ? `<span class="avatar sm more">+${todayList.length - 5}</span>` : '');

  el.innerHTML = `
    ${statCard('In office today', todayList.length, `<div class="avatar-stack">${todayAvatars || '<span class="muted-mini">No one yet — be the first</span>'}</div>`, 'today')}
    ${statCard('You this month', myMonth, `<span class="muted-mini">day${myMonth === 1 ? '' : 's'} booked</span>`)}
    ${statCard('Team days booked', teamMonth, '<span class="muted-mini">across the month</span>')}
    ${statCard('Most popular', bestWd >= 0 ? WD_PLURAL[bestWd] : '—', bestWd >= 0 ? `<span class="muted-mini">${bestN} visit${bestN === 1 ? '' : 's'}</span>` : '<span class="muted-mini">no bookings yet</span>')}`;

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

function renderCalendar() {
  const title = document.getElementById('cal-title');
  if (title) title.textContent = `${MONTHS[sched.view.month]} ${sched.view.year}`;
  const grid = document.getElementById('grid');
  if (!grid) return;

  grid.innerHTML = '';
  for (const d of sched.cells) {
    const iso = toISO(d);
    const inMonth = d.getMonth() === sched.view.month;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const list = sched.byDay.get(iso) || [];
    const mine = list.some((a) => a.user_id === me.id);
    const ratio = sched.maxCount ? list.length / sched.maxCount : 0;

    const cell = document.createElement('div');
    cell.className = 'cell'
      + (inMonth ? '' : ' muted')
      + (isWeekend ? ' weekend' : '')
      + (iso === TODAY ? ' today' : '')
      + (iso < TODAY ? ' past' : '')
      + (mine ? ' mine' : '')
      + (iso === sched.selectedDay ? ' selected' : '');
    cell.style.setProperty('--ratio', ratio.toFixed(3));

    const avs = list.slice(0, 3).map((a) => avatarHTML(a.display_name, a.user_id === me.id)).join('');
    const more = list.length > 3 ? `<span class="avatar more">+${list.length - 3}</span>` : '';

    cell.innerHTML = `
      <div class="cell-top">
        <span class="num">${d.getDate()}</span>
        ${list.length ? `<span class="cnt">${list.length}</span>` : ''}
      </div>
      <div class="avatar-stack">${avs}${more}</div>`;
    cell.onclick = () => selectDay(iso);
    grid.appendChild(cell);
  }

  const hl = document.getElementById('heat-legend');
  if (hl) {
    hl.innerHTML = sched.maxCount
      ? `<span class="muted-mini">Quieter</span><span class="heat-scale"></span><span class="muted-mini">Busier (up to ${sched.maxCount})</span>`
      : '<span class="muted-mini">No office days booked this month yet.</span>';
  }
}

function selectDay(iso) {
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
  const iso = sched.selectedDay;
  const dObj = new Date(`${iso}T00:00:00`);
  const isPast = iso < TODAY;
  const isToday = iso === TODAY;
  const list = (sched.byDay.get(iso) || []).slice().sort((a, b) => {
    if (a.user_id === me.id) return -1;
    if (b.user_id === me.id) return 1;
    return (a.display_name || '').localeCompare(b.display_name || '');
  });
  const mine = list.some((a) => a.user_id === me.id);

  const attendeeHTML = list.length
    ? list.map((a) => {
        const meFlag = a.user_id === me.id;
        return `<div class="att">${avatarHTML(a.display_name, meFlag)}<span>${esc(a.display_name || 'Someone')}${meFlag ? ' <span class="muted-mini">(you)</span>' : ''}</span></div>`;
      }).join('')
    : '<div class="empty" style="padding:10px 2px">Nobody scheduled yet.</div>';

  const action = isPast
    ? '<button class="btn ghost full" type="button" disabled>This day has passed</button>'
    : `<button class="btn ${mine ? 'danger' : 'primary'} full" id="toggle-me" type="button">${mine ? '✕ Remove me from this day' : "✓ I'll be in the office"}</button>`;

  panel.innerHTML = `
    <div class="card pad panel">
      <div class="panel-head">
        <div>
          <div class="panel-weekday">${dObj.toLocaleDateString(undefined, { weekday: 'long' })} ${isToday ? '<span class="badge today-badge">Today</span>' : ''}</div>
          <div class="panel-date">${dObj.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        </div>
        <div class="panel-count"><span class="big">${list.length}</span><span class="muted-mini">in office</span></div>
      </div>
      ${action}
      <div class="att-list">${attendeeHTML}</div>
    </div>`;

  const t = document.getElementById('toggle-me');
  if (t) t.onclick = () => toggleMe(iso);
}

async function toggleMe(iso) {
  const wasMine = (sched.byDay.get(iso) || []).some((a) => a.user_id === me.id);
  const myRow = { day: iso, user_id: me.id, display_name: me.full_name || me.email };

  // Optimistic update for instant feedback.
  sched.rows = wasMine
    ? sched.rows.filter((r) => !(r.day === iso && r.user_id === me.id))
    : sched.rows.concat([myRow]);
  indexRows();
  renderAll();

  let error;
  if (wasMine) {
    ({ error } = await supabase.from('office_days').delete().eq('user_id', me.id).eq('day', iso));
  } else {
    ({ error } = await supabase.from('office_days').insert(myRow));
    if (error && error.code === '23505') error = null; // already booked
  }

  if (error) {
    // Revert on failure.
    sched.rows = wasMine
      ? sched.rows.concat([myRow])
      : sched.rows.filter((r) => !(r.day === iso && r.user_id === me.id));
    indexRows();
    renderAll();
    alert(error.message);
  }
}

// ===========================================================================
// Admin dashboard
// ===========================================================================
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
        <div class="pending-row">
          <div style="display:flex; align-items:center; gap:10px;">
            ${avatarHTML(u.full_name || u.email, false)}
            <div>
              <div style="font-weight:600">${esc(u.full_name) || '(no name)'}</div>
              <div class="who">${esc(u.email)} · requested ${fmtDate(u.created_at)}</div>
            </div>
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
        <td><div style="display:flex;align-items:center;gap:10px;">${avatarHTML(u.full_name || u.email, isSelf)}<span>${esc(u.full_name) || '(no name)'} ${isSelf ? '<span class="who">(you)</span>' : ''}</span></div></td>
        <td class="hide-sm">${esc(u.email)}</td>
        <td><span class="badge ${esc(u.role)}">${esc(u.role)}</span></td>
        <td><span class="badge ${esc(u.status)}">${esc(u.status)}</span></td>
        <td class="hide-sm">${fmtDate(u.created_at)}</td>
        <td><div class="actions">${statusActions}${roleToggle}</div></td>
      </tr>`;
  }).join('');
}

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
