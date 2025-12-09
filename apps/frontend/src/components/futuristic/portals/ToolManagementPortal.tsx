import React, { useState, useEffect } from 'react';
import { useUAIP } from '@/contexts/UAIPContext';
import { motion } from 'framer-motion';
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
} from '@heroicons/react/24/outline';
import { uaipAPI } from '@/utils/uaip-api';

// Shared viewport type
interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface ToolManagementPortalProps {
  className?: string;
  viewport?: ViewportSize;
}

interface ToolFormData {
  name: string;
  description: string;
  version: string;
  category: string;
  securityLevel: 'safe' | 'moderate' | 'restricted' | 'dangerous';
  requiresApproval: boolean;
  tags: string[];
  author: string;
  type: 'mcp' | 'openapi' | 'custom';
  // MCP specific
  mcpConfig?: {
    serverUrl?: string;
    capabilities?: string[];
  };
  // OpenAPI specific
  openApiConfig?: {
    specUrl?: string;
    endpoints?: string[];
  };
  // Custom tool specific
  customConfig?: {
    parameters?: Record<string, any>;
    returnType?: Record<string, any>;
    examples?: any[];
  };
}

export const ToolManagementPortal: React.FC<ToolManagementPortalProps> = ({
  className,
  viewport,
}) => {
  const { capabilities, toolIntegrations, agents, refreshData, isWebSocketConnected } = useUAIP();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ToolFormData>({
    name: '',
    description: '',
    version: '1.0.0',
    category: 'api',
    securityLevel: 'safe',
    requiresApproval: false,
    tags: [],
    author: '',
    type: 'custom',
  });

  // Determine viewport if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet:
      typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  };

  const currentViewport = viewport || defaultViewport;

  // Consolidate tools from all sources like ToolsPanel does
  const allTools = React.useMemo(() => {
    const consolidatedTools: any[] = [];

    // Add tools from capabilities registry
    capabilities.data.forEach((capability) => {
      consolidatedTools.push({
        id: capability.id,
        name: capability.name,
        description: capability.description,
        category: capability.category || 'api',
        tags: capability.tags || [],
        version: '1.0.0',
        author: 'System',
        securityLevel: 'safe',
        requiresApproval: false,
        isEnabled: true,
        source: 'capability-registry',
        type: 'capability',
      });
    });

    // Add tools from tool integrations
    toolIntegrations.data.forEach((integration) => {
      consolidatedTools.push({
        id: integration.id,
        name: integration.name,
        description: integration.description,
        category: integration.type || 'api',
        tags: integration.tags || [],
        version: integration.version || '1.0.0',
        author: integration.provider || 'External',
        securityLevel: 'moderate',
        requiresApproval: true,
        isEnabled: integration.status === 'active',
        source: 'tool-integration',
        type: integration.type,
      });
    });

    // Add tools from agent capabilities
    agents.data.forEach((agent) => {
      agent.capabilities.forEach((capability, index) => {
        consolidatedTools.push({
          id: `${agent.id}-capability-${index}`,
          name: capability.name || `${agent.name} Capability ${index + 1}`,
          description: capability.description || `Capability from agent ${agent.name}`,
          category: capability.category || 'agent-capability',
          tags: capability.tags || [],
          version: '1.0.0',
          author: agent.name,
          securityLevel: 'safe',
          requiresApproval: false,
          isEnabled: agent.status === 'active',
          source: 'agent',
          type: 'agent-capability',
        });
      });
    });

    return consolidatedTools;
  }, [capabilities.data, toolIntegrations.data, agents.data]);

  // Extract categories from consolidated tools data
  const categories: string[] = [
    'all',
    ...(Array.from(new Set(allTools.map((tool) => tool.category || 'api'))) as string[]),
  ];

  const filteredTools = allTools.filter((tool) => {
    const matchesSearch =
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.tags?.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory =
      selectedCategory === 'all' || (tool.category || 'api') === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getSecurityColor = (level?: string) => {
    switch (level) {
      case 'safe':
        return 'text-green-600 bg-green-100 border-green-200';
      case 'moderate':
        return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      case 'restricted':
        return 'text-orange-600 bg-orange-100 border-orange-200';
      case 'dangerous':
        return 'text-red-600 bg-red-100 border-red-200';
      default:
        return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'mcp':
        return <CloudIcon className="w-4 h-4" />;
      case 'openapi':
        return <CodeBracketIcon className="w-4 h-4" />;
      case 'custom':
        return <CubeIcon className="w-4 h-4" />;
      default:
        return <WrenchScrewdriverIcon className="w-4 h-4" />;
    }
  };

  const selectedToolData = allTools.find((tool) => tool.id === selectedTool);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const toolPayload = {
        id: `tool-${Date.now()}`,
        name: formData.name,
        description: formData.description,
        version: formData.version,
        category: formData.category,
        parameters: formData.customConfig?.parameters || {},
        returnType: formData.customConfig?.returnType,
        securityLevel: formData.securityLevel,
        requiresApproval: formData.requiresApproval,
        isEnabled: true,
        author: formData.author,
        tags: formData.tags,
        dependencies: [],
        examples: formData.customConfig?.examples || [],
        // Add type-specific configs
        ...(formData.type === 'mcp' && { mcpConfig: formData.mcpConfig }),
        ...(formData.type === 'openapi' && { openApiConfig: formData.openApiConfig }),
      };

      await uaipAPI.tools.create(toolPayload);
      await refreshData();
      setShowCreateForm(false);
      setFormData({
        name: '',
        description: '',
        version: '1.0.0',
        category: 'api',
        securityLevel: 'safe',
        requiresApproval: false,
        tags: [],
        author: '',
        type: 'custom',
      });
    } catch (error) {
      console.error('Failed to create tool:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTagInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      const newTag = e.currentTarget.value.trim();
      if (!formData.tags.includes(newTag)) {
        setFormData((prev) => ({ ...prev, tags: [...prev.tags, newTag] }));
      }
      e.currentTarget.value = '';
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  };

  // Show error state
  if (capabilities.error || toolIntegrations.error || agents.error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-500 dark:text-red-400">Failed to load tools</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
              {capabilities.error?.message ||
                toolIntegrations.error?.message ||
                agents.error?.message}
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
  if (capabilities.isLoading || toolIntegrations.isLoading || agents.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ArrowPathIcon className="w-8 h-8 text-purple-400 mx-auto mb-2 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading tools...</p>
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
          <WrenchScrewdriverIcon className="w-6 h-6 mr-2 text-purple-500" />
          Tool Management
        </h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
            />
            <span className="text-sm text-gray-500">
              {isWebSocketConnected ? 'Live' : 'Offline'}
            </span>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all flex items-center space-x-2"
            title="Add new tool"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Add Tool</span>
          </button>
          <button
            onClick={refreshData}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Refresh tools"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          {(capabilities.lastUpdated || toolIntegrations.lastUpdated || agents.lastUpdated) && (
            <span className="text-xs text-gray-400">
              Updated:{' '}
              {(
                capabilities.lastUpdated ||
                toolIntegrations.lastUpdated ||
                agents.lastUpdated
              )?.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        >
          {categories.map((categoryStr) => (
            <option key={categoryStr} value={categoryStr}>
              {categoryStr.charAt(0).toUpperCase() + categoryStr.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tools List */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
            <WrenchScrewdriverIcon className="w-5 h-5 mr-2 text-purple-500" />
            Available Tools ({filteredTools.length})
          </h3>

          {filteredTools.length === 0 ? (
            <div className="text-center py-8">
              <MagnifyingGlassIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400">
                {allTools.length === 0 ? 'No tools registered yet' : 'No tools match your search'}
              </p>
              {allTools.length === 0 && (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-4 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                >
                  Add First Tool
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTools.map((tool) => (
                <div
                  key={tool.id}
                  className={`bg-white dark:bg-slate-700 rounded-xl p-4 border cursor-pointer transition-all ${
                    selectedTool === tool.id
                      ? 'border-purple-500 ring-2 ring-purple-500/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-purple-300'
                  }`}
                  onClick={() => setSelectedTool(tool.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                        {getTypeIcon((tool as any).type)}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 dark:text-white">{tool.name}</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {tool.description || 'No description available'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-medium border ${getSecurityColor(tool.securityLevel)}`}
                    >
                      {(tool.securityLevel || 'safe').toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm mb-3">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-1">
                        <CheckCircleIcon className="w-4 h-4 text-green-500" />
                        <span className="text-gray-900 dark:text-white">
                          {tool.isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <ClockIcon className="w-4 h-4 text-blue-500" />
                        <span className="text-gray-900 dark:text-white">v{tool.version}</span>
                      </div>
                    </div>
                    <span className="text-gray-500 dark:text-gray-400">
                      {tool.requiresApproval ? 'Approval Required' : 'Auto-execute'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {tool.tags?.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-md text-xs"
                      >
                        {tag}
                      </span>
                    )) || <span className="text-xs text-gray-400">No tags</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tool Details/Form */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          {showCreateForm ? (
            <>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                  <PlusIcon className="w-5 h-5 mr-2 text-purple-500" />
                  Add New Tool
                </h3>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Tool Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tool Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, type: e.target.value as any }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  >
                    <option value="custom">Custom Tool</option>
                    <option value="mcp">MCP Tool</option>
                    <option value="openapi">OpenAPI Tool</option>
                  </select>
                </div>

                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Version
                    </label>
                    <input
                      type="text"
                      value={formData.version}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, version: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Category
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, category: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      required
                    >
                      <option value="api">API</option>
                      <option value="computation">Computation</option>
                      <option value="file-system">File System</option>
                      <option value="database">Database</option>
                      <option value="web-search">Web Search</option>
                      <option value="code-execution">Code Execution</option>
                      <option value="communication">Communication</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Security Level
                    </label>
                    <select
                      value={formData.securityLevel}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, securityLevel: e.target.value as any }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      required
                    >
                      <option value="safe">Safe</option>
                      <option value="moderate">Moderate</option>
                      <option value="restricted">Restricted</option>
                      <option value="dangerous">Dangerous</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Author
                  </label>
                  <input
                    type="text"
                    value={formData.author}
                    onChange={(e) => setFormData((prev) => ({ ...prev, author: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tags (press Enter to add)
                  </label>
                  <input
                    type="text"
                    onKeyDown={handleTagInput}
                    placeholder="Type a tag and press Enter"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-md text-sm flex items-center space-x-1"
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="text-purple-500 hover:text-purple-700"
                          >
                            <XMarkIcon className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Type-specific configurations */}
                {formData.type === 'mcp' && (
                  <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h4 className="font-medium text-gray-900 dark:text-white">MCP Configuration</h4>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Server URL
                      </label>
                      <input
                        type="url"
                        value={formData.mcpConfig?.serverUrl || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            mcpConfig: { ...prev.mcpConfig, serverUrl: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="https://example.com/mcp"
                      />
                    </div>
                  </div>
                )}

                {formData.type === 'openapi' && (
                  <div className="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      OpenAPI Configuration
                    </h4>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        OpenAPI Spec URL
                      </label>
                      <input
                        type="url"
                        value={formData.openApiConfig?.specUrl || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            openApiConfig: { ...prev.openApiConfig, specUrl: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="https://api.example.com/openapi.json"
                      />
                    </div>
                  </div>
                )}

                {/* Checkboxes */}
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.requiresApproval}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, requiresApproval: e.target.checked }))
                      }
                      className="rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Requires Approval
                    </span>
                  </label>
                </div>

                {/* Submit */}
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Tool'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                <DocumentIcon className="w-5 h-5 mr-2 text-purple-500" />
                Tool Details
              </h3>

              {selectedToolData ? (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          {selectedToolData.name}
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          ID: {selectedToolData.id} • Category: {selectedToolData.category || 'api'}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-medium border ${getSecurityColor(selectedToolData.securityLevel)}`}
                      >
                        {(selectedToolData.securityLevel || 'safe').toUpperCase()}
                      </span>
                    </div>

                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      {selectedToolData.description || 'No description available'}
                    </p>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Version</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {selectedToolData.version}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Author</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {selectedToolData.author || 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Status</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {selectedToolData.isEnabled ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Approval</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {selectedToolData.requiresApproval ? 'Required' : 'Not Required'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  {selectedToolData.tags && selectedToolData.tags.length > 0 && (
                    <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                      <h5 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                        <TagIcon className="w-4 h-4 mr-2 text-gray-500" />
                        Tags
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {selectedToolData.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-3 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-full text-sm"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Additional metadata if available */}
                  {(selectedToolData.parameters || selectedToolData.examples) && (
                    <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                      <h5 className="font-medium text-gray-900 dark:text-white mb-3">
                        Configuration
                      </h5>
                      <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto">
                        {JSON.stringify(
                          {
                            parameters: selectedToolData.parameters,
                            examples: selectedToolData.examples,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                  <div className="text-center">
                    <WrenchScrewdriverIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500 dark:text-gray-400">
                      Select a tool to view details
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};
