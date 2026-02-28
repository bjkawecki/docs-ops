import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { TeamsPage } from './pages/TeamsPage';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { ProzessePage } from './pages/ProzessePage';
import { FirmaPage } from './pages/FirmaPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { AuthGuard } from './components/AuthGuard';

function App() {
  return (
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
