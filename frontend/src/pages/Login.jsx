import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import AuthLayout from '../components/organisms/AuthLayout';
import FormField from '../components/molecules/FormField';
import Input from '../components/atoms/Input';
import Button from '../components/atoms/Button';
import { useAuth } from '../context/AuthContext';
import { ROLE_HOME } from '../constants/roleHome';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [needsVerification, setNeedsVerification] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setIsSubmitting(true);

    try {
      const user = await login(email.trim(), password);
      // ProtectedRoute stashes the page someone was trying to reach in
      // location.state.from before bouncing them to /login. If that
      // exists, honor it (e.g. they bookmarked /admin) -- otherwise fall
      // back to this role's default home.
      const intendedDestination = location.state?.from;
      navigate(intendedDestination || ROLE_HOME[user.role] || '/hospital');
    } catch (err) {
      setError(err.message);
      if (err.data?.needs_verification) {
        setNeedsVerification(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      headline={<>O-negative is<br />1% of Bangladesh.</>}
      tagline="Every unit counts. Our engine makes sure none go to waste."
    >
      <h1 className="font-display font-semibold text-lg text-textprimary dark:text-textprimary-dark mb-1">
        Welcome back
      </h1>
      <p className="text-sm text-textsecondary dark:text-textsecondary-dark mb-5">Log in to your RoktoNet account.</p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField label="Email" htmlFor="email">
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </FormField>

        <FormField label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </FormField>

        <div className="text-right -mt-2">
          <Link to="/forgot-password" className="text-xs text-textsecondary dark:text-textsecondary-dark underline">
            Forgot password?
          </Link>
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-critical-dbg rounded-lg px-3 py-2">
            <p>{error}</p>
            {needsVerification && (
              <p className="mt-1 text-xs">Check your inbox for the verification email we sent when you registered.</p>
            )}
          </div>
        )}

        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full">
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      <p className="text-sm text-center text-textsecondary dark:text-textsecondary-dark mt-5">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="text-primary dark:text-textprimary-dark font-medium underline">
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}