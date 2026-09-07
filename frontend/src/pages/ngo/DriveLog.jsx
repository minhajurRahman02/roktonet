import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, TimeScale } from 'chart.js';
import { Line } from 'react-chartjs-2';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import { getDrive, getDriveLog } from '../../api/drives';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, TimeScale);

export default function DriveLog() {
  const { id } = useParams();
  const [status, setStatus] = useState('loading');
  const [drive, setDrive] = useState(null);
  const [log, setLog] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    Promise.all([getDrive(id), getDriveLog(id)])
      .then(([d, l]) => {
        setDrive(d);
        setLog(l);
        setStatus('success');
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === 'loading') {
    return (
      <div className="p-6">
        <LoadingState rows={5} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-6">
        <ErrorState message={`Couldn't load the log: ${errorMessage}`} onRetry={load} />
      </div>
    );
  }

  // Cumulative count over time -- a different shape of chart than the
  // blood-group bars/donuts used everywhere else in this app, since this
  // one is about pacing/momentum during the drive, not composition.
  const cumulativeData = log.map((_, i) => i + 1);
  const labels = log.map((entry) => new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  return (
    <div className="p-6">
      <Link to={`/ngo/drives/${id}`} className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">
        ← Back to {drive.title}
      </Link>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display font-bold text-xl dark:text-textprimary-dark">Drive Log</h1>
        <button
          disabled
          title="Coming later"
          className="text-sm font-medium border border-gray-300 dark:border-white/10 text-gray-400 px-4 py-2 rounded-lg cursor-not-allowed"
        >
          Download logs
        </button>
      </div>
      <p className="text-sm text-gray-500 dark:text-textsecondary-dark mb-6">Every unit logged against this drive, in order.</p>

      {log.length === 0 ? (
        <EmptyState message="Nothing logged yet." />
      ) : (
        <>
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5 mb-6">
            <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Collection pace</p>
            <p className="text-xs text-gray-400 mb-4">Running total of units logged over the course of the drive.</p>
            <div style={{ height: 220 }}>
              <Line
                data={{
                  labels,
                  datasets: [{
                    label: 'Cumulative units',
                    data: cumulativeData,
                    borderColor: '#1C4A3D',
                    backgroundColor: 'rgba(28, 74, 61, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#12332A' } },
                  scales: { y: { beginAtZero: true, grid: { color: '#F0F0EE' } }, x: { grid: { display: false } } },
                }}
              />
            </div>
          </div>

          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-gray-50 dark:bg-white/5 text-left text-xs text-gray-500 dark:text-textsecondary-dark">
                <tr>
                  <th className="px-4 py-3 font-medium">Donor</th>
                  <th className="px-4 py-3 font-medium">Blood type</th>
                  <th className="px-4 py-3 font-medium">Component</th>
                  <th className="px-4 py-3 font-medium">Logged at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {log.map((entry) => (
                  <tr key={entry.unit_id}>
                    <td className="px-4 py-3 font-medium dark:text-textprimary-dark">{entry.donor_name || '—'}</td>
                    <td className="px-4 py-3 dark:text-textprimary-dark">{entry.blood_type}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-textsecondary-dark capitalize">{entry.component.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-textsecondary-dark mono text-xs">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
