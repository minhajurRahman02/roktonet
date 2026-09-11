import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import LoadingState from '../molecules/LoadingState';
import ErrorState from '../molecules/ErrorState';
import { getOrganization, getOrganizationStats } from '../../api/organizations';
import { listDrives, getDriveLog } from '../../api/drives';
import { listInventory } from '../../api/inventory';
import { relativeTime } from '../../utils/relativeTime';

ChartJS.register(ArcElement, Tooltip, Legend);

const BLOOD_TYPE_COLORS = ['#1C4A3D', '#2E6B57', '#3F5B4E', '#6B9080', '#5B7A8C', '#42606F', '#8C6117', '#B8811F'];
const DRIVE_STATUS_STYLE = {
  planned: 'text-gray-500 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
  active: 'text-critical-text bg-critical-bg dark:text-critical-dtext dark:bg-critical-dbg',
  completed: 'text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg',
};

// Used identically whether this is the donor's OWN NGO or one they're
// just browsing -- highlighting "your contribution" on past drives works
// the same way either way, since a donor can genuinely donate at any
// NGO's drive regardless of affiliation (see drives.js's log-unit).
export default function NgoDetailView({ orgId, backTo, backLabel }) {
  const [status, setStatus] = useState('loading');
  const [org, setOrg] = useState(null);
  const [stats, setStats] = useState(null);
  const [drives, setDrives] = useState([]);
  const [myUnits, setMyUnits] = useState([]);
  const [activeDriveUnitCounts, setActiveDriveUnitCounts] = useState({});
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    Promise.all([getOrganization(orgId), getOrganizationStats(orgId), listDrives({ org_id: orgId }), listInventory()])
      .then(([o, s, d, units]) => {
        setOrg(o);
        setStats(s);
        setDrives(d);
        setMyUnits(units);
        setStatus('success');

        // The active drive's progress needs the TRUE total across every
        // donor, not just this caller's own units -- listInventory() is
        // deliberately donor-scoped (correct for the "your contribution"
        // highlight below, on past drives), so it would have badly
        // undercounted here. Fetched separately since which drives are
        // active isn't known until this list resolves.
        //
        // Was previously .find() (first match only) -- an NGO can
        // genuinely run more than one drive at once (e.g. two different
        // locations the same day), and an affiliated donor needs to see
        // ALL of them, not just whichever happened to come back first.
        const activeDrives = d.filter((drive) => drive.status === 'active');
        Promise.all(
          activeDrives.map((drive) => getDriveLog(drive.drive_id).then((log) => [drive.drive_id, log.length]))
        )
          .then((entries) => setActiveDriveUnitCounts(Object.fromEntries(entries)))
          .catch(() => { });
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, [orgId]);

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
        <ErrorState message={`Couldn't load this NGO: ${errorMessage}`} onRetry={load} />
      </div>
    );
  }

  const activeDrives = drives.filter((d) => d.status === 'active');
  const upcomingDrives = drives.filter((d) => d.status === 'planned');
  const completedDrives = drives.filter((d) => d.status === 'completed');
  const bloodTypeLabels = Object.keys(stats.units_by_blood_type);

  return (
    <div className="p-6">
      {backTo && (
        <Link to={backTo} className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">
          ← {backLabel}
        </Link>
      )}

      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="font-display font-bold text-lg dark:text-textprimary-dark">{org.name}</p>
            <p className="text-sm text-gray-500 dark:text-textsecondary-dark">
              {[org.thana, org.district].filter(Boolean).join(', ')}
            </p>
          </div>
          <div className="flex gap-2">
            {org.contact_phone && (
              <a href={`tel:${org.contact_phone}`} className="text-xs font-medium bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light">
                Call
              </a>
            )}
            {org.contact_email && (
              <a href={`mailto:${org.contact_email}`} className="text-xs font-medium border border-gray-300 dark:border-white/10 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5">
                Email
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5">
          <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">Lifetime units by blood group</p>
          <div style={{ height: 180 }}>
            {bloodTypeLabels.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">No units collected yet.</div>
            ) : (
              <Doughnut
                data={{
                  labels: bloodTypeLabels,
                  datasets: [{ data: Object.values(stats.units_by_blood_type), backgroundColor: BLOOD_TYPE_COLORS, borderWidth: 0 }],
                }}
                options={{ responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }}
              />
            )}
          </div>
        </div>
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5 flex flex-col justify-center">
          <p className="font-display font-bold text-3xl dark:text-textprimary-dark">{stats.total_drives}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark">Drives run</p>
          <p className="font-display font-bold text-3xl mt-3 dark:text-textprimary-dark">{stats.total_units}</p>
          <p className="text-xs text-gray-500 dark:text-textsecondary-dark">Units collected lifetime</p>
        </div>
      </div>

      {activeDrives.map((drive) => (
        <div key={drive.drive_id} className="bg-white dark:bg-surface-dark border-2 border-critical-text rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium dark:text-textprimary-dark">Live now: {drive.title}</p>
            <span className="text-xs font-medium text-critical-text bg-critical-bg dark:text-critical-dtext dark:bg-critical-dbg px-2.5 py-1 rounded-full">Active</span>
          </div>
          {drive.target_units && (
            <>
              <div className="w-full bg-gray-100 dark:bg-white/10 rounded-full h-2 mt-2 mb-1">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: `${Math.min(100, Math.round(((activeDriveUnitCounts[drive.drive_id] || 0) / drive.target_units) * 100))}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-textsecondary-dark">
                {activeDriveUnitCounts[drive.drive_id] || 0} of {drive.target_units} units collected
              </p>
            </>
          )}
        </div>
      ))}

      {upcomingDrives.length > 0 && (
        <>
          <p className="text-sm font-medium mb-2 dark:text-textprimary-dark">Upcoming drives</p>
          <div className="space-y-2 mb-6">
            {upcomingDrives.map((drive) => (
              <div key={drive.drive_id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 flex items-center justify-between text-sm">
                <span className="dark:text-textprimary-dark">{drive.title}</span>
                <span className="text-xs text-gray-400">{new Date(drive.drive_date).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {completedDrives.length > 0 && (
        <>
          <p className="text-sm font-medium mb-2 dark:text-textprimary-dark">Past drives</p>
          <div className="space-y-2">
            {completedDrives.map((drive) => {
              const myContribution = myUnits.filter((u) => u.drive_id === drive.drive_id);
              return (
                <div key={drive.drive_id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium dark:text-textprimary-dark">{drive.title}</span>
                    <span className="text-xs text-gray-400">{relativeTime(drive.completed_at)}</span>
                  </div>
                  {myContribution.length > 0 && (
                    <div className="bg-elective-bg dark:bg-elective-dbg text-elective-text dark:text-elective-dtext text-xs rounded-lg px-3 py-2 inline-block">
                      Your contribution: {myContribution.map((u) => u.component.replace('_', ' ')).join(', ')} ({myContribution.length} unit{myContribution.length === 1 ? '' : 's'})
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

NgoDetailView.propTypes = {
  orgId: PropTypes.string.isRequired,
  backTo: PropTypes.string,
  backLabel: PropTypes.string,
};