import { api, getMe, logout } from './api.js';

const who = document.getElementById('who');
const message = document.getElementById('message');
const pendingEl = document.getElementById('pending');
const pendingCount = document.getElementById('pending-count');
const usersBody = document.getElementById('users-body');

document.getElementById('logout').addEventListener('click', async () => {
  await logout().catch(() => {});
  window.location.href = '/';
});

let me = null;

function flash(text, type = 'success') {
  message.textContent = text;
  message.className = `msg show ${type}`;
  setTimeout(() => { message.className = 'msg'; }, 3500);
}

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function load() {
  let users;
  try {
    ({ users } = await api('/api/admin/users'));
  } catch (err) {
    pendingEl.innerHTML = `<div class="empty">Couldn't load users: ${esc(err.message)}</div>`;
    usersBody.innerHTML = `<tr><td colspan="6" class="empty">${esc(err.message)}</td></tr>`;
    return;
  }

  renderPending(users.filter((u) => u.status === 'pending'));
  renderTable(users);
}

function renderPending(pending) {
  pendingCount.textContent = pending.length ? `(${pending.length})` : '';
  if (!pending.length) {
    pendingEl.innerHTML = '<div class="empty">No pending requests. You\'re all caught up. 🎉</div>';
    return;
  }
  pendingEl.innerHTML = pending
    .map(
      (u) => `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 2px; border-bottom:1px solid var(--border);">
        <div>
          <div style="font-weight:600">${esc(u.fullName) || '(no name)'}</div>
          <div class="who">${esc(u.email)} · requested ${fmtDate(u.createdAt)}</div>
        </div>
        <div class="actions">
          <button class="btn green sm" data-act="approve" data-id="${u.id}">Approve</button>
          <button class="btn danger sm" data-act="deny" data-id="${u.id}">Deny</button>
        </div>
      </div>`
    )
    .join('');
}

function renderTable(users) {
  if (!users.length) {
    usersBody.innerHTML = '<tr><td colspan="6" class="empty">No employees yet.</td></tr>';
    return;
  }
  usersBody.innerHTML = users
    .map((u) => {
      const isSelf = u.id === me.id;
      const roleToggle =
        u.role === 'admin'
          ? `<button class="btn ghost sm" data-act="make-employee" data-id="${u.id}" ${isSelf ? 'disabled title="You cannot demote yourself"' : ''}>Make employee</button>`
          : `<button class="btn ghost sm" data-act="make-admin" data-id="${u.id}">Make admin</button>`;
      const statusActions =
        u.status === 'approved'
          ? (isSelf ? '' : `<button class="btn danger sm" data-act="deny" data-id="${u.id}">Revoke</button>`)
          : `<button class="btn green sm" data-act="approve" data-id="${u.id}">Approve</button>` +
            (u.status === 'pending' ? `<button class="btn danger sm" data-act="deny" data-id="${u.id}">Deny</button>` : '');
      return `
        <tr>
          <td>${esc(u.fullName) || '(no name)'} ${isSelf ? '<span class="who">(you)</span>' : ''}</td>
          <td class="hide-sm">${esc(u.email)}</td>
          <td><span class="badge ${u.role}">${u.role}</span></td>
          <td><span class="badge ${u.status}">${u.status}</span></td>
          <td class="hide-sm">${fmtDate(u.createdAt)}</td>
          <td><div class="actions">${statusActions}${roleToggle}</div></td>
        </tr>`;
    })
    .join('');
}

// Event delegation for all action buttons.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const { act, id } = btn.dataset;
  btn.disabled = true;
  try {
    if (act === 'approve') {
      await api(`/api/admin/users/${id}/approve`, { method: 'POST' });
      flash('Approved.');
    } else if (act === 'deny') {
      await api(`/api/admin/users/${id}/deny`, { method: 'POST' });
      flash('Updated.');
    } else if (act === 'make-admin') {
      await api(`/api/admin/users/${id}/role`, { method: 'POST', body: { role: 'admin' } });
      flash('Promoted to admin.');
    } else if (act === 'make-employee') {
      await api(`/api/admin/users/${id}/role`, { method: 'POST', body: { role: 'employee' } });
      flash('Set to employee.');
    }
    await load();
  } catch (err) {
    flash(err.message, 'error');
    btn.disabled = false;
  }
});

// ---- Boot ----
(async () => {
  try {
    me = await getMe();
  } catch {
    me = null;
  }
  if (!me) { window.location.href = '/'; return; }
  if (me.role !== 'admin') { window.location.href = '/portal.html'; return; }
  who.innerHTML = `Signed in as <strong>${esc(me.fullName)}</strong>`;
  load();
})();
