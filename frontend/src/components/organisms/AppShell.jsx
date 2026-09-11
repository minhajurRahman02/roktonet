import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import DashboardFooter from './DashboardFooter';
import { useAuth } from '../../context/AuthContext';

const ORG_ROLES = ['hospital', 'bank', 'ngo'];

/**
 * The persistent frame every dashboard page renders inside. Replaces the
 * old inline NavShell (built quickly in Phase 7.3 just to prove login/
 * logout worked) with the real shell from Phase 7.6 planning.
 *
 * `crumbs` is a simple array of strings for the breadcrumb trail, e.g.
 * ['Hospital', 'Overview'] or later ['Hospital', 'My Requests', 'New
 * Request'] once 7.7 adds real sub-pages. Each route in App.jsx passes
 * its own trail in.
 */
export default function AppShell({ crumbs, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();

  // Nothing in the registration flow ever prompted staff to set their
  // org's contact info -- it only ever lived in My Profile's org-contact
  // section, easy to never visit. Shown on every page (not dismissible)
  // for org-role accounts until it's actually set, since a dismiss
  // button just recreates the same "forgot about it" problem this exists
  // to fix.
  const showContactReminder =
    user && ORG_ROLES.includes(user.role) && !user.org_contact_phone && !user.org_contact_email;

  return (
    <div className="min-h-screen flex bg-paper dark:bg-paper-dark transition-colors duration-300">
      <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar breadcrumbs={crumbs} />
        {showContactReminder && (
          <div className="bg-urgent-bg dark:bg-urgent-dbg text-urgent-text dark:text-urgent-dtext text-sm px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <span>Your organization hasn&apos;t set contact info yet -- donors and other organizations won&apos;t be able to reach you.</span>
            <Link to="/profile" className="font-medium underline shrink-0">
              Add contact info →
            </Link>
          </div>
        )}
        <main className="flex-1 overflow-auto">{children}</main>
        <DashboardFooter />
      </div>
    </div>
  );
}

AppShell.propTypes = {
  crumbs: PropTypes.arrayOf(PropTypes.string).isRequired,
  children: PropTypes.node.isRequired,
};