import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  ShieldOff,
  ShieldAlert,
  Activity,
  RefreshCw,
  Settings,
  Key,
  Users,
  AlertTriangle,
  CheckCircle,
  Server,
  FileText,
  Bell,
  BarChart3,
  Bug,
  Radio,
  ShieldCheck,
  ArrowUp,
  ArrowDown,
  Minus,
  Pause,
  Lock,
  Download,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { auditAPI, securityAPI } from '@/api';
import { Portal, PortalProps } from '../Portal';
import { cn } from '@/lib/utils';
import { ViewportSize } from '@/hooks/use_viewport';
import { STALE_TIMES } from '@/api/query_config';
import { useAuth } from '@/contexts/AuthContext';

interface SecurityMetric {
  id: string;
  label: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  status: 'healthy' | 'warning' | 'critical';
  icon: React.ComponentType<{ className?: string }>;
}

interface SecurityEvent {
  id: string;
  type: 'threat' | 'access' | 'system' | 'audit';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  source: string;
  resolved: boolean;
}

interface SecurityPortalProps extends Omit<PortalProps, 'children' | 'type' | 'title'> {
  mode?: 'dashboard' | 'monitor' | 'settings';
  showAdvanced?: boolean;
}

type SecurityStatsRecord = Record<string, unknown>;

const SECURITY_METRIC_DEFS: Array<{
  id: SecurityMetric['id'];
  label: string;
  unit: string;
  icon: SecurityMetric['icon'];
  valueKeys: string[];
  statusKeys: string[];
  trendKeys: string[];
}> = [
  {
    id: 'threats_blocked',
    label: 'Threats Blocked',
    unit: 'today',
    icon: ShieldCheck,
    valueKeys: ['threatsBlocked', 'threats_blocked'],
    statusKeys: ['threatsBlockedStatus', 'threats_blocked_status'],
    trendKeys: ['threatsBlockedTrend', 'threats_blocked_trend'],
  },
  {
    id: 'active_sessions',
    label: 'Active Sessions',
    unit: 'current',
    icon: Users,
    valueKeys: ['activeSessions', 'active_sessions'],
    statusKeys: ['activeSessionsStatus', 'active_sessions_status'],
    trendKeys: ['activeSessionsTrend', 'active_sessions_trend'],
  },
  {
    id: 'failed_logins',
    label: 'Failed Logins',
    unit: 'last hour',
    icon: Lock,
    valueKeys: ['failedLogins', 'failed_logins'],
    statusKeys: ['failedLoginsStatus', 'failed_logins_status'],
    trendKeys: ['failedLoginsTrend', 'failed_logins_trend'],
  },
  {
    id: 'system_uptime',
    label: 'System Uptime',
    unit: '%',
    icon: Server,
    valueKeys: ['systemUptime', 'system_uptime', 'uptimePercent', 'uptime_percent'],
    statusKeys: ['systemUptimeStatus', 'system_uptime_status'],
    trendKeys: ['systemUptimeTrend', 'system_uptime_trend'],
  },
  {
    id: 'vulnerabilities',
    label: 'Open Vulnerabilities',
    unit: 'total',
    icon: Bug,
    valueKeys: ['vulnerabilities', 'openVulnerabilities', 'open_vulnerabilities'],
    statusKeys: ['vulnerabilitiesStatus', 'vulnerabilities_status'],
    trendKeys: ['vulnerabilitiesTrend', 'vulnerabilities_trend'],
  },
  {
    id: 'data_encrypted',
    label: 'Data Encrypted',
    unit: '%',
    icon: Key,
    valueKeys: ['dataEncrypted', 'data_encrypted', 'encryptionCoverage', 'encryption_coverage'],
    statusKeys: ['dataEncryptedStatus', 'data_encrypted_status'],
    trendKeys: ['dataEncryptedTrend', 'data_encrypted_trend'],
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getNestedRecord = (record: Record<string, unknown>, key: string): Record<string, unknown> | null => {
  const value = record[key];
  return isRecord(value) ? value : null;
};

const extractRootRecord = (payload: unknown): SecurityStatsRecord => {
  if (!isRecord(payload)) {
    return {};
  }

  const data = getNestedRecord(payload, 'data');
  return data ?? payload;
};

const getNumberFromKeys = (record: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
};

const normalizeMetricStatus = (value: unknown): SecurityMetric['status'] | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized === 'healthy' || normalized === 'good') {
    return 'healthy';
  }
  if (normalized === 'warning' || normalized === 'degraded') {
    return 'warning';
  }
  if (normalized === 'critical') {
    return 'critical';
  }

  return null;
};

const normalizeTrend = (value: unknown): SecurityMetric['trend'] | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized === 'up' || normalized === 'increase' || normalized === 'increasing') {
    return 'up';
  }
  if (normalized === 'down' || normalized === 'decrease' || normalized === 'decreasing') {
    return 'down';
  }
  if (normalized === 'stable' || normalized === 'flat') {
    return 'stable';
  }

  return null;
};

const defaultStatusForMetric = (id: SecurityMetric['id'], value: number): SecurityMetric['status'] => {
  if (id === 'failed_logins') {
    return value > 20 ? 'critical' : value > 5 ? 'warning' : 'healthy';
  }
  if (id === 'vulnerabilities') {
    return value > 10 ? 'critical' : value > 0 ? 'warning' : 'healthy';
  }
  if (id === 'system_uptime') {
    return value < 95 ? 'critical' : value < 99 ? 'warning' : 'healthy';
  }

  return 'healthy';
};

const defaultTrendForMetric = (id: SecurityMetric['id'], value: number): SecurityMetric['trend'] => {
  if (id === 'failed_logins' || id === 'vulnerabilities') {
    return value > 0 ? 'up' : 'stable';
  }

  return 'stable';
};

const pickMetricStatus = (
  rootRecord: Record<string, unknown>,
  metricRecord: Record<string, unknown>,
  statusKeys: string[],
  fallbackStatus: SecurityMetric['status']
): SecurityMetric['status'] => {
  const statusesRecord = getNestedRecord(rootRecord, 'statuses');
  const metricStatusesRecord = getNestedRecord(rootRecord, 'metricStatuses');

  const candidatePools: Array<Record<string, unknown>> = [
    metricRecord,
    rootRecord,
    statusesRecord ?? {},
    metricStatusesRecord ?? {},
  ];

  for (const pool of candidatePools) {
    for (const key of statusKeys) {
      const status = normalizeMetricStatus(pool[key]);
      if (status) {
        return status;
      }
    }
  }

  return fallbackStatus;
};

const pickMetricTrend = (
  rootRecord: Record<string, unknown>,
  metricRecord: Record<string, unknown>,
  trendKeys: string[],
  fallbackTrend: SecurityMetric['trend']
): SecurityMetric['trend'] => {
  const trendsRecord = getNestedRecord(rootRecord, 'trends');

  const candidatePools: Array<Record<string, unknown>> = [metricRecord, rootRecord, trendsRecord ?? {}];

  for (const pool of candidatePools) {
    for (const key of trendKeys) {
      const trend = normalizeTrend(pool[key]);
      if (trend) {
        return trend;
      }
    }
  }

  return fallbackTrend;
};

const parseSecurityMetrics = (payload: unknown): SecurityMetric[] => {
  const root = extractRootRecord(payload);
  const metricsRecord = getNestedRecord(root, 'metrics') ?? {};

  return SECURITY_METRIC_DEFS.map((definition) => {
    const metricNode = getNestedRecord(metricsRecord, definition.id) ?? {};
    const value =
      getNumberFromKeys(metricNode, [...definition.valueKeys, 'value']) ??
      getNumberFromKeys(root, definition.valueKeys) ??
      0;

    const status = pickMetricStatus(
      root,
      metricNode,
      definition.statusKeys,
      defaultStatusForMetric(definition.id, value)
    );

    const trend = pickMetricTrend(
      root,
      metricNode,
      definition.trendKeys,
      defaultTrendForMetric(definition.id, value)
    );

    return {
      id: definition.id,
      label: definition.label,
      value,
      unit: definition.unit,
      trend,
      status,
      icon: definition.icon,
    };
  });
};

const getOverallSystemStatus = (
  payload: unknown,
  metrics: SecurityMetric[]
): 'healthy' | 'warning' | 'critical' => {
  const root = extractRootRecord(payload);
  const explicitStatus = normalizeMetricStatus(root.status);
  if (explicitStatus) {
    return explicitStatus;
  }

  if (metrics.some((metric) => metric.status === 'critical')) {
    return 'critical';
  }
  if (metrics.some((metric) => metric.status === 'warning')) {
    return 'warning';
  }

  return 'healthy';
};

const getErrorMessage = (payload: unknown, fallback: string): string => {
  if (!isRecord(payload)) {
    return fallback;
  }

  if (typeof payload.message === 'string' && payload.message.length > 0) {
    return payload.message;
  }

  const data = getNestedRecord(payload, 'data');
  if (data && typeof data.message === 'string' && data.message.length > 0) {
    return data.message;
  }

  return fallback;
};

const toEventType = (value: unknown): SecurityEvent['type'] => {
  if (typeof value !== 'string') {
    return 'audit';
  }

  const normalized = value.toLowerCase();
  if (normalized === 'threat') return 'threat';
  if (normalized === 'access') return 'access';
  if (normalized === 'system') return 'system';
  return 'audit';
};

const toSeverity = (value: unknown): SecurityEvent['severity'] => {
  if (typeof value !== 'string') {
    return 'low';
  }

  const normalized = value.toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium' || normalized === 'warning') return 'medium';
  return 'low';
};

const parseTimestamp = (value: unknown): Date => {
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
};

const toResolvedState = (entry: Record<string, unknown>): boolean => {
  if (typeof entry.resolved === 'boolean') {
    return entry.resolved;
  }
  if (typeof entry.isResolved === 'boolean') {
    return entry.isResolved;
  }
  if (typeof entry.status === 'string') {
    return entry.status.toLowerCase() === 'resolved';
  }

  return false;
};

const parseEventsPayload = (payload: unknown): SecurityEvent[] => {
  const root = extractRootRecord(payload);

  const listCandidate =
    (Array.isArray(root.logs) ? root.logs : null) ??
    (Array.isArray(root.items) ? root.items : null) ??
    (Array.isArray(root.events) ? root.events : null) ??
    (Array.isArray(payload) ? payload : null);

  if (!listCandidate) {
    return [];
  }

  const events = listCandidate
    .map((rawEvent): SecurityEvent | null => {
      if (!isRecord(rawEvent)) {
        return null;
      }

      const idValue = rawEvent.id ?? rawEvent.logId ?? rawEvent.auditId;
      const id = typeof idValue === 'string' ? idValue : typeof idValue === 'number' ? String(idValue) : null;
      if (!id) {
        return null;
      }

      const messageValue =
        rawEvent.message ?? rawEvent.description ?? rawEvent.summary ?? rawEvent.action ?? 'Audit event';
      const message = typeof messageValue === 'string' ? messageValue : 'Audit event';

      const sourceValue = rawEvent.source ?? rawEvent.service ?? rawEvent.module ?? rawEvent.actor ?? 'Audit Service';
      const source = typeof sourceValue === 'string' ? sourceValue : 'Audit Service';

      return {
        id,
        type: toEventType(rawEvent.type ?? rawEvent.category ?? rawEvent.eventType),
        severity: toSeverity(rawEvent.severity ?? rawEvent.level),
        message,
        timestamp: parseTimestamp(rawEvent.timestamp ?? rawEvent.createdAt ?? rawEvent.loggedAt),
        source,
        resolved: toResolvedState(rawEvent),
      };
    })
    .filter((event): event is SecurityEvent => event !== null);

  return events.sort((a, b) => {
    const aGroup = a.resolved ? 2 : a.severity === 'critical' ? 0 : 1;
    const bGroup = b.resolved ? 2 : b.severity === 'critical' ? 0 : 1;
    if (aGroup !== bGroup) {
      return aGroup - bGroup;
    }

    return b.timestamp.getTime() - a.timestamp.getTime();
  });
};

const maskIpAddress = (ip: string): string => ip.replace(/\.\d+$/, '.x');

const maskIpAddressesInText = (text: string): string =>
  text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (ip) => maskIpAddress(ip));

const getExportFileName = (contentDisposition: string | null): string => {
  if (!contentDisposition) {
    return `audit-export-${new Date().toISOString()}.json`;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (filenameMatch && filenameMatch[1]) {
    return filenameMatch[1];
  }

  return `audit-export-${new Date().toISOString()}.json`;
};

const SecurityPortalContent: React.FC<{
  mode: 'dashboard' | 'monitor' | 'settings';
  showAdvanced: boolean;
  viewport?: ViewportSize;
}> = ({ mode: _mode, showAdvanced: _showAdvanced, viewport }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'threats' | 'monitoring' | 'users'>(
    'overview'
  );
  const [realTimeData, setRealTimeData] = useState(true);
  const [_selectedTimeRange, _setSelectedTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  const isAuthorized = user?.role === 'admin' || user?.role === 'security_auditor';
  const isAdmin = user?.role === 'admin';

  const securityStatsQuery = useQuery({
    queryKey: ['security', 'stats'],
    queryFn: async () => {
      const payload = await securityAPI.getStats();

      const metrics = parseSecurityMetrics(payload);
      const overallStatus = getOverallSystemStatus(payload, metrics);
      return { metrics, overallStatus };
    },
    staleTime: STALE_TIMES.DEFAULT,
    refetchInterval: STALE_TIMES.DEFAULT,
  });

  const securityEventsQuery = useQuery({
    queryKey: ['security', 'events'],
    queryFn: async () => {
      const payload = await auditAPI.getLogs({ limit: 20, sortOrder: 'DESC' as never });
      return parseEventsPayload(payload);
    },
    staleTime: STALE_TIMES.DEFAULT,
  });

  const resolveEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      await auditAPI.resolveLog(eventId);

      return eventId;
    },
    onMutate: async (eventId) => {
      await queryClient.cancelQueries({ queryKey: ['security', 'events'] });
      const previousEvents = queryClient.getQueryData<SecurityEvent[]>(['security', 'events']);

      queryClient.setQueryData<SecurityEvent[]>(['security', 'events'], (currentEvents) => {
        if (!currentEvents) {
          return currentEvents;
        }

        return currentEvents.map((event) =>
          event.id === eventId ? { ...event, resolved: true } : event
        );
      });

      return { previousEvents };
    },
    onError: (_error, _eventId, context) => {
      if (context?.previousEvents) {
        queryClient.setQueryData(['security', 'events'], context.previousEvents);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['security', 'events'] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const blob = await auditAPI.export({ format: 'json' });
      return {
        blob,
        fileName: `audit-export-${new Date().toISOString()}.json`,
      };
    },
    onSuccess: ({ blob, fileName }) => {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    },
  });

  const metrics = securityStatsQuery.data?.metrics ?? [];
  const systemStatus = securityStatsQuery.data?.overallStatus ?? 'healthy';

  const prioritizedEvents = useMemo(() => {
    const events = securityEventsQuery.data ?? [];
    return [...events].sort((a, b) => {
      const aGroup = a.resolved ? 2 : a.severity === 'critical' ? 0 : 1;
      const bGroup = b.resolved ? 2 : b.severity === 'critical' ? 0 : 1;
      if (aGroup !== bGroup) {
        return aGroup - bGroup;
      }
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  }, [securityEventsQuery.data]);

  // Use Portal's viewport management
  const currentViewport = viewport ?? {
    width: 1024,
    height: 768,
    isMobile: false,
    isTablet: false,
    isDesktop: true,
  };

  // Determine layout based on viewport size
  const isCompactMode = currentViewport.width < 500 || currentViewport.height < 400;
  const showReducedMetrics = currentViewport.width < 700;
  const isVerySmall = currentViewport.width < 400;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([securityStatsQuery.refetch(), securityEventsQuery.refetch()]);
    setIsRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-400';
      case 'warning':
        return 'text-amber-400';
      case 'critical':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500/20 border-green-500/30';
      case 'warning':
        return 'bg-amber-500/20 border-amber-500/30';
      case 'critical':
        return 'bg-red-500/20 border-red-500/30';
      default:
        return 'bg-slate-500/20 border-slate-500/30';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low':
        return 'text-blue-400 bg-blue-500/10';
      case 'medium':
        return 'text-yellow-400 bg-yellow-500/10';
      case 'high':
        return 'text-orange-400 bg-orange-500/10';
      case 'critical':
        return 'text-red-400 bg-red-500/10';
      default:
        return 'text-slate-400 bg-slate-500/10';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <ArrowUp className="w-3 h-3" />;
      case 'down':
        return <ArrowDown className="w-3 h-3" />;
      default:
        return <Minus className="w-3 h-3" />;
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  type TabId = 'overview' | 'threats' | 'monitoring' | 'users';

  const TAB_ITEMS: Array<{
    id: TabId;
    label: string;
    compactLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'overview', label: 'Overview', compactLabel: 'Overview', icon: BarChart3 },
    { id: 'threats', label: 'Threats', compactLabel: 'Threats', icon: ShieldAlert },
    { id: 'monitoring', label: 'Monitoring', compactLabel: 'Monitor', icon: Activity },
    { id: 'users', label: 'Users', compactLabel: 'Users', icon: Users },
  ];

  const renderTabNavigation = (compact: boolean) => (
    <div className={compact ? 'mt-3' : 'mt-6'}>
      <div className={`flex gap-1 bg-slate-800/30 ${compact ? 'rounded-lg' : 'rounded-xl'} p-1`}>
        {TAB_ITEMS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                compact
                  ? 'flex items-center justify-center p-2'
                  : 'flex items-center gap-2 px-4 py-2 font-medium',
                'rounded-lg transition-colors',
                activeTab === tab.id
                  ? 'bg-slate-700/50 text-white border border-slate-600/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/30',
              )}
              {...(compact ? { title: tab.compactLabel } : {})}
            >
              <Icon className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
              {!compact && (showReducedMetrics ? tab.label.slice(0, 4) : tab.label)}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderEventTypeIcon = (type: string, sizeClass: string) => {
    if (type === 'threat') return <ShieldAlert className={sizeClass} />;
    if (type === 'access') return <Key className={sizeClass} />;
    if (type === 'system') return <Server className={sizeClass} />;
    if (type === 'audit') return <FileText className={sizeClass} />;
    return null;
  };

  const renderPlaceholderTab = (
    tabId: string,
    icon: React.ReactNode,
    title: string,
    description: string
  ) => (
    <motion.div
      key={tabId}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="text-center py-12">
        {icon}
        <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
        <p className="text-slate-400">{description}</p>
      </div>
    </motion.div>
  );

  if (!isAuthorized) {
    return (
      <div className="h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
        <div className="h-full flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900/80 border border-slate-700/60 rounded-2xl p-8 text-center backdrop-blur-sm">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
              <ShieldOff className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Access Restricted</h2>
            <p className="text-slate-300">Security dashboard requires admin access</p>
          </div>
        </div>
      </div>
    );
  }

  const visibleMetrics = showReducedMetrics ? metrics.slice(0, 4) : metrics;
  const metricsLoadingCount = showReducedMetrics ? 4 : SECURITY_METRIC_DEFS.length;
  const visibleEvents = prioritizedEvents.slice(0, isCompactMode ? 3 : 5);

  return (
    <div className="h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 bg-slate-900/90 backdrop-blur-xl border-b border-slate-700/50"
      >
        <div className={`${isCompactMode ? 'px-3 py-3' : 'px-6 py-6'}`}>
          <div
            className={`flex items-center justify-between ${isCompactMode ? 'flex-col gap-3' : 'flex-wrap gap-4'}`}
          >
            <div
              className={`flex items-center ${isCompactMode ? 'flex-col text-center gap-2' : 'gap-4'}`}
            >
              <div
                className={cn(
                  isCompactMode ? 'w-8 h-8' : 'w-12 h-12',
                  'bg-gradient-to-br from-red-500/30 to-orange-500/30 rounded-xl flex items-center justify-center border border-red-500/30',
                )}
              >
                <Shield className={cn(isCompactMode ? 'w-4 h-4' : 'w-6 h-6', 'text-red-400')} />
              </div>
              <div>
                <h1 className={`${isCompactMode ? 'text-lg' : 'text-2xl'} font-bold text-white`}>
                  {isVerySmall ? 'Security' : 'Security Center'}
                </h1>
                {!isCompactMode && (
                  <p className="text-slate-400">
                    Real-time security monitoring and threat detection
                  </p>
                )}
              </div>
            </div>

            <div className={`flex items-center ${isCompactMode ? 'gap-2' : 'gap-3'}`}>
              {!isVerySmall && (
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-3 h-3 rounded-full',
                      systemStatus === 'healthy' ? 'bg-green-400'
                        : systemStatus === 'warning' ? 'bg-amber-400'
                        : 'bg-red-400',
                      systemStatus === 'critical' && 'animate-pulse',
                    )}
                    aria-label={`System status: ${systemStatus}`}
                  />
                  <span
                    className={`${isCompactMode ? 'text-xs' : 'text-sm'} text-slate-300 capitalize`}
                  >
                    {isCompactMode ? systemStatus.slice(0, 4) : systemStatus}
                  </span>
                </div>
              )}

              <button
                onClick={() => setRealTimeData(!realTimeData)}
                className={`${isCompactMode ? 'p-1.5' : 'p-2'} rounded-lg border transition-all duration-200 ${
                  realTimeData
                    ? 'bg-green-500/20 border-green-500/30 text-green-400'
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white'
                }`}
                title={realTimeData ? 'Disable real-time' : 'Enable real-time'}
              >
                {realTimeData ? (
                  <Radio className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'}`} />
                ) : (
                  <Pause className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'}`} />
                )}
              </button>

               <button
                 onClick={handleRefresh}
                 disabled={isRefreshing}
                 className={`${isCompactMode ? 'p-1.5' : 'p-2'} rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 text-slate-300 hover:text-white transition-colors disabled:opacity-50`}
                 title="Refresh data"
               >
                 <RefreshCw
                   className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'} ${isRefreshing ? 'animate-spin' : ''}`}
                 />
               </button>

               {!isVerySmall && (
                 <button
                   onClick={() => exportMutation.mutate()}
                   disabled={exportMutation.isPending}
                   className={cn(
                     `${isCompactMode ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'} rounded-lg border transition-colors flex items-center gap-2`,
                     exportMutation.isPending
                       ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                       : 'bg-slate-800/50 hover:bg-slate-700/50 border-slate-700/50 text-slate-300 hover:text-white'
                   )}
                   title="Export audit logs"
                 >
                   <Download className={cn(isCompactMode ? 'w-3 h-3' : 'w-4 h-4')} />
                   <span>{exportMutation.isPending ? 'Exporting...' : 'Export'}</span>
                 </button>
               )}

              {!isVerySmall && (
                <button
                  className={`${isCompactMode ? 'p-1.5' : 'p-2'} rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 text-slate-300 hover:text-white transition-colors`}
                  title="Security settings"
                >
                  <Settings className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'}`} />
                </button>
              )}
            </div>
          </div>

          {renderTabNavigation(isCompactMode)}
        </div>
      </motion.div>

      {/* Main Content */}
      <div className={`relative z-10 h-full overflow-auto ${isCompactMode ? 'p-3' : 'p-6'}`}>
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: 16, scale: 0.99 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="space-y-6"
            >
              {/* Security Metrics Grid */}
              <div
                className={`grid gap-4 ${
                  isVerySmall
                    ? 'grid-cols-1'
                    : isCompactMode
                      ? 'grid-cols-2'
                      : showReducedMetrics
                        ? 'grid-cols-2'
                        : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                }`}
              >
                {securityStatsQuery.isLoading
                  ? new Array(metricsLoadingCount).fill(0).map((_, index) => (
                      <motion.div
                        key={`metric-skeleton-${index}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.08 }}
                        className={`${isCompactMode ? 'p-3' : 'p-6'} rounded-2xl border border-slate-700/40 bg-slate-800/40 backdrop-blur-sm animate-pulse`}
                      >
                        <div
                          className={`flex items-center justify-between ${isCompactMode ? 'mb-2' : 'mb-4'}`}
                        >
                          <div
                            className={`${isCompactMode ? 'w-8 h-8' : 'w-12 h-12'} rounded-xl bg-slate-700/60`}
                          />
                          <div className="h-3 w-14 rounded bg-slate-700/60" />
                        </div>
                        <div className="space-y-2">
                          <div className="h-7 w-20 rounded bg-slate-700/60" />
                          <div className="h-4 w-28 rounded bg-slate-700/60" />
                          {!isCompactMode && <div className="h-3 w-20 rounded bg-slate-700/50" />}
                        </div>
                      </motion.div>
                    ))
                  : visibleMetrics.map((metric, index) => {
                      const Icon = metric.icon;
                      return (
                        <motion.div
                          key={metric.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.1 }}
                          className={cn(isCompactMode ? 'p-3' : 'p-6', 'rounded-2xl border backdrop-blur-sm transition-colors', getStatusBgColor(metric.status))}
                        >
                          <div
                            className={`flex items-center justify-between ${isCompactMode ? 'mb-2' : 'mb-4'}`}
                          >
                            <div
                              className={`${isCompactMode ? 'w-8 h-8' : 'w-12 h-12'} rounded-xl flex items-center justify-center ${getStatusBgColor(metric.status)}`}
                            >
                              <Icon
                                className={`${isCompactMode ? 'w-4 h-4' : 'w-6 h-6'} ${getStatusColor(metric.status)}`}
                              />
                            </div>
                            <div
                              className={`flex items-center gap-1 text-xs ${getStatusColor(metric.trend === 'up' ? (metric.status === 'healthy' ? 'healthy' : 'warning') : 'healthy')}`}
                            >
                              {getTrendIcon(metric.trend)}
                              {!isCompactMode && <span className="capitalize">{metric.trend}</span>}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p
                              className={`${isCompactMode ? 'text-lg' : 'text-2xl'} font-bold text-white`}
                            >
                              {metric.unit === '%' ? metric.value.toFixed(2) : Math.round(metric.value)}
                              {metric.unit === '%' ? '%' : ''}
                            </p>
                            <p className={`${isCompactMode ? 'text-xs' : 'text-sm'} text-slate-400`}>
                              {isCompactMode ? metric.label.split(' ')[0] : metric.label}
                            </p>
                            {!isCompactMode && metric.unit !== '%' && (
                              <p className="text-xs text-slate-500">{metric.unit}</p>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
              </div>

              {/* Recent Security Events */}
              {!isCompactMode && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className={`bg-slate-800/30 rounded-2xl border border-slate-700/50 ${isCompactMode ? 'p-3' : 'p-6'}`}
                >
                  <div
                    className={`flex items-center justify-between ${isCompactMode ? 'mb-3' : 'mb-6'}`}
                  >
                    <h3
                      className={`${isCompactMode ? 'text-base' : 'text-lg'} font-semibold text-white flex items-center gap-2`}
                    >
                      <Bell
                        className={`${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'} text-orange-400`}
                      />
                      {isCompactMode ? 'Events' : 'Recent Security Events'}
                    </h3>
                    {!isVerySmall && (
                      <button className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                        View All
                      </button>
                    )}
                  </div>

                   <div className="space-y-3">
                    {securityEventsQuery.isLoading &&
                      new Array(5).fill(0).map((_, index) => (
                        <div
                          key={`security-event-skeleton-${index}`}
                          className={`flex items-start gap-3 ${isCompactMode ? 'p-3' : 'p-4'} bg-slate-800/50 rounded-xl border border-slate-700/30 animate-pulse`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-slate-700/60 flex-shrink-0" />
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="h-4 w-full rounded bg-slate-700/60" />
                            <div className="h-3 w-2/3 rounded bg-slate-700/50" />
                          </div>
                        </div>
                      ))}

                    {!securityEventsQuery.isLoading &&
                      visibleEvents.map((event, index) => {
                        const maskedMessage = maskIpAddressesInText(event.message);
                        const maskedSource = maskIpAddressesInText(event.source);
                        const isResolvingCurrent =
                          resolveEventMutation.isPending && resolveEventMutation.variables === event.id;

                        return (
                          <motion.div
                            key={event.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className={`flex items-start gap-3 ${isCompactMode ? 'p-3' : 'p-4'} bg-slate-800/50 rounded-xl border border-slate-700/30 hover:border-slate-600/50 transition-all duration-200`}
                          >
                            <div
                              className={`${isCompactMode ? 'w-6 h-6' : 'w-8 h-8'} rounded-lg flex items-center justify-center flex-shrink-0 ${getSeverityColor(event.severity)}`}
                            >
                              {renderEventTypeIcon(event.type, isCompactMode ? 'w-3 h-3' : 'w-4 h-4')}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className={`${isCompactMode ? 'text-xs' : 'text-sm'} text-white font-medium mb-1`}
                              >
                                {isCompactMode
                                  ? `${maskedMessage.slice(0, 50)}...`
                                  : maskedMessage}
                              </p>
                              <div
                                className={`flex items-center gap-2 ${isCompactMode ? 'text-xs' : 'text-xs'} text-slate-400`}
                              >
                                {!isVerySmall && (
                                  <>
                                    <span>{isCompactMode ? maskedSource.split(' ')[0] : maskedSource}</span>
                                    <span>•</span>
                                  </>
                                )}
                                <span>{formatTimestamp(event.timestamp)}</span>
                                <span>•</span>
                                <span
                                  className={`px-2 py-1 rounded-full ${getSeverityColor(event.severity)} font-medium`}
                                >
                                  {isCompactMode
                                    ? event.severity.slice(0, 1).toUpperCase()
                                    : event.severity.toUpperCase()}
                                </span>
                                <span
                                  className={cn(
                                    'px-2 py-1 rounded-full text-[10px] font-medium',
                                    event.resolved
                                      ? 'bg-green-500/15 text-green-300 border border-green-500/30'
                                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  )}
                                >
                                  {event.resolved ? 'Resolved' : 'Unresolved'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {event.resolved ? (
                                <CheckCircle
                                  className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'} text-green-400`}
                                />
                              ) : (
                                <AlertTriangle
                                  className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'} text-amber-400`}
                                />
                              )}
                              {!event.resolved && isAdmin && (
                                <button
                                  onClick={() => resolveEventMutation.mutate(event.id)}
                                  disabled={isResolvingCurrent}
                                  className={cn(
                                    'text-xs px-2.5 py-1.5 rounded-md border transition-colors',
                                    isResolvingCurrent
                                      ? 'bg-green-500/20 border-green-500/40 text-green-200'
                                      : 'bg-slate-700/50 hover:bg-slate-700 border-slate-600/60 text-slate-200 hover:text-white'
                                  )}
                                >
                                  {isResolvingCurrent ? 'Resolving...' : 'Mark Resolved'}
                                </button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}

                    {!securityEventsQuery.isLoading && visibleEvents.length === 0 && (
                      <div className="text-sm text-slate-400 px-1 py-3">No recent security events</div>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'threats' &&
            renderPlaceholderTab(
              'threats',
              <ShieldAlert className="w-16 h-16 text-red-400 mx-auto mb-4" />,
              'Threat Detection',
              'Advanced threat monitoring and response system'
            )}

          {activeTab === 'monitoring' &&
            renderPlaceholderTab(
              'monitoring',
              <Activity className="w-16 h-16 text-blue-400 mx-auto mb-4" />,
              'System Monitoring',
              'Real-time system health and performance metrics'
            )}

          {activeTab === 'users' &&
            renderPlaceholderTab(
              'users',
              <Users className="w-16 h-16 text-purple-400 mx-auto mb-4" />,
              'User Management',
              'Manage user access, permissions, and security policies'
            )}
        </AnimatePresence>
      </div>


    </div>
  );
};

export const SecurityPortal: React.FC<SecurityPortalProps> = ({
  mode = 'dashboard',
  showAdvanced = false,
  ...portalProps
}) => {
  // Add security portal type to Portal styles
  const portalType = 'security';

  return (
    <Portal
      {...portalProps}
      type={portalType}
      title="Security Center"
      initialSize={{ width: 900, height: 600 }}
      className={cn('security-portal', portalProps.className)}
    >
      <SecurityPortalContent
        mode={mode}
        showAdvanced={showAdvanced}
        viewport={portalProps.viewport}
      />
    </Portal>
  );
};
