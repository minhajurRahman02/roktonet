import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ROLE_HOME = { admin: '/admin', hospital: '/hospital', bank: '/hospital', ngo: '/hospital', donor: '/hospital' };

export default function Unauthorized() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper dark:bg-paper-dark px-4">
      <div className="text-center max-w-sm">
        <ShieldOff className="mx-auto text-critical-text dark:text-critical-dtext mb-4" size={40} />
        <h1 className="font-display font-semibold text-lg text-textprimary dark:text-textprimary-dark mb-2">
          Not authorized
        </h1>
        <p className="text-sm text-textsecondary dark:text-textsecondary-dark">
          Your account ({user?.role}) doesn&apos;t have access to this page.
        </p>
        <Link
          to={ROLE_HOME[user?.role] || '/login'}
          className="inline-block mt-6 text-sm text-primary dark:text-textprimary-dark font-medium underline"
        >
          Go to your dashboard
        </Link>
      </div>
    </div>
  );
}
