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

