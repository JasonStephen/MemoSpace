const authMode = document.body.dataset.authMode;
const form = document.getElementById('authForm');
const errorEl = document.getElementById('authError');

function setError(message = '') {
  if (errorEl) errorEl.textContent = message;
}

async function fetchStatus() {
  const response = await fetch('/api/auth/status', { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to get auth status');
  return response.json();
}

async function initAuthPage() {
  const status = await fetchStatus();
  if (status.authenticated) {
    window.location.href = '/personal/music';
    return;
  }
  if (authMode === 'login' && !status.has_account) {
    window.location.href = '/auth/register';
    return;
  }
  if (authMode === 'register' && status.has_account) {
    window.location.href = '/auth/login';
  }
}

async function submitLogin(username, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Login failed.');
  }
}

async function submitRegister(username, password) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Register failed.');
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError('');

  const formData = new FormData(form);
  const username = (formData.get('username') || '').toString().trim();
  const password = (formData.get('password') || '').toString();
  const confirmPassword = (formData.get('confirm_password') || '').toString();

  if (!username || !password) {
    setError('请输入用户名和密码。');
    return;
  }
  if (authMode === 'register' && password !== confirmPassword) {
    setError('两次密码不一致。');
    return;
  }

  try {
    if (authMode === 'register') {
      await submitRegister(username, password);
    } else {
      await submitLogin(username, password);
    }
    window.location.href = '/personal/music';
  } catch (error) {
    setError(error.message || '请求失败');
  }
});

initAuthPage().catch((error) => {
  setError(error.message || '初始化失败');
});
