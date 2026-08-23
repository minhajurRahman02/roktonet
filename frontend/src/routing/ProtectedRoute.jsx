import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper dark:bg-paper-dark">
      <Loader2 className="animate-spin text-primary dark:text-textprimary-dark" size={32} />
    </div>
  );
}

/**
 * Blocks access entirely for logged-out users. Nested inside this, a
 * RoleRoute can further restrict WHICH logged-in users may proceed.
 *
 * The isLoading check matters: on a page refresh, AuthContext doesn't yet
 * know if a session cookie exists until its first getMe() call resolves.
 * Redirecting to /login during that brief window would incorrectly bounce
 * an actually-logged-in user. Showing a loading screen instead avoids that
 * false negative.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    // Remember where they were headed so Login can send them back after
    // a successful login, instead of always landing on their role's
    // default home.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
