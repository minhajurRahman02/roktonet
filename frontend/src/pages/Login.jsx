import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import AuthLayout from '../components/organisms/AuthLayout';
import FormField from '../components/molecules/FormField';
import Input from '../components/atoms/Input';
import Button from '../components/atoms/Button';
import { useAuth } from '../context/AuthContext';

// Where each role lands after login BY DEFAULT. If ProtectedRoute
// redirected them here from somewhere specific (e.g. they bookmarked
// /admin), we send them back there instead -- see handleSubmit.
const ROLE_HOME = {
  admin: '/admin',
  hospital: '/hospital',
  bank: '/hospital', // bank/ngo/donor dashboards land in Phase 7.8; hospital shell for now
  ngo: '/hospital',
  donor: '/hospital',
};

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
