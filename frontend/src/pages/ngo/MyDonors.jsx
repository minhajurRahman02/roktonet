import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Pagination from '../../components/molecules/Pagination';
import Input from '../../components/atoms/Input';
import Button from '../../components/atoms/Button';
import { usePaginatedAsync } from '../../hooks/usePaginatedAsync';
import { listDonors } from '../../api/donors';
import { formatEligibility } from '../../utils/eligibility';
import { useDebouncedValue } from '../../hooks/useDebouncedFilters';

export default function MyDonors() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  // The 300ms debounce this page already had, now from the shared hook
  // so every search in RoktoNet waits the same amount of time.
  //
  // Why the debounce has to live here rather than inside the loader:
  // usePaginatedAsync fetches whenever its deps change, so `query`
  // updates on every keystroke for the input's sake and
  // `debouncedQuery` trails it, and only THAT feeds the query. Without
  // the split, typing an 11-digit number is 11 requests and 11 page
  // resets.
  const debouncedQuery = useDebouncedValue(query, 300);

  // `search` rather than `phone`: the same box now finds a donor by
  // name or email as well, and matches a phone number whichever way it
  // is punctuated. Searching a roster by phone alone assumed the
  // volunteer already had the number, which at a drive is usually the
  // thing they are trying to look up.
  const filters = useMemo(
    () => (debouncedQuery.trim() ? { search: debouncedQuery.trim() } : {}),
    [debouncedQuery]
  );

  const donors = usePaginatedAsync(
    ({ page, per_page }) => listDonors({ ...filters, page, per_page }),
    [filters],
    { storageKey: 'ngo.myDonors' }
  );

  return (
    <div className="p-6">
      <PageHeader
        title="My Donors"
        subtitle="Everyone in your roster. Search by name, phone or email to find someone fast."
        action={
          <Link to="/ngo/donors/register">
            <Button variant="primary">Register donor</Button>
          </Link>
        }
      />

      <Input
        type="text"
        placeholder="Search by name, phone or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full sm:w-80 mb-4"
      />

      {donors.status === 'loading' && <LoadingState rows={5} />}
      {donors.status === 'error' && <ErrorState message={`Couldn't load your roster: ${donors.error}`} onRetry={donors.reload} />}
      {donors.isEmpty && <EmptyState message="No donors match this search." />}
      {donors.status === 'success' && donors.data.length > 0 && (
        <>
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-gray-50 dark:bg-white/5 text-left text-xs text-gray-500 dark:text-textsecondary-dark">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Blood type</th>
                  <th className="px-4 py-3 font-medium">Last donation</th>
                  <th className="px-4 py-3 font-medium">Donated component</th>
                  <th className="px-4 py-3 font-medium">Eligibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {donors.data.map((donor) => (
                  <tr
                    key={donor.donor_id}
                    className="hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer"
                    onClick={() => navigate(`/ngo/donors/${donor.donor_id}`)}
                  >
                    <td className="px-4 py-3 font-medium dark:text-textprimary-dark">{donor.full_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-textsecondary-dark mono text-xs">{donor.phone_number}</td>
                    <td className="px-4 py-3 dark:text-textprimary-dark">{donor.blood_type}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-textsecondary-dark mono text-xs">
                      {donor.last_donation_date ? new Date(donor.last_donation_date).toLocaleDateString() : 'Never donated'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-textsecondary-dark capitalize">
                      {donor.last_donation_component ? donor.last_donation_component.replace('_', ' ') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-textsecondary-dark text-xs max-w-xs">
                      {formatEligibility(donor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={donors.page} pageCount={donors.pageCount} total={donors.total} perPage={donors.perPage}
            onPageChange={donors.setPage} onPerPageChange={donors.setPerPage} noun="donor"
          />
        </>
      )}
    </div>
  );
}
