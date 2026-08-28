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
