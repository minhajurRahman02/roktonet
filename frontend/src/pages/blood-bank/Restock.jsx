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

export default function Restock() {
  const [resolveFilter, setResolveFilter] = useState('');

  // Every request a bank submits is already restock-tier (enforced
  // server-side), so there's no urgency filter here the way Hospital's
  // My Requests has one -- there's only one tier to show.
  //
  // 7.7a: the resolved/pending filter is server-side now. It used to fetch
  // every restock request and filter in the browser, which paging would
  // turn into a count that disagrees with what is on screen.
  const filters = useMemo(
    () => (resolveFilter ? { fulfillment_path: resolveFilter } : {}),
    [resolveFilter]
  );

  const requests = usePaginatedAsync(
    ({ page, per_page }) => listRequests({ ...filters, page, per_page }),
    [filters],
    { storageKey: 'bank.restock' }
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Restock"
        subtitle="These go through the same allocation engine as patient requests, just at the lowest priority tier, so a critical case always wins a contested unit."
        action={
          <Link to="/blood-bank/restock/new">
            <Button variant="primary">Request restock</Button>
          </Link>
        }
      />

      <div className="flex gap-2 mb-4">
        <Select value={resolveFilter} onChange={(e) => setResolveFilter(e.target.value)} className="w-40">
          <option value="">All statuses</option>
          <option value="resolved">Resolved</option>
          <option value="pending">Pending</option>
        </Select>
      </div>

      {requests.status === 'loading' && <LoadingState rows={5} />}
      {requests.status === 'error' && <ErrorState message={`Couldn't load your restock requests: ${requests.error}`} onRetry={requests.reload} />}
      {requests.isEmpty && (
        <EmptyState
          message="No restock requests match this filter."
          actionLabel="Clear filter"
          onAction={() => setResolveFilter('')}
        />
      )}
      {requests.status === 'success' && requests.data.length > 0 && (
        <>
          <div className="space-y-2">
            {requests.data.map((r) => (
              <RequestCard key={r.request_id} request={r} basePath="/blood-bank/restock" />
            ))}
          </div>
          <Pagination
            page={requests.page} pageCount={requests.pageCount} total={requests.total} perPage={requests.perPage}
            onPageChange={requests.setPage} onPerPageChange={requests.setPerPage} noun="restock request"
          />
        </>
      )}
    </div>
  );
}