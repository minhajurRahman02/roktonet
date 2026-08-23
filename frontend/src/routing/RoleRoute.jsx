import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Must be nested INSIDE a ProtectedRoute -- it assumes `user` already
 * exists (ProtectedRoute already guaranteed authentication) and only
 * checks whether this specific user's role is allowed here. A hospital
 * user hitting /admin gets redirected, not shown the page (not even
 * briefly) and not just hidden via CSS -- the route itself refuses to
 * render for the wrong role.
 */
export default function RoleRoute({ allowedRoles, children }) {
  const { user } = useAuth();

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

RoleRoute.propTypes = {
  allowedRoles: PropTypes.arrayOf(PropTypes.string).isRequired,
  children: PropTypes.node.isRequired,
};
