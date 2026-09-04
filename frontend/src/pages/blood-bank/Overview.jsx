import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend, ArcElement, RadialLinearScale } from 'chart.js';
import { Bar, Doughnut, PolarArea } from 'react-chartjs-2';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import Button from '../../components/atoms/Button';
import { listInventory } from '../../api/inventory';
import { listOutgoingAllocations } from '../../api/allocations';
import { listRequests } from '../../api/requests';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend, ArcElement, RadialLinearScale);

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const BLOOD_TYPE_COLORS = ['#1C4A3D', '#2E6B57', '#3F5B4E', '#6B9080', '#5B7A8C', '#42606F', '#8C6117', '#B8811F'];
const STATUS_COLORS = { available: '#3F5B4E', reserved: '#B8811F', dispatched: '#42606F', delivered: '#9CA3AF' };
const TOOLTIP_STYLE = { backgroundColor: '#12332A', padding: 10, titleFont: { family: 'Sora' }, bodyFont: { family: 'IBM Plex Sans' } };

function daysUntil(dateString) {
  const diffMs = new Date(dateString) - new Date();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default function BloodBankOverview() {
  const [status, setStatus] = useState('loading');
  const [inventory, setInventory] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [restockCount, setRestockCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    Promise.all([
      listInventory(),
      listOutgoingAllocations(),
      listRequests({ urgency_tier: 'restock' }),
    ])
      .then(([inv, alloc, restockRequests]) => {
        setInventory(inv);
        setAllocations(alloc);
        setRestockCount(restockRequests.filter((r) => !r.fulfillment_path).length);
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

  const available = inventory.filter((u) => u.status === 'available');
  const expiringSoon = available.filter((u) => daysUntil(u.expiry_date) <= 7).length;
  const pendingDispatches = allocations.filter((a) => a.status === 'reserved').length;

  const byBloodType = BLOOD_TYPES.map((bt) => available.filter((u) => u.blood_type === bt).length);
  const statusCounts = {
    available: inventory.filter((u) => u.status === 'available').length,
    reserved: inventory.filter((u) => u.status === 'reserved').length,
    dispatched: inventory.filter((u) => u.status === 'dispatched').length,
    delivered: inventory.filter((u) => u.status === 'delivered').length,
  };

  const expiryBuckets = [
    available.filter((u) => daysUntil(u.expiry_date) < 7).length,
    available.filter((u) => { const d = daysUntil(u.expiry_date); return d >= 7 && d < 14; }).length,
    available.filter((u) => { const d = daysUntil(u.expiry_date); return d >= 14 && d < 30; }).length,
    available.filter((u) => daysUntil(u.expiry_date) >= 30).length,
  ];

  const recent = [...inventory]
    .sort((a, b) => new Date(b.collection_date) - new Date(a.collection_date))
    .slice(0, 5);

  return (
    <div className="p-6">
      <PageHeader
        title="Overview"
        subtitle="A quick look at where your stock stands today."
        action={
          <Link to="/blood-bank/inventory/add">
            <Button variant="primary">Add inventory unit</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{available.length}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Available units</p>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl text-urgent-text dark:text-urgent-dtext">{expiringSoon}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Expiring within 7 days</p>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl text-critical-text dark:text-critical-dtext">{pendingDispatches}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Waiting on you to dispatch</p>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{restockCount}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Open restock requests</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5 lg:col-span-2">
          <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Inventory by blood group</p>
          <p className="text-xs text-gray-400 mb-4">Hover a bar to see the exact count.</p>
          <div style={{ height: 220 }}>
            <Bar
              data={{
                labels: BLOOD_TYPES,
                datasets: [{ label: 'Units available', data: byBloodType, backgroundColor: BLOOD_TYPE_COLORS, borderRadius: 6 }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE },
                scales: { y: { beginAtZero: true, grid: { color: '#F0F0EE' } }, x: { grid: { display: false } } },
              }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
          <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Status breakdown</p>
          <p className="text-xs text-gray-400 mb-4">Where your stock currently sits.</p>
          <div style={{ height: 220 }}>
            <Doughnut
              data={{
                labels: ['Available', 'Reserved', 'Dispatched', 'Delivered'],
                datasets: [{
                  data: [statusCounts.available, statusCounts.reserved, statusCounts.dispatched, statusCounts.delivered],
                  backgroundColor: [STATUS_COLORS.available, STATUS_COLORS.reserved, STATUS_COLORS.dispatched, STATUS_COLORS.delivered],
                  borderWidth: 0,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: { legend: { position: 'bottom', labels: { font: { family: 'IBM Plex Sans', size: 11 }, boxWidth: 10 } }, tooltip: TOOLTIP_STYLE },
              }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
          <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Expiry urgency</p>
          <p className="text-xs text-gray-400 mb-4">How many available units fall into each window.</p>
          <div style={{ height: 220 }}>
            <PolarArea
              data={{
                labels: ['Under 7 days', '7 to 14 days', '14 to 30 days', 'Over 30 days'],
                datasets: [{ data: expiryBuckets, backgroundColor: ['#A9382F', '#B8811F', '#5B7A8C', '#3F5B4E'], borderWidth: 0, borderColor: '#ffffff' }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { font: { family: 'IBM Plex Sans', size: 10 }, boxWidth: 10, padding: 8 } },
                  tooltip: TOOLTIP_STYLE,
                },
                scales: { r: { grid: { color: '#F0F0EE' }, ticks: { display: false } } },
              }}
            />
          </div>
        </div>
      </div>

      <p className="text-sm font-medium mb-3 dark:text-textprimary-dark">Recently added</p>
      {recent.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-textsecondary-dark">No units logged yet.</p>
      ) : (
        <div className="space-y-2">
          {recent.map((unit) => (
            <div key={unit.unit_id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 flex items-center justify-between text-sm">
              <div>
                <p className="font-medium dark:text-textprimary-dark">{unit.blood_type} {unit.component.replace('_', ' ')}</p>
                <p className="text-xs text-gray-400 mono">Collected {new Date(unit.collection_date).toLocaleDateString()}</p>
              </div>
              <span className="text-xs font-medium text-gray-500 dark:text-textsecondary-dark bg-gray-100 dark:bg-white/5 px-2.5 py-1 rounded-full capitalize">
                {unit.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
