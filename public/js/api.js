// Tiny fetch wrapper for our JSON API. Sends the session cookie (same-origin)
// and turns non-2xx responses into thrown Errors carrying the server message.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no JSON body */
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Returns the current user ({ id, email, fullName, role, status }) or null.
export async function getMe() {
  const { user } = await api('/api/auth/me');
  return user;
}

export function logout() {
  return api('/api/auth/logout', { method: 'POST' });
}

// Build the brand markup used in top bars.
export function brandHTML() {
  return '<span class="brand"><span class="mark"></span><span class="name">RED<span>LINE</span></span></span>';
}
