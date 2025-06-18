import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { uaipAPI, resetWebSocketClient } from '../services/uaip-api';

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

interface AuthContextType extends AuthState {
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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

  // Check for existing authentication on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      // Check if we have a stored token
      const accessToken = typeof window !== 'undefined' ? 
        (localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')) : null;
      const refreshToken = typeof window !== 'undefined' ? 
        (localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken')) : null;
      
      if (!accessToken) {
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
      
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: 'Authentication check failed'
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
        
        // Reset WebSocket client to use new authentication
        resetWebSocketClient();
        
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
      
      // Reset WebSocket client since auth is cleared
      resetWebSocketClient();
      
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
      
      // Reset WebSocket client even on error
      resetWebSocketClient();
      
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
      }
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }
  }, [state.isAuthenticated]);

  const contextValue: AuthContextType = {
    ...state,
    login,
    logout,
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