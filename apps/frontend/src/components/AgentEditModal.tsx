import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Agent, CreateAgentRequest, AgentSkill } from '@uaip/types';
import { uaipAPI } from '../utils/uaip_api';
import { edenRequest } from '../api/eden';
import { _llmAPI } from '../api/llm_api';
import { useAgents } from '../contexts/AgentContext';
import {
  X,
  Save,
  Eye,
  EyeOff,
  Settings,
  User,
  Zap,
  MessageSquare,
  Bot,
  _Palette,
  _Brain,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Cpu,
  Plus,
  Trash2,
} from 'lucide-react';

import { Sparkles } from 'lucide-react';
import { logger } from '@/utils/browser_logger';

interface AgentEditModalProps {
  agentId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (agentId: string, updates: Partial<Agent>) => void;
}

interface TabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<unknown>;
  gradient: string;
}

// LLM Task Types for preferences
const LLM_TASK_TYPES = [
  { value: 'reasoning', label: 'Reasoning & Analysis' },
  { value: 'code_generation', label: 'Code Generation' },
  { value: 'creative_writing', label: 'Creative Writing' },
  { value: 'summarization', label: 'Summarization' },
  { value: 'classification', label: 'Classification' },
  { value: 'translation', label: 'Translation' },
  { value: 'tool_calling', label: 'Tool Calling' },
  { value: 'vision', label: 'Vision Analysis' },
];

// LLM Provider Types
const LLM_PROVIDER_TYPES = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'llmstudio', label: 'LLM Studio' },
  { value: 'custom', label: 'Custom' },
];

interface AgentLLMPreference {
  id?: string;
  taskType: string;
  preferredProvider: string;
  preferredModel: string;
  fallbackModel?: string;
  settings?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    systemPrompt?: string;
  };
  isActive: boolean;
  priority: number;
}

const tabs: TabConfig[] = [
  { id: 'basic', label: 'Basic', icon: User, gradient: 'from-blue-500 to-cyan-500' },
  { id: 'advanced', label: 'Advanced', icon: Settings, gradient: 'from-purple-500 to-pink-500' },
  {
    id: 'llm-preferences',
    label: 'LLM Preferences',
    icon: Cpu,
    gradient: 'from-pink-500 to-rose-500',
  },
  { id: 'tools', label: 'Tools', icon: Zap, gradient: 'from-orange-500 to-red-500' },
  {
    id: 'chat',
    label: 'Chat Config',
    icon: MessageSquare,
    gradient: 'from-green-500 to-emerald-500',
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: Sparkles,
    gradient: 'from-violet-500 to-purple-500',
  },
];

export const AgentEditModal: React.FC<AgentEditModalProps> = ({
  agentId,
  isOpen,
  onClose,
  onSave,
}) => {
  const { refetchAgents, modelState, agents } = useAgents();
  const [activeTab, setActiveTab] = useState('basic');
  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<CreateAgentRequest>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [llmPreferences, setLlmPreferences] = useState<AgentLLMPreference[]>([]);

  const agent = agents?.[agentId];

  useEffect(() => {
    if (agent && isOpen) {
      setFormData({
        name: agent.name,
        role: agent.role,
        personaId: agent.personaId,
        intelligenceConfig: agent.intelligenceConfig || {},
        securityContext: agent.securityContext || {},
        capabilities: agent.capabilities || [],
        tags: agent.tags || [],
        metadata: agent.metadata || {},
        preferences: agent.preferences || {},
        configuration: agent.configuration || {},
        toolPermissions: agent.toolPermissions || {},
        toolPreferences: agent.toolPreferences || {},
        modelId: agent.modelId,
        apiType: agent.apiType,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        systemPrompt: agent.systemPrompt,
        skills: (agent as unknown).skills || [],
      });
    }
  }, [agent, isOpen]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'Agent name is required';
    }

    if (!formData.role) {
      newErrors.role = 'Agent role is required';
    }

    if (
      formData.temperature !== undefined &&
      (formData.temperature < 0 || formData.temperature > 2)
    ) {
      newErrors.temperature = 'Temperature must be between 0 and 2';
    }

    if (formData.maxTokens !== undefined && (formData.maxTokens < 1 || formData.maxTokens > 4000)) {
      newErrors.maxTokens = 'Max tokens must be between 1 and 4000';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      // Update agent data
      const response = await uaipAPI.agents.update(agentId, formData);
      if (response.success) {
        // If we have LLM preferences, save them separately
        if (llmPreferences.length > 0) {
          try {
            // Note: This would need a backend API endpoint for agent LLM preferences
            // For now, we'll just log them
            // TODO: Implement API call to save agent LLM preferences
            // await uaipAPI.agents.updateLLMPreferences(agentId, llmPreferences);
          } catch (prefError) {
            logger.warn('Failed to save LLM preferences:', prefError);
            // Don't fail the entire save if preferences fail
          }
        }

        onSave?.(agentId, response.data);
        refetchAgents();
        onClose();
      } else {
        setErrors({ general: response.error || 'Failed to update agent' });
      }
    } catch {
      setErrors({ general: 'Failed to update agent. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const updateFormData = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const renderBasicTab = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Agent Name *
        </label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => updateFormData('name', e.target.value)}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
            errors.name
              ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
          } text-gray-900 dark:text-white`}
          placeholder="Enter agent name..."
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {errors.name}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Role *
        </label>
        <select
          value={formData.role || ''}
          onChange={(e) => updateFormData('role', e.target.value)}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
            errors.role
              ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
          } text-gray-900 dark:text-white`}
        >
          <option value="">Select a role...</option>
          <option value="ASSISTANT">Assistant</option>
          <option value="ANALYST">Analyst</option>
          <option value="SPECIALIST">Specialist</option>
          <option value="COORDINATOR">Coordinator</option>
          <option value="RESEARCHER">Researcher</option>
        </select>
        {errors.role && (
          <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {errors.role}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Capabilities
        </label>
        <input
          type="text"
          value={formData.capabilities?.join(', ') || ''}
          onChange={(e) =>
            updateFormData(
              'capabilities',
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="Enter capabilities separated by commas..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Tags
        </label>
        <input
          type="text"
          value={formData.tags?.join(', ') || ''}
          onChange={(e) =>
            updateFormData(
              'tags',
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="Enter tags separated by commas..."
        />
      </div>
    </div>
  );

  const renderAdvancedTab = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          System Prompt
        </label>
        <textarea
          value={formData.systemPrompt || ''}
          onChange={(e) => updateFormData('systemPrompt', e.target.value)}
          rows={6}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="Enter system prompt for the agent..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Temperature
          </label>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={formData.temperature || 0.7}
            onChange={(e) => updateFormData('temperature', parseFloat(e.target.value))}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
              errors.temperature
                ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
            } text-gray-900 dark:text-white`}
          />
          {errors.temperature && <p className="mt-1 text-sm text-red-600">{errors.temperature}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Max Tokens
          </label>
          <input
            type="number"
            min="1"
            max="4000"
            value={formData.maxTokens || 1000}
            onChange={(e) => updateFormData('maxTokens', parseInt(e.target.value))}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
              errors.maxTokens
                ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
            } text-gray-900 dark:text-white`}
          />
          {errors.maxTokens && <p className="mt-1 text-sm text-red-600">{errors.maxTokens}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Model ID
        </label>
        <input
          type="text"
          value={formData.modelId || ''}
          onChange={(e) => updateFormData('modelId', e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="Enter model ID..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          API Type
        </label>
        <select
          value={formData.apiType || ''}
          onChange={(e) => updateFormData('apiType', e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">Select API type...</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="ollama">Ollama</option>
          <option value="llmstudio">LLM Studio</option>
        </select>
      </div>
    </div>
  );

  const renderToolsTab = () => {
    const [mcpTools, setMcpTools] = useState<unknown[]>([]);
    const [loadingTools, setLoadingTools] = useState(true);
    const [assignedTools, setAssignedTools] = useState<unknown[]>([]);
    const [toolSettings, setToolSettings] = useState<unknown>({});
    const [showAddTool, setShowAddTool] = useState(false);

    // Load MCP tools and agent's assigned tools
    useEffect(() => {
      const loadMCPTools = async () => {
        try {
          setLoadingTools(true);

          // Get available MCP tools
          const availableData = await edenRequest<{ tools?: unknown[] }>(
            '/api/v1/agents/mcp-tools',
            { method: 'GET' }
          );
          setMcpTools(availableData?.tools || []);

          // Get agent's assigned tools
          const assignedData = await edenRequest<{
            assignedMCPTools?: unknown[];
            mcpToolSettings?: unknown;
          }>(`/api/v1/agents/${agentId}/mcp-tools`, { method: 'GET' });
          setAssignedTools(assignedData?.assignedMCPTools || []);
          setToolSettings(assignedData?.mcpToolSettings || {});
        } catch (error) {
          logger.error('Error loading MCP tools:', error);
        } finally {
          setLoadingTools(false);
        }
      };

      if (isOpen && agentId) {
        loadMCPTools();
      }
    }, []);

    const handleAssignTool = async (tool: unknown) => {
      try {
        const data = await edenRequest<{ assignedMCPTools?: unknown[] }>(
          `/api/v1/agents/${agentId}/mcp-tools`,
          {
            method: 'POST',
            body: {
              toolsToAssign: [
                {
                  toolId: (tool as Record<string, unknown>).id,
                  toolName: (tool as Record<string, unknown>).name,
                  serverName: (tool as Record<string, unknown>).serverName,
                  enabled: true,
                  priority: 1,
                  parameters: (tool as Record<string, unknown>).parameters || {},
                },
              ],
            },
          }
        );
        setAssignedTools(data?.assignedMCPTools || []);
        setShowAddTool(false);
      } catch (error) {
        logger.error('Error assigning tool:', error);
      }
    };

    const handleRemoveTool = async (toolId: string) => {
      try {
        await edenRequest(`/api/v1/agents/${agentId}/mcp-tools/${toolId}`, { method: 'DELETE' });
        setAssignedTools((prev) =>
          (prev as Array<Record<string, unknown>>).filter((t) => t['toolId'] !== toolId)
        );
      } catch (error) {
        logger.error('Error removing tool:', error);
      }
    };

    const handleToggleTool = async (toolId: string, enabled: boolean) => {
      try {
        await edenRequest(`/api/v1/agents/${agentId}/mcp-tools/${toolId}`, { method: 'PUT', body: { enabled } });
        setAssignedTools((prev) =>
          (prev as Array<Record<string, unknown>>).map((t) =>
            t['toolId'] === toolId ? { ...t, enabled } : t
          )
        );
      } catch (error) {
        logger.error('Error toggling tool:', error);
      }
    };

    const handleUpdateSettings = async (newSettings: unknown) => {
      try {
        const data = await edenRequest<{ mcpToolSettings?: unknown }>(
          `/api/v1/agents/${agentId}/mcp-settings`,
          { method: 'PUT', body: newSettings }
        );
        setToolSettings(data?.mcpToolSettings || {});
      } catch (error) {
        logger.error('Error updating settings:', error);
      }
    };

    return (
      <div className="space-y-6">
        {/* MCP Tool Settings */}
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 p-4 rounded-lg">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            MCP Tool Settings
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Max Tools Per Server
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={toolSettings.maxToolsPerServer || 5}
                onChange={(e) => {
                  const newSettings = {
                    ...toolSettings,
                    maxToolsPerServer: parseInt(e.target.value),
                  };
                  setToolSettings(newSettings);
                  handleUpdateSettings(newSettings);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex items-center">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={toolSettings.autoDiscoveryEnabled || false}
                  onChange={(e) => {
                    const newSettings = { ...toolSettings, autoDiscoveryEnabled: e.target.checked };
                    setToolSettings(newSettings);
                    handleUpdateSettings(newSettings);
                  }}
                  className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Auto-discover new tools
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Assigned Tools */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
              Assigned MCP Tools
            </h4>
            <button
              onClick={() => setShowAddTool(true)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Tool
            </button>
          </div>

          {loadingTools ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 mx-auto mb-4 text-gray-400 animate-spin" />
              <p className="text-gray-500">Loading MCP tools...</p>
            </div>
          ) : assignedTools.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
              <Zap className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500 dark:text-gray-400">No MCP tools assigned</p>
              <p className="text-sm text-gray-400 mt-2">
                Add tools to enhance your agent's capabilities
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignedTools.map((tool) => (
                <div
                  key={tool.toolId}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-blue-500" />
                          <h5 className="font-medium text-gray-900 dark:text-white">
                            {tool.toolName}
                          </h5>
                        </div>
                        <span className="px-2 py-1 bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200 text-xs rounded-full">
                          {tool.serverName}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Tool ID: {tool.toolId}
                      </p>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={tool.enabled}
                            onChange={(e) => handleToggleTool(tool.toolId, e.target.checked)}
                            className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Enabled</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Priority:
                          </span>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={tool.priority || 1}
                            onChange={(e) => {
                              const newPriority = parseInt(e.target.value);
                              setAssignedTools((prev) =>
                                prev.map((t) =>
                                  t.toolId === tool.toolId ? { ...t, priority: newPriority } : t
                                )
                              );
                            }}
                            className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveTool(tool.toolId)}
                      className="text-red-600 hover:text-red-800 p-2"
                      title="Remove tool"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Tool Modal */}
        {showAddTool && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-2xl max-h-[80vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Add MCP Tool
                  </h3>
                  <button
                    onClick={() => setShowAddTool(false)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {mcpTools.length === 0 ? (
                  <div className="text-center py-8">
                    <Zap className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-500 dark:text-gray-400">No MCP tools available</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Configure MCP servers in the capability registry to see available tools
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mcpTools
                      .filter((tool) => !assignedTools.some((at) => at.toolId === tool.id))
                      .map((tool) => (
                        <div
                          key={tool.id}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <Zap className="h-4 w-4 text-blue-500" />
                                <h5 className="font-medium text-gray-900 dark:text-white">
                                  {tool.name}
                                </h5>
                                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200 text-xs rounded-full">
                                  {tool.serverName}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                {tool.description}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-500">
                                Tool ID: {tool.id}
                              </p>
                            </div>
                            <button
                              onClick={() => handleAssignTool(tool)}
                              className="ml-4 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm"
                            >
                              Add Tool
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderLLMPreferencesTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-gray-900 dark:text-white">LLM Preferences</h4>
        <button
          onClick={() => {
            const newPreference: AgentLLMPreference = {
              taskType: 'reasoning',
              preferredProvider: 'anthropic',
              preferredModel: 'claude-3-5-sonnet-20241022',
              isActive: true,
              priority: 50,
            };
            setLlmPreferences((prev) => [...prev, newPreference]);
          }}
          className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Preference
        </button>
      </div>

      <div className="space-y-4">
        {llmPreferences.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <Cpu className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500 dark:text-gray-400">No LLM preferences configured</p>
            <p className="text-sm text-gray-400 mt-2">
              Add preferences to optimize model selection for different task types.
            </p>
          </div>
        ) : (
          llmPreferences.map((preference, index) => (
            <div
              key={`${preference.taskType}-${preference.preferredProvider}-${preference.priority}`}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Task Type
                  </label>
                  <select
                    value={preference.taskType}
                    onChange={(e) => {
                      const updated = [...llmPreferences];
                      updated[index] = { ...updated[index], taskType: e.target.value };
                      setLlmPreferences(updated);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {LLM_TASK_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Provider
                  </label>
                  <select
                    value={preference.preferredProvider}
                    onChange={(e) => {
                      const updated = [...llmPreferences];
                      updated[index] = { ...updated[index], preferredProvider: e.target.value };
                      setLlmPreferences(updated);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {LLM_PROVIDER_TYPES.map((provider) => (
                      <option key={provider.value} value={provider.value}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Model
                  </label>
                  <select
                    value={preference.preferredModel}
                    onChange={(e) => {
                      const updated = [...llmPreferences];
                      updated[index] = { ...updated[index], preferredModel: e.target.value };
                      setLlmPreferences(updated);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {modelState?.models
                      ?.filter(
                        (m) =>
                          m.apiType === preference.preferredProvider ||
                          (preference.preferredProvider === 'anthropic' &&
                            m.name?.toLowerCase().includes('claude')) ||
                          (preference.preferredProvider === 'openai' &&
                            m.name?.toLowerCase().includes('gpt'))
                      )
                      .map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      )) || []}
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                    <option value="gpt-4o-mini">GPT-4O Mini</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Priority (1-100)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={preference.priority}
                    onChange={(e) => {
                      const updated = [...llmPreferences];
                      updated[index] = { ...updated[index], priority: parseInt(e.target.value) };
                      setLlmPreferences(updated);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preference.isActive}
                      onChange={(e) => {
                        const updated = [...llmPreferences];
                        updated[index] = { ...updated[index], isActive: e.target.checked };
                        setLlmPreferences(updated);
                      }}
                      className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
                  </label>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    onClick={() => {
                      const updated = llmPreferences.filter((_, i) => i !== index);
                      setLlmPreferences(updated);
                    }}
                    className="text-red-600 hover:text-red-800 p-2"
                    title="Remove preference"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Advanced Settings */}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                <details className="group">
                  <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                    Advanced Settings
                  </summary>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Temperature
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={preference.settings?.temperature || 0.7}
                        onChange={(e) => {
                          const updated = [...llmPreferences];
                          updated[index] = {
                            ...updated[index],
                            settings: {
                              ...updated[index].settings,
                              temperature: parseFloat(e.target.value),
                            },
                          };
                          setLlmPreferences(updated);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Max Tokens
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="8000"
                        value={preference.settings?.maxTokens || 2000}
                        onChange={(e) => {
                          const updated = [...llmPreferences];
                          updated[index] = {
                            ...updated[index],
                            settings: {
                              ...updated[index].settings,
                              maxTokens: parseInt(e.target.value),
                            },
                          };
                          setLlmPreferences(updated);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Fallback Model
                      </label>
                      <input
                        type="text"
                        value={preference.fallbackModel || ''}
                        onChange={(e) => {
                          const updated = [...llmPreferences];
                          updated[index] = { ...updated[index], fallbackModel: e.target.value };
                          setLlmPreferences(updated);
                        }}
                        placeholder="Optional fallback model"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </details>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderChatTab = () => (
    <div className="space-y-6">
      <div className="text-center py-8">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p className="text-gray-500">Chat configuration coming soon...</p>
        <p className="text-sm text-gray-400 mt-2">
          Advanced chat settings and behavior configuration will be available here.
        </p>
      </div>
    </div>
  );

  const renderSkillsTab = () => {
    const skills: AgentSkill[] = (formData as unknown).skills || [];
    const [showAddForm, setShowAddForm] = useState(false);
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [newSkill, setNewSkill] = useState<Partial<AgentSkill>>({
      name: '',
      description: '',
      content: '',
      source: 'inline',
      enabled: true,
    });

    const updateSkills = (updated: AgentSkill[]) => updateFormData('skills', updated);

    const handleAddSkill = () => {
      if (!newSkill.name?.trim() || !newSkill.description?.trim() || !newSkill.content?.trim())
        return;
      const skill: AgentSkill = {
        id: crypto.randomUUID(),
        name: newSkill.name!,
        description: newSkill.description!,
        content: newSkill.content!,
        source: newSkill.source || 'inline',
        sourcePath: newSkill.sourcePath,
        sourceUrl: newSkill.sourceUrl,
        enabled: newSkill.enabled ?? true,
        model: newSkill.model || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      updateSkills([...skills, skill]);
      setNewSkill({ name: '', description: '', content: '', source: 'inline', enabled: true });
      setShowAddForm(false);
    };

    const handleUpdateSkill = (index: number, updates: Partial<AgentSkill>) => {
      const updated = skills.map((s, i) =>
        i === index ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
      );
      updateSkills(updated);
    };

    const handleDeleteSkill = (index: number) => {
      updateSkills(skills.filter((_, i) => i !== index));
      if (editIndex === index) setEditIndex(null);
    };

    const sourceBadgeClass = (source: AgentSkill['source']) => {
      if (source === 'filesystem')
        return 'px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full';
      if (source === 'registry')
        return 'px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs rounded-full';
      return 'px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-full';
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Agent Skills</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              OpenCode-compatible skills that extend this agent's capabilities.
            </p>
          </div>
          <button
            onClick={() => {
              setShowAddForm(true);
              setEditIndex(null);
            }}
            className="flex items-center gap-2 px-3 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Skill
          </button>
        </div>

        {/* Add Skill Form */}
        {showAddForm && (
          <div className="border border-violet-200 dark:border-violet-800 rounded-lg p-4 bg-violet-50 dark:bg-violet-900/20">
            <h5 className="font-medium text-gray-900 dark:text-white mb-4">New Skill</h5>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newSkill.name || ''}
                    onChange={(e) =>
                      setNewSkill((p: Partial<AgentSkill>) => ({ ...p, name: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="e.g. git-master"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Source
                  </label>
                  <select
                    value={newSkill.source || 'inline'}
                    onChange={(e) =>
                      setNewSkill((p: Partial<AgentSkill>) => ({
                        ...p,
                        source: e.target.value as AgentSkill['source'],
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="inline">Inline</option>
                    <option value="filesystem">Filesystem</option>
                    <option value="registry">Registry</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  value={newSkill.description || ''}
                  onChange={(e) =>
                    setNewSkill((p: Partial<AgentSkill>) => ({ ...p, description: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  placeholder="When to use this skill and what it does..."
                />
              </div>
              {newSkill.source === 'filesystem' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Filesystem Path
                  </label>
                  <input
                    type="text"
                    value={newSkill.sourcePath || ''}
                    onChange={(e) =>
                      setNewSkill((p: Partial<AgentSkill>) => ({
                        ...p,
                        sourcePath: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder=".agents/skills/my-skill/SKILL.md"
                  />
                </div>
              )}
              {newSkill.source === 'registry' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Registry URL
                  </label>
                  <input
                    type="url"
                    value={newSkill.sourceUrl || ''}
                    onChange={(e) =>
                      setNewSkill((p: Partial<AgentSkill>) => ({ ...p, sourceUrl: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="https://registry.example.com/skills/my-skill"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Content * (Markdown instructions)
                </label>
                <textarea
                  value={newSkill.content || ''}
                  onChange={(e) =>
                    setNewSkill((p: Partial<AgentSkill>) => ({ ...p, content: e.target.value }))
                  }
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                  placeholder="# Skill Instructions&#10;&#10;Describe what this skill does and how to use it..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model Override (optional)
                </label>
                <input
                  type="text"
                  value={newSkill.model || ''}
                  onChange={(e) =>
                    setNewSkill((p: Partial<AgentSkill>) => ({
                      ...p,
                      model: e.target.value || undefined,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  placeholder="e.g. anthropic/claude-opus-4-5"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSkill}
                  disabled={
                    !newSkill.name?.trim() ||
                    !newSkill.description?.trim() ||
                    !newSkill.content?.trim()
                  }
                  className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
                >
                  Add Skill
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Skill List */}
        {skills.length === 0 && !showAddForm ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500 dark:text-gray-400">No skills configured</p>
            <p className="text-sm text-gray-400 mt-2">
              Add skills to give this agent specialized knowledge and instructions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {skills.map((skill, index) => (
              <div
                key={skill.id || skill.name}
                className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50"
              >
                {/* Skill Header */}
                <div className="flex items-start justify-between p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="h-4 w-4 text-violet-500 flex-shrink-0" />
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {skill.name}
                      </span>
                      <span className={sourceBadgeClass(skill.source)}>{skill.source}</span>
                      {!skill.enabled && (
                        <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs rounded-full">
                          disabled
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {skill.description}
                    </p>
                    {skill.model && (
                      <p className="text-xs text-gray-400 mt-0.5">Model: {skill.model}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skill.enabled}
                        onChange={(e) => handleUpdateSkill(index, { enabled: e.target.checked })}
                        className="mr-1 h-3.5 w-3.5 text-violet-600 focus:ring-violet-500 border-gray-300 rounded"
                      />
                      <span className="text-xs text-gray-500">On</span>
                    </label>
                    <button
                      onClick={() => setEditIndex(editIndex === index ? null : index)}
                      className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      title="Edit"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteSkill(index)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {/* Skill Edit Form */}
                {editIndex === index && (
                  <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Name
                        </label>
                        <input
                          type="text"
                          value={skill.name}
                          onChange={(e) => handleUpdateSkill(index, { name: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Source
                        </label>
                        <select
                          value={skill.source}
                          onChange={(e) =>
                            handleUpdateSkill(index, {
                              source: e.target.value as AgentSkill['source'],
                            })
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                          <option value="inline">Inline</option>
                          <option value="filesystem">Filesystem</option>
                          <option value="registry">Registry</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={skill.description}
                        onChange={(e) => handleUpdateSkill(index, { description: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    {skill.source === 'filesystem' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Filesystem Path
                        </label>
                        <input
                          type="text"
                          value={skill.sourcePath || ''}
                          onChange={(e) => handleUpdateSkill(index, { sourcePath: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    )}
                    {skill.source === 'registry' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Registry URL
                        </label>
                        <input
                          type="url"
                          value={skill.sourceUrl || ''}
                          onChange={(e) => handleUpdateSkill(index, { sourceUrl: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Content (Markdown)
                      </label>
                      <textarea
                        value={skill.content}
                        onChange={(e) => handleUpdateSkill(index, { content: e.target.value })}
                        rows={4}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Model Override
                      </label>
                      <input
                        type="text"
                        value={skill.model || ''}
                        onChange={(e) =>
                          handleUpdateSkill(index, { model: e.target.value || undefined })
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        placeholder="e.g. anthropic/claude-opus-4-5"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => setEditIndex(null)}
                        className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderPreview = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-6 rounded-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
            <Bot className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {formData.name || 'Unnamed Agent'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {formData.role || 'No role assigned'}
            </p>
          </div>
        </div>

        {formData.systemPrompt && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              System Prompt:
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-3 rounded border">
              {formData.systemPrompt}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-700 dark:text-gray-300">Temperature:</span>
            <span className="ml-2 text-gray-600 dark:text-gray-400">
              {formData.temperature || 0.7}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-700 dark:text-gray-300">Max Tokens:</span>
            <span className="ml-2 text-gray-600 dark:text-gray-400">
              {formData.maxTokens || 1000}
            </span>
          </div>
        </div>

        {formData.capabilities && formData.capabilities.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Capabilities:
            </h4>
            <div className="flex flex-wrap gap-2">
              {formData.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-xs rounded-full"
                >
                  {capability}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (!isOpen || !agent) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
                  <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Edit Agent
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Configure {agent?.name || 'agent'}'s settings
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewMode(!previewMode)}
                  className={`p-2 rounded-lg transition-colors ${
                    previewMode
                      ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title={previewMode ? 'Exit Preview' : 'Preview Agent'}
                >
                  {previewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex h-[600px]">
            {/* Sidebar - Tabs */}
            {!previewMode && (
              <div className="w-48 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
                <div className="p-4 space-y-2">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                          isActive
                            ? `bg-gradient-to-r ${tab.gradient} text-white shadow-lg`
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6">
                {errors.general && (
                  <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">{errors.general}</span>
                    </div>
                  </div>
                )}

                {previewMode ? (
                  renderPreview()
                ) : (
                  <>
                    {activeTab === 'basic' && renderBasicTab()}
                    {activeTab === 'advanced' && renderAdvancedTab()}
                    {activeTab === 'llm-preferences' && renderLLMPreferencesTab()}
                    {activeTab === 'tools' && renderToolsTab()}
                    {activeTab === 'chat' && renderChatTab()}
                    {activeTab === 'skills' && renderSkillsTab()}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving changes...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span>Ready to save</span>
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !validateForm()}
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AgentEditModal;
