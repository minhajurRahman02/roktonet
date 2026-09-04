import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import FormField from '../../components/molecules/FormField';
import Input from '../../components/atoms/Input';
import Select from '../../components/atoms/Select';
import Button from '../../components/atoms/Button';
import { useAuth } from '../../context/AuthContext';
import { addInventoryUnit } from '../../api/inventory';

// Shelf-life reference ranges already calibrated elsewhere in this
// project (Section 6 of project memory) -- reused here rather than
// invented fresh, so the suggestion matches what the rest of the system
// assumes about expiry.
const SHELF_LIFE_DAYS = { whole_blood: 35, platelets: 5, plasma: 365 };

function addDays(dateString, days) {
  const d = new Date(dateString);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const today = new Date().toISOString().slice(0, 10);

export default function AddInventoryUnit() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    blood_type: '',
    component: '',
    collection_date: today,
    expiry_date: '',
  });
  const [expiryTouchedManually, setExpiryTouchedManually] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function updateField(field, value) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      // Re-suggest the expiry date whenever component or collection date
      // changes, unless the person has already edited expiry themselves --
      // a suggestion that silently overwrites someone's manual correction
      // would be worse than not suggesting at all.
      if ((field === 'component' || field === 'collection_date') && !expiryTouchedManually && next.component) {
        const shelfLife = SHELF_LIFE_DAYS[next.component];
        if (shelfLife) next.expiry_date = addDays(next.collection_date || today, shelfLife);
      }
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!form.blood_type || !form.component || !form.collection_date || !form.expiry_date) {
      setError('All fields are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addInventoryUnit({
        org_id: user.org_id,
        blood_type: form.blood_type,
        component: form.component,
        collection_date: form.collection_date,
        expiry_date: form.expiry_date,
      });
      navigate('/blood-bank/inventory');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="p-6">
      <Link to="/blood-bank/inventory" className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">
        ← Back to My Inventory
      </Link>
      <PageHeader title="Add Inventory Unit" subtitle="Log a new unit into your organization's stock." />

      <form onSubmit={handleSubmit} noValidate className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6 max-w-lg space-y-4">
        <FormField label="Blood type" htmlFor="blood_type">
          <Select id="blood_type" value={form.blood_type} onChange={(e) => updateField('blood_type', e.target.value)}>
            <option value="">Select…</option>
            {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((bt) => (
              <option key={bt} value={bt}>{bt}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Component" htmlFor="component">
          <Select id="component" value={form.component} onChange={(e) => updateField('component', e.target.value)}>
            <option value="">Select…</option>
            <option value="whole_blood">Whole blood</option>
            <option value="platelets">Platelets</option>
            <option value="plasma">Plasma</option>
          </Select>
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Collection date" htmlFor="collection_date">
            <Input
              id="collection_date"
              type="date"
              value={form.collection_date}
              onChange={(e) => updateField('collection_date', e.target.value)}
            />
          </FormField>
          <FormField label="Expiry date" htmlFor="expiry_date">
            <Input
              id="expiry_date"
              type="date"
              value={form.expiry_date}
              onChange={(e) => {
                setExpiryTouchedManually(true);
                updateField('expiry_date', e.target.value);
              }}
            />
          </FormField>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-textsecondary-dark">
          We'll suggest a date once you pick a component (platelets last about 5 days, whole blood about 35, plasma much longer if frozen), but you can always change it.
        </p>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-critical-dbg rounded-lg px-3 py-2">{error}</p>
        )}

        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full">
          {isSubmitting ? 'Adding…' : 'Add unit'}
        </Button>
      </form>
    </div>
  );
}
