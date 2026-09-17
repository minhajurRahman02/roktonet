import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pie, Bar } from 'react-chartjs-2';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Button from '../../components/atoms/Button';
import Select from '../../components/atoms/Select';
import UrgencyBadge from '../../components/atoms/UrgencyBadge';
import StatCard from '../../components/admin/StatCard';
import DivisionMap from '../../components/admin/DivisionMap';
import { baseOptions, radialOptions, STATUS_COLOR, URGENCY_COLOR } from '../../components/admin/chartTheme';
import { useAsync } from '../../hooks/useAsync';
import { getOverview, getActivityFeed, getMap, runBatch } from '../../api/admin';
import { relativeTime } from '../../utils/relativeTime';

// Live = polling, not WebSockets (spec 2.10) -- same pattern as
// RequestTrackingModal, just a lighter interval since this is a whole
// dashboard, not one request being watched.
const POLL_MS = 10000;
const MAP_WINDOWS = { '1': 'Last 24 hours', '7': 'Last 7 days', '30': 'Last 30 days' };

function windowRange(days) {
  const from = new Date();
  from.setDate(from.getDate() - Number(days));
  return { from: from.toISOString().slice(0, 10) };
}

export default function AdminOverview() {
  const overview = useAsync(getOverview, [], { pollMs: POLL_MS });
  const feed = useAsync(() => getActivityFeed(12), [], { pollMs: POLL_MS });
  const [mapDays, setMapDays] = useState('7');
  const map = useAsync(() => getMap(windowRange(mapDays)), [mapDays]);
  const [batch, setBatch] = useState({ running: false, result: null, error: '' });

  const handleRunBatch = async () => {
    setBatch({ running: true, result: null, error: '' });
    try {
      const result = await runBatch();
      setBatch({ running: false, result, error: '' });
      overview.refresh();
      feed.refresh();
      map.refresh();
    } catch (err) {
      setBatch({ running: false, result: null, error: err.message });
    }
  };

  const o = overview.data;
  const openByTier = o?.requests.open_by_tier || {};
  const criticalUrgent = (openByTier.critical || 0) + (openByTier.urgent || 0);
  const routineElective = (openByTier.routine || 0) + (openByTier.elective || 0) + (openByTier.restock || 0);
  const usersByRole = o?.users.active_by_role || {};
  const activeUsers = Object.values(usersByRole).reduce((s, n) => s + n, 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Overview"
        subtitle="Live system state. Refreshes every 10 seconds."
        action={
          <div className="flex items-center gap-3">
            {overview.lastUpdated && (
              <span className="text-xs text-gray-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-elective-border animate-pulse" /> Live · {relativeTime(overview.lastUpdated)}
              </span>
            )}
            <Button onClick={handleRunBatch} loading={batch.running}>Run batch now</Button>
          </div>
        }
      />

      {batch.result && (
        <div className="mb-4 text-sm rounded-lg px-4 py-3 bg-elective-bg dark:bg-elective-dbg text-elective-text dark:text-elective-dtext">
          Batch complete in {(batch.result.duration_ms / 1000).toFixed(1)}s · {batch.result.processed ?? 0} processed · {batch.result.assignments ?? 0} assignment(s) · {Object.keys(batch.result.shortfalls || {}).length} shortfall(s) escalated to donor fallback
        </div>
      )}
      {batch.error && <div className="mb-4"><ErrorState message={`Batch failed: ${batch.error}`} onRetry={handleRunBatch} /></div>}

      {overview.status === 'loading' && <LoadingState rows={4} />}
      {overview.status === 'error' && <ErrorState message={overview.error} onRetry={overview.reload} />}
      {overview.status === 'success' && o && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-3">
            <StatCard value={o.inventory.by_status.available || 0} label="Units available" />
            <StatCard value={o.inventory.expiring_within_7_days} label="Expiring within 7 days" tone="urgent" />
            <StatCard value={criticalUrgent} label="Open critical / urgent" tone={criticalUrgent ? 'critical' : 'default'} />
            <StatCard value={routineElective} label="Open routine / elective / restock" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
            <StatCard value={o.requests.unmet_by_inventory} label="Resolved outside inventory" />
            <StatCard value={o.drives.by_status.active || 0} label="Active blood drives" />
            <StatCard value={o.donors.by_eligibility.eligible || 0} label="Donors eligible now" />
            <StatCard
              value={activeUsers}
              label={`Active accounts · ${['hospital', 'bank', 'ngo', 'donor', 'admin'].map((r) => `${r[0].toUpperCase()}${usersByRole[r] || 0}`).join(' ')}`}
            />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium dark:text-textprimary-dark">Allocation flow by division</p>
            <Select value={mapDays} onChange={(e) => setMapDays(e.target.value)} className="!w-auto !py-1 !text-xs">
              {Object.entries(MAP_WINDOWS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <p className="text-xs text-gray-400 mb-3">Node size = available units. Arcs = units allocated source → hospital, colored by urgency. Schematic, not geographic.</p>
          {map.status === 'loading' && <LoadingState rows={5} />}
          {map.status === 'error' && <ErrorState message={map.error} onRetry={map.reload} />}
          {map.status === 'success' && map.data && (
            <>
              <DivisionMap divisions={map.data.divisions} flows={map.data.flows} />
              {map.data.unmapped_units > 0 && (
                <p className="text-xs text-urgent-text mt-2">{map.data.unmapped_units} unit(s) belong to orgs whose district isn't mapped to a division.</p>
              )}
            </>
          )}
        </div>

        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5 lg:col-span-2 flex flex-col">
          <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">System activity</p>
          <p className="text-xs text-gray-400 mb-3">Every pipeline event across every request, newest first.</p>
          {feed.status === 'loading' && <LoadingState rows={6} />}
          {feed.status === 'error' && <ErrorState message={feed.error} onRetry={feed.reload} />}
          {feed.status === 'success' && feed.data?.length === 0 && <EmptyState message="No activity yet." />}
          {feed.status === 'success' && feed.data?.length > 0 && (
            <ol className="space-y-3 text-sm flex-1">
              {feed.data.map((e) => (
                <li key={e.event_id} className="flex gap-3">
                  <span className="shrink-0 pt-0.5">
                    {e.event_type === 'request_cancelled'
                      ? <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-textsecondary-dark">admin</span>
                      : <UrgencyBadge urgencyTier={e.urgency_tier} />}
                  </span>
                  <div className="min-w-0">
                    <p className="dark:text-textprimary-dark">{e.message}</p>
                    <p className="text-xs text-gray-400 truncate">{e.org_name} · {e.blood_type} · {relativeTime(e.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <Link to="/admin/requests" className="text-xs text-primary dark:text-textsecondary-dark underline mt-3">View all requests →</Link>
        </div>
      </div>

      {overview.status === 'success' && o && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
            <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Inventory by status</p>
            <p className="text-xs text-gray-400 mb-3">Snapshot right now.</p>
            <div style={{ height: 200 }}>
              <Pie
                data={{
                  labels: Object.keys(o.inventory.by_status),
                  datasets: [{ data: Object.values(o.inventory.by_status), backgroundColor: Object.keys(o.inventory.by_status).map((k) => STATUS_COLOR[k] || '#9CA3AF'), borderWidth: 0 }],
                }}
                options={radialOptions()}
              />
            </div>
          </div>
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
            <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Open requests by urgency</p>
            <p className="text-xs text-gray-400 mb-3">Pending = not yet through the engine.</p>
            <div style={{ height: 200 }}>
              <Bar
                data={{
                  labels: ['critical', 'urgent', 'routine', 'elective', 'restock'],
                  datasets: [{ label: 'Open', data: ['critical', 'urgent', 'routine', 'elective', 'restock'].map((t) => openByTier[t] || 0), backgroundColor: ['critical', 'urgent', 'routine', 'elective', 'restock'].map((t) => URGENCY_COLOR[t]), borderRadius: 6 }],
                }}
                options={baseOptions({ legend: false })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
