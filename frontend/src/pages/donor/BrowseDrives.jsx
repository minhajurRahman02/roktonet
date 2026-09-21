import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Pagination from '../../components/molecules/Pagination';
import Select from '../../components/atoms/Select';
import { useAuth } from '../../context/AuthContext';
import { usePaginatedAsync } from '../../hooks/usePaginatedAsync';
import { listDrives } from '../../api/drives';
import { getDistricts } from '../../api/locations';

const STATUS_LABELS = { active: 'Running now', planned: 'Upcoming', completed: 'Completed' };
const STATUS_STYLE = {
  active: 'text-critical-text bg-critical-bg dark:text-critical-dtext dark:bg-critical-dbg',
  planned: 'text-gray-500 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
  completed: 'text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg',
};

export default function BrowseDrives() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [districts, setDistricts] = useState([]);
  const [districtFilter, setDistrictFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Unpaginated on purpose: this fills the <select> below and wants every
  // district, not the first page of districts.
  useEffect(() => {
    getDistricts().then(setDistricts).catch(() => setDistricts([]));
  }, []);

  // Both filters were already real backend query params on GET /api/drives,
  // so nothing moves server-side here -- this page just gains paging.
  const filters = useMemo(() => {
    const f = {};
    if (districtFilter) f.district = districtFilter;
    if (statusFilter) f.status = statusFilter;
    return f;
  }, [districtFilter, statusFilter]);

  const drives = usePaginatedAsync(
    ({ page, per_page }) => listDrives({ ...filters, page, per_page }),
    [filters],
    { storageKey: 'donor.browseDrives', defaultPerPage: 10 }
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Browse Drives"
        subtitle="Every drive, from every NGO. Attend any of them, regardless of who you're affiliated with."
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} className="w-40">
          <option value="">All locations</option>
          {districts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-36">
          <option value="">All statuses</option>
          <option value="active">Running now</option>
          <option value="planned">Upcoming</option>
          <option value="completed">Completed</option>
        </Select>
      </div>

      {drives.status === 'loading' && <LoadingState rows={4} />}
      {drives.status === 'error' && <ErrorState message={`Couldn't load drives: ${drives.error}`} onRetry={drives.reload} />}
      {drives.isEmpty && <EmptyState message="No drives match these filters." />}
      {drives.status === 'success' && drives.data.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {drives.data.map((drive) => (
              <div
                key={drive.drive_id}
                onClick={() => navigate(`/donor/browse/${drive.drive_id}`)}
                className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 cursor-pointer hover:border-primary"
                style={drive.status === 'active' ? { borderLeft: '4px solid #A9382F' } : undefined}
              >
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[drive.status]}`}>
                    {STATUS_LABELS[drive.status]}
                  </span>
                  {drive.org_id === user.org_id && (
                    <span className="text-[10px] font-medium text-primary bg-elective-bg dark:bg-elective-dbg px-2 py-0.5 rounded-full">
                      Your NGO&apos;s drive
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium mt-2 dark:text-textprimary-dark">{drive.title}</p>
                <p className="text-xs text-gray-400">{drive.org_name}, {drive.org_district}</p>
              </div>
            ))}
          </div>
          <Pagination
            page={drives.page} pageCount={drives.pageCount} total={drives.total} perPage={drives.perPage}
            onPageChange={drives.setPage} onPerPageChange={drives.setPerPage} noun="drive"
          />
        </>
      )}
    </div>
  );
}
