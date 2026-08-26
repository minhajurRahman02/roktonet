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

export default function MyRequests() {
  const [status, setStatus] = useState('loading');
  const [requests, setRequests] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  // "resolved"/"pending" is a UI-derived filter, not a real fulfillment_path
  // value -- translated into the right query param below.
  const [resolveFilter, setResolveFilter] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    const filters = {};
    if (urgencyFilter) filters.urgency_tier = urgencyFilter;
    // The backend filters by an EXACT fulfillment_path value, not a
    // pending/resolved concept -- "resolved" here just means "don't filter
    // by a specific path, only show ones that HAVE one." Since the API
    // doesn't support "not null" filtering, we fetch all and filter
    // client-side for that one case.
    listRequests(filters)
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
  }, [urgencyFilter, resolveFilter]);

  useEffect(() => {
    load();
  }, [load]);

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

      {status === 'loading' && <LoadingState rows={5} />}
      {status === 'error' && <ErrorState message={`Couldn't load requests: ${errorMessage}`} onRetry={load} />}
      {status === 'success' && requests.length === 0 && (
        <EmptyState
          message="No requests match these filters."
          actionLabel="Clear filters"
          onAction={() => {
            setUrgencyFilter('');
            setResolveFilter('');
          }}
        />
      )}
      {status === 'success' && requests.length > 0 && (
        <div className="space-y-2">
          {requests.map((r) => (
            <RequestCard key={r.request_id} request={r} />
          ))}
        </div>
      )}
    </div>
  );
}
