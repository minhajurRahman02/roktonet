import { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Button from '../../components/atoms/Button';
import Input from '../../components/atoms/Input';
import { useAsync } from '../../hooks/useAsync';
import { listUsers, previewBroadcast, sendBroadcast, listBroadcasts } from '../../api/admin';
import { relativeTime } from '../../utils/relativeTime';

const ROLES = [['hospital', 'Hospitals'], ['bank', 'Blood banks'], ['ngo', 'NGOs'], ['donor', 'Donors'], ['admin', 'Admins']];

export default function AdminBroadcasts() {
  const [message, setMessage] = useState('');
  const [roles, setRoles] = useState([]);
  const [picked, setPicked] = useState([]); // [{user_id, full_name, email, role}]
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState({ ok: '', err: '' });
  const allUsers = useAsync(() => listUsers({ is_active: 'true' }), []);
  const history = useAsync(() => listBroadcasts(), []);

  const roleCounts = useMemo(() => {
    const c = {};
    (allUsers.data || []).forEach((u) => { c[u.role] = (c[u.role] || 0) + 1; });
    return c;
  }, [allUsers.data]);

  const matches = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return (allUsers.data || []).filter((u) => !picked.some((p) => p.user_id === u.user_id) && ((u.full_name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))).slice(0, 8);
  }, [search, allUsers.data, picked]);

  // Live recipient count -- the same resolver the send uses, so the number
  // shown is exactly the number that will be reached.
  useEffect(() => {
    if (!roles.length && !picked.length) { setPreview(null); return undefined; }
    const t = setTimeout(() => {
      previewBroadcast({ roles, user_ids: picked.map((p) => p.user_id) }).then(setPreview).catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(t);
  }, [roles, picked]);

  const toggleRole = (r) => setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));

  const send = async (e) => {
    e.preventDefault();
    setSending(true); setResult({ ok: '', err: '' });
    try {
      const res = await sendBroadcast({ message: message.trim(), roles, user_ids: picked.map((p) => p.user_id) });
      setResult({ ok: `Broadcast sent to ${res.recipient_count} recipient(s).`, err: '' });
      setMessage(''); setRoles([]); setPicked([]); setPreview(null);
      history.refresh();
    } catch (err) { setResult({ ok: '', err: err.message }); } finally { setSending(false); }
  };

  const canSend = message.trim().length > 0 && (roles.length > 0 || picked.length > 0) && preview?.recipient_count > 0;

  return (
    <div className="p-6">
      <PageHeader title="Broadcasts" subtitle="Send an in-app notification to selected roles and/or specific users." />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <form onSubmit={send} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5 lg:col-span-3">
          <label className="text-sm font-medium dark:text-textprimary-dark">Message</label>
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-surface-dark dark:text-textprimary-dark border-gray-300 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1 mb-1" rows={4} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What do recipients need to know?" />
          <p className="text-xs text-gray-400 text-right mb-4">{message.length} / 1000</p>

          <label className="text-sm font-medium dark:text-textprimary-dark">Send to roles</label>
          <div className="flex flex-wrap gap-2 mt-1 mb-4">
            {ROLES.map(([r, label]) => (
              <label key={r} className={`flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 cursor-pointer select-none dark:text-textprimary-dark ${roles.includes(r) ? 'border-primary bg-elective-bg/40 dark:bg-elective-dbg/40' : 'border-gray-300 dark:border-white/10'}`}>
                <input type="checkbox" className="accent-primary" checked={roles.includes(r)} onChange={() => toggleRole(r)} /> {label} <span className="text-gray-400">({roleCounts[r] || 0})</span>
              </label>
            ))}
          </div>

          <label className="text-sm font-medium dark:text-textprimary-dark">And / or specific users</label>
          <div className="relative">
            <Input className="mt-1" placeholder="Search users to add…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {matches.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-lg shadow-lg max-h-56 overflow-auto">
                {matches.map((u) => (
                  <li key={u.user_id}><button type="button" onClick={() => { setPicked((p) => [...p, u]); setSearch(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/5 dark:text-textprimary-dark">{u.full_name || u.email} <span className="text-xs text-gray-400">· {u.email} · {u.role}</span></button></li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2 mb-5 min-h-[1.5rem]">
            {picked.map((p) => (
              <span key={p.user_id} className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-textsecondary-dark flex items-center gap-1">
                {p.full_name || p.email} ({p.role}) <button type="button" onClick={() => setPicked((x) => x.filter((y) => y.user_id !== p.user_id))} className="text-gray-400 hover:text-critical-text" aria-label="Remove">×</button>
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 dark:border-white/10 pt-4 flex-wrap gap-2">
            <p className="text-sm dark:text-textprimary-dark">
              {preview ? <>Will reach <b>{preview.recipient_count}</b> active account(s) <span className="text-gray-400 text-xs">· {Object.entries(preview.by_role).map(([r, n]) => `${r} ${n}`).join(' · ')} (deduplicated)</span></> : <span className="text-gray-400">Pick at least one role or user.</span>}
            </p>
            <Button type="submit" disabled={!canSend} loading={sending}>Send broadcast</Button>
          </div>
          {result.ok && <p className="text-sm text-elective-text dark:text-elective-dtext mt-3">{result.ok}</p>}
          {result.err && <p className="text-sm text-critical-text dark:text-critical-dtext mt-3">{result.err}</p>}
        </form>

        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5 lg:col-span-2">
          <p className="text-sm font-medium mb-3 dark:text-textprimary-dark">History</p>
          {history.status === 'loading' && <LoadingState rows={4} />}
          {history.status === 'error' && <ErrorState message={history.error} onRetry={history.reload} />}
          {history.status === 'success' && history.data.length === 0 && <EmptyState message="No broadcasts sent yet." />}
          {history.status === 'success' && history.data.length > 0 && (
            <ul className="space-y-3 text-sm">
              {history.data.map((b) => (
                <li key={b.action_id} className="border-b border-gray-100 dark:border-white/5 pb-3 last:border-0">
                  <p className="dark:text-textprimary-dark line-clamp-3">{b.details?.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {b.details?.roles?.length ? `roles: ${b.details.roles.join(', ')}` : ''}{b.details?.roles?.length && b.details?.user_ids?.length ? ' + ' : ''}{b.details?.user_ids?.length ? `${b.details.user_ids.length} user(s)` : ''} · {b.recipient_count} recipients · <b>{b.read_count} read</b> · {relativeTime(b.created_at)} · {b.admin_name || b.admin_email}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
