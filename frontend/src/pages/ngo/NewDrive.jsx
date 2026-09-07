import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import FormField from '../../components/molecules/FormField';
import Input from '../../components/atoms/Input';
import Button from '../../components/atoms/Button';
import { useAuth } from '../../context/AuthContext';
import { createDrive } from '../../api/drives';

export default function NewDrive() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', location: '', drive_date: '', target_units: '' });
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!form.title.trim() || !form.location.trim() || !form.drive_date) {
      setError('Title, location, and drive date are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createDrive({
        org_id: user.org_id,
        title: form.title.trim(),
        location: form.location.trim(),
        drive_date: form.drive_date,
        target_units: form.target_units ? Number(form.target_units) : undefined,
      });
      navigate('/ngo/drives');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="p-6">
      <Link to="/ngo/drives" className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">
        ← Back to My Blood Drives
      </Link>
      <PageHeader title="Create Blood Drive" subtitle="Set it up now, start the live session on the actual day." />

      <form onSubmit={handleSubmit} noValidate className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6 max-w-lg space-y-4">
        <FormField label="Title" htmlFor="title">
          <Input id="title" value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="e.g. University Campus Drive" />
        </FormField>
        <FormField label="Location" htmlFor="location">
          <Input id="location" value={form.location} onChange={(e) => updateField('location', e.target.value)} placeholder="e.g. Dhanmondi, Dhaka" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Drive date" htmlFor="drive_date">
            <Input id="drive_date" type="date" value={form.drive_date} onChange={(e) => updateField('drive_date', e.target.value)} />
          </FormField>
          <FormField label="Target units" htmlFor="target_units">
            <Input id="target_units" type="number" min="1" placeholder="Optional" value={form.target_units} onChange={(e) => updateField('target_units', e.target.value)} />
          </FormField>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-critical-dbg rounded-lg px-3 py-2">{error}</p>
        )}

        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full">
          {isSubmitting ? 'Creating…' : 'Create drive'}
        </Button>
      </form>
    </div>
  );
}
