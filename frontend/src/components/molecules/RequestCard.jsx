import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import UrgencyBadge from '../atoms/UrgencyBadge';
import FulfillmentBadge from '../atoms/FulfillmentBadge';
import RequestTrackingModal from '../organisms/RequestTrackingModal';
import { relativeTime } from '../../utils/relativeTime';

const BORDER_COLOR = { critical: '#A9382F', urgent: '#B8811F', routine: '#5B7A8C', elective: '#6B9080' };

export default function RequestCard({ request, basePath = '/hospital/requests' }) {
  const [trackingOpen, setTrackingOpen] = useState(false);

  return (
    <>
      <div
        className="flex items-center justify-between bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-r-lg pl-4 pr-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
        style={{ borderLeft: `4px solid ${BORDER_COLOR[request.urgency_tier] || '#5B7A8C'}` }}
      >
        <Link to={`${basePath}/${request.request_id}`} className="flex-1 min-w-0">
          <p className="font-medium text-sm dark:text-textprimary-dark">
            {request.blood_type} {request.component.replace('_', ' ')} · {request.quantity} unit{request.quantity === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-0.5 mono">
            req_{request.request_id.slice(0, 8)} · {relativeTime(request.created_at)}
          </p>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <UrgencyBadge urgencyTier={request.urgency_tier} />
          <FulfillmentBadge fulfillmentPath={request.fulfillment_path} />
          <button
            onClick={() => setTrackingOpen(true)}
            className="text-xs font-medium border border-primary dark:border-white/20 text-primary dark:text-textprimary-dark px-2.5 py-1 rounded-lg hover:bg-primary hover:text-white dark:hover:bg-white/10 transition-colors"
          >
            {request.fulfillment_path ? 'View logs' : 'Track'}
          </button>
        </div>
      </div>

      <RequestTrackingModal
        requestId={request.request_id}
        isOpen={trackingOpen}
        onClose={() => setTrackingOpen(false)}
      />
    </>
  );
}

RequestCard.propTypes = {
  request: PropTypes.shape({
    request_id: PropTypes.string.isRequired,
    blood_type: PropTypes.string.isRequired,
    component: PropTypes.string.isRequired,
    quantity: PropTypes.number.isRequired,
    urgency_tier: PropTypes.string.isRequired,
    fulfillment_path: PropTypes.string,
    created_at: PropTypes.string.isRequired,
  }).isRequired,
  basePath: PropTypes.string,
};