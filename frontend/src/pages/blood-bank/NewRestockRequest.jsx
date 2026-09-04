import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import FormField from '../../components/molecules/FormField';
import Input from '../../components/atoms/Input';
import Select from '../../components/atoms/Select';
import Button from '../../components/atoms/Button';
import { useAuth } from '../../context/AuthContext';
import { createRequest } from '../../api/requests';

export default function NewRestockRequest() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    blood_type: 'O-',
    component: 'whole_blood',
    quantity: 5,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await createRequest({
        org_id: user.org_id,
        blood_type: form.blood_type,
        component: form.component,
        quantity: Number(form.quantity),
        urgency_tier: 'restock',
      });
      setResult(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="p-6">
      <Link to="/blood-bank/restock" className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">
        ← Back to Restock
      </Link>
      <PageHeader title="Request Restock" subtitle="Top up your own stock through the same engine that fulfills patient requests." />

      <form onSubmit={handleSubmit} noValidate className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6 max-w-lg space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Blood type" htmlFor="blood_type">
            <Select id="blood_type" value={form.blood_type} onChange={(e) => updateField('blood_type', e.target.value)}>
              {['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'].map((bt) => (
                <option key={bt} value={bt}>{bt}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Component" htmlFor="component">
            <Select id="component" value={form.component} onChange={(e) => updateField('component', e.target.value)}>
              <option value="whole_blood">Whole blood</option>
              <option value="platelets">Platelets</option>
              <option value="plasma">Plasma</option>
            </Select>
          </FormField>
        </div>

        <FormField label="Quantity" htmlFor="quantity">
          <Input
            id="quantity"
            type="number"
            min="1"
            value={form.quantity}
            onChange={(e) => updateField('quantity', e.target.value)}
          />
        </FormField>

        <p className="text-[11px] text-gray-400 dark:text-textsecondary-dark">
          Restock requests sit at the lowest priority tier. If a critical or urgent patient request needs the same unit, that request wins every time.
        </p>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-critical-dbg rounded-lg px-3 py-2">{error}</p>
        )}

        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full">
          {isSubmitting ? 'Submitting…' : 'Submit restock request'}
        </Button>
      </form>

      {result && (
        <div className="mt-4 max-w-lg bg-elective-bg dark:bg-elective-dbg text-elective-text dark:text-elective-dtext rounded-lg p-3 text-sm flex items-center justify-between gap-3">
          <span>Request submitted. It'll resolve on the next scheduled batch, or sooner if it's manually triggered.</span>
          <Link to={`/blood-bank/restock/${result.request_id}`} className="underline font-medium shrink-0">
            View
          </Link>
        </div>
      )}
    </div>
  );
}
