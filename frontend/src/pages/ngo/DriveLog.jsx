import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Chart as ChartJS, LineElement, PointElement, BarElement, ArcElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Pagination from '../../components/molecules/Pagination';
import { useClientPagination } from '../../hooks/usePaginatedAsync';
import Select from '../../components/atoms/Select';
import DownloadControl from '../../components/molecules/DownloadControl';
import { getDrive, getDriveLog, downloadDriveLog } from '../../api/drives';

ChartJS.register(LineElement, PointElement, BarElement, ArcElement, CategoryScale, LinearScale, Tooltip, Legend);

const TOOLTIP_STYLE = { backgroundColor: '#12332A' };
const COMPONENT_COLORS = { whole_blood: '#1C4A3D', platelets: '#B8811F', plasma: '#5B7A8C' };
const SEX_COLORS = { male: '#42606F', female: '#8C6117' };

// Fixed time buckets, not one point per logged unit -- the point is to
// show collection PACE against real calendar time, not just a sequence
// of events.
//
// The interval is now chosen by the person looking at the chart, with
// 'auto' keeping the original behaviour as the default. Auto adapts to
// the drive's real duration so a 20-minute drive does not get 30-minute
// buckets (nothing to show) and an 8-hour drive does not get 5-minute
// buckets (hundreds of flat points).
//
// A manual choice is worth having because auto optimises for one
// question, "how did this drive go", and there are others. Comparing
// this week's Friday drive with last week's needs both on 24-hour
// buckets whatever their individual lengths, and the long intervals
// exist for exactly that.
export const INTERVAL_OPTIONS = [
  { value: 'auto', label: 'Auto', minutes: null },
  { value: '30m', label: 'Every 30 minutes', minutes: 30 },
  { value: '1h', label: 'Hourly', minutes: 60 },
  { value: '2h', label: 'Every 2 hours', minutes: 120 },
  { value: '3h', label: 'Every 3 hours', minutes: 180 },
  { value: '4h', label: 'Every 4 hours', minutes: 240 },
  { value: '5h', label: 'Every 5 hours', minutes: 300 },
  { value: '24h', label: 'Daily', minutes: 1440 },
  { value: '48h', label: 'Every 2 days', minutes: 2880 },
  { value: '72h', label: 'Every 3 days', minutes: 4320 },
];

// A drive lasts hours, so a 72-hour bucket can legitimately produce a
// single point. That is a real answer to a badly matched question
// rather than an error, but the chart says so rather than drawing one
// dot and leaving the reader to wonder.
const MAX_BUCKETS = 400;

function buildCumulativeTimeSeries(log, startTime, intervalMinutes) {
  if (log.length === 0) return { labels: [], data: [], bucketMinutes: 0, truncated: false };

  const start = new Date(startTime);
  const end = new Date(log[log.length - 1].created_at);
  const totalMinutes = Math.max(1, (end - start) / 60000);

  const bucketMinutes = intervalMinutes
    || (totalMinutes <= 60 ? 5 : totalMinutes <= 180 ? 15 : 30);

  // Long drives on a short interval would otherwise render thousands of
  // points and lock the tab up. Capped, and the cap is reported so the
  // chart can say the view is clipped instead of quietly lying.
  const rawCount = Math.ceil(totalMinutes / bucketMinutes) + 1;
  const bucketCount = Math.min(rawCount, MAX_BUCKETS);
  const truncated = rawCount > MAX_BUCKETS;

  // Labels drop the time and show a date once buckets are a day or
  // more apart: "02:00" repeated across three days tells you nothing.
  const showDate = bucketMinutes >= 1440;

  const labels = [];
  const data = [];
  for (let i = 0; i <= bucketCount; i++) {
    const bucketTime = new Date(start.getTime() + i * bucketMinutes * 60000);
    if (bucketTime > new Date() && bucketTime > end) break;
    labels.push(
      showDate
        ? bucketTime.toLocaleDateString([], { day: '2-digit', month: 'short' })
        : bucketTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    data.push(log.filter((entry) => new Date(entry.created_at) <= bucketTime).length);
  }
  return { labels, data, bucketMinutes, truncated };
}

function countBy(log, key) {
  const counts = {};
  for (const entry of log) {
    const value = entry[key];
    if (!value) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

export default function DriveLog() {
  const { id } = useParams();
  const [status, setStatus] = useState('loading');
  const [drive, setDrive] = useState(null);
  const [log, setLog] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  // Default 'auto', so the chart looks exactly as it did before anyone
  // touches the selector.
  //
  // Named intervalKey rather than interval because setInterval would
  // shadow the global timer function inside this component, which is
  // the kind of thing that works fine until somebody adds a timer here
  // and spends an afternoon on it.
  const [intervalKey, setIntervalKey] = useState('auto');

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

  // 7.7a: the TABLE pages client-side; the CHART does not.
  //
  // buildChart() counts the whole log into time buckets to draw the
  // cumulative collection curve. Hand it one page and every point on that
  // curve is wrong -- the same failure that paginating the Overview pages
  // would cause. So `log` stays whole for the chart, and only the table
  // below renders a slice of it.
  //
  // Client-side rather than server-side because /api/drives/:id/log is a
  // single drive's log, bounded by how many units one drive collects, and
  // because the chart needs the full array in memory regardless.
  const paged = useClientPagination(log, { storageKey: 'ngo.driveLog', defaultPerPage: 25 });

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

  const chosen = INTERVAL_OPTIONS.find((o) => o.value === intervalKey) || INTERVAL_OPTIONS[0];
  const timeSeries = buildCumulativeTimeSeries(
    log, drive.started_at || drive.drive_date, chosen.minutes
  );
  const componentCounts = countBy(log, 'component');
  const sexCounts = countBy(log, 'donor_sex');

  return (
    <div className="p-6">
      <Link to={`/ngo/drives/${id}`} className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">
        ← Back to {drive.title}
      </Link>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display font-bold text-xl dark:text-textprimary-dark">Drive Log</h1>
        <DownloadControl
          label="Download logs"
          defaultFormat="xlsx"
          disabled={log.length === 0}
          hint={log.length === 0 ? 'Nothing logged yet.' : ''}
          onDownload={(format) => downloadDriveLog(id, format)}
        />
      </div>
      <p className="text-sm text-gray-500 dark:text-textsecondary-dark mb-6">Every unit logged against this drive, in order.</p>

      {log.length === 0 ? (
        <EmptyState message="Nothing logged yet." />
      ) : (
        <>
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5 mb-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              {/* min-w-0 so the heading column can shrink instead of
                  being squeezed to nothing by the select beside it. */}
              <div className="min-w-0">
                <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Collection pace</p>
                <p className="text-xs text-gray-400">
                  Cumulative units collected, one point per{' '}
                  {chosen.minutes
                    ? chosen.label.toLowerCase().replace('every ', '').replace('hourly', 'hour').replace('daily', 'day')
                    : `${timeSeries.bucketMinutes} minutes, chosen to suit this drive's length`}.
                </p>
              </div>
              {/* Sized by the wrapper, not by a class on the Select.
                  Select carries w-full in its own base classes, and two
                  competing width utilities resolve by stylesheet order
                  rather than by which one was passed in, which is not
                  something to rely on. */}
              <div className="w-44 shrink-0">
                <Select
                  value={intervalKey}
                  onChange={(e) => setIntervalKey(e.target.value)}
                  aria-label="Chart interval"
                >
                  {INTERVAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </div>
            </div>
            {timeSeries.truncated && (
              <p className="text-xs text-urgent-text dark:text-urgent-dtext mb-3">
                This drive is long enough that the chart is showing only the first part of it at
                this interval. Pick a longer one to see the whole thing.
              </p>
            )}
            <div style={{ height: 220 }}>
              <Line
                data={{
                  labels: timeSeries.labels,
                  datasets: [{
                    label: 'Cumulative units',
                    data: timeSeries.data,
                    borderColor: '#1C4A3D',
                    backgroundColor: 'rgba(28, 74, 61, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    stepped: true,
                  }],
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
              <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">By component</p>
              <p className="text-xs text-gray-400 mb-4">What was collected, not just how much.</p>
              <div style={{ height: 200 }}>
                <Doughnut
                  data={{
                    labels: Object.keys(componentCounts).map((c) => c.replace('_', ' ')),
                    datasets: [{
                      data: Object.values(componentCounts),
                      backgroundColor: Object.keys(componentCounts).map((c) => COMPONENT_COLORS[c] || '#9CA3AF'),
                      borderWidth: 0,
                    }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false, cutout: '60%',
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: TOOLTIP_STYLE },
                  }}
                />
              </div>
            </div>

            <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
              <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">By donor sex</p>
              <p className="text-xs text-gray-400 mb-4">Split of units by donor sex on file.</p>
              <div style={{ height: 200 }}>
                <Doughnut
                  data={{
                    labels: Object.keys(sexCounts).map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
                    datasets: [{
                      data: Object.values(sexCounts),
                      backgroundColor: Object.keys(sexCounts).map((s) => SEX_COLORS[s] || '#9CA3AF'),
                      borderWidth: 0,
                    }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false, cutout: '60%',
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: TOOLTIP_STYLE },
                  }}
                />
              </div>
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
                {paged.pageItems.map((entry) => (
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
          <Pagination
            page={paged.page} pageCount={paged.pageCount} total={paged.total} perPage={paged.perPage}
            onPageChange={paged.setPage} onPerPageChange={paged.setPerPage} noun="entry"
          />
        </>
      )}
    </div>
  );
}