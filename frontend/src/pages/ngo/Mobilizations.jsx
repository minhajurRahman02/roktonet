import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Pagination from '../../components/molecules/Pagination';
import { usePaginatedAsync } from '../../hooks/usePaginatedAsync';
import { listMobilizations } from '../../api/mobilizations';

const STATUS_STYLE = {
  invited: 'text-gray-500 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
  confirmed: 'text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg',
  declined: 'text-gray-400 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
};

export default function Mobilizations() {
  // 7.7a: paginated. listMobilizations gained a filters argument in the
  // same pass (api/mobilizations.js) -- it previously took none at all, so
  // there was no way to forward the paging params.
  const mobilizations = usePaginatedAsync(
    ({ page, per_page }) => listMobilizations({ page, per_page }),
    [],
    { storageKey: 'ngo.mobilizations' }
  );

  return (
    <div className="p-6">
      <PageHeader title="Mobilizations" subtitle="Invites currently out to donors in your roster." />

      {mobilizations.status === 'loading' && <LoadingState rows={4} />}
      {mobilizations.status === 'error' && <ErrorState message={`Couldn't load mobilizations: ${mobilizations.error}`} onRetry={mobilizations.reload} />}
      {mobilizations.isEmpty && (
        <EmptyState message="None of your donors have been invited to anything yet." />
      )}
      {mobilizations.status === 'success' && mobilizations.data.length > 0 && (
        <>
          <div className="space-y-2">
            {mobilizations.data.map((m) => (
              <div key={m.mobilization_id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-sm font-medium dark:text-textprimary-dark">{m.donor_name || 'Unnamed donor'}, {m.donor_blood_type}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Invited for a {m.urgency_tier} request at {m.requesting_org_name}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize self-start sm:self-auto ${STATUS_STYLE[m.invite_status]}`}>
                  {m.invite_status}
                </span>
              </div>
            ))}
          </div>
          <Pagination
            page={mobilizations.page} pageCount={mobilizations.pageCount} total={mobilizations.total} perPage={mobilizations.perPage}
            onPageChange={mobilizations.setPage} onPerPageChange={mobilizations.setPerPage} noun="invite"
          />
        </>
      )}
    </div>
  );
}
