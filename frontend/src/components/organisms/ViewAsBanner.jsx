import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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

  useEffect(() => {
    if (!viewAs) return undefined;
    const tick = () => {
      const s = Math.max(0, Math.floor((viewAs.expiresAt - Date.now()) / 1000));
      setRemaining(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [viewAs]);

  if (!viewAs) return null;
  const { full_name, email, role } = viewAs.viewing;

  const handleExit = async () => {
    await exitViewAs();
    navigate('/admin/users');
  };

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
