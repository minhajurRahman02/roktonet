import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import * as authApi from '../api/auth';
import { getViewAs, setViewAs, clearViewAs } from '../utils/viewAs';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Starts true: we don't know yet whether a session cookie exists until
  // the first getMe() call resolves. Every consumer must handle this
  // "still checking" state, not just logged-in/logged-out (see
  // frontend_standards.md's 5-state matrix -- this IS the loading state).
  const [isLoading, setIsLoading] = useState(true);
  // Admin view-as (Phase 7.7): when set, every API call carries the
  // read-only token (see api/client.js) and `user` becomes the VIEWED
  // user, so the viewed role's own dashboard renders unchanged. The
  // admin's real cookie session is untouched underneath.
  const [viewAs, setViewAsState] = useState(() => getViewAs());

  const checkSession = useCallback(async () => {
    try {
      const me = await authApi.getMe();
      setUser(me);
    } catch {
      // A 401 here just means "not logged in" -- not an error worth
      // surfacing, so we don't set any error state, just clear the user.
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Restore session on first load (e.g. page refresh) by asking the
  // backend who the current cookie belongs to.
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = useCallback(async (email, password) => {
    await authApi.login(email, password); // sets the httpOnly cookie server-side
    // Re-fetch via getMe() rather than trusting login's response directly,
    // so `user` always has the same shape (joined org info included)
    // whether it came from a fresh login or a session restore on refresh.
    const me = await authApi.getMe();
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  // Registration does NOT log the user in -- accounts require email
  // verification first (Phase 7.1), so there's deliberately no session
  // to establish yet.
  const register = useCallback((data) => authApi.register(data), []);

  const startViewAs = useCallback(async (token, viewing, expiresIn) => {
    setViewAs(token, viewing, expiresIn);
    setViewAsState(getViewAs());
    await checkSession(); // now resolves as the viewed user
  }, [checkSession]);

  const exitViewAs = useCallback(async () => {
    clearViewAs();
    setViewAsState(null);
    await checkSession(); // back to the admin's cookie session
  }, [checkSession]);

  // A view-as token expires server-side after 10 minutes. Drop it client-
  // side at the same moment so the UI doesn't sit on a dead token until
  // the next request 401s.
  useEffect(() => {
    if (!viewAs) return undefined;
    const ms = Math.max(0, viewAs.expiresAt - Date.now());
    const t = setTimeout(() => { exitViewAs(); }, ms);
    return () => clearTimeout(t);
  }, [viewAs, exitViewAs]);

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    register,
    refreshUser: checkSession,
    viewAs,
    startViewAs,
    exitViewAs,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
