import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { useSecurity } from '@/contexts/SecurityContext';
import {
  Shield,
  ShieldAlert,
  Activity,
  Lock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Eye,
  EyeOff,
  RefreshCw,
  Download,
  Filter,
  MoreVertical,
  Loader2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { RiskLevel, AgentCapability, AuditEventType } from '@uaip/types';

interface SecurityMetrics {
  overallScore: number;
  riskLevel: RiskLevel;
  totalOperations: number;
  blockedOperations: number;
  approvedOperations: number;
  pendingApprovals: number;
  activePolicies: number;
  recentIncidents: number;
  complianceScore: number;
}

interface AgentActivity {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  agentId: string;
  agentName: string;
  resource: string;
  action: string;
  outcome: 'success' | 'failure' | 'blocked';
  riskScore: number;
  details?: string;
}

interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  applicableCapabilities: AgentCapability[];
  riskThreshold: RiskLevel;
  enforcementActions: string[];
  violationCount: number;
  lastTriggered?: Date;
}

const RISK_COLORS = {
  [RiskLevel.LOW]: 'text-green-600 bg-green-50',
  [RiskLevel.MEDIUM]: 'text-yellow-600 bg-yellow-50',
  [RiskLevel.HIGH]: 'text-orange-600 bg-orange-50',
  [RiskLevel.CRITICAL]: 'text-red-600 bg-red-50',
};

const CHART_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#ec4899'];

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface AgentSecurityDashboardProps {
  className?: string;
  viewport?: ViewportSize;
  mode?: 'dashboard' | 'portal';
}

export const AgentSecurityDashboard: React.FC<AgentSecurityDashboardProps> = ({
  className,
  viewport,
  mode = 'dashboard',
}) => {
  // Use centralized security state
  const { metrics, auditLog, refreshSecurityData, isLoading, error } = useSecurity();

  // Local UI state only
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [policies, setPolicies] = useState<SecurityPolicy[]>([]);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState('overview');
  const { toast } = useToast();

  // Default viewport if not provided - memoized to prevent infinite re-renders
  const currentViewport = useMemo(() => {
    if (viewport) return viewport;

    const defaultViewport: ViewportSize = {
      width: typeof window !== 'undefined' ? window.innerWidth : 1024,
      height: typeof window !== 'undefined' ? window.innerHeight : 768,
      isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
      isTablet:
        typeof window !== 'undefined'
          ? window.innerWidth >= 768 && window.innerWidth < 1024
          : false,
      isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
    };

    return defaultViewport;
  }, [viewport]);

  const fetchSecurityData = useCallback(async () => {
    try {
      setRefreshing(true);

      // Use centralized security data refresh
      await refreshSecurityData();

      // Mock additional data that's not in central state yet
      const mockActivities: AgentActivity[] = [
        {
          id: '1',
          timestamp: new Date(),
          eventType: 'AGENT_ACTION' as AuditEventType,
          agentId: 'agent-1',
          agentName: 'Security Agent',
          resource: 'database',
          action: 'read',
          outcome: 'success',
          riskScore: 3,
        },
      ];

      const mockPolicies: SecurityPolicy[] = [
        {
          id: '1',
          name: 'Data Access Control',
          description: 'Controls agent access to sensitive data',
          enabled: true,
          applicableCapabilities: ['DATA_ACCESS' as AgentCapability],
          riskThreshold: RiskLevel.MEDIUM,
          enforcementActions: ['block', 'audit'],
          violationCount: 0,
        },
      ];

      setActivities(mockActivities);
      setPolicies(mockPolicies);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch security data',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  }, [refreshSecurityData, toast]);

  useEffect(() => {
    fetchSecurityData();
  }, [timeRange, fetchSecurityData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSecurityData();
  };

  const handlePolicyToggle = async (policyId: string, enabled: boolean) => {
    try {
      // Mock policy toggle - in real implementation, use uaipAPI
      setPolicies((prev) => prev.map((p) => (p.id === policyId ? { ...p, enabled } : p)));
      toast({
        title: 'Policy Updated',
        description: `Policy ${enabled ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update policy',
        variant: 'destructive',
      });
    }
  };

  const exportSecurityReport = async () => {
    try {
      // Mock export - in real implementation, use uaipAPI
      const mockData = JSON.stringify(
        {
          metrics,
          activities,
          policies,
          exportedAt: new Date().toISOString(),
          timeRange,
        },
        null,
        2
      );

      const blob = new Blob([mockData], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `agent-security-report-${new Date().toISOString()}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export security report',
        variant: 'destructive',
      });
    }
  };

  const renderOverviewMetrics = () => {
    if (!metrics) return null;

    // Convert SecurityContext metrics to dashboard format
    const dashboardMetrics = {
      overallScore: metrics.securityScore,
      riskLevel: metrics.riskLevel,
      totalOperations: 1247, // Mock for now
      blockedOperations: metrics.blockedAttempts,
      approvedOperations: 1224, // Mock for now
      pendingApprovals: 5, // Mock for now
      activePolicies: 12, // Mock for now
      recentIncidents: metrics.recentIncidents,
      complianceScore: 92, // Mock for now
    };

    const metricCards = [
      {
        title: 'Security Score',
        value: `${dashboardMetrics.overallScore}%`,
        icon: <Shield className="w-5 h-5" />,
        trend: dashboardMetrics.overallScore > 80 ? 'up' : 'down',
        color: dashboardMetrics.overallScore > 80 ? 'text-green-600' : 'text-orange-600',
      },
      {
        title: 'Risk Level',
        value: dashboardMetrics.riskLevel,
        icon: <ShieldAlert className="w-5 h-5" />,
        badge: true,
        color: RISK_COLORS[dashboardMetrics.riskLevel],
      },
      {
        title: 'Total Operations',
        value: dashboardMetrics.totalOperations.toLocaleString(),
        icon: <Activity className="w-5 h-5" />,
        subValue: `${dashboardMetrics.blockedOperations} blocked`,
      },
      {
        title: 'Compliance Score',
        value: `${dashboardMetrics.complianceScore}%`,
        icon: <CheckCircle2 className="w-5 h-5" />,
        progress: true,
      },
    ];

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((metric, index) => (
          <motion.div
            key={metric.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">{metric.title}</p>
                    {metric.badge ? (
                      <Badge className={metric.color}>{metric.value}</Badge>
                    ) : (
                      <p className={`text-2xl font-bold ${metric.color || ''}`}>{metric.value}</p>
                    )}
                    {metric.subValue && (
                      <p className="text-xs text-muted-foreground">{metric.subValue}</p>
                    )}
                    {metric.progress && <Progress value={parseInt(metric.value)} className="h-2" />}
                  </div>
                  <div className={`p-2 rounded-lg bg-gray-100 ${metric.color || 'text-gray-600'}`}>
                    {metric.icon}
                  </div>
                </div>
                {metric.trend && (
                  <div className="flex items-center gap-1 mt-2">
                    {metric.trend === 'up' ? (
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-600" />
                    )}
                    <span className="text-xs text-muted-foreground">vs last period</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    );
  };

  const renderActivityChart = () => {
    // Mock data for demonstration
    const chartData = [
      { time: '00:00', success: 120, blocked: 5, failed: 2 },
      { time: '04:00', success: 80, blocked: 3, failed: 1 },
      { time: '08:00', success: 200, blocked: 10, failed: 5 },
      { time: '12:00', success: 350, blocked: 15, failed: 8 },
      { time: '16:00', success: 280, blocked: 12, failed: 6 },
      { time: '20:00', success: 180, blocked: 8, failed: 3 },
    ];

    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="success" stackId="1" stroke="#10b981" fill="#10b981" />
              <Area type="monotone" dataKey="blocked" stackId="1" stroke="#f59e0b" fill="#f59e0b" />
              <Area type="monotone" dataKey="failed" stackId="1" stroke="#ef4444" fill="#ef4444" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const renderActivityLog = () => {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {activities.map((activity) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={`p-2 rounded-full ${
                      activity.outcome === 'success'
                        ? 'bg-green-100 text-green-600'
                        : activity.outcome === 'blocked'
                          ? 'bg-yellow-100 text-yellow-600'
                          : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {activity.outcome === 'success' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : activity.outcome === 'blocked' ? (
                      <Lock className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                  </div>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{activity.agentName}</p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(activity.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {activity.action} on {activity.resource}
                    </p>
                    {activity.details && (
                      <p className="text-xs text-gray-600">{activity.details}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {activity.eventType}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          activity.riskScore > 7
                            ? 'text-red-600'
                            : activity.riskScore > 4
                              ? 'text-orange-600'
                              : 'text-green-600'
                        }`}
                      >
                        Risk: {activity.riskScore}/10
                      </Badge>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  };

  const renderPolicies = () => {
    return (
      <div className="space-y-4">
        {policies.map((policy) => (
          <Card
            key={policy.id}
            className={`border-2 ${policy.enabled ? 'border-green-200' : 'border-gray-200'}`}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">{policy.name}</h3>
                    <Badge
                      variant={policy.enabled ? 'default' : 'secondary'}
                      className={policy.enabled ? 'bg-green-600 text-white' : ''}
                    >
                      {policy.enabled ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{policy.description}</p>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {policy.applicableCapabilities.map((cap) => (
                      <Badge key={cap} variant="outline" className="text-xs">
                        {cap}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-3">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {policy.violationCount} violations
                    </span>
                    {policy.lastTriggered && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last: {new Date(policy.lastTriggered).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePolicyToggle(policy.id, !policy.enabled)}
                  >
                    {policy.enabled ? (
                      <>
                        <EyeOff className="w-4 h-4 mr-2" />
                        Disable
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4 mr-2" />
                        Enable
                      </>
                    )}
                  </Button>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className={`${mode === 'portal' ? 'h-full' : 'space-y-6'} ${className || ''}`}>
      {/* Header - only show in dashboard mode */}
      {mode === 'dashboard' && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h2 className="text-2xl font-bold">Security Dashboard</h2>
            <p className="text-muted-foreground">
              Monitor and manage security policies and activities
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 border rounded-lg">
              <Button
                variant={timeRange === '24h' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeRange('24h')}
              >
                24h
              </Button>
              <Button
                variant={timeRange === '7d' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeRange('7d')}
              >
                7d
              </Button>
              <Button
                variant={timeRange === '30d' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeRange('30d')}
              >
                30d
              </Button>
            </div>

            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            <Button variant="outline" onClick={exportSecurityReport}>
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>
        </motion.div>
      )}

      {/* Portal mode controls */}
      {mode === 'portal' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-1">
              <Button
                variant={timeRange === '24h' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeRange('24h')}
                className="text-xs"
              >
                24h
              </Button>
              <Button
                variant={timeRange === '7d' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeRange('7d')}
                className="text-xs"
              >
                7d
              </Button>
              <Button
                variant={timeRange === '30d' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeRange('30d')}
                className="text-xs"
              >
                30d
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={exportSecurityReport}
              className="text-slate-300 hover:text-white hover:bg-slate-800/50"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Alert Banner */}
      {metrics && metrics.recentIncidents > 0 && (
        <Alert variant="destructive" className="bg-orange-50 border-orange-200 text-orange-800">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Security Alert</AlertTitle>
          <AlertDescription>
            {metrics.recentIncidents} security incidents detected in the last {timeRange}. Review
            the activity log for details.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {renderOverviewMetrics()}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderActivityChart()}
            {renderActivityLog()}
          </div>
        </TabsContent>

        <TabsContent value="activities">{renderActivityLog()}</TabsContent>

        <TabsContent value="policies">{renderPolicies()}</TabsContent>
      </Tabs>
    </div>
  );
};
