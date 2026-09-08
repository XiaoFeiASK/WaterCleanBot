import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from './auth-api';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.allSettled([authApi.getCurrentUser(), authApi.getAuthConfig()]).then(([me, config]) => {
      if (!active) return;
      if (me.status === 'fulfilled') setUser(me.value.user);
      if (config.status === 'fulfilled') setRegistrationEnabled(config.value.registrationEnabled);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const signIn = useCallback(async (data) => { const result = await authApi.login(data); setUser(result.user); return result.user; }, []);
  const signUp = useCallback(async (data) => { const result = await authApi.register(data); setUser(result.user); return result.user; }, []);
  const signOut = useCallback(async () => { try { await authApi.logout(); } finally { setUser(null); } }, []);
  const saveProfile = useCallback(async (data) => { const result = await authApi.updateProfile(data); setUser(result.user); return result.user; }, []);
  const savePassword = useCallback((data) => authApi.changePassword(data), []);
  const value = useMemo(() => ({ user, loading, registrationEnabled, signIn, signUp, signOut, saveProfile, savePassword }), [user, loading, registrationEnabled, signIn, signUp, signOut, saveProfile, savePassword]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used within AuthProvider'); return value; }
