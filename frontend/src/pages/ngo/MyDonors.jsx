import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Input from '../../components/atoms/Input';
import Button from '../../components/atoms/Button';
import { listDonors } from '../../api/donors';
import { formatEligibility } from '../../utils/eligibility';

export default function MyDonors() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [donors, setDonors] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [phone, setPhone] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    listDonors(phone ? { phone } : {})
      .then((data) => {
        setDonors(data);
        setStatus('success');
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, [phone]);

  useEffect(() => {
    const timeout = setTimeout(load, 300); // debounce typing
    return () => clearTimeout(timeout);
  }, [load]);

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

      {status === 'loading' && <LoadingState rows={5} />}
      {status === 'error' && <ErrorState message={`Couldn't load your roster: ${errorMessage}`} onRetry={load} />}
      {status === 'success' && donors.length === 0 && (
        <EmptyState message="No donors match this search." />
      )}
      {status === 'success' && donors.length > 0 && (
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
              {donors.map((donor) => (
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
      )}
    </div>
  );
}