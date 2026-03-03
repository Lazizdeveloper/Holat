/* eslint-disable no-console */
const API_BASE = (process.env.SMOKE_API_BASE || 'http://localhost:4000/api').replace(
  /\/$/,
  '',
);

async function request(path, { method = 'GET', token, body, expectFail } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const raw = await res.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { message: raw };
    }
  }

  if (!res.ok && !expectFail) {
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : data?.message || `Request failed (${res.status})`;
    throw new Error(`${method} ${path} -> ${message}`);
  }

  return { ok: res.ok, status: res.status, data };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  console.log(`[integration] API base: ${API_BASE}`);
  const now = Date.now();
  const suffix = String(now).slice(-6);

  const health = await request('/health');
  assert(health.ok, 'health endpoint is not available');

  const register = await request('/auth/register/citizen', {
    method: 'POST',
    body: {
      fullName: `Integration Citizen ${suffix}`,
      email: `integration-citizen-${now}@example.com`,
      password: 'ValidPass123!',
      pinfl: `${Math.floor(10000000000000 + Math.random() * 89999999999999)}`,
      phone: '+998901112233',
      region: 'Toshkent shahri',
    },
  });
  assert(register.ok, 'register citizen failed');
  const email = register.data.user.email;

  const maxAttempts = Number(process.env.AUTH_MAX_LOGIN_ATTEMPTS || 5);
  for (let index = 0; index < maxAttempts; index += 1) {
    const badLogin = await request('/auth/login', {
      method: 'POST',
      body: { email, password: 'WrongPassword!' },
      expectFail: true,
    });
    assert(badLogin.status === 401, 'invalid login should return 401');
  }
  console.log('[integration] login attempt lockout: ok');

  const lockedValidLogin = await request('/auth/login', {
    method: 'POST',
    body: { email, password: 'ValidPass123!' },
    expectFail: true,
  });
  assert(
    lockedValidLogin.status === 401,
    'locked account should reject valid password',
  );
  console.log('[integration] locked account behavior: ok');

  const metrics = await request('/metrics');
  assert(metrics.ok, 'metrics endpoint failed');
  assert(
    typeof metrics.data?.enabled === 'boolean',
    'metrics payload is invalid',
  );
  console.log('[integration] metrics endpoint: ok');

  console.log('[integration] all checks passed');
}

run().catch((error) => {
  console.error(`[integration] failed: ${error.message}`);
  process.exit(1);
});
