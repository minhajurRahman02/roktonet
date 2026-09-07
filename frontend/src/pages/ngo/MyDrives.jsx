import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Button from '../../components/atoms/Button';
import { listDrives, startDrive } from '../../api/drives';
import { relativeTime } from '../../utils/relativeTime';

const STATUS_STYLE = {
  planned: 'text-gray-500 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
  active: 'text-critical-text bg-critical-bg dark:text-critical-dtext dark:bg-critical-dbg',
  completed: 'text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg',
  cancelled: 'text-gray-400 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
};

export default function MyDrives() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [drives, setDrives] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [startingId, setStartingId] = useState(null);

  const load = useCallback(() => {
    setStatus('loading');
    listDrives()
      .then((data) => {
        setDrives(data);
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

  async function handleStart(driveId) {
    setStartingId(driveId);
    try {
      await startDrive(driveId);
      navigate(`/ngo/drives/${driveId}`);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="My Blood Drives"
        subtitle="Every drive you've planned, run, or completed."
        action={
          <Link to="/ngo/drives/new">
            <Button variant="primary">Create drive</Button>
          </Link>
        }
      />

      {status === 'loading' && <LoadingState rows={4} />}
      {status === 'error' && <ErrorState message={`Couldn't load your drives: ${errorMessage}`} onRetry={load} />}
      {status === 'success' && drives.length === 0 && (
        <EmptyState message="No drives yet." actionLabel="Create your first drive" onAction={() => navigate('/ngo/drives/new')} />
      )}
      {status === 'success' && drives.length > 0 && (
        <div className="space-y-2">
          {drives.map((drive) => (
            <div
              key={drive.drive_id}
              className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              style={drive.status === 'active' ? { borderLeft: '4px solid #A9382F' } : undefined}
            >
              <div>
                <p className="text-sm font-medium dark:text-textprimary-dark">{drive.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {drive.location}
                  {drive.status === 'planned' && `, ${new Date(drive.drive_date).toLocaleDateString()}`}
                  {drive.status === 'active' && `, started ${relativeTime(drive.started_at)}`}
                  {drive.status === 'completed' && `, completed ${relativeTime(drive.completed_at)}`}
                  {drive.target_units && `, target ${drive.target_units} units`}
                </p>
              </div>

              {drive.status === 'planned' && (
                <Button variant="primary" loading={startingId === drive.drive_id} onClick={() => handleStart(drive.drive_id)} className="self-start sm:self-auto">
                  Start drive
                </Button>
              )}
              {drive.status === 'active' && (
                <Link to={`/ngo/drives/${drive.drive_id}`} className="self-start sm:self-auto">
                  <Button variant="secondary">Resume live drive</Button>
                </Link>
              )}
              {drive.status === 'completed' && (
                <Link to={`/ngo/drives/${drive.drive_id}`} className="text-sm text-primary dark:text-textprimary-dark underline self-start sm:self-auto">
                  View summary
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
