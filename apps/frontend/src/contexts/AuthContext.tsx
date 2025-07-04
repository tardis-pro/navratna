import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  login: (credentials: any) => Promise<any>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string>;
  validatePermissions: (resource: string) => Promise<any>;
  assessRisk: (operation: any) => Promise<any>;
  auditLog: (filters?: any) => Promise<any>;
}

// System Operations Flow - Moved from DiscussionContext
interface SystemOperationsFlow {
  healthCheck: () => Promise<any>;
  getSystemMetrics: () => Promise<any>;
  getSystemConfig: () => Promise<any>;
  migrateDatabase: () => Promise<any>;
  clearCache: (layer?: string) => Promise<void>;
  getSystemLogs: (filters?: any) => Promise<any>;
  backupSystem: () => Promise<any>;
  monitorSystem: () => Promise<any>;
  discoverServices: () => Promise<any>;
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
  flowResults: Map<string, any>;
  flowErrors: Map<string, string>;
  executeFlow: (service: string, flow: string, params?: any) => Promise<any>;
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
    error: null
  });

  const [activeFlows, setActiveFlows] = useState<string[]>([]);
  const [flowResults, setFlowResults] = useState<Map<string, any>>(new Map());
  const [flowErrors, setFlowErrors] = useState<Map<string, string>>(new Map());

  // Check for existing authentication on mount
  useEffect(() => {
    checkAuthStatus();

    // Listen for auth failures from the API client
    const unsubscribe = uaipAPI.client.onAuthFailure(() => {
      console.log('Auth failure detected, clearing state');
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      });
    });

    return unsubscribe;
  }, []);

  // Generic flow execution handler
  const executeFlow = async (service: string, flow: string, params?: any) => {
    const flowId = `${service}.${flow}`;

    try {
      setActiveFlows(prev => [...prev.filter(f => f !== flowId), flowId]);
      setFlowErrors(prev => {
        const newMap = new Map(prev);
        newMap.delete(flowId);
        return newMap;
      });

      let result: any;

      // Route to actual UAIP API calls based on service
      if (service === 'security') {
        result = await executeSecurityFlow(flow, params);
      } else if (service === 'systemOperations') {
        result = await executeSystemOperationsFlow(flow, params);
      } else {
        // For other services, throw an error indicating they're not implemented
        throw new Error(`Service '${service}' is not yet implemented. Available services: security, systemOperations`);
      }

      setFlowResults(prev => {
        const newMap = new Map(prev);
        newMap.set(flowId, result);
        return newMap;
      });

      setActiveFlows(prev => prev.filter(f => f !== flowId));
      return result;
    } catch (error) {
      setFlowErrors(prev => {
        const newMap = new Map(prev);
        newMap.set(flowId, error instanceof Error ? error.message : 'Unknown error');
        return newMap;
      });
      setActiveFlows(prev => prev.filter(f => f !== flowId));
      throw error;
    }
  };

  // Execute Security flows using UAIP API
  const executeSecurityFlow = async (flow: string, params: any) => {
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
  const executeSystemOperationsFlow = async (flow: string, params: any) => {
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



  const getFlowStatus = (flowId: string): 'idle' | 'running' | 'completed' | 'error' => {
    if (activeFlows.includes(flowId)) return 'running';
    if (flowErrors.has(flowId)) return 'error';
    if (flowResults.has(flowId)) return 'completed';
    return 'idle';
  };

  const clearFlowResult = (flowId: string) => {
    setFlowResults(prev => {
      const newMap = new Map(prev);
      newMap.delete(flowId);
      return newMap;
    });
    setFlowErrors(prev => {
      const newMap = new Map(prev);
      newMap.delete(flowId);
      return newMap;
    });
  };

  // Security Gateway Flows
  const security: SecurityFlow = {
    login: (credentials) => executeFlow('security', 'login', credentials),
    logout: () => executeFlow('security', 'logout'),
    refreshToken: () => executeFlow('security', 'refreshToken'),
    validatePermissions: (resource) => executeFlow('security', 'validatePermissions', { resource }),
    assessRisk: (operation) => executeFlow('security', 'assessRisk', operation),
    auditLog: (filters) => executeFlow('security', 'auditLog', filters),
  };

  // System Operations Flows
  const systemOperations: SystemOperationsFlow = {
    healthCheck: () => executeFlow('systemOperations', 'healthCheck'),
    getSystemMetrics: () => executeFlow('systemOperations', 'getSystemMetrics'),
    getSystemConfig: () => executeFlow('systemOperations', 'getSystemConfig'),
    migrateDatabase: () => executeFlow('systemOperations', 'migrateDatabase'),
    clearCache: (layer) => executeFlow('systemOperations', 'clearCache', { layer }),
    getSystemLogs: (filters) => executeFlow('systemOperations', 'getSystemLogs', filters),
    backupSystem: () => executeFlow('systemOperations', 'backupSystem'),
    monitorSystem: () => executeFlow('systemOperations', 'monitorSystem'),
    discoverServices: () => executeFlow('systemOperations', 'discoverServices'),
  };

  const checkAuthStatus = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Check if we have a valid stored token
      const accessToken = typeof window !== 'undefined' ?
        (localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')) : null;
      const refreshToken = typeof window !== 'undefined' ?
        (localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken')) : null;

      if (!accessToken || !uaipAPI.client.isAuthenticated()) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Set the auth token on the client before making the auth.me() call
      const isRemembered = !!localStorage.getItem('accessToken');
      uaipAPI.client.setAuthToken(accessToken, refreshToken || undefined, isRemembered);

      // Try to get current user from backend
      const response = await uaipAPI.client.auth.me();

      if (response.success && response.data) {
        // Set user context for security headers
        uaipAPI.client.setUserContext(response.data.id, undefined, isRemembered);

        setState({
          user: response.data,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
      } else {
        // Token is invalid, clear it
        console.warn('Auth check failed:', response.error?.message || 'Unknown error');
        uaipAPI.client.clearAuth();
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null
        });
      }
    } catch (error) {
      console.error('Auth status check failed:', error);

      // Clear invalid tokens
      uaipAPI.client.clearAuth();

      // Don't set error state for failed auth checks - just silently log out
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      });
    }
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe = false) => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await uaipAPI.client.auth.login({ email, password });

      if (response.success && response.data) {
        const { user, tokens } = response.data;
        const { accessToken, refreshToken } = tokens;

        // Set complete authentication context (this will store tokens AND set them on the client)
        uaipAPI.client.setAuthContext({
          token: accessToken,
          refreshToken,
          userId: user.id,
          rememberMe
        });

        // WebSocket client reset removed - using useWebSocket hook instead

        // Set authenticated user
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: response.error?.message || 'Login failed'
        }));
      }
    } catch (error) {
      console.error('Login failed:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed'
      }));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

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
        error: null
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
        error: null
      });
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!state.isAuthenticated) return;

    try {
      const response = await uaipAPI.client.auth.me();

      if (response.success && response.data) {
        setState(prev => ({
          ...prev,
          user: response.data,
          error: null
        }));
      } else {
        // If user refresh fails, it might mean the token is invalid
        console.warn('User refresh failed, clearing auth');
        uaipAPI.client.clearAuth();
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null
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
          error: null
        });
      }
    }
  }, [state.isAuthenticated]);

  const contextValue: AuthContextType = {
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
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 