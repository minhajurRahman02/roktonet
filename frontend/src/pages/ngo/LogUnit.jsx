import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import FormField from '../../components/molecules/FormField';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import Select from '../../components/atoms/Select';
import Input from '../../components/atoms/Input';
import Button from '../../components/atoms/Button';
import { getDonor } from '../../api/donors';
import { getDrive, logUnit } from '../../api/drives';
import { getEligibility } from '../../utils/eligibility';

// Both driveId and donorId are now explicit route params -- previously
// this page guessed "whichever drive is active", which silently broke
// the moment two drives were active at once (always picked the newest,
// regardless of which one the person actually meant).
export default function LogUnit() {
  const { driveId, donorId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [donor, setDonor] = useState(null);
  const [drive, setDrive] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [component, setComponent] = useState('whole_blood');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    Promise.all([getDonor(donorId), getDrive(driveId)])
      .then(([d, dr]) => {
        setDonor(d);
        setDrive(dr);
        setStatus('success');
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, [donorId, driveId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await logUnit(driveId, {
        donor_id: donorId,
        blood_type: donor.blood_type,
        component,
        quantity: Number(quantity),
      });
      navigate(`/ngo/drives/${driveId}`);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="p-6">
        <LoadingState rows={3} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-6">
        <ErrorState message={`Couldn't load this page: ${errorMessage}`} />
      </div>
    );
  }

  if (drive.status !== 'active') {
    return (
      <div className="p-6">
        <Link to={`/ngo/donors/${donorId}`} className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">← Back to donor</Link>
        <p className="text-sm text-gray-500 dark:text-textsecondary-dark">
          {drive.title} is no longer active (status: {drive.status}). Units can only be logged while a drive is running.
        </p>
      </div>
    );
  }

  // Live client-side preview of what the server will enforce -- doesn't
  // replace the real check (that happens server-side, and is what
  // actually stops the request), just saves a round trip for the common
  // case of picking an obviously-too-soon component.
  const eligibility = getEligibility(donor.last_donation_date, component);

  return (
    <div className="p-6">
      <Link to={`/ngo/donors/${donorId}`} className="text-sm text-primary dark:text-textprimary-dark mb-4 inline-block">← Back to donor</Link>
      <h1 className="font-display font-bold text-xl mb-1 dark:text-textprimary-dark">Log Unit</h1>
      <p className="text-sm text-gray-500 dark:text-textsecondary-dark mb-6">
        Logging for <strong>{donor.full_name}</strong> against <strong>{drive.title}</strong> (active now).
      </p>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6 max-w-md space-y-4">
        <FormField label="Blood type" htmlFor="blood_type">
          <Input id="blood_type" value={donor.blood_type} disabled />
          <p className="text-[11px] text-gray-400 dark:text-textsecondary-dark mt-1">Already on file for this donor.</p>
        </FormField>

        <FormField label="Component" htmlFor="component">
          <Select id="component" value={component} onChange={(e) => setComponent(e.target.value)}>
            <option value="whole_blood">Whole blood</option>
            <option value="platelets">Platelets</option>
            <option value="plasma">Plasma</option>
          </Select>
        </FormField>

        {!eligibility.eligible && (
          <p className="text-xs text-critical-text dark:text-critical-dtext bg-critical-bg dark:bg-critical-dbg rounded-lg px-3 py-2">
            Not eligible for {component.replace('_', ' ')} until {eligibility.eligibleDate.toLocaleDateString()}.
          </p>
        )}

        <FormField label="Quantity (units)" htmlFor="quantity">
          <Input id="quantity" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <p className="text-[11px] text-gray-400 dark:text-textsecondary-dark mt-1">More than 1 only applies to apheresis sessions that yield multiple units.</p>
        </FormField>

        {submitError && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-critical-dbg rounded-lg px-3 py-2">{submitError}</p>
        )}

        <Button type="submit" variant="primary" loading={submitting} disabled={!eligibility.eligible} className="w-full">
          {submitting ? 'Updating…' : 'Update inventory'}
        </Button>
      </form>
    </div>
  );
}