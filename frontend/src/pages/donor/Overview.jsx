import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import { useAuth } from '../../context/AuthContext';
import { getDonor } from '../../api/donors';
import { listInventory } from '../../api/inventory';
import { listMobilizations } from '../../api/mobilizations';
import { formatEligibility, getEligibility } from '../../utils/eligibility';
import { relativeTime } from '../../utils/relativeTime';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const COMPONENT_COLORS = { whole_blood: '#1C4A3D', platelets: '#B8811F', plasma: '#5B7A8C' };
const TOOLTIP_STYLE = { backgroundColor: '#12332A' };

export default function DonorOverview() {
  const { user } = useAuth();
  const [status, setStatus] = useState('loading');
  const [donor, setDonor] = useState(null);
  const [units, setUnits] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    Promise.all([getDonor(user.donor_id), listInventory(), listMobilizations()])
      .then(([d, inv, invites]) => {
        setDonor(d);
        setUnits(inv);
        setPendingCount(invites.filter((i) => i.invite_status === 'invited').length);
        setStatus('success');
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, [user.donor_id]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === 'loading') {
    return (
      <div className="p-6">
        <LoadingState rows={4} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-6">
        <ErrorState message={`Couldn't load your overview: ${errorMessage}`} onRetry={load} />
      </div>
    );
  }

  const componentCounts = ['whole_blood', 'platelets', 'plasma'].map(
    (c) => units.filter((u) => u.component === c).length
  );
  const eligibilityDays = ['whole_blood', 'platelets', 'plasma'].map((c) => {
    const e = getEligibility(donor, c);
    if (e.eligible) return 0;
    return Math.ceil((e.eligibleDate - new Date()) / (1000 * 60 * 60 * 24));
  });
  const recent = [...units].sort((a, b) => new Date(b.collection_date) - new Date(a.collection_date)).slice(0, 3);

  return (
    <div className="p-6">
      <PageHeader title="Overview" subtitle="Your eligibility and activity at a glance." />

      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5 mb-6">
        <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Your eligibility</p>
        <p className="text-sm text-elective-text dark:text-elective-dtext font-medium">{formatEligibility(donor)}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-8">
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{units.length}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Lifetime donations</p>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl text-urgent-text dark:text-urgent-dtext">{pendingCount}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Pending invites</p>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{donor.blood_type}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Your blood type</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
          <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Your donations by component</p>
          <p className="text-xs text-gray-400 mb-4">What you've given, lifetime.</p>
          <div style={{ height: 200 }}>
            {units.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">Nothing logged yet.</div>
            ) : (
              <Doughnut
                data={{
                  labels: ['Whole blood', 'Platelets', 'Plasma'],
                  datasets: [{ data: componentCounts, backgroundColor: [COMPONENT_COLORS.whole_blood, COMPONENT_COLORS.platelets, COMPONENT_COLORS.plasma], borderWidth: 0 }],
                }}
                options={{ responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: TOOLTIP_STYLE } }}
              />
            )}
          </div>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
          <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Days until eligible</p>
          <p className="text-xs text-gray-400 mb-4">Zero means you're already clear.</p>
          <div style={{ height: 200 }}>
            <Bar
              data={{
                labels: ['Whole blood', 'Platelets', 'Plasma'],
                datasets: [{ data: eligibilityDays, backgroundColor: eligibilityDays.map((d) => (d > 0 ? '#A9382F' : '#3F5B4E')), borderRadius: 6 }],
              }}
              options={{
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE },
                scales: { x: { beginAtZero: true, grid: { color: '#F0F0EE' } }, y: { grid: { display: false } } },
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium dark:text-textprimary-dark">Recent donations</p>
        <Link to="/donor/history" className="text-xs font-medium text-primary dark:text-textprimary-dark hover:underline">View all</Link>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-textsecondary-dark">Nothing logged yet.</p>
      ) : (
        <div className="space-y-2">
          {recent.map((unit) => (
            <div key={unit.unit_id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 flex items-center justify-between text-sm">
              <span className="dark:text-textprimary-dark capitalize">{unit.component.replace('_', ' ')}</span>
              <span className="text-xs text-gray-400">{relativeTime(unit.collection_date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
