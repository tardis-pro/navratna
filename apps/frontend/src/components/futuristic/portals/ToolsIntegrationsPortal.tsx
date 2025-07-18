// Tools & Integrations Portal - Dynamic Discovery Interface
// Automatically discovers and displays MCP tools and OAuth capabilities
// Clean, robust implementation with proper error handling

import React, { useState, useEffect } from 'react';
import { uaipAPI } from '@/utils/uaip-api';
import MCPConfigUpload from '@/components/MCPConfigUpload';

interface MCPServer {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'starting';
  pid?: number;
  toolCount: number;
  uptime: number;
  lastHealthCheck?: string;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema?: any;
  serverName: string;
}

interface OAuthProvider {
  id: string;
  name: string;
  capabilities: number;
  webhookSupport: boolean;
}

interface OAuthCapability {
  action: string;
  name: string;
  description: string;
  category: string;
  parameters?: any;
  scopes?: string[];
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
    providers: OAuthProvider[];
  };
}

export const ToolsIntegrationsPortal: React.FC = () => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [availableTools, setAvailableTools] = useState<any[]>([]);
  const [selectedTool, setSelectedTool] = useState<any | null>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'mcp' | 'oauth' | 'tools'>('mcp');
  const [toolRecommendations, setToolRecommendations] = useState<any[]>([]);

  useEffect(() => {
    loadSystemStatus();
    loadAvailableTools();
  }, []);

  const loadSystemStatus = async () => {
    try {
      // Load MCP status using direct fetch with error handling
      const response = await fetch('/api/v1/mcp/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`MCP status check failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to get MCP status');
      }

      // Transform the MCP status into the expected system status format
      const mcpData = result.data;
      const systemStatus: SystemStatus = {
        mcp: {
          status: mcpData.configExists ? 'active' : 'inactive',
          totalServers: mcpData.servers?.length || 0,
          runningServers: mcpData.servers?.filter((s: any) => s.status === 'running').length || 0,
          errorServers: mcpData.servers?.filter((s: any) => s.status === 'error').length || 0,
          totalTools: mcpData.servers?.reduce((total: number, server: any) => total + (server.toolCount || 0), 0) || 0,
          servers: mcpData.servers?.map((server: any) => ({
            name: server.name,
            status: server.status as 'running' | 'stopped' | 'error' | 'starting',
            pid: undefined,
            toolCount: 0, // Will be populated from actual MCP tools discovery
            uptime: 0,    // Will be populated from server process monitoring
            lastHealthCheck: new Date().toISOString()
          })) || []
        },
        oauth: {
          connectedProviders: 0, // Placeholder - OAuth integration to be implemented
          availableCapabilities: 0,
          providers: []
        }
      };
      
      setSystemStatus(systemStatus);
    } catch (error) {
      console.error('Failed to load system status:', error);
      // Set a fallback status to prevent UI from breaking
      setSystemStatus({
        mcp: {
          status: 'error',
          totalServers: 0,
          runningServers: 0,
          errorServers: 0,
          totalTools: 0,
          servers: []
        },
        oauth: {
          connectedProviders: 0,
          availableCapabilities: 0,
          providers: []
        }
      });
    }
  };

  const loadAvailableTools = async () => {
    try {
      // Load tools using direct fetch call for better error handling
      const response = await fetch('/api/v1/tools', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Tools API failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to load tools');
      }

      setAvailableTools(result.data?.tools || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load available tools:', error);
      setAvailableTools([]);
      setLoading(false);
    }
  };

  const executeTool = async (tool: any, parameters: any) => {
    try {
      const result = await uaipAPI.tools.execute(tool.id, {
        agentId: 'system', // System execution
        parameters
      });
      setExecutionResult(result);
    } catch (error) {
      console.error('Tool execution failed:', error);
      setExecutionResult({ error: error.message });
    }
  };

  const connectOAuthProvider = async (provider: string) => {
    try {
      // Redirect to OAuth flow
      window.location.href = `/api/v1/auth/oauth/${provider}`;
    } catch (error) {
      console.error(`Failed to connect ${provider}:`, error);
    }
  };

  const loadToolRecommendations = async (toolId: string) => {
    try {
      const response = await fetch(`/api/v1/mcp/tools/${toolId}/recommendations`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setToolRecommendations(result.data.recommendations || []);
        }
      }
    } catch (error) {
      console.error('Failed to load tool recommendations:', error);
      setToolRecommendations([]);
    }
  };

  const renderMCPTab = () => {
    if (!systemStatus?.mcp) {
      return (
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            Loading MCP status...
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* MCP System Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Total Servers</div>
            <div className="text-2xl font-bold text-white">{systemStatus.mcp.totalServers}</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Running</div>
            <div className="text-2xl font-bold text-green-400">{systemStatus.mcp.runningServers}</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Errors</div>
            <div className="text-2xl font-bold text-red-400">{systemStatus.mcp.errorServers}</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Total Tools</div>
            <div className="text-2xl font-bold text-blue-400">{systemStatus.mcp.totalTools}</div>
          </div>
        </div>

        {/* MCP Servers List */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">MCP Servers</h3>
          
          {systemStatus.mcp.servers && systemStatus.mcp.servers.length > 0 ? (
            <div className="space-y-4">
              {systemStatus.mcp.servers.map((server) => (
              <div key={server.name} className="bg-gray-700 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      server.status === 'running' ? 'bg-green-400' :
                      server.status === 'error' ? 'bg-red-400' :
                      server.status === 'starting' ? 'bg-yellow-400' : 'bg-gray-400'
                    }`} />
                    <div>
                      <div className="text-white font-medium">{server.name}</div>
                      <div className="text-sm text-gray-400">
                        {server.toolCount} tools • PID: {server.pid || 'N/A'} • 
                        Uptime: {Math.floor((server.uptime || 0) / 1000)}s
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-400 capitalize">{server.status}</div>
                </div>
              </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-gray-400 mb-4">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                No MCP servers configured
              </div>
              <p className="text-gray-500 text-sm mb-4">
                Upload an MCP configuration file below to start adding servers and tools.
              </p>
            </div>
          )}
        </div>

        {/* MCP Configuration Upload */}
        <MCPConfigUpload 
          onUploadSuccess={(config) => {
            console.log('MCP config uploaded successfully:', config);
            loadSystemStatus(); // Refresh system status after upload
            loadAvailableTools(); // Refresh tools list
          }}
          onUploadError={(error) => {
            console.error('MCP config upload failed:', error);
          }}
          className="bg-gray-800"
        />
      </div>
    );
  };

  const renderOAuthTab = () => {
    if (!systemStatus?.oauth) return <div>Loading OAuth status...</div>;

    const availableProviders = [
      { name: 'GitHub', id: 'github', description: 'Repository management, issues, pull requests' },
      { name: 'Gmail', id: 'gmail', description: 'Email management, search, sending' },
    ];

    return (
      <div className="space-y-6">
        {/* OAuth System Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Connected Providers</div>
            <div className="text-2xl font-bold text-white">{systemStatus.oauth.connectedProviders}</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Available Actions</div>
            <div className="text-2xl font-bold text-blue-400">{systemStatus.oauth.availableCapabilities}</div>
          </div>
        </div>

        {/* Connected Providers */}
        {systemStatus.oauth.providers.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Connected Providers</h3>
            <div className="space-y-4">
              {systemStatus.oauth.providers.map((provider) => (
                <div key={provider.id} className="bg-gray-700 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-green-400 rounded-full" />
                      <div>
                        <div className="text-white font-medium">{provider.name}</div>
                        <div className="text-sm text-gray-400">
                          {provider.capabilities} actions available
                          {provider.webhookSupport && ' • Webhook support'}
                        </div>
                      </div>
                    </div>
                    <button className="text-red-400 hover:text-red-300 text-sm">
                      Disconnect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Providers */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Available Providers</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableProviders.map((provider) => {
              const isConnected = systemStatus.oauth.providers.some(p => p.name.toLowerCase() === provider.id);
              
              return (
                <div key={provider.id} className="bg-gray-700 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-white font-medium">{provider.name}</h4>
                    <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-gray-400'}`} />
                  </div>
                  <p className="text-sm text-gray-400 mb-4">{provider.description}</p>
                  <button
                    onClick={() => connectOAuthProvider(provider.id)}
                    disabled={isConnected}
                    className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      isConnected
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isConnected ? 'Connected' : 'Connect'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderToolsTab = () => {
    if (!availableTools || !Array.isArray(availableTools)) {
      return (
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            Loading tools...
          </div>
        </div>
      );
    }

    const mcpTools = availableTools.filter(tool => tool.category === 'mcp');
    const oauthTools = availableTools.filter(tool => tool.category === 'oauth');
    const otherTools = availableTools.filter(tool => !['mcp', 'oauth'].includes(tool.category));

    return (
      <div className="space-y-6">
        {/* Tools Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">MCP Tools</div>
            <div className="text-2xl font-bold text-purple-400">{mcpTools.length}</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">OAuth Actions</div>
            <div className="text-2xl font-bold text-blue-400">{oauthTools.length}</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">System Tools</div>
            <div className="text-2xl font-bold text-green-400">{otherTools.length}</div>
          </div>
        </div>

        {/* Tool Categories */}
        {mcpTools.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">MCP Tools</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mcpTools.map((tool) => (
                <div key={tool.id} className="bg-gray-700 p-4 rounded-lg hover:bg-gray-600 cursor-pointer transition-colors"
                     onClick={() => setSelectedTool(tool)}>
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-white font-medium">{tool.name}</h4>
                    <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded">MCP</span>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">{tool.description}</p>
                  <div className="text-xs text-gray-500">
                    Server: {tool.metadata?.mcpServer || 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {oauthTools.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">OAuth Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {oauthTools.map((tool) => (
                <div key={tool.id} className="bg-gray-700 p-4 rounded-lg hover:bg-gray-600 cursor-pointer transition-colors"
                     onClick={() => setSelectedTool(tool)}>
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-white font-medium">{tool.name}</h4>
                    <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">OAuth</span>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">{tool.description}</p>
                  <div className="text-xs text-gray-500">
                    Provider: {tool.metadata?.oauthProvider || 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {otherTools.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">System Tools</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherTools.map((tool) => (
                <div key={tool.id} className="bg-gray-700 p-4 rounded-lg hover:bg-gray-600 cursor-pointer transition-colors"
                     onClick={() => setSelectedTool(tool)}>
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-white font-medium">{tool.name}</h4>
                    <span className="text-xs bg-green-600 text-white px-2 py-1 rounded capitalize">
                      {tool.category}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">{tool.description}</p>
                  <div className="text-xs text-gray-500">
                    v{tool.version}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-gray-900 text-white p-8 rounded-lg">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <span className="ml-3">Loading tools and integrations...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 text-white p-6 rounded-lg max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Tools & Integrations</h1>
            <p className="text-gray-400">
              Manage MCP servers, OAuth providers, and discover available tools.
            </p>
          </div>
          <button
            onClick={() => {
              loadSystemStatus();
              loadAvailableTools();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
        
        {/* System Status Indicator */}
        {systemStatus && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                systemStatus.mcp.status === 'active' ? 'bg-green-400' : 
                systemStatus.mcp.status === 'error' ? 'bg-red-400' : 'bg-yellow-400'
              }`}></div>
              <span className="text-gray-300">
                MCP: {systemStatus.mcp.totalServers} servers, {systemStatus.mcp.totalTools} tools
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                systemStatus.oauth.connectedProviders > 0 ? 'bg-green-400' : 'bg-gray-400'
              }`}></div>
              <span className="text-gray-300">
                OAuth: {systemStatus.oauth.connectedProviders} connected
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-4 mb-6 border-b border-gray-700">
        {[
          { id: 'mcp', label: 'MCP Servers', count: systemStatus?.mcp.totalServers },
          { id: 'oauth', label: 'OAuth Providers', count: systemStatus?.oauth.connectedProviders },
          { id: 'tools', label: 'Available Tools', count: availableTools?.length }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-2 text-xs bg-gray-700 px-2 py-1 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'mcp' && renderMCPTab()}
      {activeTab === 'oauth' && renderOAuthTab()}
      {activeTab === 'tools' && renderToolsTab()}

      {/* Tool Execution Modal */}
      {selectedTool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{selectedTool.name}</h2>
              <button
                onClick={() => setSelectedTool(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-gray-400 mb-6">{selectedTool.description}</p>
            
            {/* Tool metadata */}
            <div className="bg-gray-900 p-4 rounded-lg mb-6">
              <h3 className="text-white font-medium mb-2">Tool Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Category:</span>
                  <span className="text-white capitalize">{selectedTool.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Version:</span>
                  <span className="text-white">{selectedTool.version}</span>
                </div>
                {selectedTool.metadata?.mcpServer && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">MCP Server:</span>
                    <span className="text-white">{selectedTool.metadata.mcpServer}</span>
                  </div>
                )}
                {selectedTool.metadata?.oauthProvider && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">OAuth Provider:</span>
                    <span className="text-white">{selectedTool.metadata.oauthProvider}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Security Level:</span>
                  <span className={`text-white ${
                    selectedTool.securityLevel === 'critical' ? 'text-red-400' :
                    selectedTool.securityLevel === 'high' ? 'text-orange-400' :
                    selectedTool.securityLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    {selectedTool.securityLevel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Executions:</span>
                  <span className="text-white">{selectedTool.totalExecutions || 0}</span>
                </div>
              </div>
            </div>

            {/* Tool Recommendations for MCP tools */}
            {selectedTool.category === 'mcp' && (
              <div className="bg-gray-900 p-4 rounded-lg mb-6">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-white font-medium">Related Tools</h3>
                  <button
                    onClick={() => loadToolRecommendations(selectedTool.id)}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Refresh
                  </button>
                </div>
                
                {toolRecommendations.length > 0 ? (
                  <div className="space-y-2">
                    {toolRecommendations.map((rec, index) => (
                      <div key={index} className="flex justify-between items-center text-sm">
                        <div>
                          <span className="text-white">{rec.name}</span>
                          <span className="text-gray-400 ml-2">({rec.relationshipType})</span>
                        </div>
                        <span className="text-gray-500">
                          {Math.round((rec.weight || 0) * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() => loadToolRecommendations(selectedTool.id)}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Load recommendations →
                  </button>
                )}
              </div>
            )}

            {/* Quick execute button */}
            <button
              onClick={() => executeTool(selectedTool, {})}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
            >
              Execute Tool
            </button>

            {/* Execution result */}
            {executionResult && (
              <div className="mt-6 bg-gray-900 p-4 rounded-lg">
                <h3 className="text-white font-medium mb-2">Execution Result</h3>
                <pre className="text-sm text-gray-300 overflow-x-auto">
                  {JSON.stringify(executionResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolsIntegrationsPortal;