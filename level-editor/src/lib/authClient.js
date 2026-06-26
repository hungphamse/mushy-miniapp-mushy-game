export async function fetchAuthSession() {
  return authRequest('/api/auth/session', { method: 'GET' });
}

export async function signInWithPassword(email, password) {
  return authRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function signOut() {
  return authRequest('/api/auth/logout', { method: 'POST' });
}

async function authRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Authentication request failed.');
  }

  return data;
}
