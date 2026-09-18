import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const ADMIN_RETURN_PATH = '/admin/users';

/**
 * Shown on every page while an admin view-as session is active (Phase
 * 7.7, spec 2.5). Non-dismissible on purpose: the admin must always be
 * able to see they're looking through someone else's eyes, and the only
 * way out is the explicit exit -- which restores their own session and
 * sends them back to the Users page they started from.
 */
export default function ViewAsBanner() {
  const { viewAs, exitViewAs } = useAuth();
  const navigate = useNavigate();
  const [remaining, setRemaining] = useState('');

  // 7.7a: the navigation is handed to exitViewAs rather than run after
  // it. Previously this awaited exitViewAs() and THEN called navigate --
  // but the await flipped the role back to admin while still mounted on
  // the viewed user's page, RoleRoute redirected to /unauthorized, this
  // banner unmounted with it, and the navigate never ran. Passing the
  // callback in means the route moves inside the same window where
  // RoleRoute is holding.
  const handleExit = useCallback(async () => {
    await exitViewAs(() => navigate(ADMIN_RETURN_PATH));
  }, [exitViewAs, navigate]);

  useEffect(() => {
    if (!viewAs) return undefined;
    const tick = () => {
      const s = Math.max(0, Math.floor((viewAs.expiresAt - Date.now()) / 1000));
      setRemaining(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
      // Expiry lands the admin back on their own page rather than
      // dumping them on /unauthorized. AuthContext has its own expiry
      // timer as a safety net for when this banner isn't mounted, but it
      // has no router access, so the navigation belongs here. Both are
      // idempotent; whichever fires first wins.
      if (s === 0) handleExit();
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [viewAs, handleExit]);

  if (!viewAs) return null;
  const { full_name, email, role } = viewAs.viewing;

  return (
    <div className="bg-urgent-bg dark:bg-urgent-dbg text-urgent-text dark:text-urgent-dtext text-sm px-4 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-urgent-border/30">
      <span className="flex items-center gap-2">
        <Eye size={16} className="shrink-0" />
        <span>
          <b>Viewing as {full_name || email} ({role})</b> — read-only session, expires in{' '}
          <span className="font-mono">{remaining}</span>. Nothing you do here will be saved.
        </span>
      </span>
      <button onClick={handleExit} className="font-medium underline shrink-0">
        Exit view-as →
      </button>
    </div>
  );
}