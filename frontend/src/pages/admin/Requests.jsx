import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Button from '../../components/atoms/Button';
import Input from '../../components/atoms/Input';
import Select from '../../components/atoms/Select';
import UrgencyBadge from '../../components/atoms/UrgencyBadge';
import RequestTrackingModal from '../../components/organisms/RequestTrackingModal';
import FilterBar from '../../components/admin/FilterBar';
import StatusBadge from '../../components/admin/StatusBadge';
import Modal from '../../components/admin/Modal';
import DateRangeFilter, { rangeToQuery, defaultRange } from '../../components/admin/DateRangeFilter';
import Pagination from '../../components/molecules/Pagination';
import { Table, Th, Td, shortId } from '../../components/admin/Table';
import { useAsync } from '../../hooks/useAsync';
import { usePaginatedAsync } from '../../hooks/usePaginatedAsync';
import { listRequests } from '../../api/requests';
import { cancelRequest } from '../../api/admin';
import { getDistricts } from '../../api/locations';
import { BLOOD_TYPES, URGENCY_TIERS, FULFILLMENT_PATHS } from '../../constants/blood';
import { relativeTime } from '../../utils/relativeTime';

export default function AdminRequests() {
  const [filters, setFilters] = useState({ urgency_tier: '', fulfillment_path: '', district: '', blood_type: '', cancelled: 'false' });
  const [range, setRange] = useState({ ...defaultRange(90), allTime: true });
  // 7.7a: 'pending' is now a real backend filter value (fulfillment_path
  // IS NULL AND cancelled_at IS NULL), so it is no longer stripped out and
  // re-applied in the browser. That had to change for pagination to tell
  // the truth -- filtering a server page of 25 down to 3 locally and then
  // displaying "3 of 143" is the page lying about what it searched.
  const buildQuery = (f, r) => {
    const q = { ...f, ...rangeToQuery(r) };
    return Object.fromEntries(Object.entries(q).filter(([, v]) => v !== ''));
  };
  const [applied, setApplied] = useState(buildQuery(filters, range));
  const requests = usePaginatedAsync(
    ({ page, per_page }) => listRequests({ ...applied, page, per_page }),
    [applied],
    { storageKey: 'admin.requests' }
  );
  const districts = useAsync(getDistricts, []);
  const [tracking, setTracking] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const apply = (e) => { e.preventDefault(); setApplied(buildQuery(filters, range)); };

  const confirmCancel = async () => {
    setBusy(true); setErr('');
    try {
      const res = await cancelRequest(cancelling.request_id, reason);
      setDone(`Request cancelled. ${res.released_units} reserved unit(s) released back to inventory.`);
      setCancelling(null); setReason(''); requests.refresh();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  // No client-side filtering any more: the server returns exactly the rows
  // that match, so what is on screen and what the count claims agree.
  const rows = requests.data || [];

  return (
    <div className="p-6">
      <PageHeader title="Requests" subtitle="All patient and restock requests, system-wide." action={<Link to="/admin/reports"><Button variant="secondary">Export →</Button></Link>} />
      {done && <div className="mb-4 text-sm rounded-lg px-4 py-3 bg-elective-bg dark:bg-elective-dbg text-elective-text dark:text-elective-dtext flex justify-between"><span>{done}</span><button onClick={() => setDone('')} className="text-xs underline">dismiss</button></div>}

      <form onSubmit={apply}>
        <FilterBar cols={6}>
          <Select value={filters.urgency_tier} onChange={set('urgency_tier')}><option value="">All urgencies</option>{URGENCY_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          <Select value={filters.fulfillment_path} onChange={set('fulfillment_path')}>
            <option value="">All paths</option><option value="pending">pending</option>{FULFILLMENT_PATHS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Select value={filters.district} onChange={set('district')}><option value="">All districts</option>{(districts.data || []).map((d) => <option key={d} value={d}>{d}</option>)}</Select>
          <Select value={filters.blood_type} onChange={set('blood_type')}><option value="">All blood types</option>{BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}</Select>
          <Select value={filters.cancelled} onChange={set('cancelled')}><option value="false">Hide cancelled</option><option value="">Show all</option><option value="true">Cancelled only</option></Select>
          <Button type="submit" variant="secondary">Apply</Button>
          <div className="col-span-2 md:col-span-6"><DateRangeFilter value={range} onChange={setRange} /></div>
        </FilterBar>
      </form>

      {requests.status === 'loading' && <LoadingState rows={6} />}
      {requests.status === 'error' && <ErrorState message={requests.error} onRetry={requests.reload} />}
      {requests.status === 'success' && rows.length === 0 && <EmptyState message="No requests match these filters." />}
      {requests.status === 'success' && rows.length > 0 && (
        <Table>
          <thead><tr><Th>Request</Th><Th>Hospital</Th><Th>District</Th><Th>Need</Th><Th>Urgency</Th><Th>Path</Th><Th>Allocated</Th><Th>Created</Th><Th> </Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.request_id} className={r.cancelled_at ? 'opacity-50' : ''}>
                <Td mono>{shortId(r.request_id)}</Td>
                <Td>{r.org_name}</Td>
                <Td muted>{r.org_district}</Td>
                <Td>{r.blood_type} · {r.component} · {r.quantity}</Td>
                <Td><UrgencyBadge urgencyTier={r.urgency_tier} /></Td>
                <Td><StatusBadge value={r.cancelled_at ? 'cancelled' : r.fulfillment_path || 'pending'} /></Td>
                <Td>{r.units_allocated} / {r.quantity}</Td>
                <Td muted>{relativeTime(r.created_at)}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs" onClick={() => setTracking(r.request_id)}>Track</Button>
                    {!r.cancelled_at && <Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs !text-critical-text" onClick={() => { setCancelling(r); setErr(''); }}>Cancel</Button>}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {requests.status === 'success' && rows.length > 0 && (
        <Pagination
          page={requests.page} pageCount={requests.pageCount} total={requests.total} perPage={requests.perPage}
          onPageChange={requests.setPage} onPerPageChange={requests.setPerPage} noun="request"
        />
      )}

      <RequestTrackingModal requestId={tracking} isOpen={!!tracking} onClose={() => setTracking(null)} />

      <Modal isOpen={!!cancelling} onClose={() => setCancelling(null)} title="Cancel this request?"
        subtitle={cancelling && `${cancelling.org_name} · ${cancelling.blood_type} ${cancelling.component} × ${cancelling.quantity} · ${cancelling.urgency_tier}`}
        footer={<><Button variant="ghost" onClick={() => setCancelling(null)}>Keep request</Button><Button variant="critical" onClick={confirmCancel} loading={busy}>Cancel request</Button></>}>
        {cancelling && (
          <>
            <div className="text-sm rounded-lg px-3 py-2 mb-4 bg-critical-bg/60 dark:bg-critical-dbg/60 text-critical-text dark:text-critical-dtext">
              <b>{cancelling.units_allocated} allocated unit(s)</b> still reserved will be released back to available inventory. Units already dispatched or delivered are not affected. The hospital will be notified. This is logged and cannot be undone.
            </div>
            <label className="text-sm font-medium dark:text-textprimary-dark">Reason <span className="text-gray-400 font-normal">(optional, goes in the audit log)</span></label>
            <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate entry" />
            {err && <p className="text-sm text-critical-text dark:text-critical-dtext mt-3">{err}</p>}
          </>
        )}
      </Modal>
    </div>
  );
}
