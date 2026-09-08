import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getAuthConfig, login } from './auth-api';

describe('auth api', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('sends credentials with login requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ user: { id: '1' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await login({ login: 'waterbot', password: 'safe-password', rememberMe: false });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });
  it('reads registration config', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ registrationEnabled: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(getAuthConfig()).resolves.toEqual({ registrationEnabled: false });
  });
});
