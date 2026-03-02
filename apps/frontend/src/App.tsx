import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { TeamsPage } from './pages/TeamsPage';
import { FirmaPage } from './pages/FirmaPage';
import { CatalogPage } from './pages/CatalogPage';
import { DepartmentPage } from './pages/DepartmentPage';
import { DepartmentContextPage } from './pages/DepartmentContextPage';
import { PersonalPage } from './pages/PersonalPage';
import { SharedPage } from './pages/SharedPage';
import { TeamContextPage } from './pages/TeamContextPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AuthGuard } from './components/AuthGuard';
import { AdminGuard } from './components/AdminGuard';
import { ThemeFromPreferences } from './components/ThemeFromPreferences';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AdminPage } from './pages/admin/AdminPage';
import { AdminUsersTab } from './pages/admin/AdminUsersTab';
import { AdminTeamsTab } from './pages/admin/AdminTeamsTab';
import { AdminOrganisationTab } from './pages/admin/AdminOrganisationTab';

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <AuthGuard>
              <ThemeFromPreferences>
                <AppShell />
              </ThemeFromPreferences>
            </AuthGuard>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="team" element={<TeamsPage />} />
          <Route path="team/:teamId" element={<TeamContextPage />} />
          <Route path="department" element={<DepartmentPage />} />
          <Route path="department/:departmentId" element={<DepartmentContextPage />} />
          <Route path="company" element={<FirmaPage />} />
          <Route path="personal" element={<PersonalPage />} />
          <Route path="shared" element={<SharedPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="teams" element={<Navigate to="/team" replace />} />
          <Route path="repositories" element={<Navigate to="/catalog" replace />} />
          <Route path="processes" element={<Navigate to="/catalog" replace />} />
          <Route path="templates" element={<Navigate to="/" replace />} />
          <Route
            path="admin"
            element={
              <AdminGuard>
                <AdminPage />
              </AdminGuard>
            }
          >
            <Route index element={<Navigate to="/admin/users" replace />} />
            <Route path="users" element={<AdminUsersTab />} />
            <Route path="teams" element={<AdminTeamsTab />} />
            <Route path="organisation" element={<AdminOrganisationTab />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
