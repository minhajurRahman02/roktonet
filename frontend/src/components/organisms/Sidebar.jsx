import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ListChecks, ChevronLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// Each role gets its OWN nav list -- previously every role saw the same
// hardcoded [Hospital, Admin] links regardless of who was actually logged
// in, which meant e.g. a hospital user saw an "Admin" link that would
// just bounce them to /unauthorized if clicked. Fixed here.
const NAV_BY_ROLE = {
  hospital: [
    { to: '/hospital', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/hospital/requests', label: 'My Requests', icon: ListChecks },
  ],
  admin: [{ to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true }],
  // bank/ngo/donor don't have real dashboards yet (Phase 7.8) -- they
  // currently land in the shared hospital shell as a placeholder, so give
  // them a minimal, honest nav rather than pretending they have Hospital's
  // features.
  bank: [{ to: '/hospital', label: 'Overview', icon: LayoutDashboard, end: true }],
  ngo: [{ to: '/hospital', label: 'Overview', icon: LayoutDashboard, end: true }],
  donor: [{ to: '/hospital', label: 'Overview', icon: LayoutDashboard, end: true }],
};

export default function Sidebar({ collapsed, onToggleCollapsed }) {
  const { user } = useAuth();
  const navItems = NAV_BY_ROLE[user?.role] || [];

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-52'} shrink-0 bg-primary dark:bg-primary-dark text-white relative transition-all duration-300 ease-in-out`}
    >
      <button
        onClick={onToggleCollapsed}
        className="absolute top-3 right-2 text-white/60 hover:text-white transition-transform duration-300"
        style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <ChevronLeft size={16} />
      </button>

      <div className="overflow-hidden h-full flex flex-col p-3">
        <div className="h-8 mb-6 flex items-center">
          <span
            className={`font-display font-semibold text-lg whitespace-nowrap transition-opacity duration-200 ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}
          >
            RoktoNet
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'
                }`
              }
              title={collapsed ? label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              <span
                className={`whitespace-nowrap transition-opacity duration-200 ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}
              >
                {label}
              </span>
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}

Sidebar.propTypes = {
  collapsed: PropTypes.bool.isRequired,
  onToggleCollapsed: PropTypes.func.isRequired,
};