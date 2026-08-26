import { useState } from 'react';
import PropTypes from 'prop-types';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import DashboardFooter from './DashboardFooter';

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

  return (
    <div className="min-h-screen flex bg-paper dark:bg-paper-dark transition-colors duration-300">
      <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar breadcrumbs={crumbs} />
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
