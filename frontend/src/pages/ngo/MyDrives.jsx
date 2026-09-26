import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Pagination from '../../components/molecules/Pagination';
import { Trash2 } from 'lucide-react';
import Button from '../../components/atoms/Button';
import Modal from '../../components/admin/Modal';
import { usePaginatedAsync } from '../../hooks/usePaginatedAsync';
import { listDrives, startDrive, deleteDrive } from '../../api/drives';
import { relativeTime } from '../../utils/relativeTime';

const STATUS_STYLE = {
  planned: 'text-gray-500 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
  active: 'text-critical-text bg-critical-bg dark:text-critical-dtext dark:bg-critical-dbg',
  completed: 'text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg',
  cancelled: 'text-gray-400 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
};

export default function MyDrives() {
  const navigate = useNavigate();
  const [startingId, setStartingId] = useState(null);
  // 7.7a: a separate error slot for the Start action.
  //
  // handleStart used to call setErrorMessage, the same state the loader
  // wrote to, so a failed start replaced the whole list with an error
  // screen. usePaginatedAsync owns the load error now, which forced the
  // two apart -- and they should have been separate anyway: failing to
  // start one drive is no reason to hide the other nine.
  const [actionError, setActionError] = useState('');
  // Deletion asks first. It is the only irreversible action on this
  // page, and the button sits next to Start drive, so a mis-click is
  // one pixel away from a destroyed plan.
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const drives = usePaginatedAsync(
    ({ page, per_page }) => listDrives({ page, per_page }),
    [],
    { storageKey: 'ngo.myDrives' }
  );

  async function handleDelete() {
    setDeleting(true);
    setActionError('');
    try {
      await deleteDrive(confirmDelete.drive_id);
      setConfirmDelete(null);
      drives.reload();
    } catch (err) {
      // Shown inside the dialog rather than behind it. The server
      // refuses a drive that has been started or has units logged, and
      // that explanation is the whole point of the failure.
      setActionError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleStart(driveId) {
    setStartingId(driveId);
    setActionError('');
    try {
      await startDrive(driveId);
      navigate(`/ngo/drives/${driveId}`);
    } catch (err) {
      setActionError(err.message);
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

      {actionError && (
        <p className="mb-4 text-sm text-critical-text dark:text-critical-dtext">{actionError}</p>
      )}

      {drives.status === 'loading' && <LoadingState rows={4} />}
      {drives.status === 'error' && <ErrorState message={`Couldn't load your drives: ${drives.error}`} onRetry={drives.reload} />}
      {drives.isEmpty && (
        <EmptyState message="No drives yet." actionLabel="Create your first drive" onAction={() => navigate('/ngo/drives/new')} />
      )}
      {drives.status === 'success' && drives.data.length > 0 && (
        <>
          <div className="space-y-2">
            {drives.data.map((drive) => (
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
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => { setActionError(''); setConfirmDelete(drive); }}
                      className="p-2 rounded-lg text-gray-400 hover:text-critical-text hover:bg-critical-bg dark:hover:text-critical-dtext dark:hover:bg-critical-dbg transition-colors"
                      aria-label={`Delete ${drive.title}`}
                      title="Delete this drive"
                    >
                      <Trash2 size={16} />
                    </button>
                    <Button variant="primary" loading={startingId === drive.drive_id} onClick={() => handleStart(drive.drive_id)}>
                      Start drive
                    </Button>
                  </div>
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
          <Pagination
            page={drives.page} pageCount={drives.pageCount} total={drives.total} perPage={drives.perPage}
            onPageChange={drives.setPage} onPerPageChange={drives.setPerPage} noun="drive"
          />
        </>
      )}

      <Modal
        isOpen={!!confirmDelete}
        onClose={() => { setConfirmDelete(null); setActionError(''); }}
        title="Delete this drive?"
        subtitle={confirmDelete ? confirmDelete.title : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setConfirmDelete(null); setActionError(''); }} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="critical" onClick={handleDelete} loading={deleting}>
              Delete drive
            </Button>
          </>
        )}
      >
        <p className="text-sm text-gray-600 dark:text-textsecondary-dark">
          This removes the drive completely and cannot be undone. If it already happened, or
          anything has been logged against it, cancel it instead so the record survives.
        </p>
        {actionError && (
          <p className="text-sm text-critical-text dark:text-critical-dtext bg-critical-bg dark:bg-critical-dbg rounded-lg px-3 py-2 mt-3">
            {actionError}
          </p>
        )}
      </Modal>
    </div>
  );
}
