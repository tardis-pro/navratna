import React from 'react';
import { motion } from 'framer-motion';
import {
  Home,
  Activity,
  Users,
  MessageSquare,
  Brain,
  Package,
  Clock,
  Zap,
  Shield,
  Server,
  Database,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { STALE_TIMES } from '@/api/query_config';
import { useDashboardStats, type DashboardStats } from '@/hooks/use_dashboard_stats';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface DashboardPortalProps {
  viewport?: ViewportSize;
  className?: string;
}

interface SystemMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  status: 'good' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface QuickStat {
  id: string;
  title: string;
  value: string | number;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}

export const DashboardPortal: React.FC<DashboardPortalProps> = ({
  viewport: _viewport,
  className = '',
}) => {
  const { data, isLoading, isError } = useDashboardStats();
  const statsData: DashboardStats | undefined = data;

  const getMetricHealth = (value: number, warningAt: number, criticalAt: number): SystemMetric['status'] => {
    if (value >= criticalAt) {
      return 'critical';
    }
    if (value >= warningAt) {
      return 'warning';
    }
    return 'good';
  };

  const getTrendFromDelta = (delta: number | undefined): 'up' | 'down' | 'stable' => {
    if (typeof delta !== 'number') {
      return 'stable';
    }
    if (delta > 0) {
      return 'up';
    }
    if (delta < 0) {
      return 'down';
    }
    return 'stable';
  };

  const formatDelta = (delta: number | undefined): string => {
    if (typeof delta !== 'number') {
      return '—';
    }

    const trend = getTrendFromDelta(delta);
    const arrow = trend === 'up' ? '↗' : trend === 'down' ? '↘' : '—';
    if (delta === 0) {
      return `${arrow} 0 from yesterday`;
    }

    const sign = delta > 0 ? '+' : '-';
    return `${arrow} ${sign}${Math.abs(delta)} from yesterday`;
  };

  const formatTimeAgo = (timestamp: string): string => {
    const parsed = new Date(timestamp).getTime();
    if (Number.isNaN(parsed)) {
      return 'Unknown';
    }

    const diffSeconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
  };

  const quickStats: QuickStat[] = [
    {
      id: 'active_agents',
      title: 'Active Agents',
      value: statsData?.counts?.activeAgents ?? '—',
      change: formatDelta(statsData?.counts?.deltaSinceYesterday?.agents),
      changeType:
        (statsData?.counts?.deltaSinceYesterday?.agents ?? 0) > 0
          ? 'positive'
          : (statsData?.counts?.deltaSinceYesterday?.agents ?? 0) < 0
            ? 'negative'
            : 'neutral',
      icon: Users,
      color: 'text-cyan-400',
    },
    {
      id: 'discussions',
      title: 'Active Discussions',
      value: statsData?.counts?.activeDiscussions ?? '—',
      change: formatDelta(statsData?.counts?.deltaSinceYesterday?.discussions),
      changeType:
        (statsData?.counts?.deltaSinceYesterday?.discussions ?? 0) > 0
          ? 'positive'
          : (statsData?.counts?.deltaSinceYesterday?.discussions ?? 0) < 0
            ? 'negative'
            : 'neutral',
      icon: MessageSquare,
      color: 'text-green-400',
    },
    {
      id: 'knowledge_items',
      title: 'Knowledge Items',
      value: statsData?.counts?.knowledgeItems ?? '—',
      change: formatDelta(statsData?.counts?.deltaSinceYesterday?.knowledge),
      changeType:
        (statsData?.counts?.deltaSinceYesterday?.knowledge ?? 0) > 0
          ? 'positive'
          : (statsData?.counts?.deltaSinceYesterday?.knowledge ?? 0) < 0
            ? 'negative'
            : 'neutral',
      icon: Brain,
      color: 'text-orange-400',
    },
    {
      id: 'artifacts',
      title: 'Artifacts',
      value: statsData?.counts?.artifacts ?? '—',
      change: formatDelta(statsData?.counts?.deltaSinceYesterday?.artifacts),
      changeType:
        (statsData?.counts?.deltaSinceYesterday?.artifacts ?? 0) > 0
          ? 'positive'
          : (statsData?.counts?.deltaSinceYesterday?.artifacts ?? 0) < 0
            ? 'negative'
            : 'neutral',
      icon: Package,
      color: 'text-purple-400',
    },
  ];

  const systemMetrics: SystemMetric[] = [
    {
      id: 'cpu',
      name: 'CPU Usage',
      value: statsData?.system?.cpuUsage ?? 0,
      unit: '%',
      status: getMetricHealth(statsData?.system?.cpuUsage ?? 0, 70, 85),
      trend: 'stable',
      icon: Server,
    },
    {
      id: 'memory',
      name: 'Memory Usage',
      value: statsData?.system?.memoryUsage ?? 0,
      unit: '%',
      status: getMetricHealth(statsData?.system?.memoryUsage ?? 0, 70, 85),
      trend: 'stable',
      icon: Database,
    },
    {
      id: 'response_time',
      name: 'Response Time',
      value: statsData?.system?.responseTimeMs ?? 0,
      unit: 'ms',
      status: getMetricHealth(statsData?.system?.responseTimeMs ?? 0, 400, 800),
      trend: 'stable',
      icon: Zap,
    },
    {
      id: 'uptime',
      name: 'System Uptime',
      value: statsData?.system?.uptimePercent ?? 0,
      unit: '%',
      status:
        (statsData?.system?.uptimePercent ?? 0) < 95
          ? 'critical'
          : (statsData?.system?.uptimePercent ?? 0) < 99
            ? 'warning'
            : 'good',
      trend: 'stable',
      icon: Shield,
    },
  ];

  const systemStatus = statsData?.system?.status ?? 'critical';
  const systemStatusColor =
    systemStatus === 'healthy'
      ? 'bg-green-400 animate-pulse'
      : systemStatus === 'degraded'
        ? 'bg-amber-400'
        : 'bg-red-400';

  const fetchedAtTimestamp = statsData?.fetchedAt ? new Date(statsData.fetchedAt).getTime() : null;
  const secondsSinceFetch =
    fetchedAtTimestamp === null
      ? null
      : Math.max(0, Math.floor((Date.now() - fetchedAtTimestamp) / 1000));
  const isStale =
    fetchedAtTimestamp !== null && Date.now() - fetchedAtTimestamp > STALE_TIMES.SLOW;

  const activityRows = statsData?.recentActivity ?? [];

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'good':
        return CheckCircle;
      case 'warning':
        return AlertTriangle;
      case 'critical':
        return XCircle;
      default:
        return Activity;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return '↗';
      case 'down':
        return '↘';
      case 'stable':
        return '→';
      default:
        return '→';
    }
  };

  return (
    <div
      className={`h-full bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 ${className}`}
    >
      {/* Header */}
      <div className="p-6 border-b border-blue-500/20 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Home className="w-8 h-8 text-blue-400" />
            <div>
              <h2 className="text-2xl font-bold text-white">System Dashboard</h2>
              <p className="text-blue-300">Navratna Overview</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${systemStatusColor}`} />
            <span className="text-white font-medium capitalize">{systemStatus}</span>
            {secondsSinceFetch !== null && (
              <span className="text-xs text-slate-300">Last updated: {secondsSinceFetch}s ago</span>
            )}
            {isStale && (
              <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                stale
              </span>
            )}
            {isError && (
              <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                live updates unavailable
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 overflow-auto h-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
          {/* Quick Stats */}
          {isLoading
            ? new Array(4).fill(0).map((_, index) => (
                <motion.div
                  key={`quick-stat-skeleton-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="bg-slate-800/50 border-slate-700/50">
                    <CardContent className="p-4 animate-pulse">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <div className="h-3 w-24 rounded bg-slate-700/70" />
                          <div className="h-7 w-16 rounded bg-slate-700/70" />
                          <div className="h-3 w-28 rounded bg-slate-700/70" />
                        </div>
                        <div className="w-12 h-12 rounded-lg bg-slate-700/70" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            : quickStats.map((stat, index) => {
                const IconComponent = stat.icon;
                return (
                  <motion.div
                    key={stat.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-slate-400 text-sm">{stat.title}</p>
                            <p className="text-2xl font-bold text-white">{stat.value}</p>
                            <p
                              className={`text-xs ${
                                stat.changeType === 'positive'
                                  ? 'text-green-400'
                                  : stat.changeType === 'negative'
                                    ? 'text-red-400'
                                    : 'text-slate-400'
                              }`}
                            >
                              {stat.change}
                            </p>
                          </div>
                          <div
                            className={`w-12 h-12 rounded-lg bg-slate-700/50 flex items-center justify-center ${stat.color}`}
                          >
                            <IconComponent size={24} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
        </div>

        {/* System Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                <span>System Metrics</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isLoading
                  ? new Array(4).fill(0).map((_, index) => (
                      <div
                        key={`system-metric-skeleton-${index}`}
                        className="flex items-center justify-between animate-pulse"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-slate-700/70 rounded-lg" />
                          <div className="space-y-2">
                            <div className="h-3 w-24 rounded bg-slate-700/70" />
                            <div className="h-3 w-20 rounded bg-slate-700/70" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="h-4 w-16 rounded bg-slate-700/70" />
                          <div className="h-2 w-16 rounded bg-slate-700/70" />
                        </div>
                      </div>
                    ))
                  : systemMetrics.map((metric) => {
                      const IconComponent = metric.icon;
                      const StatusIcon = getStatusIcon(metric.status);

                      return (
                        <div key={metric.id} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center">
                              <IconComponent size={16} className="text-slate-400" />
                            </div>
                            <div>
                              <p className="text-white text-sm font-medium">{metric.name}</p>
                              <div className="flex items-center space-x-2">
                                <StatusIcon size={12} className={getStatusColor(metric.status)} />
                                <span className="text-slate-400 text-xs">
                                  {getTrendIcon(metric.trend)} {metric.trend}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-semibold">
                              {metric.unit === '%' ? metric.value.toFixed(1) : Math.round(metric.value)}
                              {metric.unit}
                            </p>
                            {metric.unit === '%' && (
                              <Progress value={metric.value} className="w-16 h-2 mt-1" />
                            )}
                          </div>
                        </div>
                      );
                    })}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Clock className="w-5 h-5 text-green-400" />
                <span>Recent Activity</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {isLoading
                  ? new Array(4).fill(0).map((_, index) => (
                      <div
                        key={`activity-skeleton-${index}`}
                        className="flex items-center space-x-3 p-2 bg-slate-700/30 rounded-lg animate-pulse"
                      >
                        <div className="w-2 h-2 rounded-full bg-slate-600" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-full rounded bg-slate-700/70" />
                          <div className="h-3 w-20 rounded bg-slate-700/70" />
                        </div>
                      </div>
                    ))
                  : activityRows.map((activity) => {
                      const type = activity.type;
                      const severityClass =
                        activity.severity === 'error'
                          ? 'bg-red-400'
                          : activity.severity === 'warning'
                            ? 'bg-amber-400'
                            : type === 'agent_created'
                              ? 'bg-cyan-400'
                              : type === 'knowledge_added'
                                ? 'bg-orange-400'
                                : type === 'artifact_generated'
                                  ? 'bg-purple-400'
                                  : 'bg-blue-400';

                      return (
                        <div
                          key={activity.id}
                          className="flex items-center space-x-3 p-2 bg-slate-700/30 rounded-lg"
                        >
                          <div className={`w-2 h-2 rounded-full ${severityClass}`} />
                          <div className="flex-1">
                            <p className="text-white text-sm">{activity.summary}</p>
                            <p className="text-slate-400 text-xs">{formatTimeAgo(activity.timestamp)}</p>
                          </div>
                        </div>
                      );
                    })}
                {!isLoading && activityRows.length === 0 && (
                  <div className="text-sm text-slate-400">No recent activity</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center space-x-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              <span>Quick Actions</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Create Agent', icon: Users, color: 'bg-cyan-500/20 text-cyan-400' },
                {
                  label: 'Start Discussion',
                  icon: MessageSquare,
                  color: 'bg-green-500/20 text-green-400',
                },
                { label: 'Add Knowledge', icon: Brain, color: 'bg-orange-500/20 text-orange-400' },
                {
                  label: 'View Analytics',
                  icon: BarChart3,
                  color: 'bg-purple-500/20 text-purple-400',
                },
              ].map((action) => {
                const IconComponent = action.icon;
                return (
                  <motion.button
                    key={action.label}
                    className={`p-3 rounded-lg ${action.color} hover:bg-opacity-80 transition-colors`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <IconComponent size={20} className="mx-auto mb-2" />
                    <p className="text-xs font-medium">{action.label}</p>
                  </motion.button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
