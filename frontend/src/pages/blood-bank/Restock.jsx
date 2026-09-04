import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import RequestCard from '../../components/molecules/RequestCard';
import Select from '../../components/atoms/Select';
import Button from '../../components/atoms/Button';
import { listRequests } from '../../api/requests';

export default function Restock() {
  const [status, setStatus] = useState('loading');
  const [requests, setRequests] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [resolveFilter, setResolveFilter] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    // Every request a bank submits is already restock-tier (enforced
    // server-side), so there's no urgency filter here the way Hospital's
    // My Requests has one -- there's only one tier to show.
    listRequests()
      .then((data) => {
        const filtered =
          resolveFilter === 'resolved'
            ? data.filter((r) => r.fulfillment_path)
            : resolveFilter === 'pending'
              ? data.filter((r) => !r.fulfillment_path)
              : data;
        setRequests(filtered);
        setStatus('success');
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, [resolveFilter]);

  useEffect(() => {
    load();
  }, [load]);

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

      {status === 'loading' && <LoadingState rows={5} />}
      {status === 'error' && <ErrorState message={`Couldn't load your restock requests: ${errorMessage}`} onRetry={load} />}
      {status === 'success' && requests.length === 0 && (
        <EmptyState
          message="No restock requests match this filter."
          actionLabel="Clear filter"
          onAction={() => setResolveFilter('')}
        />
      )}
      {status === 'success' && requests.length > 0 && (
        <div className="space-y-2">
          {requests.map((r) => (
            <RequestCard key={r.request_id} request={r} basePath="/blood-bank/restock" />
          ))}
        </div>
      )}
    </div>
  );
}
