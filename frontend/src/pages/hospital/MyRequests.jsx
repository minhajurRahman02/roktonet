import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import RequestCard from '../../components/molecules/RequestCard';
import Pagination from '../../components/molecules/Pagination';
import Select from '../../components/atoms/Select';
import Button from '../../components/atoms/Button';
import { usePaginatedAsync } from '../../hooks/usePaginatedAsync';
import { listRequests } from '../../api/requests';

export default function MyRequests() {
  const [urgencyFilter, setUrgencyFilter] = useState('');
  // "resolved"/"pending" is a UI-derived filter, not a real fulfillment_path
  // value -- translated into the right query param below.
  const [resolveFilter, setResolveFilter] = useState('');

  // 7.7a: both filters are now sent to the server.
  //
  // This used to fetch everything and then do
  //   resolveFilter === 'resolved' ? data.filter((r) => r.fulfillment_path) : ...
  // in the browser. That was fine while the page fetched the whole list,
  // but server-side paging turns it into a page that lies: the server
  // returns 25 rows, the browser keeps 4 of them, and the footer claims
  // "4 of 87" while later pages come back empty because they happened to
  // contain none of the wanted kind.
  //
  // 'pending' and 'resolved' are real backend values now
  // (fulfillment_path IS NULL / IS NOT NULL), so what is on screen and
  // what the count claims always agree.
  const filters = useMemo(() => {
    const f = {};
    if (urgencyFilter) f.urgency_tier = urgencyFilter;
    if (resolveFilter) f.fulfillment_path = resolveFilter;
    return f;
  }, [urgencyFilter, resolveFilter]);

  const requests = usePaginatedAsync(
    ({ page, per_page }) => listRequests({ ...filters, page, per_page }),
    [filters],
    { storageKey: 'hospital.myRequests' }
  );

  return (
    <div className="p-6">
      <PageHeader
        title="My Requests"
        subtitle="All requests submitted by your hospital."
        action={
          <Link to="/hospital/requests/new">
            <Button variant="primary">+ New request</Button>
          </Link>
        }
      />

      <div className="flex gap-2 mb-4">
        <Select value={urgencyFilter} onChange={(e) => setUrgencyFilter(e.target.value)} className="w-40">
          <option value="">All urgencies</option>
          <option value="critical">Critical</option>
          <option value="urgent">Urgent</option>
          <option value="routine">Routine</option>
          <option value="elective">Elective</option>
        </Select>
        <Select value={resolveFilter} onChange={(e) => setResolveFilter(e.target.value)} className="w-40">
          <option value="">All statuses</option>
          <option value="resolved">Resolved</option>
          <option value="pending">Pending</option>
        </Select>
      </div>

      {requests.status === 'loading' && <LoadingState rows={5} />}
      {requests.status === 'error' && <ErrorState message={`Couldn't load requests: ${requests.error}`} onRetry={requests.reload} />}
      {requests.isEmpty && (
        <EmptyState
          message="No requests match these filters."
          actionLabel="Clear filters"
          onAction={() => {
            setUrgencyFilter('');
            setResolveFilter('');
          }}
        />
      )}
      {requests.status === 'success' && requests.data.length > 0 && (
        <>
          <div className="space-y-2">
            {requests.data.map((r) => (
              <RequestCard key={r.request_id} request={r} />
            ))}
          </div>
          <Pagination
            page={requests.page} pageCount={requests.pageCount} total={requests.total} perPage={requests.perPage}
            onPageChange={requests.setPage} onPerPageChange={requests.setPerPage} noun="request"
          />
        </>
      )}
    </div>
  );
}