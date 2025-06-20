import React, { useState, useEffect } from 'react';
import { useUAIP } from '@/contexts/UAIPContext';
import { motion } from 'framer-motion';
import { 
  WrenchScrewdriverIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ClockIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  EyeIcon
} from '@heroicons/react/24/outline';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface ToolsPanelPortalProps {
  /** Optional additional class names for root container */
  className?: string;
  /** Optional viewport override (useful when embedding in other layouts) */
  viewport?: ViewportSize;
}

interface Tool {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  description: string;
  lastUsed?: Date;
  usageCount: number;
  agentId: string;
  agentName: string;
  category?: string;
  version?: string;
}

export const ToolsPanel: React.FC<ToolsPanelPortalProps> = ({ className, viewport }) => {
  // Derive viewport information if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  };

  const currentViewport = viewport || defaultViewport;

  const { agents, toolIntegrations, capabilities, refreshData, isWebSocketConnected } = useUAIP();
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    // Extract tools from agent capabilities and tool integrations
    const extractedTools: Tool[] = [];
    
    try {
      // Add tools from agent capabilities
      agents.data.forEach(agent => {
        if (agent.capabilities && agent.capabilities.length > 0) {
          agent.capabilities.forEach((capability, index) => {
            extractedTools.push({
              id: `${agent.id}-tool-${index}`,
              name: capability.charAt(0).toUpperCase() + capability.slice(1).replace(/[-_]/g, ' '),
              status: agent.status === 'active' ? 'active' : 'inactive',
              description: `${capability} capability provided by ${agent.name}`,
              lastUsed: agent.lastActivity ? new Date(agent.lastActivity) : undefined,
              usageCount: agent.metrics?.totalOperations || 0,
              agentId: agent.id,
              agentName: agent.name,
              category: 'Agent Capability',
              version: '1.0.0'
            });
          });
        }
      });

      // Add tools from tool integrations
      toolIntegrations.data.forEach(integration => {
        extractedTools.push({
          id: integration.id,
          name: integration.name,
          status: integration.status === 'connected' ? 'active' : 
                  integration.status === 'error' ? 'error' : 'inactive',
          description: `${integration.type.toUpperCase()} integration - ${integration.name}`,
          lastUsed: integration.lastUsed,
          usageCount: integration.usageCount,
          agentId: 'system',
          agentName: 'System Integration',
          category: `${integration.type.toUpperCase()} Integration`,
          version: integration.configuration?.version || '1.0.0'
        });
      });

      // Add tools from capabilities registry with error handling
      capabilities.data.forEach(capability => {
        if (!extractedTools.find(tool => tool.name === capability.name)) {
          extractedTools.push({
            id: capability.id,
            name: capability.name,
            status: capability.status === 'active' ? 'active' : 'inactive',
            description: capability.description || `${capability.name} capability`,
            lastUsed: capability.lastUsed ? new Date(capability.lastUsed) : undefined,
            usageCount: capability.usageCount || 0,
            agentId: capability.agentId || 'system',
            agentName: capability.agentName || 'System',
            category: capability.category || 'General',
            version: capability.version || '1.0.0'
          });
        }
      });

      setTools(extractedTools);
    } catch (error) {
      console.error('Error extracting tools:', error);
      // Set empty tools array on error to prevent UI issues
      setTools([]);
    }
  }, [agents.data, toolIntegrations.data, capabilities.data]);

  // Filter tools based on search and category
  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         tool.agentName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Extract categories from tools
  const categories = ['all', ...Array.from(new Set(tools.map(tool => tool.category || 'General')))];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'inactive': return <ClockIcon className="w-5 h-5 text-gray-500" />;
      case 'error': return <XCircleIcon className="w-5 h-5 text-red-500" />;
      default: return <ClockIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100 border-green-200';
      case 'inactive': return 'text-gray-600 bg-gray-100 border-gray-200';
      case 'error': return 'text-red-600 bg-red-100 border-red-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      'Agent Capability': 'bg-blue-100 text-blue-800 border-blue-200',
      'MCP Integration': 'bg-purple-100 text-purple-800 border-purple-200',
      'API Integration': 'bg-green-100 text-green-800 border-green-200',
      'WEBHOOK Integration': 'bg-orange-100 text-orange-800 border-orange-200',
      'CUSTOM Integration': 'bg-pink-100 text-pink-800 border-pink-200',
      'General': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[category as keyof typeof colors] || colors['General'];
  };

  const selectedToolData = tools.find(tool => tool.id === selectedTool);

  // Show error state
  if (agents.error || toolIntegrations.error || capabilities.error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-500 dark:text-red-400">Failed to load tools data</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
              {agents.error?.message || toolIntegrations.error?.message || capabilities.error?.message}
            </p>
            <button
              onClick={refreshData}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state
  if (agents.isLoading || toolIntegrations.isLoading || capabilities.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ArrowPathIcon className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading tools...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show empty state
  if (tools.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header with Connection Status */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
            <WrenchScrewdriverIcon className="w-6 h-6 mr-2 text-blue-500" />
            Tools Panel
          </h2>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-sm text-gray-500">
                {isWebSocketConnected ? 'Live' : 'Offline'}
              </span>
            </div>
            <button
              onClick={refreshData}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Refresh tools"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <WrenchScrewdriverIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500 dark:text-gray-400">No tools available</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">Tools will appear here when agents register capabilities</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`space-y-6 ${className ?? ''} ${currentViewport.isMobile ? 'px-2' : ''}`}
    >
      {/* Header with Connection Status */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
          <WrenchScrewdriverIcon className="w-6 h-6 mr-2 text-blue-500" />
          Tools Panel
        </h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-sm text-gray-500">
              {isWebSocketConnected ? 'Live' : 'Offline'}
            </span>
          </div>
          <button
            onClick={refreshData}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Refresh tools"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          {(agents.lastUpdated || toolIntegrations.lastUpdated || capabilities.lastUpdated) && (
            <span className="text-xs text-gray-400">
              Updated: {(agents.lastUpdated || toolIntegrations.lastUpdated || capabilities.lastUpdated)?.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <WrenchScrewdriverIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {categories.map(category => (
            <option key={category} value={category}>
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tools List */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
            <WrenchScrewdriverIcon className="w-5 h-5 mr-2 text-blue-500" />
            Available Tools ({filteredTools.length})
          </h3>
          
          {filteredTools.length === 0 ? (
            <div className="text-center py-8">
              <WrenchScrewdriverIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400">No tools match your search</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredTools.map((tool) => (
                <div 
                  key={tool.id}
                  className={`bg-white dark:bg-slate-700 rounded-xl p-4 border cursor-pointer transition-all ${
                    selectedTool === tool.id 
                      ? 'border-blue-500 ring-2 ring-blue-500/20' 
                      : 'border-slate-200 dark:border-slate-600 hover:border-blue-300'
                  }`}
                  onClick={() => setSelectedTool(tool.id)}
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                      <WrenchScrewdriverIcon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{tool.name}</h3>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(tool.status)}
                          <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(tool.status)}`}>
                            {tool.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">{tool.description}</p>
                      
                      <div className="flex items-center space-x-2 mb-2">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getCategoryColor(tool.category || 'General')}`}>
                          {tool.category || 'General'}
                        </span>
                        <span className="text-xs text-gray-500">v{tool.version}</span>
                      </div>
                      
                      <div className="text-sm text-gray-500 space-y-1">
                        <p>Agent: {tool.agentName}</p>
                        <p>Used {tool.usageCount} times</p>
                        {tool.lastUsed && (
                          <p>Last used: {tool.lastUsed.toLocaleTimeString()}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tool Details */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <EyeIcon className="w-5 h-5 mr-2 text-purple-500" />
            Tool Details
          </h3>
          
          {selectedToolData ? (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">{selectedToolData.name}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">ID: {selectedToolData.id}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(selectedToolData.status)}
                    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(selectedToolData.status)}`}>
                      {selectedToolData.status.toUpperCase()}
                    </span>
                  </div>
                </div>
                
                <p className="text-gray-600 dark:text-gray-400 mb-4">{selectedToolData.description}</p>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Agent:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedToolData.agentName}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Category:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedToolData.category}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Version:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedToolData.version}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Usage Count:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedToolData.usageCount}</span>
                  </div>
                  {selectedToolData.lastUsed && (
                    <div className="col-span-2">
                      <span className="text-gray-600 dark:text-gray-400">Last Used:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">
                        {selectedToolData.lastUsed.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Usage Statistics */}
              <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <h5 className="font-semibold text-gray-900 dark:text-white mb-3">Usage Statistics</h5>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Total Executions</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{selectedToolData.usageCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Status</span>
                    <span className={`text-sm font-medium ${
                      selectedToolData.status === 'active' ? 'text-green-600' :
                      selectedToolData.status === 'error' ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {selectedToolData.status.charAt(0).toUpperCase() + selectedToolData.status.slice(1)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Availability</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedToolData.status === 'active' ? '100%' : '0%'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <WrenchScrewdriverIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Select a tool to view details</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}; 