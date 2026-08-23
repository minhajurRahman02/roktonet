import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import AuthLayout from '../components/organisms/AuthLayout';
import FormField from '../components/molecules/FormField';
import Input from '../components/atoms/Input';
import Button from '../components/atoms/Button';
import { resetPassword } from '../api/auth';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [success, setSuccess] = useState(false);

  function validate() {
    const next = {};
    if (password.length < 8) next.password = 'Password must be at least 8 characters';
    if (confirmPassword !== password) next.confirmPassword = "Passwords don't match";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError(null);
    if (!token) {
      setSubmitError('No reset token found in this link.');
      return;
    }
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <AuthLayout headline="A fresh key to the same trusted account.">
        <div className="text-center py-2">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <CheckCircle2 className="mx-auto text-primary dark:text-textprimary-dark mb-3" size={40} />
          </motion.div>
          <h1 className="font-display font-semibold text-lg text-textprimary dark:text-textprimary-dark mb-2">
            Password updated
          </h1>
          <p className="text-sm text-textsecondary dark:text-textsecondary-dark">
            You can now log in with your new password.
          </p>
          <Button variant="primary" className="mt-6" onClick={() => navigate('/login')}>
            Go to login
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout headline="A fresh key to the same trusted account.">
      <h1 className="font-display font-semibold text-lg text-textprimary dark:text-textprimary-dark mb-1">
        Choose a new password
      </h1>
      <p className="text-sm text-textsecondary dark:text-textsecondary-dark mb-5">
        Enter a new password for your account.
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField label="New password" htmlFor="password" error={errors.password}>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={!!errors.password}
          />
        </FormField>

        <FormField label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword}>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={!!errors.confirmPassword}
          />
        </FormField>

        {submitError && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-critical-dbg rounded-lg px-3 py-2">
            {submitError}
          </p>
        )}

        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full">
          {isSubmitting ? 'Updating…' : 'Update password'}
        </Button>
      </form>

      <p className="text-sm text-center text-textsecondary dark:text-textsecondary-dark mt-5">
        <Link to="/login" className="text-primary dark:text-textprimary-dark font-medium underline">
          Back to login
        </Link>
      </p>
    </AuthLayout>
  );
}
