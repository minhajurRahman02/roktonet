import { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import { listMobilizations } from '../../api/mobilizations';

const STATUS_STYLE = {
  invited: 'text-gray-500 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
  confirmed: 'text-elective-text bg-elective-bg dark:text-elective-dtext dark:bg-elective-dbg',
  declined: 'text-gray-400 bg-gray-100 dark:text-textsecondary-dark dark:bg-white/5',
};

export default function Mobilizations() {
  const [status, setStatus] = useState('loading');
  const [mobilizations, setMobilizations] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    listMobilizations()
      .then((data) => {
        setMobilizations(data);
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

  return (
    <div className="p-6">
      <PageHeader title="Mobilizations" subtitle="Invites currently out to donors in your roster." />

      {status === 'loading' && <LoadingState rows={4} />}
      {status === 'error' && <ErrorState message={`Couldn't load mobilizations: ${errorMessage}`} onRetry={load} />}
      {status === 'success' && mobilizations.length === 0 && (
        <EmptyState message="None of your donors have been invited to anything yet." />
      )}
      {status === 'success' && mobilizations.length > 0 && (
        <div className="space-y-2">
          {mobilizations.map((m) => (
            <div key={m.mobilization_id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-sm font-medium dark:text-textprimary-dark">{m.donor_name || 'Unnamed donor'}, {m.donor_blood_type}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Invited for a {m.urgency_tier} request at {m.requesting_org_name}
                </p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize self-start sm:self-auto ${STATUS_STYLE[m.invite_status]}`}>
                {m.invite_status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
