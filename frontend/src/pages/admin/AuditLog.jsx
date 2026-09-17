import { useState } from 'react';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Button from '../../components/atoms/Button';
import Select from '../../components/atoms/Select';
import FilterBar from '../../components/admin/FilterBar';
import DateRangeFilter, { rangeToQuery, defaultRange } from '../../components/admin/DateRangeFilter';
import { Table, Th, Td, TableFooter, shortId } from '../../components/admin/Table';
import { useAsync } from '../../hooks/useAsync';
import { listAudit, listUsers } from '../../api/admin';
import { relativeTime } from '../../utils/relativeTime';

// Mirrors services/adminAudit.js's documented action_type values.
const ACTIONS = ['batch_triggered', 'user_updated', 'user_deactivated', 'user_reactivated', 'admin_created', 'request_cancelled', 'inventory_updated', 'org_updated', 'org_created', 'broadcast_sent', 'view_as_started', 'report_generated'];
const TARGETS = ['user', 'request', 'inventory_unit', 'organization', 'broadcast', 'report'];

const TONE = {
  batch_triggered: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-textsecondary-dark',
  request_cancelled: 'bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext',
  user_deactivated: 'bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext',
  view_as_started: 'bg-urgent-bg text-urgent-text dark:bg-urgent-dbg dark:text-urgent-dtext',
  inventory_updated: 'bg-routine-bg text-routine-text dark:bg-routine-dbg dark:text-routine-dtext',
  broadcast_sent: 'bg-elective-bg text-elective-text dark:bg-elective-dbg dark:text-elective-dtext',
};

function details(d) {
  if (!d) return '—';
  // Show the field-level diff for updates; otherwise a compact key=value line.
  return Object.entries(d).map(([k, v]) => {
    if (v && typeof v === 'object' && 'from' in v && 'to' in v) return `${k} ${v.from ?? '∅'} → ${v.to ?? '∅'}`;
    if (v && typeof v === 'object') return `${k} ${JSON.stringify(v)}`;
    return `${k} ${v}`;
  }).join(' · ');
}

export default function AdminAuditLog() {
  const [filters, setFilters] = useState({ action_type: '', admin_user_id: '', target_type: '' });
  const [range, setRange] = useState({ ...defaultRange(30), allTime: true });
  const [applied, setApplied] = useState({ limit: 300 });
  const audit = useAsync(() => listAudit(applied), [applied]);
  const admins = useAsync(() => listUsers({ role: 'admin' }), []);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const apply = (e) => { e.preventDefault(); setApplied({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')), ...rangeToQuery(range), limit: 300 }); };

  return (
    <div className="p-6">
      <PageHeader title="Audit log" subtitle="Every admin action, immutable. Nothing here can be edited or deleted." />
      <form onSubmit={apply}>
        <FilterBar cols={4}>
          <Select value={filters.action_type} onChange={set('action_type')}><option value="">All actions</option>{ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</Select>
          <Select value={filters.admin_user_id} onChange={set('admin_user_id')}><option value="">All admins</option>{(admins.data || []).map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name || a.email}</option>)}</Select>
          <Select value={filters.target_type} onChange={set('target_type')}><option value="">All targets</option>{TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          <Button type="submit" variant="secondary">Apply</Button>
          <div className="col-span-2 md:col-span-4"><DateRangeFilter value={range} onChange={setRange} /></div>
        </FilterBar>
      </form>

      {audit.status === 'loading' && <LoadingState rows={8} />}
      {audit.status === 'error' && <ErrorState message={audit.error} onRetry={audit.reload} />}
      {audit.status === 'success' && audit.data.length === 0 && <EmptyState message="No actions match these filters." />}
      {audit.status === 'success' && audit.data.length > 0 && (
        <Table>
          <thead><tr><Th>When</Th><Th>Admin</Th><Th>Action</Th><Th>Target</Th><Th>Details</Th></tr></thead>
          <tbody>
            {audit.data.map((a) => (
              <tr key={a.action_id}>
                <Td muted className="whitespace-nowrap" ><span title={new Date(a.created_at).toLocaleString()}>{relativeTime(a.created_at)}</span></Td>
                <Td>{a.admin_name || a.admin_email}</Td>
                <Td><span className={`text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap ${TONE[a.action_type] || TONE.batch_triggered}`}>{a.action_type}</span></Td>
                <Td mono>{a.target_type ? `${a.target_type} ${shortId(a.target_id)}` : '—'}</Td>
                <Td mono muted className="max-w-md truncate" ><span title={JSON.stringify(a.details)}>{details(a.details)}</span></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {audit.status === 'success' && audit.data.length > 0 && <TableFooter><span>{audit.data.length} action(s){audit.data.length === 300 ? ' (showing the latest 300 — narrow the filters for more)' : ''}</span></TableFooter>}
    </div>
  );
}
