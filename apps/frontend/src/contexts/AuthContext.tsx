import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { uaipAPI } from '../utils/uaip-api';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  permissions: string[];
  lastLoginAt?: Date;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// Security Flow - Moved from DiscussionContext
interface SecurityFlow {
  login: (credentials: unknown) => Promise<unknown>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string>;
  validatePermissions: (resource: string) => Promise<unknown>;
  assessRisk: (operation: unknown) => Promise<unknown>;
  auditLog: (filters?: unknown) => Promise<unknown>;
}

// System Operations Flow - Moved from DiscussionContext
interface SystemOperationsFlow {
  healthCheck: () => Promise<unknown>;
  getSystemMetrics: () => Promise<unknown>;
  getSystemConfig: () => Promise<unknown>;
  migrateDatabase: () => Promise<unknown>;
  clearCache: (layer?: string) => Promise<void>;
  getSystemLogs: (filters?: unknown) => Promise<unknown>;
  backupSystem: () => Promise<unknown>;
  monitorSystem: () => Promise<unknown>;
  discoverServices: () => Promise<unknown>;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;

  // UAIP Backend Flow Integration
  security: SecurityFlow;
  systemOperations: SystemOperationsFlow;

  // UI State Management
  activeFlows: string[];
  flowResults: Map<string, unknown>;
  flowErrors: Map<string, string>;
  executeFlow: (service: string, flow: string, params?: unknown) => Promise<unknown>;
  getFlowStatus: (flowId: string) => 'idle' | 'running' | 'completed' | 'error';
  clearFlowResult: (flowId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  const [activeFlows, setActiveFlows] = useState<string[]>([]);
  const [flowResults, setFlowResults] = useState<Map<string, unknown>>(new Map());
  const [flowErrors, setFlowErrors] = useState<Map<string, string>>(new Map());

  // Generic flow execution handler
  const executeFlow = useCallback(async (service: string, flow: string, params?: unknown) => {
    const flowId = `${service}.${flow}`;

    try {
      setActiveFlows((prev) => [...prev.filter((f) => f !== flowId), flowId]);
      setFlowErrors((prev) => {
        const newMap = new Map(prev);
        newMap.delete(flowId);
        return newMap;
      });

      let result: unknown;

      // Route to actual UAIP API calls based on service
      if (service === 'security') {
        result = await executeSecurityFlow(flow, params);
      } else if (service === 'systemOperations') {
        result = await executeSystemOperationsFlow(flow, params);
      } else {
        // For other services, throw an error indicating they're not implemented
        throw new Error(
          `Service '${service}' is not yet implemented. Available services: security, systemOperations`
        );
      }

      setFlowResults((prev) => {
        const newMap = new Map(prev);
        newMap.set(flowId, result);
        return newMap;
      });

      setActiveFlows((prev) => prev.filter((f) => f !== flowId));
      return result;
    } catch (error) {
      setFlowErrors((prev) => {
        const newMap = new Map(prev);
        newMap.set(flowId, error instanceof Error ? error.message : 'Unknown error');
        return newMap;
      });
      setActiveFlows((prev) => prev.filter((f) => f !== flowId));
      throw error;
    }
  }, []);

  // Execute Security flows using UAIP API
  const executeSecurityFlow = async (flow: string, params: unknown) => {
    switch (flow) {
      case 'login':
        return await uaipAPI.client.auth.login(params);
      case 'logout':
        return await uaipAPI.client.auth.logout();
      case 'refreshToken':
        return await uaipAPI.client.auth.refreshToken();
      case 'validatePermissions':
        // This would be a specialized security endpoint
        throw new Error(`Security flow '${flow}' is not yet implemented`);
      case 'assessRisk':
        // This would be a risk assessment endpoint
        throw new Error(`Security flow '${flow}' is not yet implemented`);
      case 'auditLog':
        // This would be an audit log endpoint
        throw new Error(`Security flow '${flow}' is not yet implemented`);
      default:
        throw new Error(`Security flow '${flow}' is not yet implemented`);
    }
  };

  // Execute System Operations flows
  const executeSystemOperationsFlow = async (flow: string, _params: unknown) => {
    switch (flow) {
      case 'healthCheck':
        return await uaipAPI.client.health();
      case 'getSystemMetrics':
        // This would be a system metrics endpoint
        throw new Error(`System operations flow '${flow}' is not yet implemented`);
      case 'getSystemConfig':
        // This would be a system config endpoint
        throw new Error(`System operations flow '${flow}' is not yet implemented`);
      default:
        throw new Error(`System operations flow '${flow}' is not yet implemented`);
    }
  };

  const getFlowStatus = useCallback(
    (flowId: string): 'idle' | 'running' | 'completed' | 'error' => {
      if (activeFlows.includes(flowId)) return 'running';
      if (flowErrors.has(flowId)) return 'error';
      if (flowResults.has(flowId)) return 'completed';
      return 'idle';
    },
    [activeFlows, flowErrors, flowResults]
  );

  const clearFlowResult = useCallback((flowId: string) => {
    setFlowResults((prev) => {
      const newMap = new Map(prev);
      newMap.delete(flowId);
      return newMap;
    });
    setFlowErrors((prev) => {
      const newMap = new Map(prev);
      newMap.delete(flowId);
      return newMap;
    });
  }, []);

  // Security Gateway Flows
  const security: SecurityFlow = useMemo(
    () => ({
      login: (credentials) => executeFlow('security', 'login', credentials),
      logout: () => executeFlow('security', 'logout'),
      refreshToken: () => executeFlow('security', 'refreshToken'),
      validatePermissions: (resource) =>
        executeFlow('security', 'validatePermissions', { resource }),
      assessRisk: (operation) => executeFlow('security', 'assessRisk', operation),
      auditLog: (filters) => executeFlow('security', 'auditLog', filters),
    }),
    [executeFlow]
  );

  // System Operations Flows
  const systemOperations: SystemOperationsFlow = useMemo(
    () => ({
      healthCheck: () => executeFlow('systemOperations', 'healthCheck'),
      getSystemMetrics: () => executeFlow('systemOperations', 'getSystemMetrics'),
      getSystemConfig: () => executeFlow('systemOperations', 'getSystemConfig'),
      migrateDatabase: () => executeFlow('systemOperations', 'migrateDatabase'),
      clearCache: (layer) => executeFlow('systemOperations', 'clearCache', { layer }),
      getSystemLogs: (filters) => executeFlow('systemOperations', 'getSystemLogs', filters),
      backupSystem: () => executeFlow('systemOperations', 'backupSystem'),
      monitorSystem: () => executeFlow('systemOperations', 'monitorSystem'),
      discoverServices: () => executeFlow('systemOperations', 'discoverServices'),
    }),
    [executeFlow]
  );

  const checkAuthStatus = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const userData = await uaipAPI.client.auth.getCurrentUser();

      if (userData) {
        setState({
          user: {
            id: userData.id,
            email: userData.email,
            firstName: userData.name?.split(' ')[0] || '',
            lastName: userData.name?.split(' ').slice(1).join(' ') || '',
            role: userData.role,
            permissions: [],
          },
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      console.error('Auth status check failed:', error);
      uaipAPI.client.clearAuth();
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  }, []);

  // Check for existing authentication on mount
  useEffect(() => {
    checkAuthStatus();

    // Listen for auth failures from the API client
    const handleAuthFailure = () => {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    };

    // Listen for the auth:unauthorized event from the API client
    window.addEventListener('auth:unauthorized', handleAuthFailure);

    return () => {
      window.removeEventListener('auth:unauthorized', handleAuthFailure);
    };
  }, [checkAuthStatus]);

  const login = useCallback(async (email: string, password: string, _rememberMe = false) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const loginData = await uaipAPI.client.auth.login({ email, password });

      if (loginData && loginData.user) {
        const { user } = loginData;

        setState({
          user: {
            id: user.id,
            email: user.email,
            firstName: user.name?.split(' ')[0] || '',
            lastName: user.name?.split(' ').slice(1).join(' ') || '',
            role: user.role,
            permissions: [],
          },
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Login failed - invalid response',
        }));
      }
    } catch (error) {
      console.error('Login failed:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed',
      }));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      // Call backend logout
      await uaipAPI.client.auth.logout();

      // Clear auth from API client (this will also clear stored tokens)
      uaipAPI.client.clearAuth();

      // WebSocket client reset removed - using useWebSocket hook instead

      // Clear auth state
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Logout failed:', error);

      // Force clear state even if backend call fails
      uaipAPI.client.clearAuth();

      // WebSocket client reset removed - using useWebSocket hook instead

      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!state.isAuthenticated) return;

    try {
      const userData = await uaipAPI.client.auth.getCurrentUser();

      if (userData) {
        setState((prev) => ({
          ...prev,
          user: {
            id: userData.id,
            email: userData.email,
            firstName: userData.name?.split(' ')[0] || '',
            lastName: userData.name?.split(' ').slice(1).join(' ') || '',
            role: userData.role,
            permissions: [], // Will be populated from role
          },
          error: null,
        }));
      } else {
        // If user refresh fails, it might mean the token is invalid
        console.warn('User refresh failed, clearing auth');
        uaipAPI.client.clearAuth();
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      console.error('Failed to refresh user data:', error);
      // Don't clear auth on network errors, only on auth failures
      if (error instanceof Error && error.message.includes('Authentication failed')) {
        uaipAPI.client.clearAuth();
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      }
    }
  }, [state.isAuthenticated]);

  const contextValue: AuthContextType = useMemo(
    () => ({
      ...state,
      login,
      logout,
      refreshUser,

      // UAIP Backend Flow Integration
      security,
      systemOperations,

      // UI State Management
      activeFlows,
      flowResults,
      flowErrors,
      executeFlow,
      getFlowStatus,
      clearFlowResult,
    }),
    [
      state,
      login,
      logout,
      refreshUser,
      security,
      systemOperations,
      activeFlows,
      flowResults,
      flowErrors,
      executeFlow,
      getFlowStatus,
      clearFlowResult,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
