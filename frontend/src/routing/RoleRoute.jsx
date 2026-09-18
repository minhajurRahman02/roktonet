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
  const { user, switching } = useAuth();

  // 7.7a: hold, do not judge, while an identity swap is in flight.
  //
  // Entering or leaving view-as changes the route AND the user's role.
  // Those are two separate state updates, so for at least one render the
  // router is on the new page with the old role, or the old page with the
  // new role. Either way this guard saw a mismatch and fired
  // <Navigate to="/unauthorized">, which unmounted whichever component
  // was mid-await and swallowed its follow-up navigate() -- leaving the
  // admin stranded on the unauthorized page with a "Go to your dashboard"
  // button quietly finishing the job.
  //
  // There is no ordering of the two updates that avoids the mismatched
  // frame, so instead AuthContext marks the window and this guard
  // declines to evaluate inside it. Rendering null rather than a spinner
  // because the window is one or two frames, and a spinner that brief
  // reads as a flicker.
  if (switching) return null;

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

RoleRoute.propTypes = {
  allowedRoles: PropTypes.arrayOf(PropTypes.string).isRequired,
  children: PropTypes.node.isRequired,
};