import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Pagination from '../../components/molecules/Pagination';
import { usePaginatedAsync } from '../../hooks/usePaginatedAsync';
import { listInventory } from '../../api/inventory';

export default function DonationHistory() {
  // 7.7a: paginated. GET /api/inventory has a donor branch that scopes to
  // the caller's own donor record, and that branch now pages too -- a donor
  // with a long history was the exact case the old unbounded fetch handled
  // worst.
  const units = usePaginatedAsync(
    ({ page, per_page }) => listInventory({ page, per_page }),
    [],
    { storageKey: 'donor.donationHistory', defaultPerPage: 10 }
  );

  return (
    <div className="p-6">
      <PageHeader title="Donation History" subtitle="Every unit you've given, on record." />

      {units.status === 'loading' && <LoadingState rows={5} />}
      {units.status === 'error' && <ErrorState message={`Couldn't load your history: ${units.error}`} onRetry={units.reload} />}
      {units.isEmpty && <EmptyState message="No donations logged yet." />}
      {units.status === 'success' && units.data.length > 0 && (
        <>
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-gray-50 dark:bg-white/5 text-left text-xs text-gray-500 dark:text-textsecondary-dark">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Component</th>
                  <th className="px-4 py-3 font-medium">Blood type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {units.data.map((unit) => (
                  <tr key={unit.unit_id}>
                    <td className="px-4 py-3 mono text-xs text-gray-500 dark:text-textsecondary-dark">
                      {new Date(unit.collection_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-textsecondary-dark capitalize">{unit.component.replace('_', ' ')}</td>
                    <td className="px-4 py-3 dark:text-textprimary-dark">{unit.blood_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={units.page} pageCount={units.pageCount} total={units.total} perPage={units.perPage}
            onPageChange={units.setPage} onPerPageChange={units.setPerPage} noun="donation"
          />
        </>
      )}
    </div>
  );
}
