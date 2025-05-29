import React, { useState, useEffect } from 'react';
import { EnhancedAgentState, Operation, ApprovalWorkflow, Capability, SecurityContext } from '../types/uaip-interfaces';
import { IntelligencePanel } from './uaip/IntelligencePanel';
import { OperationsMonitor } from './uaip/OperationsMonitor';
import { SecurityGateway } from './uaip/SecurityGateway';
import { CapabilityRegistry } from './uaip/CapabilityRegistry';
import { InsightsPanel } from './uaip/InsightsPanel';
import { ToolsPanel } from './uaip/ToolsPanel';
import { EventStreamMonitor } from './uaip/EventStreamMonitor';
import { 
  ChartBarIcon, 
  CogIcon, 
  ShieldCheckIcon, 
  PuzzlePieceIcon,
  LightBulbIcon,
  WrenchScrewdriverIcon,
  BoltIcon,
  EyeIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

interface UAIPDashboardProps {
  agents: EnhancedAgentState[];
  className?: string;
}

type PanelType = 'intelligence' | 'operations' | 'security' | 'capabilities' | 'insights' | 'tools' | 'events';

interface PanelConfig {
  id: PanelType;
  title: string;
  icon: React.ComponentType<any>;
  description: string;
  color: string;
}

const PANELS: PanelConfig[] = [
  {
    id: 'intelligence',
    title: 'Intelligence',
    icon: ChartBarIcon,
    description: 'AI decision making and context analysis',
    color: 'from-blue-500 to-cyan-500'
  },
  {
    id: 'operations',
    title: 'Operations',
    icon: CogIcon,
    description: 'Operation orchestration and monitoring',
    color: 'from-green-500 to-emerald-500'
  },
  {
    id: 'security',
    title: 'Security',
    icon: ShieldCheckIcon,
    description: 'Security gateway and approvals',
    color: 'from-red-500 to-pink-500'
  },
  {
    id: 'capabilities',
    title: 'Capabilities',
    icon: PuzzlePieceIcon,
    description: 'Tool and capability registry',
    color: 'from-purple-500 to-violet-500'
  },
  {
    id: 'insights',
    title: 'Insights',
    icon: LightBulbIcon,
    description: 'AI insights and recommendations',
    color: 'from-yellow-500 to-orange-500'
  },
  {
    id: 'tools',
    title: 'Tools',
    icon: WrenchScrewdriverIcon,
    description: 'Active tools and integrations',
    color: 'from-indigo-500 to-blue-500'
  },
  {
    id: 'events',
    title: 'Events',
    icon: BoltIcon,
    description: 'Real-time event monitoring',
    color: 'from-teal-500 to-green-500'
  }
];

export const UAIPDashboard: React.FC<UAIPDashboardProps> = ({ agents, className = '' }) => {
  const [activePanel, setActivePanel] = useState<PanelType>('intelligence');
  const [isExpanded, setIsExpanded] = useState(true);
  const [systemStatus, setSystemStatus] = useState({
    operationsActive: 0,
    pendingApprovals: 0,
    systemHealth: 'healthy' as 'healthy' | 'warning' | 'critical',
    lastUpdate: new Date()
  });

  // Mock data - replace with actual UAIP system integration
  const mockData = {
    activeOperations: [] as Operation[],
    pendingApprovals: [] as ApprovalWorkflow[],
    capabilities: [] as Capability[],
    securityContext: {
      userId: 'current-user',
      permissions: ['read', 'write', 'approve'],
      securityLevel: 'standard'
    } as SecurityContext
  };

  useEffect(() => {
    // Set up real-time updates for system status
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
        return <OperationsMonitor operations={mockData.activeOperations} />;
      case 'security':
        return <SecurityGateway 
          pendingApprovals={mockData.pendingApprovals} 
          securityContext={mockData.securityContext} 
        />;
      case 'capabilities':
        return <CapabilityRegistry capabilities={mockData.capabilities} />;
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'critical': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className={`uaip-dashboard ${className}`}>
      {/* Dashboard Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <BoltIcon className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              UAIP System
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(systemStatus.systemHealth)}`}>
              {systemStatus.systemHealth.toUpperCase()}
            </div>
            <span className="text-sm text-gray-500">
              Last update: {systemStatus.lastUpdate.toLocaleTimeString()}
            </span>
          </div>
        </div>
        
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          {isExpanded ? (
            <ChevronLeftIcon className="w-5 h-5" />
          ) : (
            <ChevronRightIcon className="w-5 h-5" />
          )}
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Panel Navigation */}
        <div className={`${isExpanded ? 'col-span-3' : 'col-span-1'} space-y-2`}>
          {PANELS.map((panel) => {
            const Icon = panel.icon;
            const isActive = activePanel === panel.id;
            
            return (
              <button
                key={panel.id}
                onClick={() => setActivePanel(panel.id)}
                className={`w-full p-4 rounded-2xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700'
                    : 'hover:bg-white/50 dark:hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${panel.color} flex items-center justify-center shadow-lg`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  
                  {isExpanded && (
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-gray-700 dark:group-hover:text-gray-300">
                        {panel.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {panel.description}
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Active indicator */}
                {isActive && (
                  <div className="mt-3 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Main Panel Content */}
        <div className={`${isExpanded ? 'col-span-9' : 'col-span-11'}`}>
          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden">
            <div className="p-6">
              {/* Panel Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  {(() => {
                    const currentPanel = PANELS.find(p => p.id === activePanel);
                    if (!currentPanel) return null;
                    const Icon = currentPanel.icon;
                    return (
                      <>
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${currentPanel.color} flex items-center justify-center shadow-lg`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                            {currentPanel.title}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {currentPanel.description}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
                
                <div className="flex items-center space-x-2">
                  <EyeIcon className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-500">Real-time</span>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                </div>
              </div>

              {/* Panel Content */}
              <div className="min-h-[600px]">
                {renderActivePanel()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 