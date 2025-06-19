import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

// Context
import { useAgents } from '../contexts/AgentContext';

// UAIP Component Imports
import { IntelligencePanel } from './uaip/IntelligencePanel';
import { OperationsMonitor } from './uaip/OperationsMonitor';
import { SecurityGateway } from './uaip/SecurityGateway';
import { CapabilityRegistry } from './uaip/CapabilityRegistry';
import { InsightsPanel } from './uaip/InsightsPanel';
import { ToolsPanel } from './uaip/ToolsPanel';
import { EventStreamMonitor } from './uaip/EventStreamMonitor';

// Icons
import {
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
  ChartBarIcon,
  CommandLineIcon,
  SignalIcon,
  LightBulbIcon
} from '@heroicons/react/24/outline';

// Types
import { EnhancedAgentState, Operation, ApprovalWorkflow, Capability } from '../types/uaip-interfaces';

// Hooks - PRODUCTION READY
import { useOperations, useApprovals, useCapabilities, useSystemMetrics } from '../hooks/useUAIP';

type PanelType = 'intelligence' | 'operations' | 'security' | 'capabilities' | 'insights' | 'tools' | 'events';

interface UAIPDashboardProps {
  agents?: EnhancedAgentState[]; // Made optional
  className?: string;
}

export const UAIPDashboard: React.FC<UAIPDashboardProps> = ({ agents: propAgents, className = '' }) => {
  const [activePanel, setActivePanel] = useState<PanelType>('intelligence');
  const [isExpanded, setIsExpanded] = useState(true);
  const [systemStatus, setSystemStatus] = useState({
    operationsActive: 0,
    pendingApprovals: 0,
    systemHealth: 'healthy' as 'healthy' | 'warning' | 'critical',
    lastUpdate: new Date()
  });

  // Get agents from context if not provided as prop
  const { agents: contextAgents } = useAgents();
  const agents = propAgents || Object.values(contextAgents || {});

  // Real backend data hooks
  const { operations, isLoading: operationsLoading, error: operationsError } = useOperations();
  const { approvals, isLoading: approvalsLoading, error: approvalsError } = useApprovals();
  const { capabilities, isLoading: capabilitiesLoading, error: capabilitiesError } = useCapabilities();
  const { metrics, isLoading: metricsLoading, error: metricsError } = useSystemMetrics();

  // Update system status based on real data
  useEffect(() => {
    const activeOperations = operations?.filter(op => op.status === 'running' || op.status === 'queued') || [];
    const pendingApprovals = approvals?.filter(approval => approval.status === 'pending') || [];
    
    // Determine system health based on errors and data
    let health: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (operationsError || approvalsError || capabilitiesError || metricsError) {
      health = 'critical';
    } else if (activeOperations.length > 10 || pendingApprovals.length > 5) {
      health = 'warning';
    }

    setSystemStatus({
      operationsActive: activeOperations.length,
      pendingApprovals: pendingApprovals.length,
      systemHealth: health,
      lastUpdate: new Date()
    });
  }, [operations, approvals, operationsError, approvalsError, capabilitiesError, metricsError]);

  // Set up real-time updates for system status
  useEffect(() => {
    const interval = setInterval(() => {
      setSystemStatus(prev => ({
        ...prev,
        lastUpdate: new Date()
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const renderActivePanel = () => {
    switch (activePanel) {
      case 'intelligence':
        return <IntelligencePanel agents={agents} />;
      case 'operations':
        return <OperationsMonitor operations={operations || []} />;
      case 'security':
        return <SecurityGateway 
          pendingApprovals={approvals || []} 
          securityContext={{
            userId: 'current-user',
            permissions: ['read', 'write', 'approve'],
            securityLevel: 'standard'
          }} 
        />;
      case 'capabilities':
        return <CapabilityRegistry capabilities={capabilities || []} />;
      case 'insights':
        return <InsightsPanel agents={agents} />;
      case 'tools':
        return <ToolsPanel agents={agents} />;
      case 'events':
        return <EventStreamMonitor />;
      default:
        return <IntelligencePanel agents={agents} />;
    }
  };

  const getPanelIcon = (panel: PanelType) => {
    const iconClass = "w-4 h-4";
    switch (panel) {
      case 'intelligence': return <ChartBarIcon className={iconClass} />;
      case 'operations': return <CommandLineIcon className={iconClass} />;
      case 'security': return <ShieldCheckIcon className={iconClass} />;
      case 'capabilities': return <WrenchScrewdriverIcon className={iconClass} />;
      case 'insights': return <LightBulbIcon className={iconClass} />;
      case 'tools': return <ChartBarIcon className={iconClass} />;
      case 'events': return <SignalIcon className={iconClass} />;
      default: return <ChartBarIcon className={iconClass} />;
    }
  };

  const getSystemHealthColor = () => {
    switch (systemStatus.systemHealth) {
      case 'healthy': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const isLoading = operationsLoading || approvalsLoading || capabilitiesLoading || metricsLoading;
  const hasError = operationsError || approvalsError || capabilitiesError || metricsError;

  return (
    <div className={`uaip-dashboard ${className}`}>
      {/* System Status Header */}
      <div className="mb-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">UAIP System Status</CardTitle>
              <div className={`px-3 py-1 rounded-full text-xs font-medium border ${getSystemHealthColor()}`}>
                {systemStatus.systemHealth.toUpperCase()}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{agents.length}</div>
                <div className="text-xs text-gray-500">Active Agents</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{systemStatus.operationsActive}</div>
                <div className="text-xs text-gray-500">Active Operations</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{systemStatus.pendingApprovals}</div>
                <div className="text-xs text-gray-500">Pending Approvals</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{capabilities?.length || 0}</div>
                <div className="text-xs text-gray-500">Available Capabilities</div>
              </div>
            </div>
            
            {hasError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <LightBulbIcon className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-red-700">Backend connection issues detected</span>
                </div>
              </div>
            )}
            
            <div className="mt-4 text-xs text-gray-400 text-center">
              Last updated: {systemStatus.lastUpdate.toLocaleTimeString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard Content */}
      <Card className="h-[600px]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">System Control Panel</CardTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs value={activePanel} onValueChange={(value) => setActivePanel(value as PanelType)}>
            <div className="px-6 pb-4">
              <TabsList className="grid grid-cols-7 w-full">
                <TabsTrigger value="intelligence" className="flex items-center space-x-2">
                  {getPanelIcon('intelligence')}
                  <span className="hidden sm:inline">Intelligence</span>
                </TabsTrigger>
                <TabsTrigger value="operations" className="flex items-center space-x-2">
                  {getPanelIcon('operations')}
                  <span className="hidden sm:inline">Operations</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="flex items-center space-x-2">
                  {getPanelIcon('security')}
                  <span className="hidden sm:inline">Security</span>
                </TabsTrigger>
                <TabsTrigger value="capabilities" className="flex items-center space-x-2">
                  {getPanelIcon('capabilities')}
                  <span className="hidden sm:inline">Capabilities</span>
                </TabsTrigger>
                <TabsTrigger value="insights" className="flex items-center space-x-2">
                  {getPanelIcon('insights')}
                  <span className="hidden sm:inline">Insights</span>
                </TabsTrigger>
                <TabsTrigger value="tools" className="flex items-center space-x-2">
                  {getPanelIcon('tools')}
                  <span className="hidden sm:inline">Tools</span>
                </TabsTrigger>
                <TabsTrigger value="events" className="flex items-center space-x-2">
                  {getPanelIcon('events')}
                  <span className="hidden sm:inline">Events</span>
                </TabsTrigger>
              </TabsList>
            </div>
            
            <Separator />
            
            <div className="p-6 h-[450px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading system data...</p>
                  </div>
                </div>
              ) : (
                <TabsContent value={activePanel} className="mt-0 h-full">
                  {renderActivePanel()}
                </TabsContent>
              )}
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}; 