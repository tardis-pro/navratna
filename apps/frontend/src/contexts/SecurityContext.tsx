import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useMemo,
} from 'react';
import { RiskLevel, MFAMethod, OAuthProviderType } from '@uaip/types';
import { securityAPI } from '@/api/security_api';
import { API_BASE_URL } from '@/config/api_config';

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
  details?: Record<string, unknown>;
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
  canViewAuditLogs: false,
};

const defaultSettings: SecuritySettings = {
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxAge: 90,
  },
  sessionTimeout: 60,
  maxFailedAttempts: 5,
  lockoutDuration: 15,
  requireMFA: false,
  allowedOAuthProviders: [],
  auditLogRetention: 90,
};

const defaultMFAStatus: MFAStatus = {
  enabled: false,
  methods: [],
  backupCodesRemaining: 0,
};

const defaultMetrics: SecurityMetrics = {
  riskLevel: RiskLevel.LOW,
  securityScore: 85,
  recentIncidents: 0,
  blockedAttempts: 0,
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

      const [stats, events, policies] = await Promise.all([
        securityAPI.getStats(30).catch((): null => null),
        securityAPI.getEvents({ limit: 50 }).catch((): Awaited<ReturnType<typeof securityAPI.getEvents>> => []),
        securityAPI.listPolicies({ isActive: true }).catch((): Awaited<ReturnType<typeof securityAPI.listPolicies>> => []),
      ]);

      if (stats) {
        const riskCounts = stats.riskDistribution ?? {};
        const highRisk = (riskCounts['high'] ?? 0) + (riskCounts['critical'] ?? 0);
        const total = stats.totalEvents || 1;
        const riskLevel =
          highRisk / total > 0.2
            ? RiskLevel.HIGH
            : highRisk / total > 0.05
              ? RiskLevel.MEDIUM
              : RiskLevel.LOW;

        setMetrics({
          riskLevel,
          securityScore: Math.max(0, 100 - Math.round((stats.deniedEvents / total) * 100)),
          recentIncidents: stats.deniedEvents,
          blockedAttempts: stats.deniedEvents,
          lastSecurityScan: new Date(),
        });
      }

      if (Array.isArray(events) && events.length > 0) {
        setAuditLog(
          events.map((e) => ({
            id: e.id,
            timestamp: new Date(e.timestamp),
            userId: e.userId ?? '',
            action: e.action,
            resource: e.resourceType,
            outcome: e.result === 'allowed' ? 'success' : e.result === 'denied' ? 'blocked' : 'failure',
            ipAddress: typeof e.metadata?.ipAddress === 'string' ? e.metadata.ipAddress : '',
            userAgent: typeof e.metadata?.userAgent === 'string' ? e.metadata.userAgent : '',
            details: e.metadata,
          }))
        );
      }

      if (Array.isArray(policies) && policies.length > 0) {
        setSettings((prev) => ({ ...prev }));
      }

      setPermissions({
        canManageAgents: true,
        canModifySettings: true,
        canAccessSensitiveData: true,
        canExecuteTools: true,
        canManageUsers: false,
        canViewAuditLogs: true,
      });
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
      setSettings((prev) => ({ ...prev, ...updates }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      throw err;
    }
  }, []);

  const enableMFA = useCallback(async (method: MFAMethod) => {
    try {
      setError(null);
      // In real implementation: await api.post('/security/mfa/enable', { method });
      setMfaStatus((prev) => ({
        ...prev,
        enabled: true,
        methods: [...prev.methods, method],
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
      setMfaStatus((prev) => ({
        ...prev,
        methods: prev.methods.filter((m) => m !== method),
        enabled: prev.methods.filter((m) => m !== method).length > 0,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable MFA');
      throw err;
    }
  }, []);

  const connectOAuth = useCallback(async (provider: OAuthProviderType) => {
    // OAuth is a full-page browser flow: redirect to the backend initiate endpoint, which
    // 302s to the provider's consent screen. The backend callback sets the session cookies
    // and returns the browser to the app. (No fetch here, so no credentials option needed.)
    setError(null);
    window.location.href = `${API_BASE_URL}/api/v1/oauth/initiate/${provider}`;
  }, []);

  const disconnectOAuth = useCallback(async (provider: OAuthProviderType) => {
    try {
      setError(null);
      // In real implementation: await api.delete(`/security/oauth/${provider}`);
      setOauthConnections((prev) => prev.filter((conn) => conn.provider !== provider));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect OAuth provider');
      throw err;
    }
  }, []);

  const fetchAuditLog = useCallback(async (filters?: AuditLogFilters) => {
    try {
      setError(null);
      const events = await securityAPI.getEvents({
        limit: 50,
        userId: filters?.userId,
        type: filters?.action,
        startDate: filters?.startDate?.toISOString(),
        endDate: filters?.endDate?.toISOString(),
      });

      if (Array.isArray(events)) {
        setAuditLog(
          events.map((e) => ({
            id: e.id,
            timestamp: new Date(e.timestamp),
            userId: e.userId ?? '',
            action: e.action,
            resource: e.resourceType,
            outcome: e.result === 'allowed' ? 'success' : e.result === 'denied' ? 'blocked' : 'failure',
            ipAddress: typeof e.metadata?.ipAddress === 'string' ? e.metadata.ipAddress : '',
            userAgent: typeof e.metadata?.userAgent === 'string' ? e.metadata.userAgent : '',
            details: e.metadata,
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit log');
      throw err;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: SecurityContextType = useMemo(
    () => ({
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
      clearError,
    }),
    [
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
      clearError,
    ]
  );

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
};
