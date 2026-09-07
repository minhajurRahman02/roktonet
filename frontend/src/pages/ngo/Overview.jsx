import { useState, useEffect, useCallback } from 'react';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import Select from '../../components/atoms/Select';
import { listDonors } from '../../api/donors';
import { listDrives } from '../../api/drives';
import { listInventory } from '../../api/inventory';
import { relativeTime } from '../../utils/relativeTime';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend, ArcElement);

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const BLOOD_TYPE_COLORS = ['#1C4A3D', '#2E6B57', '#3F5B4E', '#6B9080', '#5B7A8C', '#42606F', '#8C6117', '#B8811F'];
const TOOLTIP_STYLE = { backgroundColor: '#12332A', padding: 10, titleFont: { family: 'Sora' }, bodyFont: { family: 'IBM Plex Sans' } };

// How far back to look for the contribution chart -- computed client-side
// against the org's own inventory list, same pattern Blood Bank's
// Overview already uses for its charts (fetch once, aggregate in the
// browser, no new backend aggregation endpoint needed).
const RANGE_DAYS = { week: 7, month: 30, year: 365, all: null };

function daysAgo(dateString) {
  const diffMs = new Date() - new Date(dateString);
  return diffMs / (1000 * 60 * 60 * 24);
}

export default function NgoOverview() {
  const [status, setStatus] = useState('loading');
  const [donors, setDonors] = useState([]);
  const [drives, setDrives] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [range, setRange] = useState('month');

  const load = useCallback(() => {
    setStatus('loading');
    Promise.all([listDonors(), listDrives(), listInventory()])
      .then(([d, dr, inv]) => {
        setDonors(d);
        setDrives(dr);
        setInventory(inv);
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

  const rangeDays = RANGE_DAYS[range];
  const filteredInventory = rangeDays === null ? inventory : inventory.filter((u) => daysAgo(u.collection_date) <= rangeDays);

  const rosterByType = BLOOD_TYPES.map((bt) => donors.filter((d) => d.blood_type === bt).length);
  const contributionByType = BLOOD_TYPES.map((bt) => filteredInventory.filter((u) => u.blood_type === bt).length);
  const completedDrives = drives.filter((d) => d.status === 'completed');
  const activeDrive = drives.find((d) => d.status === 'active');

  const recentDrives = [...drives].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);
  const STATUS_STYLE = {
    planned: 'text-gray-500 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
    active: 'text-critical-text bg-critical-bg dark:text-critical-dtext dark:bg-critical-dbg',
    completed: 'text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg',
    cancelled: 'text-gray-400 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
  };

  return (
    <div className="p-6">
      <PageHeader title="Overview" subtitle="Your roster and drive activity at a glance." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{donors.length}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Donors in roster</p>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{completedDrives.length}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Drives completed</p>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl text-elective-text dark:text-elective-dtext">{inventory.length}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Units collected lifetime</p>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{activeDrive ? '1 live' : '0'}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Drive in progress</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
          <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Roster by blood group</p>
          <p className="text-xs text-gray-400 mb-4">Who you'd be able to call on today.</p>
          <div style={{ height: 220 }}>
            <Bar
              data={{ labels: BLOOD_TYPES, datasets: [{ data: rosterByType, backgroundColor: BLOOD_TYPE_COLORS, borderRadius: 6 }] }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE },
                scales: { y: { beginAtZero: true, grid: { color: '#F0F0EE' } }, x: { grid: { display: false } } },
              }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium dark:text-textprimary-dark">Contribution to shared inventory</p>
            <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-28 text-xs">
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
              <option value="all">All time</option>
            </Select>
          </div>
          <p className="text-xs text-gray-400 mb-4">Units your drives have actually put into the system.</p>
          <div style={{ height: 220 }}>
            {filteredInventory.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">No units in this period yet.</div>
            ) : (
              <Pie
                data={{ labels: BLOOD_TYPES, datasets: [{ data: contributionByType, backgroundColor: BLOOD_TYPE_COLORS, borderWidth: 0 }] }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: TOOLTIP_STYLE },
                }}
              />
            )}
          </div>
        </div>
      </div>

      <p className="text-sm font-medium mb-3 dark:text-textprimary-dark">Recent drives</p>
      {recentDrives.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-textsecondary-dark">No drives yet.</p>
      ) : (
        <div className="space-y-2">
          {recentDrives.map((drive) => (
            <div key={drive.drive_id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
              <div>
                <p className="font-medium dark:text-textprimary-dark">{drive.title}</p>
                <p className="text-xs text-gray-400">{drive.location}, {relativeTime(drive.created_at)}</p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize self-start sm:self-auto ${STATUS_STYLE[drive.status]}`}>
                {drive.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
