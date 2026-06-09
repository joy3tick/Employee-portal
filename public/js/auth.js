import { api, getMe } from './api.js';

const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const message = document.getElementById('message');

function showMessage(text, type = 'error') {
  message.textContent = text;
  message.className = `msg show ${type}`;
}
function clearMessage() {
  message.className = 'msg';
}

function selectTab(which) {
  const login = which === 'login';
  tabLogin.classList.toggle('active', login);
  tabSignup.classList.toggle('active', !login);
  loginForm.style.display = login ? '' : 'none';
  signupForm.style.display = login ? 'none' : '';
  clearMessage();
}

tabLogin.addEventListener('click', () => selectTab('login'));
tabSignup.addEventListener('click', () => selectTab('signup'));

function destinationFor(user) {
  return user.role === 'admin' ? '/admin.html' : '/portal.html';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();
  const btn = loginForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const { user } = await api('/api/auth/login', {
      method: 'POST',
      body: {
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value,
      },
    });
    window.location.href = destinationFor(user);
  } catch (err) {
    showMessage(err.message);
    btn.disabled = false;
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();
  const btn = signupForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const res = await api('/api/auth/signup', {
      method: 'POST',
      body: {
        name: document.getElementById('signup-name').value,
        email: document.getElementById('signup-email').value,
        password: document.getElementById('signup-password').value,
      },
    });
    signupForm.reset();
    selectTab('login');
    showMessage(res.message || 'Account created! Awaiting admin approval.', 'success');
  } catch (err) {
    showMessage(err.message);
    btn.disabled = false;
  }
});

// If already signed in, skip the login screen.
getMe()
  .then((user) => {
    if (user) window.location.href = destinationFor(user);
  })
  .catch(() => {});
