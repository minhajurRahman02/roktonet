import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import UrgencyBadge from '../../components/atoms/UrgencyBadge';
import Button from '../../components/atoms/Button';
import RequestTrackingModal from '../../components/organisms/RequestTrackingModal';
import { getRequest } from '../../api/requests';
import { getMobilizationsForRequest } from '../../api/mobilizations';
import { relativeTime } from '../../utils/relativeTime';

const FALLBACK_PATHS = ['donor_fallback', 'parallel_critical', 'scheduled_donor_mobilization'];
const BORDER_COLOR = { critical: '#A9382F', urgent: '#B8811F', routine: '#5B7A8C', elective: '#6B9080' };

export default function RequestDetail() {
  const { id } = useParams();
  const [status, setStatus] = useState('loading');
  const [request, setRequest] = useState(null);
  const [mobilizations, setMobilizations] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [trackingOpen, setTrackingOpen] = useState(false);

  const load = useCallback(() => {
    setStatus('loading');
    getRequest(id)
      .then((data) => {
        setRequest(data);
        if (FALLBACK_PATHS.includes(data.fulfillment_path)) {
          return getMobilizationsForRequest(id).then(setMobilizations);
        }
        return null;
      })
      .then(() => setStatus('success'))
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === 'loading') {
    return (
      <div className="p-6">
        <LoadingState rows={5} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-6">
        <ErrorState message={`Couldn't load this request: ${errorMessage}`} onRetry={load} />
      </div>
    );
  }

  const isResolved = !!request.fulfillment_path;
  const confirmedCount = mobilizations.filter((m) => m.invite_status === 'confirmed').length;
  const pendingCount = mobilizations.filter((m) => m.invite_status === 'invited').length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <Link to="/hospital/requests" className="text-sm text-primary dark:text-textprimary-dark">
          ← Back to My Requests
        </Link>
        <Button variant="secondary" onClick={() => setTrackingOpen(true)}>
          {isResolved ? 'View logs' : 'Track request'}
        </Button>
      </div>

      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden max-w-2xl">
        <div className="p-5" style={{ borderLeft: `5px solid ${BORDER_COLOR[request.urgency_tier] || '#5B7A8C'}` }}>
          <div className="flex items-center justify-between mb-1">
            <h1 className="font-display font-bold text-xl dark:text-textprimary-dark">
              {request.blood_type} {request.component.replace('_', ' ')} · {request.quantity} unit
              {request.quantity === 1 ? '' : 's'}
            </h1>
            <UrgencyBadge urgencyTier={request.urgency_tier} />
          </div>
          <p className="mono text-xs text-gray-400">req_{request.request_id}</p>
        </div>

        <div className="border-t border-gray-100 dark:border-white/10 p-5 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-1">Resolve status</p>
            <p className={`font-medium ${isResolved ? 'text-elective-text dark:text-elective-dtext' : 'text-gray-500 dark:text-textsecondary-dark'}`}>
              {isResolved ? 'Resolved' : 'Pending'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Fulfillment path</p>
            <p className="font-medium mono dark:text-textprimary-dark">{request.fulfillment_path || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Submitted</p>
            <p className="font-medium dark:text-textprimary-dark">{relativeTime(request.created_at)}</p>
          </div>
        </div>

        {request.needed_by_date && (
          <div className="border-t border-gray-100 dark:border-white/10 p-5 text-sm">
            <p className="text-xs text-gray-400 mb-1">Needed by</p>
            <p className="font-medium dark:text-textprimary-dark">{new Date(request.needed_by_date).toLocaleDateString()}</p>
          </div>
        )}

        {FALLBACK_PATHS.includes(request.fulfillment_path) && (
          <div className="border-t border-gray-100 dark:border-white/10 p-5">
            <p className="text-sm font-medium mb-2 dark:text-textprimary-dark">Donor outreach (fallback triggered)</p>
            {mobilizations.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-textsecondary-dark">No donors invited yet.</p>
            ) : (
              <div className="flex gap-4 text-sm">
                <span className="text-gray-600 dark:text-textsecondary-dark">{mobilizations.length} donors invited</span>
                <span className="text-elective-text dark:text-elective-dtext">{confirmedCount} confirmed</span>
                <span className="text-gray-400">{pendingCount} pending</span>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">
              Donor identities aren&apos;t shown here — the system handles matching and outreach directly.
            </p>
          </div>
        )}
      </div>

      <RequestTrackingModal requestId={request.request_id} isOpen={trackingOpen} onClose={() => setTrackingOpen(false)} />
    </div>
  );
}