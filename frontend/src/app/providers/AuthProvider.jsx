import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, onUnauthorized, setCsrfToken } from '../../services/apiClient.js';
import { useToast } from './ToastProvider.jsx';

const AuthContext = createContext(null);

// Concurrent callers (e.g. StrictMode's double effect) share one /auth/me request.
// Two parallel cookie-less requests would otherwise open two different sessions.
let sessionRequest = null;
function fetchSession() {
  sessionRequest ??= api.get('/auth/me').finally(() => {
    sessionRequest = null;
  });
  return sessionRequest;
}

/**
 * Holds the authenticated user. On start-up asks the server who we are
 * (GET /auth/me), which also issues the CSRF token for later mutations.
 *
 * status: 'loading' | 'authenticated' | 'anonymous' | 'error'
 */
export function AuthProvider({ children }) {
  const toast = useToast();
  const [state, setState] = useState({ status: 'loading', user: null, error: null });

  const loadSession = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const data = await fetchSession();
      setCsrfToken(data.csrfToken);
      setState({ status: data.user ? 'authenticated' : 'anonymous', user: data.user, error: null });
      if (data.sessionExpired) toast.info('Your session expired. Please log in again.');
    } catch (error) {
      setState({ status: 'error', user: null, error });
    }
  }, [toast]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // A protected API call found the session gone (expired or logged out elsewhere).
  useEffect(() => onUnauthorized((code) => {
    setState({ status: 'anonymous', user: null, error: null });
    toast.info(code === 'SESSION_EXPIRED' ? 'Your session expired. Please log in again.' : 'Please log in to continue.');
  }), [toast]);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password }, { source: 'auth' });
    setCsrfToken(data.csrfToken);
    setState({ status: 'authenticated', user: data.user, error: null });
    return data.user;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const data = await api.post('/auth/register', { name, email, password }, { source: 'auth' });
    setCsrfToken(data.csrfToken);
    setState({ status: 'authenticated', user: data.user, error: null });
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', undefined, { source: 'auth' });
    } finally {
      setState({ status: 'anonymous', user: null, error: null });
      // Fresh anonymous session → fresh CSRF token for the next login.
      api.get('/auth/csrf').then((d) => setCsrfToken(d.csrfToken)).catch(() => {});
    }
  }, []);

  const value = useMemo(
    () => ({ ...state, login, register, logout, retry: loadSession }),
    [state, login, register, logout, loadSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
