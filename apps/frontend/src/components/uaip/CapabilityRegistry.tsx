import React, { useState, useEffect } from 'react';
import { useUAIP } from '../../contexts/UAIPContext';
import { 
  PuzzlePieceIcon, 
  MagnifyingGlassIcon,
  StarIcon,
  ClockIcon,
  CheckCircleIcon,
  WrenchScrewdriverIcon,
  DocumentIcon,
  TagIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

export const CapabilityRegistry: React.FC = () => {
  const { capabilities, refreshData, isWebSocketConnected } = useUAIP();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCapability, setSelectedCapability] = useState<string | null>(null);

  // Extract categories from real capabilities data
  const categories = ['all', ...Array.from(new Set(capabilities.data.map(cap => cap.category || 'Uncategorized')))];
  
  const filteredCapabilities = capabilities.data.filter(cap => {
    const matchesSearch = cap.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         cap.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         cap.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || (cap.category || 'Uncategorized') === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100 border-green-200';
      case 'beta': return 'text-blue-600 bg-blue-100 border-blue-200';
      case 'deprecated': return 'text-red-600 bg-red-100 border-red-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'tool': return <WrenchScrewdriverIcon className="w-4 h-4" />;
      case 'template': return <DocumentIcon className="w-4 h-4" />;
      case 'service': return <PuzzlePieceIcon className="w-4 h-4" />;
      default: return <PuzzlePieceIcon className="w-4 h-4" />;
    }
  };

  const selectedCapabilityData = capabilities.data.find(cap => cap.id === selectedCapability);

  // Show error state
  if (capabilities.error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-500 dark:text-red-400">Failed to load capabilities</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{capabilities.error.message}</p>
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
  if (capabilities.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ArrowPathIcon className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading capabilities...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show empty state
  if (capabilities.data.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <PuzzlePieceIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500 dark:text-gray-400">No capabilities available</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">Capabilities will appear here when agents register them</p>
            <button
              onClick={refreshData}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Connection Status */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
          <PuzzlePieceIcon className="w-6 h-6 mr-2 text-purple-500" />
          Capability Registry
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
            title="Refresh capabilities"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          {capabilities.lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated: {capabilities.lastUpdated.toLocaleTimeString()}
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
            placeholder="Search capabilities..."
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
        {/* Capabilities List */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
            <PuzzlePieceIcon className="w-5 h-5 mr-2 text-purple-500" />
            Available Capabilities ({filteredCapabilities.length})
          </h3>
          
          {filteredCapabilities.length === 0 ? (
            <div className="text-center py-8">
              <MagnifyingGlassIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400">No capabilities match your search</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCapabilities.map((capability) => (
                <div 
                  key={capability.id}
                  className={`bg-white dark:bg-slate-700 rounded-xl p-4 border cursor-pointer transition-all ${
                    selectedCapability === capability.id 
                      ? 'border-blue-500 ring-2 ring-blue-500/20' 
                      : 'border-slate-200 dark:border-slate-600 hover:border-blue-300'
                  }`}
                  onClick={() => setSelectedCapability(capability.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white">
                        {getTypeIcon(capability.type)}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 dark:text-white">{capability.name}</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{capability.description || 'No description available'}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(capability.status)}`}>
                      {(capability.status || 'unknown').toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm mb-3">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-1">
                        <CheckCircleIcon className="w-4 h-4 text-green-500" />
                        <span className="text-gray-900 dark:text-white">
                          {capability.successRate ? `${(capability.successRate * 100).toFixed(0)}%` : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <ClockIcon className="w-4 h-4 text-blue-500" />
                        <span className="text-gray-900 dark:text-white">
                          {capability.avgDuration ? `${capability.avgDuration}ms` : 'N/A'}
                        </span>
                      </div>
                    </div>
                    <span className="text-gray-500 dark:text-gray-400">
                      Used: {capability.usageCount || 0} times
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {capability.tags?.map((tag, index) => (
                      <span 
                        key={index}
                        className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-md text-xs"
                      >
                        {tag}
                      </span>
                    )) || (
                      <span className="text-xs text-gray-400">No tags</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Capability Details */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <DocumentIcon className="w-5 h-5 mr-2 text-blue-500" />
            Capability Details
          </h3>

          {selectedCapabilityData ? (
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">{selectedCapabilityData.name}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ID: {selectedCapabilityData.id} • Category: {selectedCapabilityData.category || 'Uncategorized'}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(selectedCapabilityData.status)}`}>
                    {(selectedCapabilityData.status || 'unknown').toUpperCase()}
                  </span>
                </div>
                
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {selectedCapabilityData.description || 'No description available'}
                </p>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Success Rate</span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {selectedCapabilityData.successRate ? `${(selectedCapabilityData.successRate * 100).toFixed(1)}%` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Avg Duration</span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {selectedCapabilityData.avgDuration ? `${selectedCapabilityData.avgDuration}ms` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Usage Count</span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {selectedCapabilityData.usageCount || 0}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Type</span>
                    <p className="font-medium text-gray-900 dark:text-white capitalize">
                      {selectedCapabilityData.type || 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tags */}
              {selectedCapabilityData.tags && selectedCapabilityData.tags.length > 0 && (
                <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                  <h5 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                    <TagIcon className="w-4 h-4 mr-2 text-gray-500" />
                    Tags
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedCapabilityData.tags.map((tag, index) => (
                      <span 
                        key={index}
                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full text-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional metadata if available */}
              {selectedCapabilityData.metadata && (
                <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                  <h5 className="font-medium text-gray-900 dark:text-white mb-3">Metadata</h5>
                  <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto">
                    {JSON.stringify(selectedCapabilityData.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <div className="text-center">
                <DocumentIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">Select a capability to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 