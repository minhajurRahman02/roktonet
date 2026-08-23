import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import AuthLayout from '../components/organisms/AuthLayout';
import FormField from '../components/molecules/FormField';
import Input from '../components/atoms/Input';
import Select from '../components/atoms/Select';
import Button from '../components/atoms/Button';
import { register } from '../api/auth';

const ORG_ROLES = ['hospital', 'bank', 'ngo'];

export default function Register() {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'hospital',
    invite_code: '',
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null); // Success state -- Shneiderman Rule 4 (closure)

  const isOrgRole = ORG_ROLES.includes(form.role);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined })); // clear that field's error as they retype
  }

  function validate() {
    const next = {};
    if (!form.full_name.trim()) next.full_name = 'Required';
    if (!form.email.trim()) next.email = 'Required';
    if (form.password.length < 8) next.password = 'Min 8 characters';
    if (form.confirmPassword !== form.password) next.confirmPassword = "Don't match";
    if (isOrgRole && !form.invite_code.trim()) next.invite_code = 'Required for this role';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await register({
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        full_name: form.full_name.trim(),
        invite_code: isOrgRole ? form.invite_code.trim() : undefined,
      });
      setSuccessMessage(result.message);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Success state: replaces the form entirely with clear next steps,
  // rather than silently clearing fields (Shneiderman Rule 4 -- closure).
  if (successMessage) {
    return (
      <AuthLayout
        panelWidth="twoFifths"
        headline="Join the network that decides, not just connects."
      >
        <div className="text-center py-2">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <CheckCircle2 className="mx-auto text-primary dark:text-textprimary-dark mb-3" size={40} />
          </motion.div>
          <h1 className="font-display font-semibold text-lg text-textprimary dark:text-textprimary-dark mb-2">
            Check your email
          </h1>
          <p className="text-sm text-textsecondary dark:text-textsecondary-dark">{successMessage}</p>
          <Link to="/login" className="inline-block mt-6 text-sm text-primary dark:text-textprimary-dark font-medium underline">
            Back to login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      panelWidth="twoFifths"
      headline="Join the network that decides, not just connects."
    >
      <h1 className="font-display font-semibold text-lg text-textprimary dark:text-textprimary-dark mb-1">
        Create your account
      </h1>
      <p className="text-sm text-textsecondary dark:text-textsecondary-dark mb-5">
        Join as a hospital, blood bank, NGO, or donor.
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Full name" htmlFor="full_name" error={errors.full_name}>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => updateField('full_name', e.target.value)}
              error={!!errors.full_name}
            />
          </FormField>

          <FormField label="Email" htmlFor="email" error={errors.email}>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              error={!!errors.email}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Role" htmlFor="role">
            <Select id="role" value={form.role} onChange={(e) => updateField('role', e.target.value)}>
              <option value="hospital">Hospital</option>
              <option value="bank">Blood bank</option>
              <option value="ngo">NGO</option>
              <option value="donor">Donor</option>
            </Select>
          </FormField>

          <FormField label="Invite code" htmlFor="invite_code" error={errors.invite_code}>
            <Input
              id="invite_code"
              value={form.invite_code}
              onChange={(e) => updateField('invite_code', e.target.value)}
              error={!!errors.invite_code}
              disabled={!isOrgRole}
              placeholder={isOrgRole ? undefined : 'Not needed'}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Password" htmlFor="password" error={errors.password}>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              error={!!errors.password}
            />
          </FormField>

          <FormField label="Confirm" htmlFor="confirmPassword" error={errors.confirmPassword}>
            <Input
              id="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              error={!!errors.confirmPassword}
            />
          </FormField>
        </div>

        {submitError && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-critical-dbg rounded-lg px-3 py-2">
            {submitError}
          </p>
        )}

        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full">
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="text-sm text-center text-textsecondary dark:text-textsecondary-dark mt-4">
        Already have an account?{' '}
        <Link to="/login" className="text-primary dark:text-textprimary-dark font-medium underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
