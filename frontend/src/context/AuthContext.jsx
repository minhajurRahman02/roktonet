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

  // ---------------------------------------------------------------------
  // 7.7a: `switching` fixes the "Your account (donor) doesn't have access
  // to this page" warning on entering and leaving view-as.
  //
  // THE BUG. RoleRoute does not render a message, it does
  // <Navigate to="/unauthorized" replace />. Entering view-as awaited
  // checkSession(), which flipped user.role to 'donor' WHILE the router
  // was still sitting on /admin/users/:id. RoleRoute(['admin']) saw the
  // mismatch on the very next render and redirected, which UNMOUNTED
  // UserDetail -- so the navigate(ROLE_HOME[...]) on the following line
  // ran from a dead component and was swallowed. Exiting was the mirror
  // image: role flips to 'admin' while on /donor/overview, RoleRoute
  // redirects, ViewAsBanner unmounts (it lives inside AppShell, inside
  // RoleRoute), and its navigate was swallowed too. Both times the user
  // was parked on /unauthorized, and that page's "Go to your dashboard"
  // button was silently doing the routing the code had intended.
  //
  // WHY NOT JUST NAVIGATE FIRST. Because that fails symmetrically:
  // navigating to /bank/overview while still an admin makes
  // RoleRoute(['bank']) reject the admin instead. There is no ordering of
  // two independent state changes that avoids a mismatched frame.
  //
  // So the route change and the identity change have to happen inside one
  // window where RoleRoute declines to judge at all. `switching` is that
  // window; RoleRoute holds while it is true.
  //
  // The navigation is passed IN as a callback rather than done here,
  // because AuthProvider wraps BrowserRouter in App.jsx and therefore
  // cannot call useNavigate itself.
  // ---------------------------------------------------------------------
  const [switching, setSwitching] = useState(false);

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

  /**
   * @param {string} token
   * @param {object} viewing
   * @param {string} expiresIn
   * @param {Function} [navigateTo] - called after the token is stored but
   *   before the identity swap resolves, so the route and the role change
   *   inside the same `switching` window.
   */
  const startViewAs = useCallback(async (token, viewing, expiresIn, navigateTo) => {
    setSwitching(true);
    try {
      setViewAs(token, viewing, expiresIn);
      setViewAsState(getViewAs());
      if (navigateTo) navigateTo();
      await checkSession(); // now resolves as the viewed user
    } finally {
      setSwitching(false);
    }
  }, [checkSession]);

  /** @param {Function} [navigateTo] - see startViewAs. */
  const exitViewAs = useCallback(async (navigateTo) => {
    setSwitching(true);
    try {
      clearViewAs();
      setViewAsState(null);
      if (navigateTo) navigateTo();
      await checkSession(); // back to the admin's cookie session
    } finally {
      setSwitching(false);
    }
  }, [checkSession]);

  // A view-as token expires server-side after 10 minutes. Drop it client-
  // side at the same moment so the UI doesn't sit on a dead token until
  // the next request 401s.
  //
  // No navigation here on purpose: this is the safety net that runs even
  // if the banner is unmounted, and it has no router access. ViewAsBanner
  // owns the navigation on expiry, since it is the thing actually
  // counting down. Both are idempotent, so whichever fires first wins and
  // the other is a no-op.
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
    switching,
    startViewAs,
    exitViewAs,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}