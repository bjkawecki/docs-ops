import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AdminGuard } from './AdminGuard';
import type { MeResponse } from '../api/me-types';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function createWrapper(me: MeResponse | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (me) {
    queryClient.setQueryData(['me'], me);
  }
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

const adminMe: MeResponse = {
  user: {
    id: '1',
    name: 'Admin',
    email: 'admin@test.de',
    isAdmin: true,
    hasLocalLogin: true,
  },
  identity: { teams: [], departments: [], supervisorOfDepartments: [], userSpaces: [] },
  preferences: {},
};

const nonAdminMe: MeResponse = {
  ...adminMe,
  user: { ...adminMe.user, isAdmin: false },
};

describe('AdminGuard', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('rendert Kinder, wenn Nutzer Admin ist', () => {
    const Wrapper = createWrapper(adminMe);
    render(
      <AdminGuard>
        <div data-testid="admin-content">Admin-Bereich</div>
      </AdminGuard>,
      { wrapper: Wrapper }
    );
    expect(screen.getByTestId('admin-content')).toBeInTheDocument();
    expect(screen.getByText('Admin-Bereich')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('leitet auf / weiter und rendert nichts, wenn Nutzer kein Admin ist', () => {
    const Wrapper = createWrapper(nonAdminMe);
    render(
      <AdminGuard>
        <div data-testid="admin-content">Admin-Bereich</div>
      </AdminGuard>,
      { wrapper: Wrapper }
    );
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('rendert nichts (loading), wenn keine Me-Daten im Cache', () => {
    const Wrapper = createWrapper(null);
    render(
      <AdminGuard>
        <div data-testid="admin-content">Admin-Bereich</div>
      </AdminGuard>,
      { wrapper: Wrapper }
    );
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
  });
});
