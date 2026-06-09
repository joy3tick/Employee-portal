import { api, getMe, logout } from './api.js';

const who = document.getElementById('who');
const adminLink = document.getElementById('admin-link');
const content = document.getElementById('content');
document.getElementById('logout').addEventListener('click', async () => {
  await logout().catch(() => {});
  window.location.href = '/';
});

// ---- Date helpers (work in local time, output YYYY-MM-DD) ----
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = toISO(new Date());
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // Monday-first

let me = null;
let view = (() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; })();

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'Someone';
}

function statusCard() {
  const pending = me.status === 'pending';
  content.innerHTML = `
    <div class="card pad" style="max-width:560px; margin:40px auto; text-align:center;">
      <div class="badge ${me.status}" style="font-size:0.85rem; margin-bottom:14px;">${me.status}</div>
      <h1>${pending ? 'Your account is awaiting approval' : 'Account not approved'}</h1>
      <p class="subtitle" style="margin-top:8px;">
        ${pending
          ? 'An admin needs to approve your account before you can schedule office days. Check back soon!'
          : 'Your access request was denied. If you think this is a mistake, contact your administrator.'}
      </p>
    </div>`;
}

// Build the 6-week (42 cell) Monday-first grid for the current view month.
function buildGrid() {
  const first = new Date(view.year, view.month, 1);
  const offset = (first.getDay() + 6) % 7; // days from Monday
  const start = new Date(view.year, view.month, 1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

async function renderCalendar() {
  content.innerHTML = `
    <div class="card pad">
      <div class="cal-head">
        <div>
          <div class="cal-title" id="cal-title"></div>
        </div>
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
      <div class="cal-grid" id="dow-row" style="margin-top:14px;">
        ${DOW.map((d) => `<div class="dow">${d}</div>`).join('')}
      </div>
      <div class="cal-grid" id="grid" style="margin-top:8px;">
        <div class="spinner" style="grid-column:1/-1">Loading schedule…</div>
      </div>
    </div>`;

  document.getElementById('cal-title').textContent = `${MONTHS[view.month]} ${view.year}`;
  document.getElementById('prev').onclick = () => { shiftMonth(-1); };
  document.getElementById('next').onclick = () => { shiftMonth(1); };
  document.getElementById('today-btn').onclick = () => {
    const n = new Date();
    view = { year: n.getFullYear(), month: n.getMonth() };
    renderCalendar();
  };

  const cells = buildGrid();
  const from = toISO(cells[0]);
  const to = toISO(cells[cells.length - 1]);

  let byDay = new Map();
  try {
    const { days } = await api(`/api/office-days?from=${from}&to=${to}`);
    for (const entry of days) {
      if (!byDay.has(entry.day)) byDay.set(entry.day, []);
      byDay.get(entry.day).push(entry);
    }
  } catch (err) {
    document.getElementById('grid').innerHTML =
      `<div class="empty" style="grid-column:1/-1">Couldn't load schedule: ${err.message}</div>`;
    return;
  }

  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (const d of cells) {
    const iso = toISO(d);
    const inMonth = d.getMonth() === view.month;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const isPast = iso < TODAY;
    const attendees = byDay.get(iso) || [];
    const mine = attendees.some((a) => a.isMe);

    const cell = document.createElement('div');
    cell.className = 'cell';
    if (!inMonth) cell.classList.add('muted');
    if (isWeekend) cell.classList.add('weekend');
    if (iso === TODAY) cell.classList.add('today');
    if (isPast) cell.classList.add('past');
    if (mine) cell.classList.add('mine');

    const others = attendees.filter((a) => !a.isMe);
    const chips = [];
    if (mine) chips.push('<span class="chip" style="background:var(--accent);color:#fff">You</span>');
    others.slice(0, mine ? 2 : 3).forEach((a) => {
      chips.push(`<span class="chip">${firstName(a.name)}</span>`);
    });
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
  try {
    if (currentlyMine) {
      await api(`/api/office-days/${iso}`, { method: 'DELETE' });
    } else {
      await api('/api/office-days', { method: 'POST', body: { day: iso } });
    }
    await renderCalendar();
  } catch (err) {
    alert(err.message);
    cell.style.pointerEvents = '';
  }
}

function shiftMonth(delta) {
  let m = view.month + delta;
  let y = view.year;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  view = { year: y, month: m };
  renderCalendar();
}

// ---- Boot ----
(async () => {
  try {
    me = await getMe();
  } catch {
    me = null;
  }
  if (!me) {
    window.location.href = '/';
    return;
  }
  who.innerHTML = `Signed in as <strong>${firstName(me.fullName)}</strong>`;
  if (me.role === 'admin') adminLink.style.display = '';

  if (me.status !== 'approved') {
    statusCard();
  } else {
    renderCalendar();
  }
})();
