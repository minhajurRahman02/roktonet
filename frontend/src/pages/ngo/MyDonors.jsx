import { useState, useEffect, useMemo } from 'react';
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

export default function MyDonors() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  // 7.7a: the 300ms debounce is preserved, but it now lives in its own
  // state rather than in the loader's useEffect.
  //
  // The old version debounced by delaying the fetch itself. usePaginatedAsync
  // fetches whenever its deps change, so debouncing has to happen one level
  // up: `phone` updates on every keystroke for the input's sake, and
  // `debouncedPhone` trails it, and only THAT feeds the query. Without this
  // split, typing an 11-digit number would fire 11 requests and 11 page
  // resets.
  const [debouncedPhone, setDebouncedPhone] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedPhone(phone), 300);
    return () => clearTimeout(timeout);
  }, [phone]);

  const filters = useMemo(
    () => (debouncedPhone ? { phone: debouncedPhone } : {}),
    [debouncedPhone]
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
        subtitle="Everyone in your roster. Search by phone to find someone fast."
        action={
          <Link to="/ngo/donors/register">
            <Button variant="primary">Register donor</Button>
          </Link>
        }
      />

      <Input
        type="text"
        placeholder="Search by phone number..."
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
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
