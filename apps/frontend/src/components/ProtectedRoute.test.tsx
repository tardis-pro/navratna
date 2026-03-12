import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAuth } from '../contexts/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('./Login', () => ({
  Login: () => <div>Mock Login Screen</div>,
}));

const createAuthContextValue = (
  overrides: Partial<ReturnType<typeof useAuth>>
): ReturnType<typeof useAuth> => {
  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    login: async () => {},
    logout: async () => {},
    refreshUser: async () => {},
    security: {
      login: async () => ({}),
      logout: async () => {},
      refreshToken: async () => '',
      validatePermissions: async () => ({}),
      assessRisk: async () => ({}),
      auditLog: async () => ({}),
    },
    systemOperations: {
      healthCheck: async () => ({}),
      getSystemMetrics: async () => ({}),
      getSystemConfig: async () => ({}),
      migrateDatabase: async () => ({}),
      clearCache: async () => {},
      getSystemLogs: async () => ({}),
      backupSystem: async () => ({}),
      monitorSystem: async () => ({}),
      discoverServices: async () => ({}),
    },
    activeFlows: [],
    flowResults: new Map<string, unknown>(),
    flowErrors: new Map<string, string>(),
    executeFlow: async () => ({}),
    getFlowStatus: () => 'idle',
    clearFlowResult: () => {},
    ...overrides,
  };
};

describe('ProtectedRoute', () => {
  it('renders loading state when auth status is loading', () => {
    vi.mocked(useAuth).mockReturnValue(createAuthContextValue({ isLoading: true }));

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Loading Navratna')).toBeInTheDocument();
  });

  it('renders login when user is not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue(createAuthContextValue({ isAuthenticated: false }));

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Mock Login Screen')).toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue(
      createAuthContextValue({
        isAuthenticated: true,
        user: {
          id: 'user-1',
          email: 'user@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'member',
          permissions: [],
        },
      })
    );

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
