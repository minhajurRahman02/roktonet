import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import FormField from '../../components/molecules/FormField';
import Input from '../../components/atoms/Input';
import Select from '../../components/atoms/Select';
import DatalistInput from '../../components/atoms/DatalistInput';
import Button from '../../components/atoms/Button';
import { useAuth } from '../../context/AuthContext';
import { registerDonor } from '../../api/donors';
import { getDistricts, getThanas } from '../../api/locations';

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

export default function RegisterDonor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    phone_number: '',
    email: '',
    blood_type: '',
    current_district: '',
    current_thana: '',
    last_donation_date: '',
  });
  const [districts, setDistricts] = useState([]);
  const [thanas, setThanas] = useState([]);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    getDistricts().then(setDistricts).catch(() => setDistricts([]));
  }, []);

  useEffect(() => {
    if (!districts.includes(form.current_district)) {
      setThanas([]);
      return;
    }
    getThanas(form.current_district).then(setThanas).catch(() => setThanas([]));
  }, [form.current_district, districts]);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!form.full_name.trim() || !form.phone_number.trim() || !form.blood_type) {
      setError('Full name, phone number, and blood type are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const donor = await registerDonor({
        org_id: user.org_id,
        full_name: form.full_name.trim(),
        phone_number: form.phone_number.trim(),
        blood_type: form.blood_type,
        email: form.email.trim() || undefined,
        current_district: form.current_district.trim() || undefined,
        current_thana: form.current_thana.trim() || undefined,
        last_donation_date: form.last_donation_date || undefined,
      });
      navigate(`/ngo/donors/${donor.donor_id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="p-6">
      <Link to="/ngo/donors" className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">
        ← Back to My Donors
      </Link>
      <PageHeader title="Register Donor" subtitle="For a donor who doesn't want their own account. They can still be reached later." />

      <form onSubmit={handleSubmit} noValidate className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6 max-w-lg space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Full name" htmlFor="full_name">
            <Input id="full_name" value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} />
          </FormField>
          <FormField label="Phone number" htmlFor="phone_number">
            <Input id="phone_number" type="tel" value={form.phone_number} onChange={(e) => updateField('phone_number', e.target.value)} />
          </FormField>
        </div>

        <FormField label="Email" htmlFor="email">
          <Input id="email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} placeholder="Optional, but needed if they want a login later" />
        </FormField>

        <FormField label="Blood type" htmlFor="blood_type">
          <Select id="blood_type" value={form.blood_type} onChange={(e) => updateField('blood_type', e.target.value)}>
            <option value="">Select…</option>
            {BLOOD_TYPES.map((bt) => (
              <option key={bt} value={bt}>{bt}</option>
            ))}
          </Select>
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="District" htmlFor="current_district">
            <DatalistInput
              id="current_district"
              value={form.current_district}
              onChange={(e) => updateField('current_district', e.target.value)}
              placeholder="Start typing…"
              options={districts}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Thana / upazila" htmlFor="current_thana">
            <DatalistInput
              id="current_thana"
              value={form.current_thana}
              onChange={(e) => updateField('current_thana', e.target.value)}
              disabled={!form.current_district.trim()}
              placeholder={!form.current_district.trim() ? 'Pick a district first' : 'Start typing…'}
              options={thanas}
              autoComplete="off"
            />
          </FormField>
        </div>

        <FormField label="Last donation date" htmlFor="last_donation_date">
          <Input
            id="last_donation_date"
            type="date"
            value={form.last_donation_date}
            onChange={(e) => updateField('last_donation_date', e.target.value)}
          />
          <p className="text-[11px] text-gray-400 dark:text-textsecondary-dark mt-1">Optional, ask them directly.</p>
        </FormField>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-critical-dbg rounded-lg px-3 py-2">{error}</p>
        )}

        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full">
          {isSubmitting ? 'Registering…' : 'Register donor'}
        </Button>
      </form>
    </div>
  );
}
