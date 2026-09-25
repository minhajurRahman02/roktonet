import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Pagination from '../../components/molecules/Pagination';
import Input from '../../components/atoms/Input';
import Select from '../../components/atoms/Select';
import UrgencyBadge from '../../components/atoms/UrgencyBadge';
import { usePaginatedAsync } from '../../hooks/usePaginatedAsync';
import { listIncomingAllocations } from '../../api/allocations';

// Every unit allocated to this hospital, across every request, with the
// patient it was requested for.
//
// WHY THIS IS A PAGE AND NOT A SECTION ON REQUEST DETAIL
//
// Request Detail already shows a single request's allocation, and it still
// does. But losing track is a cross-request problem: a nurse on a ward knows
// a patient's name, not which of nine open requests carries their units. A
// per-request view can only be read by someone who already knows the answer
// to the question they are asking.
//
// It costs almost nothing to have both. GET /api/allocations already ran this
// exact query in the mirror direction for a blood bank's outgoing view; the
// hospital version filters on the other side of the same joins.
//
// ON THE PATIENT COLUMNS
//
// This is the only screen in RoktoNet that shows a patient's name and phone,
// and it is reachable only by the hospital that filed the request and by
// admin. The supplying blood bank or NGO sees the same allocation rows on
// their own Outgoing Allocations page, served by the same endpoint in its
// outgoing direction, which does not select these columns at all.

const STATUS_STYLE = {
  available: 'text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg',
  reserved: 'text-urgent-text bg-urgent-bg dark:text-urgent-dtext dark:bg-urgent-dbg',
  dispatched: 'text-routine-text bg-routine-bg dark:text-routine-dtext dark:bg-routine-dbg',
  delivered: 'text-gray-500 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
  expired: 'text-critical-text bg-critical-bg dark:text-critical-dtext dark:bg-critical-dbg',
};

export default function AllocationLog() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const rows = usePaginatedAsync(
    ({ page, per_page }) => listIncomingAllocations({ page, per_page }),
    [],
    { storageKey: 'hospital.allocationLog' }
  );

  // Patient search is filtered in the browser, deliberately, and this is the
  // one place in the project where that is the correct call rather than a
  // shortcut.
  //
  // Everywhere else, client-side filtering after paging produces a count that
  // lies about what was searched. Here the search is over data the server
  // must not index on our behalf: sending a patient's name to the backend as
  // a query parameter puts it in request logs, proxy logs and browser
  // history, for a field whose whole point is that it is sensitive. The
  // hospital's own allocation history is small enough that the page it
  // already holds is the right thing to search.
  //
  // The count below is worded to match: it says how many of the loaded rows
  // matched, never how many exist system-wide.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows.data || []).filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.patient_name || '').toLowerCase().includes(q)
        || (r.patient_phone || '').toLowerCase().includes(q)
        || (r.blood_type || '').toLowerCase().includes(q)
      );
    });
  }, [rows.data, search, statusFilter]);

  const isFiltering = !!search.trim() || !!statusFilter;

  return (
    <div className="p-6">
      <PageHeader
        title="Allocation Log"
        subtitle="Every unit allocated to your requests, and the patient it was requested for."
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          className="w-64"
          placeholder="Search patient, phone or blood type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
          <option value="">All statuses</option>
          <option value="reserved">Reserved</option>
          <option value="dispatched">Dispatched</option>
          <option value="delivered">Delivered</option>
        </Select>
      </div>

      {rows.status === 'loading' && <LoadingState rows={5} />}
      {rows.status === 'error' && (
        <ErrorState message={`Couldn't load the allocation log: ${rows.error}`} onRetry={rows.reload} />
      )}
      {rows.isEmpty && (
        <EmptyState message="No units have been allocated to your requests yet." />
      )}

      {rows.status === 'success' && rows.data.length > 0 && (
        <>
          {isFiltering && (
            <p className="text-xs text-gray-500 dark:text-textsecondary-dark mb-2">
              {filtered.length} of {rows.data.length} rows on this page match.
            </p>
          )}

          {filtered.length === 0 ? (
            <EmptyState
              message="Nothing on this page matches that search."
              actionLabel="Clear"
              onAction={() => { setSearch(''); setStatusFilter(''); }}
            />
          ) : (
            <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="bg-gray-50 dark:bg-white/5 text-left text-xs text-gray-500 dark:text-textsecondary-dark">
                  <tr>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="px-4 py-3 font-medium">Unit</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Urgency</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Requested</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {filtered.map((r) => (
                    <tr key={r.unit_id}>
                      <td className="px-4 py-3">
                        <p className="font-medium dark:text-textprimary-dark">
                          {r.patient_name || <span className="text-gray-400">Not recorded</span>}
                        </p>
                        {r.patient_phone && (
                          <a
                            href={`tel:${r.patient_phone}`}
                            className="text-xs text-gray-500 dark:text-textsecondary-dark hover:underline"
                          >
                            {r.patient_phone}
                          </a>
                        )}
                        {r.patient_note && (
                          <p className="text-xs text-gray-400 mt-0.5">{r.patient_note}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium dark:text-textprimary-dark">{r.blood_type}</p>
                        <p className="text-xs text-gray-500 dark:text-textsecondary-dark capitalize">
                          {String(r.component || '').replace('_', ' ')}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-textsecondary-dark">
                        {r.source_org_name}
                        {r.source_org_district && (
                          <span className="block text-xs text-gray-400">{r.source_org_district}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <UrgencyBadge urgencyTier={r.urgency_tier} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[r.status] || STATUS_STYLE.reserved}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-textsecondary-dark mono text-xs">
                        {r.request_created_at ? new Date(r.request_created_at).toLocaleDateString() : '·'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/hospital/requests/${r.request_id}`}
                          className="text-xs font-medium text-primary dark:text-textprimary-dark hover:underline"
                        >
                          View request
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={rows.page} pageCount={rows.pageCount} total={rows.total} perPage={rows.perPage}
            onPageChange={rows.setPage} onPerPageChange={rows.setPerPage} noun="unit"
          />
        </>
      )}
    </div>
  );
}
