import React, { useState, useEffect } from 'react';
import { Capability } from '../../types/uaip-interfaces';
import { 
  PuzzlePieceIcon, 
  MagnifyingGlassIcon,
  StarIcon,
  ClockIcon,
  CheckCircleIcon,
  WrenchScrewdriverIcon,
  DocumentIcon,
  TagIcon
} from '@heroicons/react/24/outline';

interface CapabilityRegistryProps {
  capabilities: Capability[];
}

interface MockCapability {
  id: string;
  name: string;
  description: string;
  category: string;
  type: 'tool' | 'template' | 'service';
  successRate: number;
  avgDuration: number;
  usageCount: number;
  lastUsed: Date;
  rating: number;
  status: 'active' | 'deprecated' | 'beta';
  tags: string[];
}

export const CapabilityRegistry: React.FC<CapabilityRegistryProps> = ({ capabilities }) => {
  const [mockCapabilities, setMockCapabilities] = useState<MockCapability[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCapability, setSelectedCapability] = useState<string | null>(null);

  useEffect(() => {
    const mockData: MockCapability[] = [
      {
        id: 'cap-1',
        name: 'Code Analyzer',
        description: 'Analyzes code quality, performance, and best practices',
        category: 'Development',
        type: 'tool',
        successRate: 0.94,
        avgDuration: 1250,
        usageCount: 156,
        lastUsed: new Date(Date.now() - 180000),
        rating: 4.7,
        status: 'active',
        tags: ['code', 'analysis', 'quality', 'performance']
      },
      {
        id: 'cap-2',
        name: 'API Documentation Generator',
        description: 'Generates comprehensive API documentation from OpenAPI specs',
        category: 'Documentation',
        type: 'template',
        successRate: 0.98,
        avgDuration: 890,
        usageCount: 89,
        lastUsed: new Date(Date.now() - 600000),
        rating: 4.9,
        status: 'active',
        tags: ['api', 'documentation', 'openapi', 'swagger']
      },
      {
        id: 'cap-3',
        name: 'Security Vulnerability Scanner',
        description: 'Scans dependencies for known security vulnerabilities',
        category: 'Security',
        type: 'service',
        successRate: 0.92,
        avgDuration: 2100,
        usageCount: 67,
        lastUsed: new Date(Date.now() - 300000),
        rating: 4.6,
        status: 'active',
        tags: ['security', 'vulnerabilities', 'dependencies', 'scan']
      },
      {
        id: 'cap-4',
        name: 'Database Migration Tool',
        description: 'Automates database schema migrations with rollback support',
        category: 'Database',
        type: 'tool',
        successRate: 0.87,
        avgDuration: 3400,
        usageCount: 34,
        lastUsed: new Date(Date.now() - 1200000),
        rating: 4.2,
        status: 'beta',
        tags: ['database', 'migration', 'schema', 'rollback']
      }
    ];

    setMockCapabilities(mockData);
  }, []);

  const categories = ['all', ...Array.from(new Set(mockCapabilities.map(cap => cap.category)))];
  
  const filteredCapabilities = mockCapabilities.filter(cap => {
    const matchesSearch = cap.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         cap.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         cap.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || cap.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100 border-green-200';
      case 'beta': return 'text-blue-600 bg-blue-100 border-blue-200';
      case 'deprecated': return 'text-red-600 bg-red-100 border-red-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'tool': return <WrenchScrewdriverIcon className="w-4 h-4" />;
      case 'template': return <DocumentIcon className="w-4 h-4" />;
      case 'service': return <PuzzlePieceIcon className="w-4 h-4" />;
      default: return <PuzzlePieceIcon className="w-4 h-4" />;
    }
  };

  const selectedCapabilityData = mockCapabilities.find(cap => cap.id === selectedCapability);

  return (
    <div className="space-y-6">
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
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                      {getTypeIcon(capability.type)}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{capability.name}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{capability.description}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(capability.status)}`}>
                    {capability.status.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm mb-3">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1">
                      <StarIcon className="w-4 h-4 text-yellow-500" />
                      <span className="text-gray-900 dark:text-white">{capability.rating.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <CheckCircleIcon className="w-4 h-4 text-green-500" />
                      <span className="text-gray-900 dark:text-white">{(capability.successRate * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <ClockIcon className="w-4 h-4 text-blue-500" />
                      <span className="text-gray-900 dark:text-white">{(capability.avgDuration / 1000).toFixed(1)}s</span>
                    </div>
                  </div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Used {capability.usageCount} times
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {capability.tags.slice(0, 3).map((tag, index) => (
                    <span key={index} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded text-xs">
                      {tag}
                    </span>
                  ))}
                  {capability.tags.length > 3 && (
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs">
                      +{capability.tags.length - 3}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Capability Details */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <TagIcon className="w-5 h-5 mr-2 text-indigo-500" />
            Capability Details
          </h3>

          {selectedCapabilityData ? (
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <div className="flex items-start space-x-3 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                    {getTypeIcon(selectedCapabilityData.type)}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-white text-lg">{selectedCapabilityData.name}</h4>
                    <p className="text-gray-600 dark:text-gray-400">{selectedCapabilityData.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Category:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedCapabilityData.category}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Type:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedCapabilityData.type}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Status:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs font-medium border ${getStatusColor(selectedCapabilityData.status)}`}>
                      {selectedCapabilityData.status.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Last Used:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedCapabilityData.lastUsed.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <h5 className="font-semibold text-gray-900 dark:text-white mb-3">Performance Metrics</h5>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Success Rate</span>
                      <span className="text-gray-900 dark:text-white">{(selectedCapabilityData.successRate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${selectedCapabilityData.successRate * 100}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">User Rating</span>
                      <span className="text-gray-900 dark:text-white">{selectedCapabilityData.rating.toFixed(1)}/5.0</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div 
                        className="bg-yellow-500 h-2 rounded-full"
                        style={{ width: `${(selectedCapabilityData.rating / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Average Duration:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{(selectedCapabilityData.avgDuration / 1000).toFixed(1)}s</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Usage Count:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedCapabilityData.usageCount}</span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <h5 className="font-semibold text-gray-900 dark:text-white mb-3">Tags</h5>
                <div className="flex flex-wrap gap-2">
                  {selectedCapabilityData.tags.map((tag, index) => (
                    <span key={index} className="px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-md text-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex space-x-2">
                <button className="flex items-center space-x-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
                  <WrenchScrewdriverIcon className="w-4 h-4" />
                  <span>Test Capability</span>
                </button>
                <button className="flex items-center space-x-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors">
                  <DocumentIcon className="w-4 h-4" />
                  <span>View Documentation</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <PuzzlePieceIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Select a capability to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 