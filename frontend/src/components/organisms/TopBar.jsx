import { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Sun, Moon, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDarkMode } from '../../hooks/useDarkMode';
import { getNotifications, markNotificationRead } from '../../api/notifications';
import { relativeTime } from '../../utils/relativeTime';

const dropdownMotion = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: -4 },
  transition: { duration: 0.35 },
};

// Not tied to an open modal like the request-tracking log (which polls at
// 2s), so this is a much lighter interval -- the bell just needs to feel
// reasonably current in the background, not real-time.
const POLL_INTERVAL_MS = 30000;

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function TopBar({ breadcrumbs }) {
  const { user, logout, viewAs, exitViewAs } = useAuth();
  const [isDark, setIsDark] = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const loadNotifications = useCallback(() => {
    getNotifications()
      .then(setNotifications)
      .catch(() => { }); // fails soft -- a stale/empty bell isn't worth surfacing an error for
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Close either dropdown when clicking anywhere outside it.
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    // 7.7a: during view-as, "log out" means leave the view-as session,
    // not end the admin's real one. The admin is not logged in as this
    // person in the first place -- their own cookie is still underneath.
    //
    // Before this, the POST to /auth/logout was rejected by the read-only
    // guard, the throw escaped an unguarded await, and the hard
    // navigation below never ran. The button did nothing and said nothing.
    if (viewAs) {
      await exitViewAs();
      window.location.href = '/admin/users';
      return;
    }
    // Wrapped because a failed logout must never strand someone on a page
    // they are trying to leave. The cookie is httpOnly so we cannot clear
    // it here, but the hard navigation below at least gets them to the
    // login screen rather than leaving the button apparently dead.
    try {
      await logout();
    } catch (err) {
      console.error('[TopBar] logout request failed, navigating anyway:', err.message);
    }
    // A hard navigation, not react-router's navigate(). Clearing the user
    // above can itself trigger ProtectedRoute's own redirect-to-login
    // (since we're still mounted on a now-unauthenticated protected page
    // for a moment), which races against this call and can leave a stale
    // location.state.from pointing at whatever page we just logged out
    // of. The next person to log in -- possibly a completely different
    // role -- would then get sent straight at that stale destination
    // instead of their own dashboard. A full page load wipes all router
    // state outright, so there's nothing left to race.
    window.location.href = '/login';
  }

  function handleNotificationClick(notification) {
    // 7.7a: in a view-as session the mark-read POST is refused by the
    // read-only guard, which is correct -- an admin looking at someone's
    // inbox must not consume their unread state. But the optimistic flip
    // below would still show the dot clearing, i.e. display an outcome
    // that did not happen. Skip both, and the inbox reads exactly as the
    // donor would see it.
    if (!viewAs) {
      // Optimistic -- flip it locally right away, don't wait on the network
      // round-trip before the dot disappears.
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === notification.notification_id ? { ...n, is_read: true } : n))
      );
      markNotificationRead(notification.notification_id).catch(() => { });
    }

    if (notification.related_request_id && user?.role === 'hospital') {
      setNotifOpen(false);
      navigate(`/hospital/requests/${notification.related_request_id}`);
    }
  }

  return (
    <header className="h-14 shrink-0 bg-white dark:bg-surface-dark border-b border-gray-200 dark:border-white/10 flex items-center justify-between px-5">
      {/* Breadcrumbs -- a simple trail today (role name + one page), built
          to extend as 7.7/7.8 add real sub-pages under each role. */}
      <div className="flex items-center gap-1.5 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb} className="flex items-center gap-1.5">
            {i > 0 && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 dark:text-white/20">
                <path d="M9 18l6-6-6-6" />
              </svg>
            )}
            <span className={i === breadcrumbs.length - 1 ? 'font-medium dark:text-textprimary-dark' : 'text-gray-400 dark:text-textsecondary-dark'}>
              {crumb}
            </span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="relative p-2 rounded-lg text-gray-500 dark:text-textsecondary-dark hover:bg-gray-100 dark:hover:bg-white/5"
            aria-label="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-critical-text dark:bg-critical-dtext" />
            )}
          </button>
          {notifOpen && (
            <AnimatePresence>
              <motion.div
                {...dropdownMotion}
                className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-lg shadow-lg py-2 z-10 origin-top-right"
              >
                {notifications.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-textsecondary-dark text-center py-3">
                    No notifications
                  </p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.notification_id}
                      onClick={() => handleNotificationClick(n)}
                      className={`w-full text-left px-3 py-2.5 text-sm border-b border-gray-50 dark:border-white/5 last:border-0 hover:bg-gray-50 dark:hover:bg-white/5 ${n.is_read ? 'text-gray-500 dark:text-textsecondary-dark' : 'text-textprimary dark:text-textprimary-dark font-medium'
                        }`}
                    >
                      <p>{n.message}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{relativeTime(n.created_at)}</p>
                    </button>
                  ))
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <button
          onClick={() => setIsDark((d) => !d)}
          className="p-2 rounded-lg text-gray-500 dark:text-textsecondary-dark hover:bg-gray-100 dark:hover:bg-white/5"
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-1" />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5"
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {initials(user?.full_name || user?.org_name)}
              </div>
            )}
            <div className="text-left leading-tight hidden sm:block">
              <p className="text-xs font-medium dark:text-textprimary-dark">{user?.full_name || user?.org_name || 'Account'}</p>
              <p className="text-[10px] text-gray-400 dark:text-textsecondary-dark capitalize">{user?.role}</p>
            </div>
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {menuOpen && (
            <AnimatePresence>
              <motion.div
                {...dropdownMotion}
                className="absolute right-0 mt-2 w-44 bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-lg shadow-lg py-1 z-10 origin-top-right"
              >
                <button
                  onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                  className="w-full text-left block px-3 py-2 text-sm text-gray-700 dark:text-textsecondary-dark hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  My profile
                </button>
                <a href="#" className="block px-3 py-2 text-sm text-gray-700 dark:text-textsecondary-dark hover:bg-gray-50 dark:hover:bg-white/5">
                  Settings
                </a>
                <div className="border-t border-gray-100 dark:border-white/10 my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-critical-text dark:text-critical-dtext hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <LogOut size={14} /> Log out
                </button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </header>
  );
}

TopBar.propTypes = {
  breadcrumbs: PropTypes.arrayOf(PropTypes.string).isRequired,
};