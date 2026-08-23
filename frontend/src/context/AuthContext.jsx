import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import * as authApi from '../api/auth';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Starts true: we don't know yet whether a session cookie exists until
  // the first getMe() call resolves. Every consumer must handle this
  // "still checking" state, not just logged-in/logged-out (see
  // frontend_standards.md's 5-state matrix -- this IS the loading state).
  const [isLoading, setIsLoading] = useState(true);

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

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    register,
    refreshUser: checkSession,
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
