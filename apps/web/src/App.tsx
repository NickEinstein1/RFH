import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { LoginPage } from './pages/LoginPage';
import { ResidentsPage } from './pages/ResidentsPage';
import { ResidentDetailPage } from './pages/ResidentDetailPage';
import { AlertsPage } from './pages/AlertsPage';
import { StaffPage } from './pages/StaffPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { ReportsPage } from './pages/ReportsPage';
import { MarSheetPage } from './pages/MarSheetPage';

function Shell() {
  const { user, logout } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const showStaff = ['OWNER', 'ADMIN', 'NURSE', 'CAREGIVER'].includes(user.role);
  const showMedAlerts = user.role !== 'FAMILY_VIEWER';
  const showIncidents = user.role !== 'FAMILY_VIEWER';
  const showReports = ['OWNER', 'ADMIN', 'NURSE'].includes(user.role);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          RFH <span>Care</span>
        </div>
        <nav className="nav-actions">
          <NavLink to="/" className={({ isActive }) => `btn ${isActive ? '' : 'secondary'}`}>
            Residents
          </NavLink>
          {showMedAlerts ? (
            <NavLink to="/alerts" className={({ isActive }) => `btn ${isActive ? '' : 'secondary'}`}>
              Alerts
            </NavLink>
          ) : null}
          {showIncidents ? (
            <NavLink to="/incidents" className={({ isActive }) => `btn ${isActive ? '' : 'secondary'}`}>
              Incidents
            </NavLink>
          ) : null}
          {showStaff ? (
            <NavLink to="/staff" className={({ isActive }) => `btn ${isActive ? '' : 'secondary'}`}>
              Staff
            </NavLink>
          ) : null}
          {showReports ? (
            <NavLink to="/reports" className={({ isActive }) => `btn ${isActive ? '' : 'secondary'}`}>
              Reports
            </NavLink>
          ) : null}
          <span className="meta account-chip">
            <span className="account-facility">{user.tenantName}</span>
            <span>
              {user.firstName} · {user.role}
            </span>
          </span>
          <button className="btn ghost" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  const tz = user?.timezone || 'America/Los_Angeles';

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Shell />}>
        <Route index element={<ResidentsPage timezone={tz} />} />
        <Route path="residents/:id" element={<ResidentDetailPage timezone={tz} />} />
        <Route path="residents/:id/mar" element={<MarSheetPage />} />
        <Route path="alerts" element={<AlertsPage timezone={tz} />} />
        <Route path="incidents" element={<IncidentsPage timezone={tz} />} />
        <Route path="staff" element={<StaffPage timezone={tz} />} />
        <Route path="reports" element={<ReportsPage timezone={tz} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
