import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Phone, Mail, MapPin, Droplet } from 'lucide-react';
import LoadingState from '../molecules/LoadingState';
import ErrorState from '../molecules/ErrorState';
import UrgencyBadge from '../atoms/UrgencyBadge';
import Button from '../atoms/Button';
import RequestTrackingModal from './RequestTrackingModal';
import { getRequest, getAllocation, confirmDelivery } from '../../api/requests';
import { getMobilizationsForRequest } from '../../api/mobilizations';
import { relativeTime } from '../../utils/relativeTime';

const FALLBACK_PATHS = ['donor_fallback', 'parallel_critical', 'scheduled_donor_mobilization'];
const INVENTORY_PATHS = ['inventory', 'restock'];
const BORDER_COLOR = { critical: '#A9382F', urgent: '#B8811F', routine: '#5B7A8C', elective: '#6B9080' };

// Groups flat per-unit allocation rows into one entry per source org, since
// delivery is confirmed per-org (a request can be fulfilled by multiple
// banks/NGOs arriving separately) rather than all at once.
function groupByOrg(allocation) {
  const groups = new Map();
  for (const row of allocation) {
    if (!groups.has(row.org_id)) {
      groups.set(row.org_id, { org_id: row.org_id, org_name: row.org_name, district: row.district, units: [] });
    }
    groups.get(row.org_id).units.push(row);
  }
  return Array.from(groups.values());
}

// The actual detail view logic, shared by Hospital's request detail and
// Blood Bank's restock detail -- a restock request is a normal row in the
// same `requests` table (the bank IS the "requester"), so every ownership
// check, dispatch/delivery state, and donor-fallback rule already applies
// unchanged. Only the "back" link differs per role, which is why that's a
// prop here rather than hardcoded, instead of duplicating this whole file.
export default function RequestDetailView({ backTo, backLabel }) {
  const { id } = useParams();
  const [status, setStatus] = useState('loading');
  const [request, setRequest] = useState(null);
  const [mobilizations, setMobilizations] = useState([]);
  const [allocation, setAllocation] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [confirmingOrgId, setConfirmingOrgId] = useState(null);
  const [confirmError, setConfirmError] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    getRequest(id)
      .then((data) => {
        setRequest(data);
        const tasks = [];
        if (FALLBACK_PATHS.includes(data.fulfillment_path)) {
          tasks.push(getMobilizationsForRequest(id).then(setMobilizations));
        }
        if (INVENTORY_PATHS.includes(data.fulfillment_path)) {
          tasks.push(getAllocation(id).then(setAllocation));
        }
        return Promise.all(tasks);
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

  async function handleConfirmArrival(orgId) {
    setConfirmingOrgId(orgId);
    setConfirmError('');
    try {
      await confirmDelivery(request.request_id, orgId);
      const updated = await getAllocation(request.request_id);
      setAllocation(updated);
    } catch (err) {
      setConfirmError(err.message);
    } finally {
      setConfirmingOrgId(null);
    }
  }

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
  const confirmedDonors = mobilizations.filter((m) => m.invite_status === 'confirmed');
  const pendingCount = mobilizations.filter((m) => m.invite_status === 'invited').length;
  const declinedCount = mobilizations.filter((m) => m.invite_status === 'declined').length;
  const orgGroups = groupByOrg(allocation);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <Link to={backTo} className="text-sm text-primary dark:text-textprimary-dark">
          ← {backLabel}
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

        {/* Per-org dispatch/delivery status -- one row per source org, since
            delivery is confirmed per-org, not for the whole request at once. */}
        {INVENTORY_PATHS.includes(request.fulfillment_path) && orgGroups.length > 0 && (
          <div className="border-t border-gray-100 dark:border-white/10 p-5">
            <p className="text-sm font-medium mb-3 dark:text-textprimary-dark">Delivery status</p>
            <div className="space-y-3">
              {orgGroups.map((group) => {
                const allDelivered = group.units.every((u) => u.status === 'delivered');
                const anyDispatched = group.units.some((u) => u.status === 'dispatched');

                return (
                  <div
                    key={group.org_id}
                    className="flex items-center justify-between border border-gray-100 dark:border-white/10 rounded-lg px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium dark:text-textprimary-dark">{group.org_name}</p>
                      <p className="text-xs text-gray-400">
                        {group.district} · {group.units.length} unit{group.units.length === 1 ? '' : 's'}
                      </p>
                    </div>

                    {allDelivered ? (
                      <span className="text-xs font-medium text-elective-text dark:text-elective-dtext bg-elective-bg dark:bg-elective-dbg px-2.5 py-1 rounded-full">
                        Delivered
                      </span>
                    ) : anyDispatched ? (
                      <Button
                        variant="primary"
                        loading={confirmingOrgId === group.org_id}
                        onClick={() => handleConfirmArrival(group.org_id)}
                      >
                        Mark arrived
                      </Button>
                    ) : (
                      <span className="text-xs font-medium text-gray-500 dark:text-textsecondary-dark bg-gray-100 dark:bg-white/5 px-2.5 py-1 rounded-full">
                        Awaiting dispatch
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {confirmError && (
              <p className="text-xs text-critical-text dark:text-critical-dtext mt-2">{confirmError}</p>
            )}
          </div>
        )}

        {FALLBACK_PATHS.includes(request.fulfillment_path) && (
          <div className="border-t border-gray-100 dark:border-white/10 p-5">
            <p className="text-sm font-medium mb-2 dark:text-textprimary-dark">Donor outreach (fallback triggered)</p>
            {mobilizations.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-textsecondary-dark">No donors invited yet.</p>
            ) : (
              <>
                <div className="flex gap-4 text-sm mb-3">
                  <span className="text-gray-600 dark:text-textsecondary-dark">{mobilizations.length} donors invited</span>
                  <span className="text-elective-text dark:text-elective-dtext">{confirmedDonors.length} confirmed</span>
                  <span className="text-gray-400">{pendingCount} pending</span>
                  {declinedCount > 0 && <span className="text-gray-400">{declinedCount} declined</span>}
                </div>

                {/* Contact details only ever appear here for confirmed donors --
                    the backend nulls these fields out for anyone who hasn't
                    accepted, so there's nothing to accidentally over-render. */}
                {confirmedDonors.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {confirmedDonors.map((donor) => (
                      <div
                        key={donor.mobilization_id}
                        className="border border-gray-100 dark:border-white/10 rounded-lg p-3 text-sm"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="font-medium dark:text-textprimary-dark">{donor.donor_name || 'Confirmed donor'}</p>
                          <span className="flex items-center gap-1 text-xs font-medium text-critical-text dark:text-critical-dtext">
                            <Droplet size={12} /> {donor.donor_blood_type}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-textsecondary-dark">
                          {donor.donor_phone && (
                            <a href={`tel:${donor.donor_phone}`} className="flex items-center gap-1 hover:text-primary dark:hover:text-textprimary-dark">
                              <Phone size={12} /> {donor.donor_phone}
                            </a>
                          )}
                          {donor.donor_email && (
                            <a href={`mailto:${donor.donor_email}`} className="flex items-center gap-1 hover:text-primary dark:hover:text-textprimary-dark">
                              <Mail size={12} /> {donor.donor_email}
                            </a>
                          )}
                          {(donor.donor_thana || donor.donor_district) && (
                            <span className="flex items-center gap-1">
                              <MapPin size={12} /> {[donor.donor_thana, donor.donor_district].filter(Boolean).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(pendingCount > 0 || declinedCount > 0) && (
                  <p className="text-xs text-gray-400">
                    Donor identities aren&apos;t shown until they accept an invite.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <RequestTrackingModal requestId={request.request_id} isOpen={trackingOpen} onClose={() => setTrackingOpen(false)} />
    </div>
  );
}

RequestDetailView.propTypes = {
  backTo: PropTypes.string.isRequired,
  backLabel: PropTypes.string.isRequired,
};
