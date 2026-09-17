import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ListChecks, Droplets, PackagePlus, Truck, RefreshCw, Users, Heart, Building2, Search, ChevronLeft, UserCog, BarChart3, Megaphone, ScrollText, Download } from 'lucide-react';
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
  admin: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'Users', icon: UserCog },
    { to: '/admin/requests', label: 'Requests', icon: ListChecks },
    { to: '/admin/inventory', label: 'Inventory', icon: Droplets },
    { to: '/admin/organizations', label: 'Organizations', icon: Building2 },
    { to: '/admin/donors', label: 'Donors', icon: Heart },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/admin/broadcasts', label: 'Broadcasts', icon: Megaphone },
    { to: '/admin/audit', label: 'Audit Log', icon: ScrollText },
    { to: '/admin/reports', label: 'Reports', icon: Download },
  ],
  bank: [
    { to: '/blood-bank', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/blood-bank/inventory', label: 'My Inventory', icon: Droplets },
    { to: '/blood-bank/allocations', label: 'Outgoing Allocations', icon: Truck },
    { to: '/blood-bank/restock', label: 'Restock', icon: RefreshCw },
  ],
  // ngo/donor don't have real dashboards yet (Phase 7.8) -- they currently
  // land in the shared hospital shell as a placeholder, so give them a
  // minimal, honest nav rather than pretending they have Hospital's
  // features.
  ngo: [
    { to: '/ngo', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/ngo/donors', label: 'My Donors', icon: Users },
    { to: '/ngo/drives', label: 'My Blood Drives', icon: Heart },
    { to: '/ngo/mobilizations', label: 'Mobilizations', icon: Truck },
  ],
  // donor's nav is computed dynamically below (getNavItems), not listed
  // here statically -- "My NGO" vs "Find an NGO" depends on whether the
  // donor is currently affiliated with one.
};

function getNavItems(user) {
  if (!user) return [];
  if (user.role === 'donor') {
    return [
      { to: '/donor', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/donor/history', label: 'Donation History', icon: Droplets },
      { to: '/donor/invites', label: 'My Invites', icon: Truck },
      // The label itself reflects real affiliation state -- "My NGO"
      // would be misleading for a donor who doesn't have one; "Find an
      // NGO" would undersell it for a donor who does.
      { to: '/donor/ngo', label: user.org_id ? 'My NGO' : 'Find an NGO', icon: Building2 },
      { to: '/donor/browse', label: 'Browse Drives', icon: Search },
    ];
  }
  return NAV_BY_ROLE[user.role] || [];
}

export default function Sidebar({ collapsed, onToggleCollapsed }) {
  const { user } = useAuth();
  const navItems = getNavItems(user);

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
        <div className="h-8 mb-6 flex items-center gap-2">
          {/* Placeholder mark -- swap for the real RoktoNet logo when it
              exists. A simple droplet keeps the sidebar from looking
              unfinished in the meantime without pretending to be final. */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#A9382F" className="shrink-0" aria-hidden="true">
            <path d="M12 2C12 2 5 11.5 5 16a7 7 0 0 0 14 0c0-4.5-7-14-7-14z" />
          </svg>
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
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'
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