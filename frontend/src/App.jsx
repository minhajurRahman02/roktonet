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
import HospitalAllocationLog from './pages/hospital/AllocationLog';
import BloodBankOverview from './pages/blood-bank/Overview';
import MyInventory from './pages/blood-bank/MyInventory';
import AddInventoryUnit from './pages/blood-bank/AddInventoryUnit';
import OutgoingAllocations from './pages/blood-bank/OutgoingAllocations';
import Restock from './pages/blood-bank/Restock';
import NewRestockRequest from './pages/blood-bank/NewRestockRequest';
import RestockDetail from './pages/blood-bank/RestockDetail';
import NgoOverview from './pages/ngo/Overview';
import MyDonors from './pages/ngo/MyDonors';
import RegisterDonor from './pages/ngo/RegisterDonor';
import DonorDetail from './pages/ngo/DonorDetail';
import LogUnit from './pages/ngo/LogUnit';
import MyDrives from './pages/ngo/MyDrives';
import NewDrive from './pages/ngo/NewDrive';
import DriveDetail from './pages/ngo/DriveDetail';
import DriveLog from './pages/ngo/DriveLog';
import NgoMobilizations from './pages/ngo/Mobilizations';
import DonorOverview from './pages/donor/Overview';
import DonationHistory from './pages/donor/DonationHistory';
import MyInvites from './pages/donor/MyInvites';
import MyNgo from './pages/donor/MyNgo';
import DonorNgoDetail from './pages/donor/NgoDetail';
import BrowseDrives from './pages/donor/BrowseDrives';
import DriveInfo from './pages/donor/DriveInfo';
import MyProfile from './pages/MyProfile';
import AdminOverview from './pages/admin/Overview';
import AdminUsers from './pages/admin/Users';
import AdminUserDetail from './pages/admin/UserDetail';
import AdminRequests from './pages/admin/Requests';
import AdminInventory from './pages/admin/Inventory';
import AdminOrganizations from './pages/admin/Organizations';
import AdminDonors from './pages/admin/Donors';
import AdminAnalytics from './pages/admin/Analytics';
import AdminBroadcasts from './pages/admin/Broadcasts';
import AdminAuditLog from './pages/admin/AuditLog';
import AdminReports from './pages/admin/Reports';
// Roktim (Phase 6E). Admin-only, and deliberately NOT wrapped in AppShell:
// the page takes the full viewport with its own dark theme and navigation.
// Deleting these three imports and their three routes is part of removing the
// module.
import RoktimPage from './roktim/RoktimPage';
import RoktimDistrictsPage from './roktim/RoktimDistrictsPage';
import RoktimLogPage from './roktim/RoktimLogPage';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Unauthorized from './pages/Unauthorized';

// Every role now has its own real dashboard -- this constant only still
// exists because Hospital's routes were originally built to allow a
// shared list of roles (in case others landed here as a placeholder
// first, which bank/ngo/donor all did at various points). Now that
// nothing else does, this is just ['hospital'], kept as a named
// constant rather than inlining the literal so a future role added here
// as a temporary placeholder has an obvious, named place to go.
const HOSPITAL_SHELL_ROLES = ['hospital'];

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
            path="/hospital/allocations"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={HOSPITAL_SHELL_ROLES}>
                  <AppShell crumbs={['Hospital', 'Allocation Log']}>
                    <HospitalAllocationLog />
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

          {/* NGO -- real dashboard (Phase 7.8). */}
          <Route
            path="/ngo"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'Overview']}>
                    <NgoOverview />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo/donors"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'My Donors']}>
                    <MyDonors />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo/donors/register"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'My Donors', 'Register']}>
                    <RegisterDonor />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo/donors/:id"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'My Donors', 'Detail']}>
                    <DonorDetail />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo/drives"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'My Blood Drives']}>
                    <MyDrives />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo/drives/new"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'My Blood Drives', 'Create']}>
                    <NewDrive />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo/drives/:id"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'My Blood Drives', 'Detail']}>
                    <DriveDetail />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo/drives/:driveId/log-unit/:donorId"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'My Blood Drives', 'Log Unit']}>
                    <LogUnit />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo/drives/:id/log"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'My Blood Drives', 'Log']}>
                    <DriveLog />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          {/* NGOs hold real inventory and the engine allocates from it, so
              they get the same two views the blood bank has. These are the
              SAME components -- both call endpoints that auto-scope to the
              caller's own org, so there is nothing bank-specific in them and
              a second copy would only be a second place for the dispatch
              grouping logic to drift. */}
          <Route
            path="/ngo/inventory"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'My Inventory']}>
                    <MyInventory />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo/inventory/add"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'My Inventory', 'Add Unit']}>
                    <AddInventoryUnit />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo/allocations"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'Outgoing Allocations']}>
                    <OutgoingAllocations />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo/mobilizations"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['ngo']}>
                  <AppShell crumbs={['NGO', 'Mobilizations']}>
                    <NgoMobilizations />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />

          {/* Universal -- reachable via the TopBar avatar menu for every
              role, not tied to any one role's URL prefix. */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AppShell crumbs={['My Profile']}>
                  <MyProfile />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Donor -- real dashboard (Phase 7.8, the last of the four
              role builds before Admin). */}
          <Route
            path="/donor"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['donor']}>
                  <AppShell crumbs={['Donor', 'Overview']}>
                    <DonorOverview />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/donor/history"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['donor']}>
                  <AppShell crumbs={['Donor', 'Donation History']}>
                    <DonationHistory />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/donor/invites"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['donor']}>
                  <AppShell crumbs={['Donor', 'My Invites']}>
                    <MyInvites />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/donor/ngo"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['donor']}>
                  <AppShell crumbs={['Donor', 'My NGO']}>
                    <MyNgo />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/donor/ngo/:orgId"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['donor']}>
                  <AppShell crumbs={['Donor', 'My NGO', 'Detail']}>
                    <DonorNgoDetail />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/donor/browse"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['donor']}>
                  <AppShell crumbs={['Donor', 'Browse Drives']}>
                    <BrowseDrives />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/donor/browse/:id"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['donor']}>
                  <AppShell crumbs={['Donor', 'Browse Drives', 'Detail']}>
                    <DriveInfo />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />

          {/* Admin (Phase 7.7) -- every page under /admin is admin-only */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AppShell crumbs={['Admin', 'Overview']}>
                    <AdminOverview />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AppShell crumbs={['Admin', 'Users']}>
                    <AdminUsers />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users/:id"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AppShell crumbs={['Admin', 'Users']}>
                    <AdminUserDetail />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/requests"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AppShell crumbs={['Admin', 'Requests']}>
                    <AdminRequests />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/inventory"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AppShell crumbs={['Admin', 'Inventory']}>
                    <AdminInventory />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/organizations"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AppShell crumbs={['Admin', 'Organizations']}>
                    <AdminOrganizations />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/donors"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AppShell crumbs={['Admin', 'Donors']}>
                    <AdminDonors />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/analytics"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AppShell crumbs={['Admin', 'Analytics']}>
                    <AdminAnalytics />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/broadcasts"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AppShell crumbs={['Admin', 'Broadcasts']}>
                    <AdminBroadcasts />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AppShell crumbs={['Admin', 'Audit Log']}>
                    <AdminAuditLog />
                  </AppShell>
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          {/* Roktim. Same ProtectedRoute + RoleRoute guards as every other
              admin page, but no AppShell wrapper, so no sidebar, no TopBar and
              no breadcrumbs. Its own shell provides the way back. */}
          <Route
            path="/admin/roktim"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <RoktimPage />
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/roktim/districts"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <RoktimDistrictsPage />
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/roktim/log"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <RoktimLogPage />
                </RoleRoute>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AppShell crumbs={['Admin', 'Reports']}>
                    <AdminReports />
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