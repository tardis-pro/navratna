import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { RiskLevel, MFAMethod, OAuthProviderType } from '@uaip/types';

export interface SecurityPermissions {
  canManageAgents: boolean;
  canModifySettings: boolean;
  canAccessSensitiveData: boolean;
  canExecuteTools: boolean;
  canManageUsers: boolean;
  canViewAuditLogs: boolean;
}

export interface MFAStatus {
  enabled: boolean;
  methods: MFAMethod[];
  backupCodesRemaining: number;
  lastVerified?: Date;
}

export interface SecuritySettings {
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    maxAge: number; // days
  };
  sessionTimeout: number; // minutes
  maxFailedAttempts: number;
  lockoutDuration: number; // minutes
  requireMFA: boolean;
  allowedOAuthProviders: OAuthProviderType[];
  auditLogRetention: number; // days
}

export interface SecurityMetrics {
  riskLevel: RiskLevel;
  securityScore: number;
  recentIncidents: number;
  blockedAttempts: number;
  lastSecurityScan?: Date;
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  outcome: 'success' | 'failure' | 'blocked';
  ipAddress: string;
  userAgent: string;
  details?: Record<string, any>;
}

export interface OAuthConnection {
  id: string;
  provider: OAuthProviderType;
  connected: boolean;
  lastUsed?: Date;
  permissions: string[];
}

interface SecurityContextType {
  // State
  permissions: SecurityPermissions;
  mfaStatus: MFAStatus;
  settings: SecuritySettings;
  metrics: SecurityMetrics;
  auditLog: AuditEvent[];
  oauthConnections: OAuthConnection[];
  isLoading: boolean;
  error: string | null;

  // Actions
  updateSettings: (updates: Partial<SecuritySettings>) => Promise<void>;
  enableMFA: (method: MFAMethod) => Promise<void>;
  disableMFA: (method: MFAMethod) => Promise<void>;
  connectOAuth: (provider: OAuthProviderType) => Promise<void>;
  disconnectOAuth: (provider: OAuthProviderType) => Promise<void>;
  fetchAuditLog: (filters?: AuditLogFilters) => Promise<void>;
  refreshSecurityData: () => Promise<void>;
  clearError: () => void;
}

interface AuditLogFilters {
  userId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  outcome?: string;
}

const defaultPermissions: SecurityPermissions = {
  canManageAgents: false,
  canModifySettings: false,
  canAccessSensitiveData: false,
  canExecuteTools: false,
  canManageUsers: false,
  canViewAuditLogs: false
};

const defaultSettings: SecuritySettings = {
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxAge: 90
  },
  sessionTimeout: 60,
  maxFailedAttempts: 5,
  lockoutDuration: 15,
  requireMFA: false,
  allowedOAuthProviders: [],
  auditLogRetention: 90
};

const defaultMFAStatus: MFAStatus = {
  enabled: false,
  methods: [],
  backupCodesRemaining: 0
};

const defaultMetrics: SecurityMetrics = {
  riskLevel: RiskLevel.LOW,
  securityScore: 85,
  recentIncidents: 0,
  blockedAttempts: 0
};

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
};

interface SecurityProviderProps {
  children: ReactNode;
}

export const SecurityProvider: React.FC<SecurityProviderProps> = ({ children }) => {
  const [permissions, setPermissions] = useState<SecurityPermissions>(defaultPermissions);
  const [mfaStatus, setMfaStatus] = useState<MFAStatus>(defaultMFAStatus);
  const [settings, setSettings] = useState<SecuritySettings>(defaultSettings);
  const [metrics, setMetrics] = useState<SecurityMetrics>(defaultMetrics);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [oauthConnections, setOauthConnections] = useState<OAuthConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSecurityData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // In a real implementation, these would be API calls
      // For now, using mock data to establish the structure
      
      // Mock permissions based on user role
      const mockPermissions: SecurityPermissions = {
        canManageAgents: true,
        canModifySettings: true,
        canAccessSensitiveData: true,
        canExecuteTools: true,
        canManageUsers: false,
        canViewAuditLogs: true
      };

      const mockMfaStatus: MFAStatus = {
        enabled: false,
        methods: [],
        backupCodesRemaining: 0
      };

      const mockMetrics: SecurityMetrics = {
        riskLevel: RiskLevel.MEDIUM,
        securityScore: 78,
        recentIncidents: 2,
        blockedAttempts: 5,
        lastSecurityScan: new Date()
      };

      setPermissions(mockPermissions);
      setMfaStatus(mockMfaStatus);
      setMetrics(mockMetrics);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load security data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load initial security data
  useEffect(() => {
    refreshSecurityData();
  }, [refreshSecurityData]);

  const updateSettings = useCallback(async (updates: Partial<SecuritySettings>) => {
    try {
      setError(null);
      // In real implementation: await api.post('/security/settings', updates);
      setSettings(prev => ({ ...prev, ...updates }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      throw err;
    }
  }, []);

  const enableMFA = useCallback(async (method: MFAMethod) => {
    try {
      setError(null);
      // In real implementation: await api.post('/security/mfa/enable', { method });
      setMfaStatus(prev => ({
        ...prev,
        enabled: true,
        methods: [...prev.methods, method]
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable MFA');
      throw err;
    }
  }, []);

  const disableMFA = useCallback(async (method: MFAMethod) => {
    try {
      setError(null);
      // In real implementation: await api.delete(`/security/mfa/${method}`);
      setMfaStatus(prev => ({
        ...prev,
        methods: prev.methods.filter(m => m !== method),
        enabled: prev.methods.filter(m => m !== method).length > 0
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable MFA');
      throw err;
    }
  }, []);

  const connectOAuth = useCallback(async (provider: OAuthProviderType) => {
    try {
      setError(null);
      // In real implementation: await api.post('/security/oauth/connect', { provider });
      const newConnection: OAuthConnection = {
        id: `${provider}-${Date.now()}`,
        provider,
        connected: true,
        lastUsed: new Date(),
        permissions: ['read', 'write']
      };
      setOauthConnections(prev => [...prev, newConnection]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect OAuth provider');
      throw err;
    }
  }, []);

  const disconnectOAuth = useCallback(async (provider: OAuthProviderType) => {
    try {
      setError(null);
      // In real implementation: await api.delete(`/security/oauth/${provider}`);
      setOauthConnections(prev => prev.filter(conn => conn.provider !== provider));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect OAuth provider');
      throw err;
    }
  }, []);

  const fetchAuditLog = useCallback(async (filters?: AuditLogFilters) => {
    try {
      setError(null);
      // In real implementation: await api.get('/security/audit', { params: filters });
      
      // Mock audit events
      const mockEvents: AuditEvent[] = [
        {
          id: '1',
          timestamp: new Date(),
          userId: 'user-1',
          action: 'LOGIN',
          resource: 'auth',
          outcome: 'success',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0...'
        }
      ];
      
      setAuditLog(mockEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit log');
      throw err;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: SecurityContextType = useMemo(() => ({
    permissions,
    mfaStatus,
    settings,
    metrics,
    auditLog,
    oauthConnections,
    isLoading,
    error,
    updateSettings,
    enableMFA,
    disableMFA,
    connectOAuth,
    disconnectOAuth,
    fetchAuditLog,
    refreshSecurityData,
    clearError
  }), [
    permissions,
    mfaStatus,
    settings,
    metrics,
    auditLog,
    oauthConnections,
    isLoading,
    error,
    updateSettings,
    enableMFA,
    disableMFA,
    connectOAuth,
    disconnectOAuth,
    fetchAuditLog,
    refreshSecurityData,
    clearError
  ]);

  return (
    <SecurityContext.Provider value={value}>
      {children}
    </SecurityContext.Provider>
  );
};