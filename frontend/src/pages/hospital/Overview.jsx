import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import RequestCard from '../../components/molecules/RequestCard';
import Button from '../../components/atoms/Button';
import { listRequests } from '../../api/requests';

const FALLBACK_PATHS = ['donor_fallback', 'parallel_critical', 'scheduled_donor_mobilization'];

function isThisMonth(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export default function HospitalOverview() {
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [requests, setRequests] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    listRequests()
      .then((data) => {
        setRequests(data);
        setStatus('success');
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pendingCount = requests.filter((r) => !r.fulfillment_path).length;
  const criticalOpenCount = requests.filter((r) => r.urgency_tier === 'critical' && !r.fulfillment_path).length;
  const fulfilledThisMonth = requests.filter((r) => r.fulfillment_path && isThisMonth(r.created_at)).length;
  const fallbackCount = requests.filter((r) => FALLBACK_PATHS.includes(r.fulfillment_path)).length;
  const recent = requests.slice(0, 5);

  return (
    <div className="p-6">
      <PageHeader
        title="Overview"
        subtitle="Your pending and recent blood requests."
        action={
          <Link to="/hospital/requests/new">
            <Button variant="primary">+ New request</Button>
          </Link>
        }
      />

      {status === 'loading' && <LoadingState rows={4} />}
      {status === 'error' && <ErrorState message={`Couldn't load your requests: ${errorMessage}`} onRetry={load} />}

      {status === 'success' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
              <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{pendingCount}</p>
              <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Pending requests</p>
            </div>
            <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
              <p className="font-display font-bold text-2xl text-critical-text dark:text-critical-dtext">{criticalOpenCount}</p>
              <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Critical open</p>
            </div>
            <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
              <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{fulfilledThisMonth}</p>
              <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Fulfilled this month</p>
            </div>
            <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
              <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{fallbackCount}</p>
              <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Donor fallback triggered</p>
            </div>
          </div>

          <p className="text-sm font-medium mb-3 dark:text-textprimary-dark">Recent requests</p>
          {recent.length === 0 ? (
            <EmptyState
              message="No requests yet."
              actionLabel="Submit your first request"
              onAction={() => {
                window.location.href = '/hospital/requests/new';
              }}
            />
          ) : (
            <div className="space-y-2">
              {recent.map((r) => (
                <RequestCard key={r.request_id} request={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
