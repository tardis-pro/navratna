import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Home,
  Activity,
  Users,
  MessageSquare,
  Brain,
  Package,
  TrendingUp,
  Clock,
  Zap,
  Shield,
  Server,
  Database,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

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
  icon: React.ComponentType<any>;
}

interface QuickStat {
  id: string;
  title: string;
  value: string | number;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: React.ComponentType<any>;
  color: string;
}

export const DashboardPortal: React.FC<DashboardPortalProps> = ({
  viewport,
  className = ''
}) => {
  const [systemMetrics, setSystemMetrics] = useState<SystemMetric[]>([]);
  const [quickStats, setQuickStats] = useState<QuickStat[]>([]);
  const [systemStatus, setSystemStatus] = useState<'online' | 'degraded' | 'offline'>('online');

  // Mock data - in real implementation, this would come from APIs
  useEffect(() => {
    const mockMetrics: SystemMetric[] = [
      {
        id: 'cpu',
        name: 'CPU Usage',
        value: 45,
        unit: '%',
        status: 'good',
        trend: 'stable',
        icon: Server
      },
      {
        id: 'memory',
        name: 'Memory Usage',
        value: 68,
        unit: '%',
        status: 'warning',
        trend: 'up',
        icon: Database
      },
      {
        id: 'response_time',
        name: 'Response Time',
        value: 120,
        unit: 'ms',
        status: 'good',
        trend: 'down',
        icon: Zap
      },
      {
        id: 'uptime',
        name: 'System Uptime',
        value: 99.9,
        unit: '%',
        status: 'good',
        trend: 'stable',
        icon: Shield
      }
    ];

    const mockStats: QuickStat[] = [
      {
        id: 'active_agents',
        title: 'Active Agents',
        value: 12,
        change: '+2 from yesterday',
        changeType: 'positive',
        icon: Users,
        color: 'text-cyan-400'
      },
      {
        id: 'discussions',
        title: 'Active Discussions',
        value: 8,
        change: '+3 from yesterday',
        changeType: 'positive',
        icon: MessageSquare,
        color: 'text-green-400'
      },
      {
        id: 'knowledge_items',
        title: 'Knowledge Items',
        value: 1247,
        change: '+15 this week',
        changeType: 'positive',
        icon: Brain,
        color: 'text-orange-400'
      },
      {
        id: 'artifacts',
        title: 'Artifacts',
        value: 89,
        change: '+5 this week',
        changeType: 'positive',
        icon: Package,
        color: 'text-purple-400'
      }
    ];

    setSystemMetrics(mockMetrics);
    setQuickStats(mockStats);
  }, []);

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
    <div className={`h-full bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-blue-500/20 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Home className="w-8 h-8 text-blue-400" />
            <div>
              <h2 className="text-2xl font-bold text-white">System Dashboard</h2>
              <p className="text-blue-300">Council of Nycea Overview</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              systemStatus === 'online' ? 'bg-green-400 animate-pulse' :
              systemStatus === 'degraded' ? 'bg-yellow-400' :
              'bg-red-400'
            }`} />
            <span className="text-white font-medium capitalize">{systemStatus}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 overflow-auto h-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
          {/* Quick Stats */}
          {quickStats.map((stat, index) => {
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
                        <p className={`text-xs ${
                          stat.changeType === 'positive' ? 'text-green-400' :
                          stat.changeType === 'negative' ? 'text-red-400' :
                          'text-slate-400'
                        }`}>
                          {stat.change}
                        </p>
                      </div>
                      <div className={`w-12 h-12 rounded-lg bg-slate-700/50 flex items-center justify-center ${stat.color}`}>
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
                {systemMetrics.map((metric) => {
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
                          {metric.value}{metric.unit}
                        </p>
                        {metric.unit === '%' && (
                          <Progress 
                            value={metric.value} 
                            className="w-16 h-2 mt-1"
                          />
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
                {[
                  { action: 'Agent Alpha started new discussion', time: '2 minutes ago', type: 'agent' },
                  { action: 'Knowledge base updated', time: '5 minutes ago', type: 'knowledge' },
                  { action: 'New artifact generated', time: '8 minutes ago', type: 'artifact' },
                  { action: 'System health check completed', time: '15 minutes ago', type: 'system' }
                ].map((activity, index) => (
                  <div key={index} className="flex items-center space-x-3 p-2 bg-slate-700/30 rounded-lg">
                    <div className={`w-2 h-2 rounded-full ${
                      activity.type === 'agent' ? 'bg-cyan-400' :
                      activity.type === 'knowledge' ? 'bg-orange-400' :
                      activity.type === 'artifact' ? 'bg-purple-400' :
                      'bg-blue-400'
                    }`} />
                    <div className="flex-1">
                      <p className="text-white text-sm">{activity.action}</p>
                      <p className="text-slate-400 text-xs">{activity.time}</p>
                    </div>
                  </div>
                ))}
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
                { label: 'Start Discussion', icon: MessageSquare, color: 'bg-green-500/20 text-green-400' },
                { label: 'Add Knowledge', icon: Brain, color: 'bg-orange-500/20 text-orange-400' },
                { label: 'View Analytics', icon: BarChart3, color: 'bg-purple-500/20 text-purple-400' }
              ].map((action, index) => {
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
