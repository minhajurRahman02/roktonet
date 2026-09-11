import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Select from '../../components/atoms/Select';
import { useAuth } from '../../context/AuthContext';
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
  const [status, setStatus] = useState('loading');
  const [drives, setDrives] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [districtFilter, setDistrictFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    getDistricts().then(setDistricts).catch(() => setDistricts([]));
  }, []);

  const load = useCallback(() => {
    setStatus('loading');
    const filters = {};
    if (districtFilter) filters.district = districtFilter;
    if (statusFilter) filters.status = statusFilter;
    listDrives(filters)
      .then((data) => {
        setDrives(data);
        setStatus('success');
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, [districtFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

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

      {status === 'loading' && <LoadingState rows={4} />}
      {status === 'error' && <ErrorState message={`Couldn't load drives: ${errorMessage}`} onRetry={load} />}
      {status === 'success' && drives.length === 0 && <EmptyState message="No drives match these filters." />}
      {status === 'success' && drives.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {drives.map((drive) => (
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
                    Your NGO's drive
                  </span>
                )}
              </div>
              <p className="text-sm font-medium mt-2 dark:text-textprimary-dark">{drive.title}</p>
              <p className="text-xs text-gray-400">{drive.org_name}, {drive.org_district}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
