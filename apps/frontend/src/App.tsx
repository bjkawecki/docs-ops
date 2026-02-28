import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { TeamsPage } from './pages/TeamsPage';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { ProzessePage } from './pages/ProzessePage';
import { FirmaPage } from './pages/FirmaPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AuthGuard } from './components/AuthGuard';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="repositories" element={<RepositoriesPage />} />
          <Route path="processes" element={<ProzessePage />} />
          <Route path="company" element={<FirmaPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
