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
import BloodBankOverview from './pages/blood-bank/Overview';
import MyInventory from './pages/blood-bank/MyInventory';
import AddInventoryUnit from './pages/blood-bank/AddInventoryUnit';
import OutgoingAllocations from './pages/blood-bank/OutgoingAllocations';
import Restock from './pages/blood-bank/Restock';
import NewRestockRequest from './pages/blood-bank/NewRestockRequest';
import RestockDetail from './pages/blood-bank/RestockDetail';
import AdminDashboard from './pages/AdminDashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Unauthorized from './pages/Unauthorized';

// Roles still waiting on their own dashboard (Phase 7.8) land in the
// shared hospital shell as a placeholder. Bank graduated out of this list
// now that it has a real dashboard -- ngo/donor remain here until theirs
// are built.
const HOSPITAL_SHELL_ROLES = ['hospital', 'ngo', 'donor'];

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

          {/* Blood Bank -- real dashboard (Phase 7.8, built ahead of NGO/Donor). */}
          <Route
            path="/blood-bank"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['bank']}>
                  <AppShell crumbs={['Blood Bank', 'Overview']}>
                    <BloodBankOverview />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/blood-bank/inventory"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['bank']}>
                  <AppShell crumbs={['Blood Bank', 'My Inventory']}>
                    <MyInventory />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/blood-bank/inventory/add"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['bank']}>
                  <AppShell crumbs={['Blood Bank', 'My Inventory', 'Add Unit']}>
                    <AddInventoryUnit />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/blood-bank/allocations"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['bank']}>
                  <AppShell crumbs={['Blood Bank', 'Outgoing Allocations']}>
                    <OutgoingAllocations />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/blood-bank/restock"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['bank']}>
                  <AppShell crumbs={['Blood Bank', 'Restock']}>
                    <Restock />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/blood-bank/restock/new"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['bank']}>
                  <AppShell crumbs={['Blood Bank', 'Restock', 'New Request']}>
                    <NewRestockRequest />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/blood-bank/restock/:id"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['bank']}>
                  <AppShell crumbs={['Blood Bank', 'Restock', 'Detail']}>
                    <RestockDetail />
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