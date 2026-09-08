const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ''
).replace(/\/$/, '');

export class AuthError extends Error {
  constructor(message, code = 'request_failed', status = 0, fields = {}) {
    super(message);
    this.name = 'AuthError'; this.code = code; this.status = status; this.fields = fields;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
      cache: 'no-store',
      ...options,
    });
  } catch {
    throw new AuthError('无法连接账号服务，请检查后端是否启动');
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error || {};
    throw new AuthError(error.message || '账号服务请求失败', error.code, response.status, error.fields || {});
  }
  return payload;
}

export const getAuthConfig = () => request('/api/auth/config');
export const getCurrentUser = () => request('/api/auth/me');
export const login = (data) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
export const register = (data) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) });
export const logout = () => request('/api/auth/logout', { method: 'POST' });
export const updateProfile = (data) => request('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(data) });
export const changePassword = (data) => request('/api/auth/change-password', { method: 'POST', body: JSON.stringify(data) });
