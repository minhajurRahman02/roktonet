import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './routing/ProtectedRoute';
import RoleRoute from './routing/RoleRoute';
import AppShell from './components/organisms/AppShell';
import Landing from './pages/Landing';
import HospitalOverview from './pages/hospital/Overview';
import MyRequests from './pages/hospital/MyRequests';
import NewRequest from './pages/hospital/NewRequest';
import RequestDetail from './pages/hospital/RequestDetail';
import AdminDashboard from './pages/AdminDashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Unauthorized from './pages/Unauthorized';

// Roles allowed into the shared "hospital" shell for now -- bank/ngo/donor
// get their own dashboards in Phase 7.8; this placeholder keeps them from
// having nowhere to go in the meantime.
const HOSPITAL_SHELL_ROLES = ['hospital', 'bank', 'ngo', 'donor'];

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route
            path="/unauthorized"
            element={
              <ProtectedRoute>
                <Unauthorized />
              </ProtectedRoute>
            }
          />

          {/* Hospital -- real pages now (Phase 7.7), each with its own
              breadcrumb trail passed to AppShell. */}
          <Route
            path="/hospital"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={HOSPITAL_SHELL_ROLES}>
                  <AppShell crumbs={['Hospital', 'Overview']}>
                    <HospitalOverview />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/hospital/requests"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={HOSPITAL_SHELL_ROLES}>
                  <AppShell crumbs={['Hospital', 'My Requests']}>
                    <MyRequests />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/hospital/requests/new"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={HOSPITAL_SHELL_ROLES}>
                  <AppShell crumbs={['Hospital', 'My Requests', 'New Request']}>
                    <NewRequest />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/hospital/requests/:id"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={HOSPITAL_SHELL_ROLES}>
                  <AppShell crumbs={['Hospital', 'My Requests', 'Detail']}>
                    <RequestDetail />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AppShell crumbs={['Admin', 'Overview']}>
                    <AdminDashboard />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}