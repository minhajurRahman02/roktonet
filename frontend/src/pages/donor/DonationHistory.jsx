import { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import { listInventory } from '../../api/inventory';

export default function DonationHistory() {
  const [status, setStatus] = useState('loading');
  const [units, setUnits] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    listInventory()
      .then((data) => {
        setUnits(data);
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

  return (
    <div className="p-6">
      <PageHeader title="Donation History" subtitle="Every unit you've given, on record." />

      {status === 'loading' && <LoadingState rows={5} />}
      {status === 'error' && <ErrorState message={`Couldn't load your history: ${errorMessage}`} onRetry={load} />}
      {status === 'success' && units.length === 0 && (
        <EmptyState message="No donations logged yet." />
      )}
      {status === 'success' && units.length > 0 && (
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
              {units.map((unit) => (
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
      )}
    </div>
  );
}
