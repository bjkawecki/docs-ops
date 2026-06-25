import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { AppShell } from './components/appShell/AppShell';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/auth/LoginPage';
import { TeamRedirectPage } from './pages/team/TeamRedirectPage';
import { CompanyPage } from './pages/company/CompanyPage';
import { CatalogPage } from './pages/catalog/CatalogPage';
import { DepartmentRedirectPage } from './pages/department/DepartmentRedirectPage';
import { DepartmentContextPage } from './pages/department/DepartmentContextPage';
import { PersonalPage } from './pages/account/PersonalPage';
import { SharedPage } from './pages/account/SharedPage';
import { ReviewsPage } from './pages/catalog/ReviewsPage';
import { TeamContextPage } from './pages/TeamContextPage';
import { ProcessContextPage } from './pages/process/ProcessContextPage';
import { ProjectContextPage } from './pages/project/ProjectContextPage';
import { ProjectWorkspaceOutlet } from './pages/project/ProjectWorkspaceOutlet';
import { SubcontextDetailPage } from './pages/context/SubcontextDetailPage';
import { SubcontextRedirectPage } from './pages/context/SubcontextRedirectPage';
import { DocumentVersionsPage } from './pages/document/DocumentVersionsPage';
import { SettingsPage } from './pages/account/SettingsPage';
import { NotificationsPage } from './pages/account/NotificationsPage';
import { HelpLayout } from './pages/help/HelpLayout';
import { HelpOverviewPage } from './pages/help/HelpOverviewPage';
import { HelpOrganisationPage } from './pages/help/HelpOrganisationPage';
import { HelpPermissionsPage } from './pages/help/HelpPermissionsPage';
import { HelpWorkflowPage } from './pages/help/HelpWorkflowPage';
import { HelpCollaborationPage } from './pages/help/HelpCollaborationPage';
import { NotFoundPage } from './pages/misc/NotFoundPage';
import { AuthGuard } from './components/guards/AuthGuard';
import { AdminGuard } from './components/guards/AdminGuard';
import { ThemeFromPreferences } from './components/system/ThemeFromPreferences';
import { ErrorBoundary } from './components/system/ErrorBoundary';
import { WhatsNewPage } from './pages/whatsNew/WhatsNewPage';

const DocumentPage = lazy(() =>
  import('./pages/document/DocumentPage').then((m) => ({ default: m.DocumentPage }))
);
const AdminPage = lazy(() =>
  import('./pages/admin/AdminPage').then((m) => ({ default: m.AdminPage }))
);
const AdminUsersTab = lazy(() =>
  import('./pages/admin/AdminUsersTab').then((m) => ({ default: m.AdminUsersTab }))
);
const AdminTeamsTab = lazy(() =>
  import('./pages/admin/AdminTeamsTab').then((m) => ({ default: m.AdminTeamsTab }))
);
const AdminDepartmentsTab = lazy(() =>
  import('./pages/admin/AdminDepartmentsTab').then((m) => ({ default: m.AdminDepartmentsTab }))
);
const AdminCompanyTab = lazy(() =>
  import('./pages/admin/AdminCompanyTab').then((m) => ({ default: m.AdminCompanyTab }))
);
const AdminJobsTab = lazy(() =>
  import('./pages/admin/AdminJobsTab').then((m) => ({ default: m.AdminJobsTab }))
);
const AdminSchedulerTab = lazy(() =>
  import('./pages/admin/AdminSchedulerTab').then((m) => ({ default: m.AdminSchedulerTab }))
);
const AdminBackupTab = lazy(() =>
  import('./pages/admin/AdminBackupTab/AdminBackupTab').then((m) => ({ default: m.AdminBackupTab }))
);
const AdminMigrationTab = lazy(() =>
  import('./pages/admin/AdminMigrationTab/AdminMigrationTab').then((m) => ({
    default: m.AdminMigrationTab,
  }))
);
const AdminBroadcastTab = lazy(() =>
  import('./pages/admin/AdminBroadcastTab/index.js').then((m) => ({ default: m.AdminBroadcastTab }))
);
const AdminSystemTab = lazy(() =>
  import('./pages/admin/AdminSystemTab/AdminSystemTab.js').then((m) => ({
    default: m.AdminSystemTab,
  }))
);

function RouteFallback() {
  return (
    <Center py="xl">
      <Loader size="sm" />
    </Center>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
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
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="whats-new" element={<WhatsNewPage />} />
            <Route path="help" element={<HelpLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<HelpOverviewPage />} />
              <Route path="organisation" element={<HelpOrganisationPage />} />
              <Route path="permissions" element={<HelpPermissionsPage />} />
              <Route path="workflow" element={<HelpWorkflowPage />} />
              <Route path="collaboration" element={<HelpCollaborationPage />} />
            </Route>
            <Route path="teams" element={<Navigate to="/team" replace />} />
            <Route path="repositories" element={<Navigate to="/catalog" replace />} />
            <Route path="processes">
              <Route index element={<Navigate to="/catalog" replace />} />
              <Route path=":processId" element={<ProcessContextPage />} />
            </Route>
            <Route path="projects">
              <Route index element={<Navigate to="/catalog" replace />} />
              <Route path=":projectId" element={<ProjectWorkspaceOutlet />}>
                <Route index element={<ProjectContextPage />} />
                <Route path="subcontexts/:subcontextId" element={<SubcontextDetailPage />} />
              </Route>
            </Route>
            <Route path="subcontexts/:subcontextId" element={<SubcontextRedirectPage />} />
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
              <Route path="jobs" element={<AdminJobsTab />} />
              <Route path="scheduler" element={<AdminSchedulerTab />} />
              <Route path="backup" element={<AdminBackupTab />} />
              <Route path="migration" element={<AdminMigrationTab />} />
              <Route path="broadcast" element={<AdminBroadcastTab />} />
              <Route path="system" element={<AdminSystemTab />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
