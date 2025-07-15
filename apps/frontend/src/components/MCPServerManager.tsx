// MCP Server Manager Component for Navratna
// Interface for managing MCP servers and their configurations

import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { 
  MCPServerInstance, 
  MCPServerConfig, 
  MCPServerPreset,
  MCPServerCapabilities 
} from '../types/mcp';
import { mcpServerManager } from '../services/mcp/mcp-server-manager';
import { mcpServerPresets, getMCPServerPreset } from '../services/mcp/mcp-server-presets';
import { mcpToolBridge } from '../services/mcp/mcp-tool-bridge';
import {
  Play,
  Square,
  RotateCcw,
  Plus,
  Settings,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  Tool,
  Server,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export const MCPServerManager: React.FC = () => {
  const [servers, setServers] = useState<MCPServerInstance[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customConfig, setCustomConfig] = useState<Partial<MCPServerConfig>>({});
  const [loading, setLoading] = useState(true);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadServers();
    
    // Set up event listener for server status changes
    const handleServerEvent = () => {
      loadServers();
    };
    
    mcpServerManager.addEventListener(handleServerEvent);
    
    return () => {
      mcpServerManager.removeEventListener(handleServerEvent);
    };
  }, []);

  const loadServers = async () => {
    try {
      const allServers = await mcpServerManager.getAllServers();
      setServers(allServers);
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartServer = async (serverId: string) => {
    try {
      await mcpServerManager.start(serverId);
      await loadServers();
    } catch (error) {
      console.error(`Failed to start server ${serverId}:`, error);
      alert(`Failed to start server: ${error}`);
    }
  };

  const handleStopServer = async (serverId: string) => {
    try {
      await mcpServerManager.stop(serverId);
      await loadServers();
    } catch (error) {
      console.error(`Failed to stop server ${serverId}:`, error);
      alert(`Failed to stop server: ${error}`);
    }
  };

  const handleRestartServer = async (serverId: string) => {
    try {
      await mcpServerManager.restart(serverId);
      await loadServers();
    } catch (error) {
      console.error(`Failed to restart server ${serverId}:`, error);
      alert(`Failed to restart server: ${error}`);
    }
  };

  const handleCreateFromPreset = async () => {
    if (!selectedPreset) return;

    const preset = getMCPServerPreset(selectedPreset);
    if (!preset) return;

    const config: MCPServerConfig = {
      ...preset.config,
      id: crypto.randomUUID(),
      enabled: true,
      ...customConfig
    };

    try {
      mcpServerManager.registerServer(config);
      await loadServers();
      setShowCreateForm(false);
      setSelectedPreset('');
      setCustomConfig({});
    } catch (error) {
      console.error('Failed to create MCP server:', error);
      alert(`Failed to create server: ${error}`);
    }
  };

  const getStatusIcon = (status: MCPServerInstance['status']) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'stopped':
        return <Square className="w-4 h-4 text-gray-500" />;
      case 'starting':
        return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'stopping':
        return <Clock className="w-4 h-4 text-orange-500 animate-spin" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: MCPServerInstance['status']) => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-800';
      case 'stopped':
        return 'bg-gray-100 text-gray-800';
      case 'starting':
        return 'bg-blue-100 text-blue-800';
      case 'stopping':
        return 'bg-orange-100 text-orange-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const formatUptime = (startTime?: Date) => {
    if (!startTime) return 'N/A';
    const uptime = Date.now() - startTime.getTime();
    const minutes = Math.floor(uptime / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const toggleServerExpanded = (serverId: string) => {
    const newExpanded = new Set(expandedServers);
    if (newExpanded.has(serverId)) {
      newExpanded.delete(serverId);
    } else {
      newExpanded.add(serverId);
    }
    setExpandedServers(newExpanded);
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <Clock className="w-6 h-6 animate-spin mr-2" />
          Loading MCP servers...
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold">MCP Server Manager</h3>
          </div>
          
          <Button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </Button>
        </div>

        {/* Server List */}
        <div className="space-y-2">
          {servers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No MCP servers configured. Add one from presets to get started.
            </div>
          ) : (
            servers.map(server => (
              <div key={server.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(server.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{server.config.name}</span>
                        <Badge className={getStatusColor(server.status)}>
                          {server.status}
                        </Badge>
                        <Badge variant="outline">{server.config.type}</Badge>
                      </div>
                      <p className="text-sm text-gray-600">{server.config.description}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {server.status === 'running' ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRestartServer(server.id)}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Restart
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStopServer(server.id)}
                        >
                          <Square className="w-3 h-3 mr-1" />
                          Stop
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleStartServer(server.id)}
                        disabled={server.status === 'starting'}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Start
                      </Button>
                    )}
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleServerExpanded(server.id)}
                    >
                      {expandedServers.has(server.id) ? 
                        <ChevronUp className="w-4 h-4" /> : 
                        <ChevronDown className="w-4 h-4" />
                      }
                    </Button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedServers.has(server.id) && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Command:</span>
                        <code className="ml-2 bg-gray-100 px-1 rounded">
                          {server.config.command} {server.config.args.join(' ')}
                        </code>
                      </div>
                      <div>
                        <span className="font-medium">Uptime:</span>
                        <span className="ml-2">{formatUptime(server.startTime)}</span>
                      </div>
                      {server.pid && (
                        <div>
                          <span className="font-medium">PID:</span>
                          <span className="ml-2">{server.pid}</span>
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Requests:</span>
                        <span className="ml-2">{server.stats.requestCount}</span>
                      </div>
                    </div>

                    {server.error && (
                      <div className="bg-red-50 border border-red-200 rounded p-2">
                        <div className="flex items-center gap-2 text-red-800">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="font-medium">Error:</span>
                        </div>
                        <p className="text-red-700 text-sm mt-1">{server.error}</p>
                      </div>
                    )}

                    {server.config.env && Object.keys(server.config.env).length > 0 && (
                      <div>
                        <span className="font-medium text-sm">Environment Variables:</span>
                        <div className="mt-1 space-y-1">
                          {Object.entries(server.config.env).map(([key, value]) => (
                            <div key={key} className="text-xs bg-gray-50 p-1 rounded">
                              <code>{key}={value.startsWith('<') ? '[CONFIGURED]' : value}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Create Server Form */}
      {showCreateForm && (
        <Card className="p-4">
          <h4 className="font-semibold mb-4">Add MCP Server</h4>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Choose Preset</label>
              <select
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Select a preset...</option>
                {mcpServerPresets.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} - {preset.description}
                  </option>
                ))}
              </select>
            </div>

            {selectedPreset && (
              <>
                {getMCPServerPreset(selectedPreset)?.setupInstructions && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3">
                    <div className="flex items-center gap-2 text-blue-800 mb-2">
                      <Settings className="w-4 h-4" />
                      <span className="font-medium">Setup Instructions</span>
                    </div>
                    <p className="text-blue-700 text-sm">
                      {getMCPServerPreset(selectedPreset)?.setupInstructions}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">Custom Name (optional)</label>
                  <Input
                    value={customConfig.name || ''}
                    onChange={(e) => setCustomConfig({...customConfig, name: e.target.value})}
                    placeholder="Leave empty to use preset name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Custom Arguments (optional)</label>
                  <Textarea
                    value={customConfig.args?.join(' ') || ''}
                    onChange={(e) => setCustomConfig({
                      ...customConfig, 
                      args: e.target.value.split(' ').filter(arg => arg.trim())
                    })}
                    placeholder="Override preset arguments (space-separated)"
                    rows={2}
                  />
                </div>
              </>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleCreateFromPreset}
                disabled={!selectedPreset}
              >
                Create Server
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateForm(false);
                  setSelectedPreset('');
                  setCustomConfig({});
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Quick Stats */}
      <Card className="p-4">
        <h4 className="font-semibold mb-3">Quick Stats</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {servers.length}
            </div>
            <div className="text-sm text-gray-600">Total Servers</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {servers.filter(s => s.status === 'running').length}
            </div>
            <div className="text-sm text-gray-600">Running</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {servers.reduce((sum, s) => sum + s.stats.requestCount, 0)}
            </div>
            <div className="text-sm text-gray-600">Total Requests</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {mcpToolBridge.getBridgeStats().totalBridgedTools}
            </div>
            <div className="text-sm text-gray-600">Available Tools</div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default MCPServerManager; 