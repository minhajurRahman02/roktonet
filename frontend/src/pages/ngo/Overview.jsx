import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Pie, Doughnut } from 'react-chartjs-2';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import Select from '../../components/atoms/Select';
import { listDonors } from '../../api/donors';
import { listDrives } from '../../api/drives';
import { listInventory } from '../../api/inventory';
import { relativeTime } from '../../utils/relativeTime';
import { getEarliestEligibility } from '../../utils/eligibility';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend, ArcElement);

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const BLOOD_TYPE_COLORS = ['#1C4A3D', '#2E6B57', '#3F5B4E', '#6B9080', '#5B7A8C', '#42606F', '#8C6117', '#B8811F'];
const SEX_COLORS = { male: '#42606F', female: '#8C6117' };
const TOOLTIP_STYLE = { backgroundColor: '#12332A', padding: 10, titleFont: { family: 'Sora' }, bodyFont: { family: 'IBM Plex Sans' } };

const RANGE_DAYS = { week: 7, month: 30, year: 365, all: null };

function daysAgo(dateString) {
  return (new Date() - new Date(dateString)) / (1000 * 60 * 60 * 24);
}

const DRIVE_STATUS_STYLE = {
  planned: 'text-gray-500 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
  active: 'text-critical-text bg-critical-bg dark:text-critical-dtext dark:bg-critical-dbg',
  completed: 'text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg',
  cancelled: 'text-gray-400 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
};

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
  // Was previously .find() (first match only) with the display text
  // HARDCODED to say "1 live" whenever any active drive existed at all --
  // a real bug once more than one drive could be active simultaneously.
  const activeDrives = drives.filter((d) => d.status === 'active');
  const eligibleNowCount = donors.filter((d) => getEarliestEligibility(d).eligible).length;
  const maleCount = donors.filter((d) => d.sex === 'male').length;
  const femaleCount = donors.filter((d) => d.sex === 'female').length;

  const recentDrives = [...drives].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);
  const recentDonors = [...donors].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);

  return (
    <div className="p-6">
      <PageHeader title="Overview" subtitle="Your roster and drive activity at a glance." />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mb-8">
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{donors.length}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Donors in roster</p>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
          <p className="font-display font-bold text-2xl text-elective-text dark:text-elective-dtext">{eligibleNowCount}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Eligible for something now</p>
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
          <p className="font-display font-bold text-2xl dark:text-textprimary-dark">
            {activeDrives.length} {activeDrives.length === 1 ? 'drive' : 'drives'}
          </p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Currently active</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
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
          <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Roster by sex</p>
          <p className="text-xs text-gray-400 mb-4">Relevant since whole-blood eligibility differs by sex.</p>
          <div style={{ height: 220 }}>
            <Doughnut
              data={{
                labels: ['Male', 'Female'],
                datasets: [{ data: [maleCount, femaleCount], backgroundColor: [SEX_COLORS.male, SEX_COLORS.female], borderWidth: 0 }],
              }}
              options={{
                responsive: true, maintainAspectRatio: false, cutout: '60%',
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: TOOLTIP_STYLE },
              }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium dark:text-textprimary-dark">Contribution to inventory</p>
            <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-24 text-xs">
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-sm font-medium mb-3 dark:text-textprimary-dark">Recent drives</p>
          {recentDrives.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-textsecondary-dark">No drives yet.</p>
          ) : (
            <div className="space-y-2">
              {recentDrives.map((drive) => (
                <Link
                  key={drive.drive_id}
                  to={`/ngo/drives/${drive.drive_id}`}
                  className="block bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium dark:text-textprimary-dark truncate">{drive.title}</p>
                      <p className="text-xs text-gray-400">{drive.location}, {relativeTime(drive.created_at)}</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize shrink-0 ${DRIVE_STATUS_STYLE[drive.status]}`}>
                      {drive.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium mb-3 dark:text-textprimary-dark">Recently registered donors</p>
          {recentDonors.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-textsecondary-dark">No donors registered yet.</p>
          ) : (
            <div className="space-y-2">
              {recentDonors.map((donor) => (
                <Link
                  key={donor.donor_id}
                  to={`/ngo/donors/${donor.donor_id}`}
                  className="block bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium dark:text-textprimary-dark truncate">{donor.full_name || 'Unnamed donor'}</p>
                      <p className="text-xs text-gray-400">Registered {relativeTime(donor.created_at)}</p>
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-textsecondary-dark bg-gray-100 dark:bg-white/5 px-2.5 py-1 rounded-full shrink-0">
                      {donor.blood_type}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}