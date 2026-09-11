import { useState, useEffect } from 'react';
import PageHeader from '../components/molecules/PageHeader';
import FormField from '../components/molecules/FormField';
import Input from '../components/atoms/Input';
import DatalistInput from '../components/atoms/DatalistInput';
import Button from '../components/atoms/Button';
import { useAuth } from '../context/AuthContext';
import { updateMe, changePassword, uploadAvatar } from '../api/auth';
import { getDonor, updateDonor } from '../api/donors';
import { getOrganization, updateOrganization } from '../api/organizations';
import { getDistricts, getThanas } from '../api/locations';

const ORG_ROLES = ['hospital', 'bank', 'ngo'];

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function MyProfile() {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [donor, setDonor] = useState(null);
  const [org, setOrg] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '' });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [districts, setDistricts] = useState([]);
  const [thanas, setThanas] = useState([]);

  const isDonor = user?.role === 'donor';
  const isOrgRole = ORG_ROLES.includes(user?.role);

  useEffect(() => {
    if (isDonor && user?.donor_id) {
      getDonor(user.donor_id).then(setDonor).catch(() => { });
    }
    if (isOrgRole && user?.org_id) {
      getOrganization(user.org_id).then(setOrg).catch(() => { });
    }
  }, [isDonor, isOrgRole, user?.donor_id, user?.org_id]);

  useEffect(() => {
    if (isDonor || isOrgRole) {
      getDistricts().then(setDistricts).catch(() => setDistricts([]));
    }
  }, [isDonor, isOrgRole]);

  // A user is always exactly one of donor or org-role, never both, so
  // reusing the same cascading thana list for whichever section is
  // actually rendered is safe -- only one of these two source fields is
  // ever populated for a given logged-in account.
  const activeDistrict = isOrgRole ? org?.district : donor?.current_district;
  useEffect(() => {
    if (!activeDistrict || !districts.includes(activeDistrict)) {
      setThanas([]);
      return;
    }
    getThanas(activeDistrict).then(setThanas).catch(() => setThanas([]));
  }, [activeDistrict, districts]);

  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      await uploadAvatar(file);
      await refreshUser();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSave() {
    // district is required for organizations -- checked before anything
    // is sent, same as any other required field in this project's forms.
    if (isOrgRole && !org?.district?.trim()) {
      setSaveError('District is required.');
      return;
    }

    setSaving(true);
    setSaveMessage('');
    setSaveError('');
    try {
      const tasks = [updateMe({ full_name: fullName })];
      if (isDonor && donor) {
        // Same reasoning as the org-contact fix below -- only send
        // fields that actually have a value, so an accidentally-cleared
        // field doesn't get saved as an explicit empty string.
        const donorUpdate = {};
        if (donor.phone_number) donorUpdate.phone_number = donor.phone_number;
        if (donor.current_district) donorUpdate.current_district = donor.current_district;
        if (donor.current_thana) donorUpdate.current_thana = donor.current_thana;
        if (Object.keys(donorUpdate).length > 0) {
          tasks.push(updateDonor(user.donor_id, donorUpdate));
        }
      }
      if (isOrgRole && org) {
        // contact_phone/email stay optional-if-present (same reasoning
        // as before), but district is always sent once we're here --
        // it's required, already validated above, and thana rides along
        // with it (optional, may legitimately be empty).
        const orgUpdate = { district: org.district, thana: org.thana || undefined };
        if (org.contact_phone) orgUpdate.contact_phone = org.contact_phone;
        if (org.contact_email) orgUpdate.contact_email = org.contact_email;
        tasks.push(updateOrganization(user.org_id, orgUpdate));
      }
      await Promise.all(tasks);
      await refreshUser();
      setSaveMessage('Saved.');
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    setPasswordMessage('');
    setPasswordError('');
    try {
      await changePassword(passwordForm.current, passwordForm.next);
      setPasswordMessage('Password changed.');
      setPasswordForm({ current: '', next: '' });
    } catch (err) {
      setPasswordError(err.message);
    }
  }

  if (!user) return null;

  return (
    <div className="p-6">
      <PageHeader title="My Profile" subtitle="Shared across every role." />

      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6 max-w-lg mb-6">
        <p className="text-sm font-medium mb-4 dark:text-textprimary-dark">Profile picture</p>
        <div className="flex items-center gap-4">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-lg font-semibold">
              {initials(user.full_name)}
            </div>
          )}
          <div>
            <label className="text-xs font-medium bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-light cursor-pointer inline-block">
              {avatarUploading ? 'Uploading...' : 'Upload new'}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} disabled={avatarUploading} className="hidden" />
            </label>
            <p className="text-[11px] text-gray-400 dark:text-textsecondary-dark mt-1">JPEG, PNG, or WebP, up to 2MB.</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6 max-w-lg mb-6">
        <p className="text-sm font-medium mb-4 dark:text-textprimary-dark">Your info</p>
        <div className="space-y-4">
          <FormField label="Full name" htmlFor="full_name">
            <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
          <FormField label="Email" htmlFor="email">
            <Input id="email" type="email" value={user.email} disabled />
            <p className="text-[11px] text-gray-400 dark:text-textsecondary-dark mt-1">Can&apos;t be changed here yet.</p>
          </FormField>
        </div>
      </div>

      {isDonor && donor && (
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6 max-w-lg mb-6">
          <p className="text-sm font-medium mb-4 dark:text-textprimary-dark">Donor details</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <FormField label="Blood type" htmlFor="blood_type">
              <Input id="blood_type" value={donor.blood_type} disabled />
            </FormField>
            <FormField label="Sex" htmlFor="sex">
              <Input id="sex" value={donor.sex ? donor.sex.charAt(0).toUpperCase() + donor.sex.slice(1) : '\u2014'} disabled />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <FormField label="District" htmlFor="district">
              <DatalistInput
                id="district"
                value={donor.current_district || ''}
                onChange={(e) => setDonor((d) => ({ ...d, current_district: e.target.value }))}
                options={districts}
                autoComplete="off"
              />
            </FormField>
            <FormField label="Thana / upazila" htmlFor="thana">
              <DatalistInput
                id="thana"
                value={donor.current_thana || ''}
                onChange={(e) => setDonor((d) => ({ ...d, current_thana: e.target.value }))}
                options={thanas}
                autoComplete="off"
              />
            </FormField>
          </div>
          <FormField label="Phone" htmlFor="phone">
            <Input
              id="phone"
              type="tel"
              value={donor.phone_number || ''}
              onChange={(e) => setDonor((d) => ({ ...d, phone_number: e.target.value }))}
            />
          </FormField>
        </div>
      )}

      {isOrgRole && org && (
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6 max-w-lg mb-6">
          <p className="text-sm font-medium mb-4 dark:text-textprimary-dark">Organization contact &amp; location</p>
          <p className="text-xs text-gray-400 dark:text-textsecondary-dark mb-4">
            Shown to donors invited by or browsing {org.name}.
          </p>
          <div className="space-y-4">
            <FormField label="Contact phone" htmlFor="org_phone">
              <Input
                id="org_phone"
                type="tel"
                value={org.contact_phone || ''}
                onChange={(e) => setOrg((o) => ({ ...o, contact_phone: e.target.value }))}
              />
            </FormField>
            <FormField label="Contact email" htmlFor="org_email">
              <Input
                id="org_email"
                type="email"
                value={org.contact_email || ''}
                onChange={(e) => setOrg((o) => ({ ...o, contact_email: e.target.value }))}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="District" htmlFor="org_district">
                <DatalistInput
                  id="org_district"
                  value={org.district || ''}
                  onChange={(e) => setOrg((o) => ({ ...o, district: e.target.value }))}
                  options={districts}
                  autoComplete="off"
                />
                <p className="text-[11px] text-gray-400 dark:text-textsecondary-dark mt-1">Required.</p>
              </FormField>
              <FormField label="Thana / upazila" htmlFor="org_thana">
                <DatalistInput
                  id="org_thana"
                  value={org.thana || ''}
                  onChange={(e) => setOrg((o) => ({ ...o, thana: e.target.value }))}
                  disabled={!org.district?.trim()}
                  placeholder={!org.district?.trim() ? 'Pick a district first' : 'Start typing…'}
                  options={thanas}
                  autoComplete="off"
                />
                <p className="text-[11px] text-gray-400 dark:text-textsecondary-dark mt-1">Optional.</p>
              </FormField>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6 max-w-lg mb-6">
        <p className="text-sm font-medium mb-4 dark:text-textprimary-dark">Change password</p>
        <div className="space-y-3">
          <Input
            type="password"
            placeholder="Current password"
            value={passwordForm.current}
            onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))}
          />
          <Input
            type="password"
            placeholder="New password"
            value={passwordForm.next}
            onChange={(e) => setPasswordForm((f) => ({ ...f, next: e.target.value }))}
          />
          {passwordError && <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>}
          {passwordMessage && <p className="text-sm text-elective-text dark:text-elective-dtext">{passwordMessage}</p>}
          <Button variant="secondary" onClick={handleChangePassword} disabled={!passwordForm.current || !passwordForm.next}>
            Change password
          </Button>
        </div>
      </div>

      {saveError && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{saveError}</p>}
      {saveMessage && <p className="text-sm text-elective-text dark:text-elective-dtext mb-2">{saveMessage}</p>}
      <Button variant="primary" loading={saving} onClick={handleSave}>
        Save changes
      </Button>
    </div>
  );
}