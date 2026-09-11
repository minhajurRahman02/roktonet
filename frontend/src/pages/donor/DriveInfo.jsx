import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import { getDrive, getDriveLog } from '../../api/drives';
import { getOrganization } from '../../api/organizations';

const STATUS_LABELS = { active: 'Running now', planned: 'Upcoming', completed: 'Completed' };
const STATUS_STYLE = {
  active: 'text-critical-text bg-critical-bg dark:text-critical-dtext dark:bg-critical-dbg',
  planned: 'text-gray-500 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
  completed: 'text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg',
};

export default function DriveInfo() {
  const { id } = useParams();
  const [status, setStatus] = useState('loading');
  const [drive, setDrive] = useState(null);
  const [org, setOrg] = useState(null);
  const [unitsCollected, setUnitsCollected] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    getDrive(id)
      .then((d) => {
        setDrive(d);
        // getDriveLog returns every unit logged against this drive by
        // ANY donor -- listInventory() would have been wrong here,
        // since for a donor caller it's deliberately scoped to only
        // their own donations (correct for Donation History, but not
        // for a drive-wide progress count. A donor who gave 1 of 25
        // units would have seen "1 of 25" instead of the real "21 of 25").
        return Promise.all([getOrganization(d.org_id), getDriveLog(id)]);
      })
      .then(([o, log]) => {
        setOrg(o);
        setUnitsCollected(log.length);
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

  return (
    <div className="p-6">
      <Link to="/donor/browse" className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">
        ← Back to Browse Drives
      </Link>
      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5 max-w-lg">
        <div className="flex items-center justify-between mb-1 gap-2">
          <h1 className="font-display font-bold text-xl dark:text-textprimary-dark">{drive.title}</h1>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLE[drive.status]}`}>
            {STATUS_LABELS[drive.status]}
          </span>
        </div>
        <p className="text-sm text-gray-500 dark:text-textsecondary-dark mb-4">
          {org.name} - {drive.location}
        </p>

        {drive.target_units && (
          <>
            <div className="w-full bg-gray-100 dark:bg-white/10 rounded-full h-2 mb-1">
              <div
                className="bg-primary h-2 rounded-full"
                style={{ width: `${Math.min(100, Math.round((unitsCollected / drive.target_units) * 100))}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-textsecondary-dark mb-4">
              {unitsCollected} of {drive.target_units} units collected
            </p>
          </>
        )}

        {drive.status !== 'completed' && (
          <div className="flex gap-2">
            {org.contact_phone && (
              <a href={`tel:${org.contact_phone}`} className="text-xs font-medium bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light">
                Call to attend
              </a>
            )}
            {org.contact_email && (
              <a href={`mailto:${org.contact_email}`} className="text-xs font-medium border border-gray-300 dark:border-white/10 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5">
                Email
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}