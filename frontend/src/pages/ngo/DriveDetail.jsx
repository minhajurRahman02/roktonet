import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import Button from '../../components/atoms/Button';
import Input from '../../components/atoms/Input';
import DownloadControl from '../../components/molecules/DownloadControl';
import { getDrive, startDrive, finishDrive, downloadDriveReport } from '../../api/drives';
import { listInventory } from '../../api/inventory';
import { listDonors } from '../../api/donors';
import { relativeTime } from '../../utils/relativeTime';
import { useDebouncedValue } from '../../hooks/useDebouncedFilters';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend, ArcElement);

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const BLOOD_TYPE_COLORS = ['#1C4A3D', '#2E6B57', '#3F5B4E', '#6B9080', '#5B7A8C', '#42606F', '#8C6117', '#B8811F'];
const TOOLTIP_STYLE = { backgroundColor: '#12332A' };

export default function DriveDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [drive, setDrive] = useState(null);
  const [units, setUnits] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [phone, setPhone] = useState('');
  const [donorResults, setDonorResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    Promise.all([getDrive(id), listInventory()])
      .then(([d, inventory]) => {
        setDrive(d);
        setUnits(inventory.filter((u) => u.drive_id === id));
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

  async function handleStart() {
    setStarting(true);
    try {
      await startDrive(id);
      load();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setStarting(false);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      await finishDrive(id);
      load();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setFinishing(false);
    }
  }

  // Roster lookup for logging a unit.
  //
  // This used to require typing a full phone number and pressing Search,
  // and showed nothing at all until you did. At a live drive that is the
  // wrong shape: the volunteer at the table has a person in front of
  // them and often only a first name, and an empty panel gives no hint
  // that a roster exists.
  //
  // Now the panel is always populated, the search runs as you type, and
  // it matches name, email or phone in any spelling, because the server
  // compares phone numbers digit by digit.
  //
  // DONOR_PREVIEW_COUNT is 3 when nothing has been typed, per the brief:
  // enough to show the list is alive and that these are your donors,
  // without turning the top of the page into a roster dump.
  const DONOR_PREVIEW_COUNT = 3;
  const DONOR_RESULT_COUNT = 8;

  const debouncedQuery = useDebouncedValue(phone, 300);

  useEffect(() => {
    let cancelled = false;
    const q = debouncedQuery.trim();
    const perPage = q ? DONOR_RESULT_COUNT : DONOR_PREVIEW_COUNT;

    setSearchError('');
    setSearching(true);
    listDonors(q ? { search: q, page: 1, per_page: perPage } : { page: 1, per_page: perPage })
      .then((res) => {
        if (cancelled) return;
        // listDonors returns a bare array when called without paging and
        // { data, page } when called with it. Both shapes are handled
        // because this component is not the right place to care which.
        const rows = Array.isArray(res) ? res : (res.data || []);
        setDonorResults(rows);
        if (q && rows.length === 0) {
          setSearchError('Nobody on your roster matches that. Register them below and log the unit straight after.');
        }
      })
      .catch((err) => { if (!cancelled) setSearchError(err.message); })
      .finally(() => { if (!cancelled) setSearching(false); });

    // Cancelled rather than aborted: a stale response that arrives after
    // a newer one must not overwrite it, which is the classic
    // search-as-you-type bug where the list settles on the answer to a
    // prefix of what you typed.
    return () => { cancelled = true; };
  }, [debouncedQuery]);

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
        <ErrorState message={`Couldn't load this drive: ${errorMessage}`} onRetry={load} />
      </div>
    );
  }

  const byBloodType = BLOOD_TYPES.map((bt) => units.filter((u) => u.blood_type === bt).length);
  const uniqueDonors = new Set(units.map((u) => u.donor_id)).size;
  const recent = [...units].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);

  // ============ PLANNED ============
  if (drive.status === 'planned') {
    return (
      <div className="p-6">
        <Link to="/ngo/drives" className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">← Back to My Blood Drives</Link>
        <h1 className="font-display font-bold text-xl mb-1 dark:text-textprimary-dark">{drive.title}</h1>
        <p className="text-sm text-gray-500 dark:text-textsecondary-dark mb-6">
          {drive.location}, planned for {new Date(drive.drive_date).toLocaleDateString()}
          {drive.target_units && `, target ${drive.target_units} units`}
        </p>
        <Button variant="primary" loading={starting} onClick={handleStart}>Start drive</Button>
      </div>
    );
  }

  // ============ COMPLETED ============
  if (drive.status === 'completed') {
    const percentOfTarget = drive.target_units ? Math.round((units.length / drive.target_units) * 100) : null;
    return (
      <div className="p-6">
        <Link to="/ngo/drives" className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">← Back to My Blood Drives</Link>
        <h1 className="font-display font-bold text-xl mb-1 dark:text-textprimary-dark">{drive.title}</h1>
        <p className="text-sm text-gray-500 dark:text-textsecondary-dark mb-6">
          Completed {relativeTime(drive.completed_at)}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
            <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{units.length}</p>
            <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Units collected</p>
          </div>
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
            <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{uniqueDonors}</p>
            <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Donors who gave</p>
          </div>
          {percentOfTarget !== null && (
            <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
              <p className="font-display font-bold text-2xl text-elective-text dark:text-elective-dtext">{percentOfTarget}%</p>
              <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Of target ({drive.target_units})</p>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5 mb-6">
          <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Final blood group breakdown</p>
          <div style={{ height: 220 }}>
            <Doughnut
              data={{ labels: BLOOD_TYPES, datasets: [{ data: byBloodType, backgroundColor: BLOOD_TYPE_COLORS, borderWidth: 0 }] }}
              options={{ responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: TOOLTIP_STYLE } }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to={`/ngo/drives/${id}/log`} className="text-sm font-medium text-primary dark:text-textprimary-dark underline">
            View full log
          </Link>
          {/* The summary, not the raw log. The raw per-unit export
              lives on the Drive Log page, next to the table it
              exports, so each download sits beside the thing it is a
              copy of. */}
          <DownloadControl
            label="Generate report"
            defaultFormat="pdf"
            onDownload={(format) => downloadDriveReport(id, format)}
          />
        </div>
      </div>
    );
  }

  // ============ ACTIVE ============
  const progressPercent = drive.target_units ? Math.min(100, Math.round((units.length / drive.target_units) * 100)) : null;

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
        <div>
          <h1 className="font-display font-bold text-xl dark:text-textprimary-dark">{drive.title}</h1>
          <p className="text-sm text-gray-500 dark:text-textsecondary-dark">Started {relativeTime(drive.started_at)}</p>
        </div>
        <Button variant="critical" loading={finishing} onClick={handleFinish} className="self-start sm:self-auto">Finish drive</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 my-6">
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5 flex items-center gap-4">
          {drive.target_units && (
            <div style={{ width: 90, height: 90 }} className="relative shrink-0">
              <Doughnut
                data={{ datasets: [{ data: [progressPercent, 100 - progressPercent], backgroundColor: ['#1C4A3D', '#EDEEEC'], borderWidth: 0 }] }}
                options={{ responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display font-bold text-base dark:text-textprimary-dark">{progressPercent}%</span>
              </div>
            </div>
          )}
          <div>
            <p className="font-display font-bold text-2xl dark:text-textprimary-dark">
              {units.length}{drive.target_units && <span className="text-sm text-gray-400 font-normal"> / {drive.target_units}</span>}
            </p>
            <p className="text-xs text-gray-500 dark:text-textsecondary-dark">Units collected{drive.target_units && ' vs target'}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
          <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{uniqueDonors}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Unique donors so far</p>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
          <p className="font-display font-bold text-2xl dark:text-textprimary-dark">{units.length}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">Total units so far</p>
        </div>
      </div>

      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5 mb-6">
        <div className="flex items-baseline justify-between mb-3 gap-3">
          <p className="text-sm font-medium dark:text-textprimary-dark">Find a donor</p>
          <p className="text-xs text-gray-400">
            {searching ? 'Searching…'
              : phone.trim() ? `${donorResults.length} match${donorResults.length === 1 ? '' : 'es'}`
                : 'Recent donors on your roster'}
          </p>
        </div>
        {/* The form wrapper stays so Enter behaves, but there is no
            Search button any more: results follow the typing. */}
        <form onSubmit={(e) => e.preventDefault()}>
          <Input
            placeholder="Search by name, phone or email…"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full"
          />
        </form>
        {searchError && <p className="text-xs text-critical-text dark:text-critical-dtext mt-2">{searchError}</p>}

        {donorResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {donorResults.map((d) => (
              <div
                key={d.donor_id}
                className="flex items-center justify-between gap-3 border border-gray-100 dark:border-white/10 rounded-lg p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium dark:text-textprimary-dark truncate">
                    {d.full_name || 'Unnamed donor'}
                    {d.blood_type && <span className="text-gray-400 font-normal">, {d.blood_type}</span>}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {d.phone_number ? `${d.phone_number} · ` : ''}
                    {d.last_donation_date
                      ? `Last donated ${new Date(d.last_donation_date).toLocaleDateString()}`
                      : 'Never donated before'}
                  </p>
                </div>
                <Button
                  variant="primary"
                  className="shrink-0"
                  onClick={() => navigate(`/ngo/drives/${id}/log-unit/${d.donor_id}`)}
                >
                  Log unit
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">
          Not found? <Link to="/ngo/donors/register" className="text-primary dark:text-textprimary-dark underline">Register a new donor</Link> and log their unit right after.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
          <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Collected so far, by blood group</p>
          <div style={{ height: 200 }}>
            <Bar
              data={{ labels: BLOOD_TYPES, datasets: [{ data: byBloodType, backgroundColor: BLOOD_TYPE_COLORS, borderRadius: 6 }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: TOOLTIP_STYLE }, scales: { y: { beginAtZero: true, grid: { color: '#F0F0EE' } }, x: { grid: { display: false } } } }}
            />
          </div>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium dark:text-textprimary-dark">Just logged</p>
            <Link to={`/ngo/drives/${id}/log`} className="text-xs font-medium text-primary dark:text-textprimary-dark underline">
              View full log
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-textsecondary-dark">Nothing logged yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {recent.map((unit) => (
                <div key={unit.unit_id} className="flex items-center justify-between">
                  <span className="dark:text-textprimary-dark">{unit.blood_type} {unit.component.replace('_', ' ')}</span>
                  <span className="text-xs text-gray-400">{relativeTime(unit.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}