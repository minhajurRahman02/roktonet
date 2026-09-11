import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Input from '../../components/atoms/Input';
import NgoDetailView from '../../components/organisms/NgoDetailView';
import { useAuth } from '../../context/AuthContext';
import { listOrganizations } from '../../api/organizations';

export default function MyNgo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [ngos, setNgos] = useState([]);
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const isAffiliated = !!user.org_id;

  const load = useCallback(() => {
    if (isAffiliated) return;
    setStatus('loading');
    listOrganizations({ org_type: 'ngo', ...(search ? { search } : {}) })
      .then((data) => {
        setNgos(data);
        setStatus('success');
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, [isAffiliated, search]);

  useEffect(() => {
    const timeout = setTimeout(load, 300);
    return () => clearTimeout(timeout);
  }, [load]);

  if (isAffiliated) {
    return <NgoDetailView orgId={user.org_id} />;
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Find an NGO"
        subtitle="You're not currently affiliated with an NGO. Browse below, and attending any drive will add you to that NGO's roster automatically."
      />

      <Input
        type="text"
        placeholder="Search NGOs by name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-80 mb-4"
      />

      {status === 'loading' && <LoadingState rows={4} />}
      {status === 'error' && <ErrorState message={`Couldn't load NGOs: ${errorMessage}`} onRetry={load} />}
      {status === 'success' && ngos.length === 0 && <EmptyState message="No NGOs match this search." />}
      {status === 'success' && ngos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ngos.map((ngo) => (
            <div
              key={ngo.org_id}
              onClick={() => navigate(`/donor/ngo/${ngo.org_id}`)}
              className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 cursor-pointer hover:border-primary"
            >
              <p className="text-sm font-medium dark:text-textprimary-dark">{ngo.name}</p>
              <p className="text-xs text-gray-400">{[ngo.thana, ngo.district].filter(Boolean).join(', ')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
