import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { uaipAPI } from '../services/uaip-api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department: string;
  permissions: string[];
  lastLoginAt?: Date;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null
  });

  // Check for existing authentication on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      // Check if we have a stored token
      const hasToken = typeof window !== 'undefined' && 
        (localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken'));
      
      if (!hasToken) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Check backend availability first
      const isBackendAvailable = await uaipAPI.isBackendAvailable();
      
      if (!isBackendAvailable) {
        // Use mock user data when backend is unavailable
        const mockUser: User = {
          id: 'mock-user-1',
          email: 'demo@example.com',
          firstName: 'Demo',
          lastName: 'User',
          role: 'admin',
          department: 'engineering',
          permissions: ['admin:*'],
          lastLoginAt: new Date()
        };
        
        setState({
          user: mockUser,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
        return;
      }

      // Try to get current user from backend
      const response = await uaipAPI.client.auth.me();
      
      if (response.success && response.data) {
        setState({
          user: response.data,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
      } else {
        // Token is invalid, clear it
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
      // Clear invalid auth state
      uaipAPI.client.clearAuth();
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

      // Check backend availability
      const isBackendAvailable = await uaipAPI.isBackendAvailable();
      
      if (!isBackendAvailable) {
        // Mock login for demo purposes
        const mockUser: User = {
          id: 'mock-user-1',
          email: email,
          firstName: 'Demo',
          lastName: 'User',
          role: 'admin',
          department: 'engineering',
          permissions: ['admin:*'],
          lastLoginAt: new Date()
        };
        
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setState({
          user: mockUser,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
        return;
      }

      // Real login
      const response = await uaipAPI.client.auth.login({
        email,
        password,
        rememberMe
      });

      if (response.success && response.data) {
        // Store tokens using the API client's method
        uaipAPI.client.setAuthToken(
          response.data.tokens.accessToken,
          response.data.tokens.refreshToken,
          rememberMe
        );

        setState({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
      } else {
        throw new Error(response.error?.message || 'Login failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      // Try to logout from backend if available
      const isBackendAvailable = await uaipAPI.isBackendAvailable();
      if (isBackendAvailable) {
        try {
          await uaipAPI.client.auth.logout();
        } catch (error) {
          console.warn('Backend logout failed:', error);
        }
      }

      // Clear local auth state
      uaipAPI.client.clearAuth();
      
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Force clear auth state even if logout fails
      uaipAPI.client.clearAuth();
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      });
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const refreshUser = useCallback(async () => {
    await checkAuthStatus();
  }, [checkAuthStatus]);

  const contextValue: AuthContextType = {
    ...state,
    login,
    logout,
    clearError,
    refreshUser
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