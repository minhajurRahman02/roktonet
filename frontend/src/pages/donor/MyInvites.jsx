import { useState } from 'react';
import { Phone, Mail } from 'lucide-react';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Pagination from '../../components/molecules/Pagination';
import Button from '../../components/atoms/Button';
import { usePaginatedAsync } from '../../hooks/usePaginatedAsync';
import { listMobilizations, respondToMobilization } from '../../api/mobilizations';

const URGENCY_BORDER = { critical: '#A9382F', urgent: '#B8811F', routine: '#5B7A8C', elective: '#6B9080' };
const STATUS_STYLE = {
  invited: 'text-gray-500 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
  confirmed: 'text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg',
  declined: 'text-gray-400 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
};

export default function MyInvites() {
  const [respondingId, setRespondingId] = useState(null);
  // 7.7a: accept/decline failures get their own slot rather than writing
  // to the loader's error state. Previously a failed response replaced the
  // whole invite list with an error screen, losing the other invites.
  const [actionError, setActionError] = useState('');

  const invites = usePaginatedAsync(
    ({ page, per_page }) => listMobilizations({ page, per_page }),
    [],
    { storageKey: 'donor.myInvites', defaultPerPage: 10 }
  );

  async function handleRespond(mobilizationId, inviteStatus) {
    setRespondingId(mobilizationId);
    setActionError('');
    try {
      await respondToMobilization(mobilizationId, inviteStatus);
      // refresh, not reload: re-fetch in the background so the list does
      // not blank out to a skeleton the instant you click Accept.
      invites.refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setRespondingId(null);
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="My Invites"
        subtitle="Requests you've been asked to help with. Hospital contact details are shown either way, so you can ask questions before deciding."
      />

      {actionError && (
        <p className="mb-4 text-sm text-critical-text dark:text-critical-dtext">{actionError}</p>
      )}

      {invites.status === 'loading' && <LoadingState rows={4} />}
      {invites.status === 'error' && <ErrorState message={`Couldn't load your invites: ${invites.error}`} onRetry={invites.reload} />}
      {invites.isEmpty && <EmptyState message="No invites yet." />}
      {invites.status === 'success' && invites.data.length > 0 && (
        <>
          <div className="space-y-3">
            {invites.data.map((invite) => (
              <div
                key={invite.mobilization_id}
                className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4"
                style={{ borderLeft: `4px solid ${URGENCY_BORDER[invite.urgency_tier] || '#5B7A8C'}` }}
              >
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div>
                    <p className="text-sm font-medium dark:text-textprimary-dark capitalize">
                      {invite.urgency_tier} request, {invite.blood_type} {invite.component.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {invite.requesting_org_name}, {invite.requesting_org_district}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize shrink-0 ${STATUS_STYLE[invite.invite_status]}`}>
                    {invite.invite_status}
                  </span>
                </div>

                {(invite.requesting_org_phone || invite.requesting_org_email) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-textsecondary-dark mb-3">
                    {invite.requesting_org_phone && (
                      <a href={`tel:${invite.requesting_org_phone}`} className="flex items-center gap-1 hover:text-primary dark:hover:text-textprimary-dark">
                        <Phone size={12} /> {invite.requesting_org_phone}
                      </a>
                    )}
                    {invite.requesting_org_email && (
                      <a href={`mailto:${invite.requesting_org_email}`} className="flex items-center gap-1 hover:text-primary dark:hover:text-textprimary-dark">
                        <Mail size={12} /> {invite.requesting_org_email}
                      </a>
                    )}
                  </div>
                )}

                {invite.invite_status === 'invited' && (
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      loading={respondingId === invite.mobilization_id}
                      onClick={() => handleRespond(invite.mobilization_id, 'confirmed')}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={respondingId === invite.mobilization_id}
                      onClick={() => handleRespond(invite.mobilization_id, 'declined')}
                    >
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Pagination
            page={invites.page} pageCount={invites.pageCount} total={invites.total} perPage={invites.perPage}
            onPageChange={invites.setPage} onPerPageChange={invites.setPerPage} noun="invite"
          />
        </>
      )}
    </div>
  );
}
