import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
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
} from 'lucide-react';
import { Portal, PortalProps } from '../Portal';
import { cn } from '@/lib/utils';

interface SecurityMetric {
  id: string;
  label: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  status: 'good' | 'warning' | 'critical';
  icon: React.ComponentType<any>;
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

const SECURITY_METRICS: SecurityMetric[] = [
  {
    id: 'threats_blocked',
    label: 'Threats Blocked',
    value: 247,
    unit: 'today',
    trend: 'down',
    status: 'good',
    icon: ShieldCheck,
  },
  {
    id: 'active_sessions',
    label: 'Active Sessions',
    value: 42,
    unit: 'current',
    trend: 'stable',
    status: 'good',
    icon: Users,
  },
  {
    id: 'failed_logins',
    label: 'Failed Logins',
    value: 12,
    unit: 'last hour',
    trend: 'up',
    status: 'warning',
    icon: Lock,
  },
  {
    id: 'system_uptime',
    label: 'System Uptime',
    value: 99.97,
    unit: '%',
    trend: 'stable',
    status: 'good',
    icon: Server,
  },
  {
    id: 'vulnerabilities',
    label: 'Open Vulnerabilities',
    value: 3,
    unit: 'total',
    trend: 'down',
    status: 'warning',
    icon: Bug,
  },
  {
    id: 'data_encrypted',
    label: 'Data Encrypted',
    value: 100,
    unit: '%',
    trend: 'stable',
    status: 'good',
    icon: Key,
  },
];

const SECURITY_EVENTS: SecurityEvent[] = [
  {
    id: '1',
    type: 'threat',
    severity: 'high',
    message: 'Suspicious login attempt blocked from IP 192.168.1.100',
    timestamp: new Date(Date.now() - 5 * 60000),
    source: 'Authentication Service',
    resolved: true,
  },
  {
    id: '2',
    type: 'access',
    severity: 'medium',
    message: 'Admin user john.doe accessed sensitive data',
    timestamp: new Date(Date.now() - 15 * 60000),
    source: 'Audit Trail',
    resolved: false,
  },
  {
    id: '3',
    type: 'system',
    severity: 'low',
    message: 'Security patch applied to database server',
    timestamp: new Date(Date.now() - 30 * 60000),
    source: 'System Updates',
    resolved: true,
  },
  {
    id: '4',
    type: 'threat',
    severity: 'critical',
    message: 'Potential DDoS attack detected and mitigated',
    timestamp: new Date(Date.now() - 45 * 60000),
    source: 'Network Monitor',
    resolved: true,
  },
  {
    id: '5',
    type: 'audit',
    severity: 'medium',
    message: 'Failed MFA verification attempt',
    timestamp: new Date(Date.now() - 60 * 60000),
    source: 'MFA Service',
    resolved: false,
  },
];

const SecurityPortalContent: React.FC<{
  mode: 'dashboard' | 'monitor' | 'settings';
  showAdvanced: boolean;
  viewport?: any;
}> = ({ mode, showAdvanced, viewport }) => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'threats' | 'monitoring' | 'users'>(
    'overview'
  );
  const [realTimeData, setRealTimeData] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [systemStatus, setSystemStatus] = useState<'healthy' | 'warning' | 'critical'>('healthy');

  // Use Portal's viewport management
  const currentViewport = viewport || {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet:
      typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  };

  // Determine layout based on viewport size
  const isCompactMode = currentViewport.width < 500 || currentViewport.height < 400;
  const showReducedMetrics = currentViewport.width < 700;
  const isVerySmall = currentViewport.width < 400;

  // Simulate real-time updates
  useEffect(() => {
    if (!realTimeData) return;

    const interval = setInterval(() => {
      // Simulate random system status changes
      const statuses: ('healthy' | 'warning' | 'critical')[] = [
        'healthy',
        'healthy',
        'healthy',
        'warning',
        'healthy',
      ];
      setSystemStatus(statuses[Math.floor(Math.random() * statuses.length)]);
    }, 5000);

    return () => clearInterval(interval);
  }, [realTimeData]);

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good':
        return 'text-green-400';
      case 'warning':
        return 'text-yellow-400';
      case 'critical':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'good':
        return 'bg-green-500/20 border-green-500/30';
      case 'warning':
        return 'bg-yellow-500/20 border-yellow-500/30';
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

  return (
    <div className="h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
      {/* Enhanced Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
            radial-gradient(circle at 20% 20%, rgba(239, 68, 68, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(34, 197, 94, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 20% 80%, rgba(168, 85, 247, 0.3) 0%, transparent 50%)
          `,
            backgroundSize: '100% 100%',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-slate-900/50 to-transparent" />
      </div>

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
              <motion.div
                className={`${isCompactMode ? 'w-8 h-8' : 'w-12 h-12'} bg-gradient-to-br from-red-500/30 to-orange-500/30 rounded-xl flex items-center justify-center border border-red-500/30`}
                animate={{
                  boxShadow:
                    systemStatus === 'critical'
                      ? [
                          '0 0 0 rgba(239, 68, 68, 0)',
                          '0 0 20px rgba(239, 68, 68, 0.5)',
                          '0 0 0 rgba(239, 68, 68, 0)',
                        ]
                      : systemStatus === 'warning'
                        ? [
                            '0 0 0 rgba(245, 158, 11, 0)',
                            '0 0 15px rgba(245, 158, 11, 0.4)',
                            '0 0 0 rgba(245, 158, 11, 0)',
                          ]
                        : '0 0 10px rgba(34, 197, 94, 0.3)',
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Shield className={`${isCompactMode ? 'w-4 h-4' : 'w-6 h-6'} text-red-400`} />
              </motion.div>
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
                  <motion.div
                    className={`w-3 h-3 rounded-full ${
                      systemStatus === 'healthy'
                        ? 'bg-green-400'
                        : systemStatus === 'warning'
                          ? 'bg-yellow-400'
                          : 'bg-red-400'
                    }`}
                    animate={{
                      scale: systemStatus === 'critical' ? [1, 1.2, 1] : 1,
                      opacity: systemStatus === 'critical' ? [1, 0.7, 1] : 1,
                    }}
                    transition={{ duration: 1, repeat: systemStatus === 'critical' ? Infinity : 0 }}
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
                disabled={loading}
                className={`${isCompactMode ? 'p-1.5' : 'p-2'} rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 text-slate-300 hover:text-white transition-colors disabled:opacity-50`}
                title="Refresh data"
              >
                <RefreshCw
                  className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'} ${loading ? 'animate-spin' : ''}`}
                />
              </button>

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

          {/* Tab Navigation */}
          {!isCompactMode && (
            <div className="mt-6">
              <div className="flex gap-1 bg-slate-800/30 rounded-xl p-1">
                {[
                  { id: 'overview', label: 'Overview', icon: BarChart3 },
                  { id: 'threats', label: 'Threats', icon: ShieldAlert },
                  { id: 'monitoring', label: 'Monitoring', icon: Activity },
                  { id: 'users', label: 'Users', icon: Users },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <motion.button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                        activeTab === tab.id
                          ? 'bg-slate-700/50 text-white border border-slate-600/50'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/30'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Icon className="w-4 h-4" />
                      {showReducedMetrics ? tab.label.slice(0, 4) : tab.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Compact Tab Navigation */}
          {isCompactMode && (
            <div className="mt-3">
              <div className="flex gap-1 bg-slate-800/30 rounded-lg p-1">
                {[
                  { id: 'overview', label: 'Overview', icon: BarChart3 },
                  { id: 'threats', label: 'Threats', icon: ShieldAlert },
                  { id: 'monitoring', label: 'Monitor', icon: Activity },
                  { id: 'users', label: 'Users', icon: Users },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <motion.button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center justify-center p-2 rounded-lg transition-all duration-200 ${
                        activeTab === tab.id
                          ? 'bg-slate-700/50 text-white border border-slate-600/50'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/30'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      title={tab.label}
                    >
                      <Icon className="w-3 h-3" />
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Main Content */}
      <div className={`relative z-10 h-full overflow-auto ${isCompactMode ? 'p-3' : 'p-6'}`}>
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
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
                {(showReducedMetrics ? SECURITY_METRICS.slice(0, 4) : SECURITY_METRICS).map(
                  (metric, index) => {
                    const Icon = metric.icon;
                    return (
                      <motion.div
                        key={metric.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.1 }}
                        className={`${isCompactMode ? 'p-3' : 'p-6'} rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:scale-105 ${getStatusBgColor(metric.status)}`}
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
                            className={`flex items-center gap-1 text-xs ${getStatusColor(metric.trend === 'up' ? (metric.status === 'good' ? 'good' : 'warning') : 'good')}`}
                          >
                            {getTrendIcon(metric.trend)}
                            {!isCompactMode && <span className="capitalize">{metric.trend}</span>}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p
                            className={`${isCompactMode ? 'text-lg' : 'text-2xl'} font-bold text-white`}
                          >
                            {metric.value}
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
                  }
                )}
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
                    {SECURITY_EVENTS.slice(0, isCompactMode ? 3 : 5).map((event, index) => (
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
                          {event.type === 'threat' && (
                            <ShieldAlert className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'}`} />
                          )}
                          {event.type === 'access' && (
                            <Key className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'}`} />
                          )}
                          {event.type === 'system' && (
                            <Server className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'}`} />
                          )}
                          {event.type === 'audit' && (
                            <FileText className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'}`} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`${isCompactMode ? 'text-xs' : 'text-sm'} text-white font-medium mb-1`}
                          >
                            {isCompactMode ? event.message.slice(0, 50) + '...' : event.message}
                          </p>
                          <div
                            className={`flex items-center gap-2 ${isCompactMode ? 'text-xs' : 'text-xs'} text-slate-400`}
                          >
                            {!isVerySmall && (
                              <>
                                <span>
                                  {isCompactMode ? event.source.split(' ')[0] : event.source}
                                </span>
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
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {event.resolved ? (
                            <CheckCircle
                              className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'} text-green-400`}
                            />
                          ) : (
                            <AlertTriangle
                              className={`${isCompactMode ? 'w-3 h-3' : 'w-4 h-4'} text-yellow-400`}
                            />
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'threats' && (
            <motion.div
              key="threats"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center py-12">
                <ShieldAlert className="w-16 h-16 text-red-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Threat Detection</h3>
                <p className="text-slate-400">Advanced threat monitoring and response system</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'monitoring' && (
            <motion.div
              key="monitoring"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center py-12">
                <Activity className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">System Monitoring</h3>
                <p className="text-slate-400">Real-time system health and performance metrics</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">User Management</h3>
                <p className="text-slate-400">
                  Manage user access, permissions, and security policies
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Enhanced Status Indicator */}
      {!isVerySmall && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className={`absolute ${isCompactMode ? 'bottom-3 right-3' : 'bottom-6 right-6'} z-20`}
        >
          <div
            className={`flex items-center gap-2 ${isCompactMode ? 'px-3 py-2' : 'px-4 py-3'} bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl`}
          >
            <div className="flex items-center gap-2">
              <motion.div
                className={`w-3 h-3 rounded-full ${
                  systemStatus === 'healthy'
                    ? 'bg-green-400'
                    : systemStatus === 'warning'
                      ? 'bg-yellow-400'
                      : 'bg-red-400'
                }`}
                animate={{
                  scale: realTimeData ? [1, 1.2, 1] : 1,
                  opacity: realTimeData ? [1, 0.7, 1] : 1,
                }}
                transition={{ duration: 2, repeat: realTimeData ? Infinity : 0 }}
              />
              <span
                className={`${isCompactMode ? 'text-xs' : 'text-sm'} text-slate-300 font-medium`}
              >
                {isCompactMode ? systemStatus.slice(0, 4) : `Security ${systemStatus}`}
              </span>
            </div>
            {!isCompactMode && (
              <>
                <div className="w-px h-4 bg-slate-600"></div>
                <div className="flex items-center gap-2">
                  {realTimeData ? (
                    <Radio className="w-4 h-4 text-green-400" />
                  ) : (
                    <Pause className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="text-sm text-slate-300">{realTimeData ? 'Live' : 'Paused'}</span>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
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
