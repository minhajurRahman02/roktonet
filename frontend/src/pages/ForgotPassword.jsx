import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MailCheck } from 'lucide-react';
import AuthLayout from '../components/organisms/AuthLayout';
import FormField from '../components/molecules/FormField';
import Input from '../components/atoms/Input';
import Button from '../components/atoms/Button';
import { forgotPassword } from '../api/auth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      // Backend always returns the same generic message whether or not the
      // email exists (anti-enumeration, matches the login error design) --
      // so the frontend just trusts and displays it, no special-casing.
      await forgotPassword(email.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <AuthLayout headline="A trail that can't be guessed, only proven.">
        <div className="text-center py-2">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <MailCheck className="mx-auto text-primary dark:text-textprimary-dark mb-3" size={40} />
          </motion.div>
          <h1 className="font-display font-semibold text-lg text-textprimary dark:text-textprimary-dark mb-2">
            Check your email
          </h1>
          <p className="text-sm text-textsecondary dark:text-textsecondary-dark">
            If an account with that email exists, a password reset link has been sent.
          </p>
          <Link to="/login" className="inline-block mt-6 text-sm text-primary dark:text-textprimary-dark font-medium underline">
            Back to login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout headline="A trail that can't be guessed, only proven.">
      <h1 className="font-display font-semibold text-lg text-textprimary dark:text-textprimary-dark mb-1">
        Reset your password
      </h1>
      <p className="text-sm text-textsecondary dark:text-textsecondary-dark mb-5">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField label="Email" htmlFor="email">
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </FormField>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-critical-dbg rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full">
          {isSubmitting ? 'Sending…' : 'Send reset link'}
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
