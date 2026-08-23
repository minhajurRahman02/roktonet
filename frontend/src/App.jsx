import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { Hospital, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Sun, Moon, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useDarkMode } from './hooks/useDarkMode';
import ProtectedRoute from './routing/ProtectedRoute';
import RoleRoute from './routing/RoleRoute';
import Landing from './pages/Landing';
import HospitalDashboard from './pages/HospitalDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Unauthorized from './pages/Unauthorized';

// Roles allowed into the shared "hospital" shell for now -- bank/ngo/donor
// don't have their own dashboards yet (Phase 7.8), so they land here as a
// placeholder rather than having nowhere to go at all.
const HOSPITAL_SHELL_ROLES = ['hospital', 'bank', 'ngo', 'donor'];

const NAV_ITEMS = [
  { to: '/hospital', label: 'Hospital', icon: Hospital },
  { to: '/admin', label: 'Admin', icon: LayoutDashboard },
];

function NavShell({ children }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark] = useDarkMode(); // shared with the landing page's toggle

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex bg-paper dark:bg-paper-dark transition-colors duration-300">
      <aside
        className={`${collapsed ? 'w-16' : 'w-52'} shrink-0 bg-primary dark:bg-primary-dark text-white flex flex-col p-3 transition-all duration-300 ease-in-out overflow-hidden`}
      >
        <div className="flex items-center justify-between mb-6 h-8">
          <span
            className={`font-display font-semibold text-lg whitespace-nowrap transition-opacity duration-200 ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}
          >
            RoktoNet
          </span>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-white/70 hover:text-white shrink-0"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
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

        <button
          onClick={() => setIsDark((d) => !d)}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
          title={collapsed ? (isDark ? 'Light mode' : 'Dark mode') : undefined}
        >
          {isDark ? <Sun size={18} className="shrink-0" /> : <Moon size={18} className="shrink-0" />}
          <span
            className={`whitespace-nowrap transition-opacity duration-200 ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}
          >
            {isDark ? 'Light mode' : 'Dark mode'}
          </span>
        </button>

        {/* TEMPORARY (7.3) -- a real top nav with a proper user menu comes
            in 7.6 (app shell). This just proves the full login->logout loop
            works end to end before that polish exists. */}
        {!collapsed && (
          <div className="mt-3 pt-3 border-t border-white/10 text-xs text-white/60 space-y-2">
            <div>
              {isLoading ? 'Checking session…' : isAuthenticated ? `${user.email} (${user.role})` : 'Not logged in'}
            </div>
            {isAuthenticated && (
              <button onClick={handleLogout} className="flex items-center gap-1.5 hover:text-white">
                <LogOut size={14} /> Log out
              </button>
            )}
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes -- no auth required. Landing is now the real
              public home page (previously "/" redirected into the
              dashboard shell -- that duplicate route is removed). */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Protected routes -- ProtectedRoute checks auth, RoleRoute
              (nested inside) checks the specific role is allowed here. */}
          <Route
            path="/unauthorized"
            element={
              <ProtectedRoute>
                <Unauthorized />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hospital"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={HOSPITAL_SHELL_ROLES}>
                  <NavShell>
                    <HospitalDashboard />
                  </NavShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <NavShell>
                    <AdminDashboard />
                  </NavShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
