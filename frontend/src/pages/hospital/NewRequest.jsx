import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/molecules/PageHeader';
import FormField from '../../components/molecules/FormField';
import Input from '../../components/atoms/Input';
import Select from '../../components/atoms/Select';
import Button from '../../components/atoms/Button';
import FulfillmentBadge from '../../components/atoms/FulfillmentBadge';
import { useAuth } from '../../context/AuthContext';
import { createRequest } from '../../api/requests';

export default function NewRequest() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    blood_type: 'O-',
    component: 'whole_blood',
    quantity: 1,
    urgency_tier: 'critical',
    needed_by_date: '',
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

    if (form.urgency_tier === 'elective' && !form.needed_by_date) {
      setError('needed_by_date is required for elective requests');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createRequest({
        org_id: user.org_id,
        blood_type: form.blood_type,
        component: form.component,
        quantity: Number(form.quantity),
        urgency_tier: form.urgency_tier,
        needed_by_date: form.urgency_tier === 'elective' ? form.needed_by_date : undefined,
      });
      setResult(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const isElective = form.urgency_tier === 'elective';
  const resolvedImmediately = result && ['critical', 'urgent'].includes(result.urgency_tier);

  return (
    <div className="p-6">
      <PageHeader title="New Request" subtitle="Submit a blood request for a patient." />

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

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Quantity" htmlFor="quantity">
            <Input
              id="quantity"
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => updateField('quantity', e.target.value)}
            />
          </FormField>
          <FormField label="Urgency" htmlFor="urgency_tier">
            <Select id="urgency_tier" value={form.urgency_tier} onChange={(e) => updateField('urgency_tier', e.target.value)}>
              <option value="critical">Critical</option>
              <option value="urgent">Urgent</option>
              <option value="routine">Routine</option>
              <option value="elective">Elective</option>
            </Select>
          </FormField>
        </div>

        <FormField label="Needed by date (elective only)" htmlFor="needed_by_date">
          <Input
            id="needed_by_date"
            type="date"
            disabled={!isElective}
            value={form.needed_by_date}
            onChange={(e) => updateField('needed_by_date', e.target.value)}
          />
        </FormField>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-critical-dbg rounded-lg px-3 py-2">{error}</p>
        )}

        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full">
          {isSubmitting ? 'Submitting…' : 'Submit request'}
        </Button>
      </form>

      {result && (
        <div className="mt-4 max-w-lg bg-elective-bg dark:bg-elective-dbg text-elective-text dark:text-elective-dtext rounded-lg p-3 text-sm flex items-center justify-between gap-3">
          <span>
            {resolvedImmediately ? (
              <>✓ Request submitted and resolved — <FulfillmentBadge fulfillmentPath={result.fulfillment_path} /></>
            ) : (
              '✓ Request submitted. It will resolve on the next scheduled batch.'
            )}
          </span>
          <Link to={`/hospital/requests/${result.request_id}`} className="underline font-medium shrink-0">
            View
          </Link>
        </div>
      )}
    </div>
  );
}
