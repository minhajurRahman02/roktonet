import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import ErrorState from '../../components/molecules/ErrorState';
import Button from '../../components/atoms/Button';
import DriveCalendar, { startOfMonth, calendarDate } from '../../components/organisms/DriveCalendar';
import { listDrives } from '../../api/drives';

// The donor's calendar: the same month grid the NGO scheduler uses,
// with nothing to click.
//
// Donors do not sign up for drives in RoktoNet and they do not keep
// notes, so there is no cell interaction to offer. Making the cells
// buttons anyway, opening a modal that only says "this drive exists",
// would be an interaction that promises something the product does not
// do.
//
// What a donor wants from this screen is "is anything happening near me
// soon", which the grid answers at a glance. Browse Drives remains the
// place to read the detail of one, and the link below points at it
// rather than this page duplicating it.

export default function DonorDrivesCalendar() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    // For a donor, GET /api/drives returns drives across every NGO,
    // joined to the organization name, which is why the chips can show
    // whose drive it is without a second request per card.
    listDrives()
      .then((res) => setDrives(Array.isArray(res) ? res : (res.data || [])))
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Filtered to the visible month plus a week either side, matching
  // what the grid actually draws.
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  first.setDate(first.getDate() - 7);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  last.setDate(last.getDate() + 7);
  const from = calendarDate(first);
  const to = calendarDate(last);
  const visible = drives.filter((d) => {
    const key = calendarDate(d.drive_date);
    return key >= from && key <= to;
  });

  return (
    <div className="p-6 flex flex-col" style={{ minHeight: 'calc(100vh - 4rem)' }}>
      <PageHeader
        title="Drive Calendar"
        subtitle="Every blood drive being run by NGOs on RoktoNet, month by month."
        action={
          <Link to="/donor/browse">
            <Button variant="secondary">Browse drives</Button>
          </Link>
        }
      />

      {loadError ? (
        <ErrorState message={`Couldn't load the calendar: ${loadError}`} onRetry={load} />
      ) : (
        <div className="flex-1 min-h-[520px]">
          <DriveCalendar
            month={month}
            onMonthChange={setMonth}
            drives={visible}
            loading={loading}
          />
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Hover a drive to see which organization is running it. Open Browse Drives for locations and
        full details.
      </p>
    </div>
  );
}
