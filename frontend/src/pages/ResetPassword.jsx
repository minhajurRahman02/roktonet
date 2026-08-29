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
