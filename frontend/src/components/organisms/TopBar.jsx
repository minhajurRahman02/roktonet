import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Sun, Moon, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDarkMode } from '../../hooks/useDarkMode';

const dropdownMotion = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: -4 },
  transition: { duration: 0.35 },
};

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
  const { user, logout } = useAuth();
  const [isDark, setIsDark] = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const notifRef = useRef(null);

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
    await logout();
    navigate('/login');
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
        {/* Notifications -- placeholder until a real system exists (no
            backend for this yet, per dashboard_specification.md). */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="relative p-2 rounded-lg text-gray-500 dark:text-textsecondary-dark hover:bg-gray-100 dark:hover:bg-white/5"
            aria-label="Notifications"
          >
            <Bell size={18} />
          </button>
          {notifOpen && (
            <AnimatePresence>
              <motion.div
                {...dropdownMotion}
                className="absolute right-0 mt-2 w-56 bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-lg shadow-lg py-3 px-3 z-10 origin-top-right"
              >
                <p className="text-sm text-gray-400 dark:text-textsecondary-dark text-center">No new notifications</p>
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
            <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {initials(user?.full_name || user?.org_name)}
            </div>
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
                <a href="#" className="block px-3 py-2 text-sm text-gray-700 dark:text-textsecondary-dark hover:bg-gray-50 dark:hover:bg-white/5">
                  My profile
                </a>
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