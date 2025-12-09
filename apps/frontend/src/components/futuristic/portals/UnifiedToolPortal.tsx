// Unified Tool Portal - Comprehensive Tool Management Interface
// Combines discovery, management, and monitoring in one place
// Includes agent integration features

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  WrenchScrewdriverIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ClockIcon,
  CheckCircleIcon,
  DocumentIcon,
  TagIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  CloudIcon,
  CodeBracketIcon,
  CubeIcon,
  UserGroupIcon,
  ServerStackIcon,
  ChartBarIcon,
  CogIcon,
  BoltIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import { uaipAPI } from '@/utils/uaip-api';
import MCPConfigUpload from '@/components/MCPConfigUpload';

interface Agent {
  id: string;
  name: string;
  description?: string;
  status:
    | 'initializing'
    | 'idle'
    | 'active'
    | 'busy'
    | 'error'
    | 'offline'
    | 'shutting_down'
    | 'inactive'
    | 'deleted';
  assignedMCPTools?: Array<{
    toolId: string;
    toolName: string;
    serverName: string;
  }>;
  capabilities?: string[];
  isActive: boolean;
}

interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  author: string;
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresApproval: boolean;
  tags: string[];
  totalExecutions: number;
  successfulExecutions: number;
  isEnabled: boolean;
  lastUsedAt?: string;
  metadata?: {
    mcpServer?: string;
    oauthProvider?: string;
  };
  parameters?: any;
}

interface MCPServer {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'starting';
  command: string;
  args: string[];
  disabled: boolean;
  toolCount?: number;
  uptime?: number;
}

interface SystemStatus {
  mcp: {
    status: string;
    totalServers: number;
    runningServers: number;
    errorServers: number;
    totalTools: number;
    servers: MCPServer[];
  };
  oauth: {
    connectedProviders: number;
    availableCapabilities: number;
    providers: any[];
  };
}

export const UnifiedToolPortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'discover' | 'manage' | 'monitor'>('discover');
  const [tools, setTools] = useState<Tool[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showToolForm, setShowToolForm] = useState(false);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [toolToAddToAgent, setToolToAddToAgent] = useState<Tool | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadTools(), loadAgents(), loadSystemStatus()]);
    setLoading(false);
  };

  const loadTools = async () => {
    try {
      // Load regular tools
      const regularResult = await uaipAPI.tools.list();
      const regularTools = Array.isArray(regularResult)
        ? regularResult
        : regularResult?.data?.tools && Array.isArray(regularResult.data.tools)
          ? regularResult.data.tools
          : regularResult?.tools && Array.isArray(regularResult.tools)
            ? regularResult.tools
            : [];

      // Load MCP tools
      let mcpTools = [];
      try {
        const mcpResult = await uaipAPI.mcp.getTools();
        if (mcpResult?.tools) {
          mcpTools = mcpResult.tools.map((mcpTool) => ({
            id: mcpTool.id,
            name: mcpTool.name,
            description: mcpTool.description,
            category: mcpTool.category || 'mcp',
            version: '1.0.0',
            author: 'MCP Server',
            securityLevel: 'medium',
            requiresApproval: false,
            tags: ['mcp', mcpTool.serverName],
            totalExecutions: 0,
            successfulExecutions: 0,
            isEnabled: true,
            metadata: {
              mcpServer: mcpTool.serverName,
              command: mcpTool.command,
              parameters: mcpTool.parameters,
            },
          }));
        }
      } catch (mcpError) {
        console.warn('Failed to load MCP tools:', mcpError);
      }

      // Combine regular tools and MCP tools
      const allTools = [...regularTools, ...mcpTools];
      console.log('Loaded tools:', {
        regular: regularTools.length,
        mcp: mcpTools.length,
        total: allTools.length,
      });
      setTools(allTools);
    } catch (error) {
      console.error('Failed to load tools:', error);
      setTools([]);
    }
  };

  const loadAgents = async () => {
    try {
      const result = await uaipAPI.agents.list();
      // Handle different response structures
      const agentsArray = Array.isArray(result)
        ? result
        : result?.data?.agents && Array.isArray(result.data.agents)
          ? result.data.agents
          : result?.agents && Array.isArray(result.agents)
            ? result.agents
            : result?.data && Array.isArray(result.data)
              ? result.data
              : [];

      console.log('Loaded agents:', agentsArray);
      setAgents(agentsArray);
    } catch (error) {
      console.error('Failed to load agents:', error);
      setAgents([]);
    }
  };

  const loadSystemStatus = async () => {
    try {
      // Check if there's an MCP status method in uaipAPI, if not use direct fetch
      const response = await fetch('/api/v1/mcp/status');
      if (response.ok) {
        const result = await response.json();
        const mcpData = result.data;
        setSystemStatus({
          mcp: {
            status: mcpData.configExists ? 'active' : 'inactive',
            totalServers: mcpData.servers?.length || 0,
            runningServers: mcpData.servers?.filter((s: any) => s.status === 'running').length || 0,
            errorServers: mcpData.servers?.filter((s: any) => s.status === 'error').length || 0,
            totalTools: 0, // Will be calculated from actual tools
            servers: mcpData.servers || [],
          },
          oauth: {
            connectedProviders: 0,
            availableCapabilities: 0,
            providers: [],
          },
        });
      }
    } catch (error) {
      console.error('Failed to load system status:', error);
      setSystemStatus({
        mcp: {
          status: 'error',
          totalServers: 0,
          runningServers: 0,
          errorServers: 0,
          totalTools: 0,
          servers: [],
        },
        oauth: {
          connectedProviders: 0,
          availableCapabilities: 0,
          providers: [],
        },
      });
    }
  };

  const addToolToAgent = async (toolId: string, agentId: string) => {
    try {
      await uaipAPI.agents.addTool(agentId, toolId);

      // Refresh agents to show updated tool attachments
      await loadAgents();
      setShowAgentSelector(false);
      setToolToAddToAgent(null);
    } catch (error) {
      console.error('Failed to add tool to agent:', error);
      // Show user-friendly error message
      alert('Failed to add tool to agent. Please try again.');
    }
  };

  const removeToolFromAgent = async (toolId: string, agentId: string) => {
    try {
      await uaipAPI.agents.removeTool(agentId, toolId);

      await loadAgents();
    } catch (error) {
      console.error('Failed to remove tool from agent:', error);
      // Show user-friendly error message
      alert('Failed to remove tool from agent. Please try again.');
    }
  };

  const filteredTools = Array.isArray(tools)
    ? tools.filter((tool) => {
        if (!tool || typeof tool !== 'object') return false;

        const matchesSearch =
          (tool.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (tool.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (Array.isArray(tool.tags)
            ? tool.tags.some((tag) => (tag || '').toLowerCase().includes(searchQuery.toLowerCase()))
            : false);

        const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;

        return matchesSearch && matchesCategory;
      })
    : [];

  const categories = [
    'all',
    ...Array.from(
      new Set(Array.isArray(tools) ? tools.map((tool) => tool?.category).filter(Boolean) : [])
    ),
  ];

  const renderDiscoverTab = () => (
    <div className="space-y-6">
      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <ServerStackIcon className="w-5 h-5 text-blue-400" />
            <span className="text-sm text-gray-400">MCP Servers</span>
          </div>
          <div className="text-2xl font-bold text-white">{systemStatus?.mcp.totalServers || 0}</div>
          <div className="text-xs text-gray-500">
            {systemStatus?.mcp.runningServers || 0} running
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <WrenchScrewdriverIcon className="w-5 h-5 text-green-400" />
            <span className="text-sm text-gray-400">Available Tools</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {Array.isArray(tools) ? tools.length : 0}
          </div>
          <div className="text-xs text-gray-500">
            {Array.isArray(tools) ? tools.filter((t) => t?.isEnabled).length : 0} enabled
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <UserGroupIcon className="w-5 h-5 text-purple-400" />
            <span className="text-sm text-gray-400">Active Agents</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {Array.isArray(agents)
              ? agents.filter((a) => a?.status && ['active', 'busy', 'idle'].includes(a.status))
                  .length
              : 0}
          </div>
          <div className="text-xs text-gray-500">
            {Array.isArray(agents) ? agents.length : 0} total
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <CloudIcon className="w-5 h-5 text-orange-400" />
            <span className="text-sm text-gray-400">OAuth Providers</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {systemStatus?.oauth.connectedProviders || 0}
          </div>
          <div className="text-xs text-gray-500">connected</div>
        </div>
      </div>

      {/* MCP Servers & Tools Discovery */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">MCP Servers & Tools</h3>
          <div className="flex gap-2">
            <button
              onClick={() => {
                loadSystemStatus();
                loadTools(); // Also refresh tools when refreshing servers
              }}
              className="text-blue-400 hover:text-blue-300"
            >
              <ArrowPathIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                // Discover new MCP tools
                loadTools();
              }}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            >
              Discover Tools
            </button>
          </div>
        </div>

        {systemStatus?.mcp.servers && systemStatus.mcp.servers.length > 0 ? (
          <div className="space-y-4">
            {/* MCP Servers */}
            <div className="space-y-3">
              <h4 className="text-white font-medium mb-2">Configured Servers</h4>
              {systemStatus.mcp.servers.map((server) => {
                const serverTools = Array.isArray(tools)
                  ? tools.filter((tool) => tool.metadata?.mcpServer === server.name)
                  : [];
                return (
                  <div key={server.name} className="bg-gray-700 p-4 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start space-x-3">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            server.status === 'running'
                              ? 'bg-green-400'
                              : server.status === 'error'
                                ? 'bg-red-400'
                                : server.status === 'starting'
                                  ? 'bg-yellow-400'
                                  : 'bg-gray-400'
                          }`}
                        />
                        <div>
                          <div className="text-white font-medium">{server.name}</div>
                          <div className="text-sm text-gray-400">
                            {server.command} {server.args.join(' ')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-blue-600 text-blue-200 px-2 py-1 rounded">
                          {serverTools.length} tools
                        </span>
                        <span className="text-sm text-gray-400 capitalize">{server.status}</span>
                        {server.disabled && (
                          <span className="text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded">
                            Disabled
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Show available tools for this server */}
                    {serverTools.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-600">
                        <div className="flex flex-wrap gap-2">
                          {serverTools.map((tool) => (
                            <span
                              key={tool.id}
                              className="text-xs bg-gray-600 text-gray-200 px-2 py-1 rounded cursor-pointer hover:bg-gray-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTool(tool);
                              }}
                            >
                              {tool.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Available MCP Tools Summary */}
            {Array.isArray(tools) && tools.filter((tool) => tool.category === 'mcp').length > 0 && (
              <div className="bg-gray-700 p-4 rounded-lg">
                <h4 className="text-white font-medium mb-2">Available MCP Tools</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {tools
                    .filter((tool) => tool.category === 'mcp')
                    .map((tool) => (
                      <button
                        key={tool.id}
                        onClick={() => {
                          setSelectedTool(tool);
                          setActiveTab('manage');
                        }}
                        className="text-left p-2 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
                      >
                        <div className="text-white font-medium">{tool.name}</div>
                        <div className="text-gray-400 text-xs">{tool.metadata?.mcpServer}</div>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <ServerStackIcon className="w-12 h-12 mx-auto mb-4 text-gray-500" />
            <p className="text-gray-400 mb-4">No MCP servers configured</p>
          </div>
        )}
      </div>

      {/* MCP Configuration Upload */}
      <MCPConfigUpload
        onUploadSuccess={(config) => {
          console.log('MCP config uploaded:', config);
          loadSystemStatus();
          loadTools();
        }}
        onUploadError={(error) => {
          console.error('MCP config upload failed:', error);
        }}
        className="bg-gray-800"
      />
    </div>
  );

  const renderManageTab = () => (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category === 'all'
                ? 'All Categories'
                : category.charAt(0).toUpperCase() + category.slice(1)}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowToolForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          Add Tool
        </button>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTools.map((tool) => (
          <motion.div
            key={tool.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800 rounded-lg p-6 hover:bg-gray-750 transition-colors cursor-pointer"
            onClick={() => setSelectedTool(tool)}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <WrenchScrewdriverIcon className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-white">{tool.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    tool.securityLevel === 'critical'
                      ? 'bg-red-900 text-red-300'
                      : tool.securityLevel === 'high'
                        ? 'bg-orange-900 text-orange-300'
                        : tool.securityLevel === 'medium'
                          ? 'bg-yellow-900 text-yellow-300'
                          : 'bg-green-900 text-green-300'
                  }`}
                >
                  {tool.securityLevel}
                </span>
                {!tool.isEnabled && (
                  <span className="text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded">
                    Disabled
                  </span>
                )}
              </div>
            </div>

            <p className="text-gray-400 text-sm mb-4 line-clamp-2">{tool.description}</p>

            <div className="flex items-center justify-between mb-3">
              <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                {tool.category}
              </span>
              <span className="text-xs text-gray-500">v{tool.version}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{tool.totalExecutions} runs</span>
                {tool.lastUsedAt && (
                  <span>Last: {new Date(tool.lastUsedAt).toLocaleDateString()}</span>
                )}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setToolToAddToAgent(tool);
                  setShowAgentSelector(true);
                }}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors flex items-center gap-1"
              >
                <UserGroupIcon className="w-3 h-3" />
                Add to Agent
              </button>
            </div>

            {/* Tool type and source indicator */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {tool.category === 'mcp' && (
                  <span className="bg-blue-600 text-blue-200 px-2 py-1 rounded">MCP Tool</span>
                )}
                {tool.metadata?.mcpServer && (
                  <span className="text-gray-400">Server: {tool.metadata.mcpServer}</span>
                )}
              </div>
            </div>

            {/* Agent attachments */}
            {agents.some((agent) =>
              agent.assignedMCPTools?.some((mcpTool) => mcpTool.toolId === tool.id)
            ) && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <LinkIcon className="w-3 h-3" />
                  <span>
                    Used by:{' '}
                    {agents
                      .filter((agent) =>
                        agent.assignedMCPTools?.some((mcpTool) => mcpTool.toolId === tool.id)
                      )
                      .map((agent) => agent.name)
                      .join(', ')}
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {filteredTools.length === 0 && (
        <div className="text-center py-12">
          <WrenchScrewdriverIcon className="w-12 h-12 mx-auto mb-4 text-gray-500" />
          <p className="text-gray-400 mb-2">No tools found</p>
          <p className="text-gray-500 text-sm">
            {searchQuery
              ? 'Try adjusting your search or filters'
              : 'Add your first tool to get started'}
          </p>
        </div>
      )}
    </div>
  );

  const renderMonitorTab = () => (
    <div className="space-y-6">
      {/* Monitoring Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="flex items-center gap-3 mb-4">
            <ChartBarIcon className="w-6 h-6 text-green-400" />
            <h3 className="text-lg font-semibold text-white">Execution Stats</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Executions:</span>
              <span className="text-white">
                {Array.isArray(tools)
                  ? tools.reduce((sum, tool) => sum + (tool?.totalExecutions || 0), 0)
                  : 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Success Rate:</span>
              <span className="text-green-400">
                {Array.isArray(tools) && tools.length > 0
                  ? Math.round(
                      (tools.reduce((sum, tool) => sum + (tool?.successfulExecutions || 0), 0) /
                        Math.max(
                          tools.reduce((sum, tool) => sum + (tool?.totalExecutions || 0), 0),
                          1
                        )) *
                        100
                    )
                  : 0}
                %
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="flex items-center gap-3 mb-4">
            <ClockIcon className="w-6 h-6 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
          </div>
          <div className="space-y-2">
            {Array.isArray(tools)
              ? tools
                  .filter((tool) => tool?.lastUsedAt)
                  .slice(0, 3)
                  .map((tool) => (
                    <div key={tool.id} className="text-sm">
                      <div className="text-white">{tool.name}</div>
                      <div className="text-gray-400">
                        {new Date(tool.lastUsedAt!).toLocaleString()}
                      </div>
                    </div>
                  ))
              : null}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="flex items-center gap-3 mb-4">
            <ExclamationTriangleIcon className="w-6 h-6 text-yellow-400" />
            <h3 className="text-lg font-semibold text-white">Alerts</h3>
          </div>
          <div className="space-y-2 text-sm">
            {Array.isArray(tools) && tools.filter((tool) => !tool?.isEnabled).length > 0 && (
              <div className="text-yellow-400">
                {tools.filter((tool) => !tool?.isEnabled).length} tools disabled
              </div>
            )}
            {systemStatus?.mcp.errorServers > 0 && (
              <div className="text-red-400">
                {systemStatus.mcp.errorServers} MCP servers with errors
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Tools */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Most Used Tools</h3>
        <div className="space-y-3">
          {tools
            .sort((a, b) => b.totalExecutions - a.totalExecutions)
            .slice(0, 10)
            .map((tool, index) => (
              <div key={tool.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm w-6">#{index + 1}</span>
                  <div>
                    <div className="text-white">{tool.name}</div>
                    <div className="text-gray-400 text-sm">{tool.category}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white">{tool.totalExecutions}</div>
                  <div className="text-gray-400 text-sm">executions</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="bg-gray-900 text-white p-8 rounded-lg">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <span className="ml-3">Loading unified tool portal...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 text-white p-6 rounded-lg max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Tool Management</h1>
            <p className="text-gray-400">
              Discover integrations, manage tools, and monitor performance
            </p>
          </div>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-4 mb-6 border-b border-gray-700">
        {[
          {
            id: 'discover',
            label: 'Discover',
            icon: ServerStackIcon,
            description: 'MCP servers & integrations',
          },
          {
            id: 'manage',
            label: 'Manage',
            icon: WrenchScrewdriverIcon,
            description: 'Tool CRUD operations',
          },
          {
            id: 'monitor',
            label: 'Monitor',
            icon: ChartBarIcon,
            description: 'Performance & analytics',
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-6 py-3 font-medium text-sm transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <div className="text-left">
              <div>{tab.label}</div>
              <div className="text-xs text-gray-500">{tab.description}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'discover' && renderDiscoverTab()}
          {activeTab === 'manage' && renderManageTab()}
          {activeTab === 'monitor' && renderMonitorTab()}
        </motion.div>
      </AnimatePresence>

      {/* Agent Selector Modal */}
      {showAgentSelector && toolToAddToAgent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Add to Agent</h2>
              <button
                onClick={() => {
                  setShowAgentSelector(false);
                  setToolToAddToAgent(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <p className="text-gray-400 mb-4">
              Select which agent to add "{toolToAddToAgent.name}" to:
            </p>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {agents.map((agent) => {
                const hasThisTool =
                  agent.assignedMCPTools?.some(
                    (mcpTool) => mcpTool.toolId === toolToAddToAgent.id
                  ) || false;
                const isOnline = ['active', 'busy', 'idle'].includes(agent.status);
                return (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-3 bg-gray-700 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-400' : 'bg-gray-400'}`}
                      />
                      <div>
                        <div className="text-white font-medium">{agent.name}</div>
                        <div className="text-gray-400 text-sm">
                          {agent.assignedMCPTools?.length || 0} tools attached
                        </div>
                      </div>
                    </div>

                    {hasThisTool ? (
                      <button
                        onClick={() => removeToolFromAgent(toolToAddToAgent.id, agent.id)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        onClick={() => addToolToAgent(toolToAddToAgent.id, agent.id)}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                      >
                        Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {agents.length === 0 && (
              <div className="text-center py-8">
                <UserGroupIcon className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                <p className="text-gray-400">No agents available</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tool Detail Modal */}
      {selectedTool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{selectedTool.name}</h2>
              <button
                onClick={() => setSelectedTool(null)}
                className="text-gray-400 hover:text-white"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <p className="text-gray-400 mb-6">{selectedTool.description}</p>

            {/* Tool Details */}
            <div className="bg-gray-900 p-4 rounded-lg mb-6">
              <h3 className="text-white font-medium mb-3">Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Category:</span>
                  <span className="text-white ml-2">{selectedTool.category}</span>
                </div>
                <div>
                  <span className="text-gray-400">Version:</span>
                  <span className="text-white ml-2">{selectedTool.version}</span>
                </div>
                <div>
                  <span className="text-gray-400">Security:</span>
                  <span
                    className={`ml-2 ${
                      selectedTool.securityLevel === 'critical'
                        ? 'text-red-400'
                        : selectedTool.securityLevel === 'high'
                          ? 'text-orange-400'
                          : selectedTool.securityLevel === 'medium'
                            ? 'text-yellow-400'
                            : 'text-green-400'
                    }`}
                  >
                    {selectedTool.securityLevel}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Executions:</span>
                  <span className="text-white ml-2">{selectedTool.totalExecutions}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setToolToAddToAgent(selectedTool);
                  setShowAgentSelector(true);
                  setSelectedTool(null);
                }}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <UserGroupIcon className="w-4 h-4" />
                Add to Agent
              </button>

              <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors">
                Test Tool
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedToolPortal;
