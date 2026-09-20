import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import {
  flushAllOfflineQueues,
  isOnline,
  pendingCount,
} from './offlineQueue';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { HomePage } from './pages/HomePage';
import { ResidentsPage } from './pages/ResidentsPage';
import { ResidentDetailPage } from './pages/ResidentDetailPage';
import { AlertsPage } from './pages/AlertsPage';
import { StaffPage } from './pages/StaffPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { ReportsPage } from './pages/ReportsPage';
import { MarSheetPage } from './pages/MarSheetPage';
import { CarePlanPage } from './pages/CarePlanPage';
import { DownloadsPage } from './pages/DownloadsPage';

function Shell() {
  const { user, logout, idleWarning, homes, switchHome } = useAuth();
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(pendingCount());
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const syncPending = () => setPending(pendingCount());
    const onOnline = () => {
      setOnline(true);
      void flushAllOfflineQueues().then(syncPending);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('rfh-offline-queue', syncPending);
    if (navigator.onLine) void flushAllOfflineQueues().then(syncPending);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('rfh-offline-queue', syncPending);
    };
  }, []);

  if (!user) return <Navigate to="/login" replace />;
  const showStaff = ['OWNER', 'ADMIN', 'NURSE', 'CAREGIVER'].includes(user.role);
  const showMedAlerts = user.role !== 'FAMILY_VIEWER';
  const showIncidents = user.role !== 'FAMILY_VIEWER';
  const showReports = ['OWNER', 'ADMIN', 'NURSE'].includes(user.role);
  const showSecurity = ['OWNER', 'ADMIN'].includes(user.role);
  const multiHome = homes.length > 1;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand">
            RFH <span>Care</span>
          </div>
          {multiHome ? (
            <label className="home-switcher">
              <span className="visually-hidden">Facility</span>
              <select
                value={user.tenantId}
                disabled={switching}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id === user.tenantId) return;
                  setSwitching(true);
                  void switchHome(id).finally(() => setSwitching(false));
                }}
              >
                {homes.map((h) => (
                  <option key={h.tenantId} value={h.tenantId}>
                    {h.tenantName}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="brand-facility">{user.tenantName}</div>
          )}
        </div>
        <nav className="nav-actions">
          <NavLink to="/" end className={({ isActive }) => `btn ${isActive ? '' : 'secondary'}`}>
            Today
          </NavLink>
          <NavLink
            to="/residents"
            className={({ isActive }) => `btn ${isActive ? '' : 'secondary'}`}
          >
            Residents
          </NavLink>
          {showMedAlerts ? (
            <NavLink to="/alerts" className={({ isActive }) => `btn ${isActive ? '' : 'secondary'}`}>
              Alerts
            </NavLink>
          ) : null}
          {showIncidents ? (
            <NavLink
              to="/incidents"
              className={({ isActive }) => `btn ${isActive ? '' : 'secondary'}`}
            >
              Notes
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
          <NavLink
            to="/downloads"
            className={({ isActive }) => `btn ${isActive ? '' : 'secondary'}`}
          >
            Downloads
          </NavLink>
          <span className={`sync-chip ${online ? (pending ? 'warn' : 'ok') : 'danger'}`}>
            {!online ? 'Offline' : pending ? `${pending} to sync` : 'Synced'}
          </span>
          <span className="meta account-chip">
            <span>
              {user.firstName} · {user.role}
            </span>
          </span>
          <button className="btn ghost" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </nav>
      </header>
      {idleWarning ? (
        <div className="toast toast-warn session-warn">
          Session idle — you will be signed out soon. Move the mouse to stay signed in.
        </div>
      ) : null}
      {showSecurity ? (
        <div className="security-banner">
          Security: TLS at proxy · JWT + PHI keys in env · SMTP optional · see docs/hipaa-ops.md
        </div>
      ) : null}
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
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<Shell />}>
        <Route index element={<HomePage timezone={tz} />} />
        <Route path="residents" element={<ResidentsPage timezone={tz} />} />
        <Route path="residents/:id" element={<ResidentDetailPage timezone={tz} />} />
        <Route path="residents/:id/mar" element={<MarSheetPage />} />
        <Route path="residents/:id/care-plan" element={<CarePlanPage />} />
        <Route path="residents/:id/care-plan/:planId" element={<CarePlanPage />} />
        <Route path="alerts" element={<AlertsPage timezone={tz} />} />
        <Route path="incidents" element={<IncidentsPage timezone={tz} />} />
        <Route path="staff" element={<StaffPage timezone={tz} />} />
        <Route path="reports" element={<ReportsPage timezone={tz} />} />
        <Route path="downloads" element={<DownloadsPage />} />
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
