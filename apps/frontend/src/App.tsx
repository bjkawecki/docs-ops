import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { TeamRedirectPage } from './pages/TeamRedirectPage';
import { CompanyPage } from './pages/CompanyPage';
import { CatalogPage } from './pages/CatalogPage';
import { DepartmentRedirectPage } from './pages/DepartmentRedirectPage';
import { DepartmentContextPage } from './pages/DepartmentContextPage';
import { PersonalPage } from './pages/PersonalPage';
import { SharedPage } from './pages/SharedPage';
import { TeamContextPage } from './pages/TeamContextPage';
import { ProcessContextPage } from './pages/ProcessContextPage';
import { ProjectContextPage } from './pages/ProjectContextPage';
import { SubcontextDetailPage } from './pages/SubcontextDetailPage';
import { DocumentPage } from './pages/DocumentPage';
import { DocumentVersionsPage } from './pages/DocumentVersionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AuthGuard } from './components/AuthGuard';
import { AdminGuard } from './components/AdminGuard';
import { ThemeFromPreferences } from './components/ThemeFromPreferences';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AdminPage } from './pages/admin/AdminPage';
import { AdminUsersTab } from './pages/admin/AdminUsersTab';
import { AdminTeamsTab } from './pages/admin/AdminTeamsTab';
import { AdminDepartmentsTab } from './pages/admin/AdminDepartmentsTab';
import { AdminCompanyTab } from './pages/admin/AdminCompanyTab';

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
          <Route path="team" element={<TeamRedirectPage />} />
          <Route path="team/:teamId" element={<TeamContextPage />} />
          <Route path="department" element={<DepartmentRedirectPage />} />
          <Route path="department/:departmentId" element={<DepartmentContextPage />} />
          <Route path="company" element={<CompanyPage />} />
          <Route path="personal" element={<PersonalPage />} />
          <Route path="shared" element={<SharedPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="teams" element={<Navigate to="/team" replace />} />
          <Route path="repositories" element={<Navigate to="/catalog" replace />} />
          <Route path="processes">
            <Route index element={<Navigate to="/catalog" replace />} />
            <Route path=":processId" element={<ProcessContextPage />} />
          </Route>
          <Route path="projects">
            <Route index element={<Navigate to="/catalog" replace />} />
            <Route path=":projectId" element={<ProjectContextPage />} />
          </Route>
          <Route path="subcontexts/:subcontextId" element={<SubcontextDetailPage />} />
          <Route path="documents/:documentId" element={<DocumentPage />} />
          <Route path="documents/:documentId/versions" element={<DocumentVersionsPage />} />
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
            <Route path="departments" element={<AdminDepartmentsTab />} />
            <Route path="company" element={<AdminCompanyTab />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
