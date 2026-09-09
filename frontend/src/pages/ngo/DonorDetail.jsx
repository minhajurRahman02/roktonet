import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import Select from '../../components/atoms/Select';
import Button from '../../components/atoms/Button';
import { getDonor, updateDonor, inviteDonorLogin } from '../../api/donors';
import { listDrives } from '../../api/drives';
import { listInventory } from '../../api/inventory';
import { listMobilizations } from '../../api/mobilizations';
import { formatEligibility } from '../../utils/eligibility';

export default function DonorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [donor, setDonor] = useState(null);
  const [donations, setDonations] = useState([]);
  const [mobilizations, setMobilizations] = useState([]);
  const [activeDrives, setActiveDrives] = useState([]);
  const [selectedDriveId, setSelectedDriveId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [inviteMessage, setInviteMessage] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    Promise.all([getDonor(id), listInventory(), listMobilizations(), listDrives()])
      .then(([d, inventory, mobs, drives]) => {
        setDonor(d);
        setEditForm({ full_name: d.full_name || '', phone_number: d.phone_number || '', email: d.email || '' });
        setDonations(inventory.filter((u) => u.donor_id === id));
        setMobilizations(mobs.filter((m) => m.donor_id === id));
        const active = drives.filter((dr) => dr.status === 'active');
        setActiveDrives(active);
        setSelectedDriveId(active[0]?.drive_id || '');
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

  async function handleSaveEdit() {
    const updated = await updateDonor(id, editForm);
    setDonor(updated);
    setEditing(false);
  }

  async function handleInviteLogin() {
    setInviteMessage('');
    try {
      const result = await inviteDonorLogin(id);
      setInviteMessage(result.message);
      load();
    } catch (err) {
      setInviteMessage(err.message);
    }
  }

  function handleLogUnit() {
    navigate(`/ngo/drives/${selectedDriveId}/log-unit/${id}`);
  }

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
        <ErrorState message={`Couldn't load this donor: ${errorMessage}`} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <Link to="/ngo/donors" className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">
        ← Back to My Donors
      </Link>

      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5 mb-4 max-w-2xl">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="font-display font-bold text-xl dark:text-textprimary-dark">{donor.full_name || 'Unnamed donor'}</h1>
            <p className="text-xs text-gray-400 mono mt-0.5">{donor.phone_number}{donor.email ? ` · ${donor.email}` : ''}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 self-start items-stretch sm:items-center">
            <Button variant="secondary" onClick={() => setEditing((e) => !e)}>{editing ? 'Cancel' : 'Edit'}</Button>
            {activeDrives.length === 1 && (
              <Button variant="primary" onClick={handleLogUnit}>Log unit</Button>
            )}
            {/* Multiple simultaneous active drives -- previously this
                silently guessed "whichever is active" (always the
                newest), which broke the moment two drives ran at once.
                Now it's an explicit choice. */}
            {activeDrives.length > 1 && (
              <div className="flex gap-2 items-center">
                <Select value={selectedDriveId} onChange={(e) => setSelectedDriveId(e.target.value)} className="text-xs">
                  {activeDrives.map((d) => (
                    <option key={d.drive_id} value={d.drive_id}>{d.title}</option>
                  ))}
                </Select>
                <Button variant="primary" onClick={handleLogUnit}>Log unit</Button>
              </div>
            )}
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <input
              className="w-full border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-surface-dark"
              value={editForm.full_name}
              onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="Full name"
            />
            <input
              className="w-full border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-surface-dark"
              value={editForm.phone_number}
              onChange={(e) => setEditForm((f) => ({ ...f, phone_number: e.target.value }))}
              placeholder="Phone number"
            />
            <input
              className="w-full border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-surface-dark"
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Email"
            />
            <Button variant="primary" onClick={handleSaveEdit}>Save</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-1">Blood type</p>
              <p className="font-medium dark:text-textprimary-dark">{donor.blood_type}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Sex</p>
              <p className="font-medium dark:text-textprimary-dark capitalize">{donor.sex || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Location</p>
              <p className="font-medium dark:text-textprimary-dark">
                {[donor.current_thana, donor.current_district].filter(Boolean).join(', ') || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Last donation</p>
              <p className="font-medium mono text-xs dark:text-textprimary-dark">
                {donor.last_donation_date
                  ? `${new Date(donor.last_donation_date).toLocaleDateString()} (${donor.last_donation_component?.replace('_', ' ')})`
                  : 'Never'}
              </p>
            </div>
          </div>
        )}

        {!editing && (
          <div className="mt-3">
            <p className="text-xs text-gray-400 mb-1">Eligibility</p>
            <p className="font-medium text-elective-text dark:text-elective-dtext text-sm">
              {formatEligibility(donor)}
            </p>
          </div>
        )}

        {!donor.user_id && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5 rounded-lg px-3 py-2 text-xs text-gray-500 dark:text-textsecondary-dark">
            This donor doesn't have login access yet.
            <button onClick={handleInviteLogin} className="text-primary dark:text-textprimary-dark font-medium underline ml-1">
              Invite to create login
            </button>
            {inviteMessage && <p className="mt-1">{inviteMessage}</p>}
          </div>
        )}
      </div>

      <p className="text-sm font-medium mb-2 dark:text-textprimary-dark">Donation history</p>
      {donations.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-textsecondary-dark mb-6">No donations logged yet.</p>
      ) : (
        <div className="space-y-2 mb-6">
          {donations.map((unit) => (
            <div key={unit.unit_id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-3 flex items-center justify-between text-sm">
              <span className="dark:text-textprimary-dark">{unit.blood_type} {unit.component.replace('_', ' ')}</span>
              <span className="text-xs text-gray-400">{new Date(unit.collection_date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm font-medium mb-2 dark:text-textprimary-dark">Mobilization history</p>
      {mobilizations.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-textsecondary-dark">No invites yet.</p>
      ) : (
        <div className="space-y-2">
          {mobilizations.map((m) => (
            <div key={m.mobilization_id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-3 flex items-center justify-between text-sm">
              <span className="dark:text-textprimary-dark">Invited for {donor.blood_type}, {m.urgency_tier} request at {m.requesting_org_name}</span>
              <span className="text-xs font-medium text-gray-500 dark:text-textsecondary-dark bg-gray-100 dark:bg-white/5 px-2.5 py-1 rounded-full capitalize">
                {m.invite_status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}