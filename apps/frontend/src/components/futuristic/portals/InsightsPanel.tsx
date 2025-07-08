import React, { useState, useEffect } from 'react';
import { useUAIP } from '@/contexts/UAIPContext';
import { motion } from 'framer-motion';
import { 
  LightBulbIcon, 
  ArrowTrendingUpIcon, 
  ChartBarIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

// Shared viewport interface
interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface InsightsPanelPortalProps {
  className?: string;
  viewport?: ViewportSize;
}

export const InsightsPanel: React.FC<InsightsPanelPortalProps> = ({ className, viewport }) => {
  const { insights, agents, operations, systemMetrics, refreshData, isWebSocketConnected } = useUAIP();
  const [selectedInsight, setSelectedInsight] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Default viewport setup
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  };

  const currentViewport = viewport || defaultViewport;

  // Filter insights based on type and status
  const filteredInsights = insights.data.filter(insight => {
    const matchesType = filterType === 'all' || insight.type === filterType;
    const matchesStatus = filterStatus === 'all' || insight.status === filterStatus;
    return matchesType && matchesStatus;
  });

  // Extract unique types and statuses for filters
  const insightTypes: string[] = ['all', ...Array.from(new Set(insights.data.map(insight => insight.type))) as string[]];
  const insightStatuses: string[] = ['all', ...Array.from(new Set(insights.data.map(insight => insight.status))) as string[]];

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'critical': return 'text-red-600';
      case 'high': return 'text-orange-600';
      case 'medium': return 'text-yellow-600';
      default: return 'text-green-600';
    }
  };

  const getImpactBadgeColor = (impact: string) => {
    switch (impact) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'pattern': return <ChartBarIcon className="w-6 h-6 text-blue-500" />;
      case 'optimization': return <ArrowTrendingUpIcon className="w-6 h-6 text-green-500" />;
      case 'opportunity': return <LightBulbIcon className="w-6 h-6 text-yellow-500" />;
      case 'risk': return <ExclamationTriangleIcon className="w-6 h-6 text-red-500" />;
      case 'anomaly': return <XMarkIcon className="w-6 h-6 text-purple-500" />;
      default: return <LightBulbIcon className="w-6 h-6 text-purple-500" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'pattern': return 'text-blue-500';
      case 'optimization': return 'text-green-500';
      case 'opportunity': return 'text-yellow-500';
      case 'risk': return 'text-red-500';
      case 'anomaly': return 'text-purple-500';
      default: return 'text-purple-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new': return <LightBulbIcon className="w-4 h-4 text-blue-500" />;
      case 'acknowledged': return <EyeIcon className="w-4 h-4 text-yellow-500" />;
      case 'acted_upon': return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'dismissed': return <XMarkIcon className="w-4 h-4 text-gray-500" />;
      default: return <LightBulbIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  const handleInsightAction = (insightId: string, action: 'acknowledge' | 'act_upon' | 'dismiss') => {
    // This would trigger an API call to update the insight status
    console.log(`${action} insight ${insightId}`);
    // In a real implementation, this would call an API endpoint
    // and then refresh the insights data
  };

  const selectedInsightData = insights.data.find(insight => insight.id === selectedInsight);

  // Calculate insight statistics
  const insightStats = {
    total: insights.data.length,
    new: insights.data.filter(i => i.status === 'new').length,
    acknowledged: insights.data.filter(i => i.status === 'acknowledged').length,
    acted_upon: insights.data.filter(i => i.status === 'acted_upon').length,
    dismissed: insights.data.filter(i => i.status === 'dismissed').length,
    high_impact: insights.data.filter(i => i.impact === 'high' || i.impact === 'critical').length
  };

  // Show error state
  if (insights.error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-500 dark:text-red-400">Failed to load insights</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{insights.error.message}</p>
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
  if (insights.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ArrowPathIcon className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading insights...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show empty state
  if (insights.data.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header with Connection Status */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
            <LightBulbIcon className="w-6 h-6 mr-2 text-yellow-500" />
            AI Insights Panel
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
              title="Refresh insights"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <LightBulbIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500 dark:text-gray-400">No insights available yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">Insights will appear as the system learns and analyzes patterns</p>
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
          <LightBulbIcon className="w-6 h-6 mr-2 text-yellow-500" />
          AI Insights Panel
        </h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-sm text-gray-500">
              {isWebSocketConnected ? 'Live' : 'Offline'} ({insightStats.total})
            </span>
          </div>
          <button
            onClick={refreshData}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Refresh insights"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          {insights.lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated: {insights.lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Insight Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{insightStats.total}</div>
            <div className="text-sm text-blue-600 dark:text-blue-400">Total</div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-800">
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{insightStats.new}</div>
            <div className="text-sm text-yellow-600 dark:text-yellow-400">New</div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">{insightStats.acknowledged}</div>
            <div className="text-sm text-purple-600 dark:text-purple-400">Reviewed</div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-900 dark:text-green-100">{insightStats.acted_upon}</div>
            <div className="text-sm text-green-600 dark:text-green-400">Acted</div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{insightStats.dismissed}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Dismissed</div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-900 dark:text-red-100">{insightStats.high_impact}</div>
            <div className="text-sm text-red-600 dark:text-red-400">High Impact</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Type:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {insightTypes.map((typeStr) => (
              <option key={typeStr} value={typeStr}>
                {typeStr.charAt(0).toUpperCase() + typeStr.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {insightStatuses.map((statusStr) => (
              <option key={statusStr} value={statusStr}>
                {statusStr.charAt(0).toUpperCase() + statusStr.slice(1).replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Insights List */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
            <LightBulbIcon className="w-5 h-5 mr-2 text-yellow-500" />
            AI Insights ({filteredInsights.length})
          </h3>
          
          {filteredInsights.length === 0 ? (
            <div className="text-center py-8">
              <LightBulbIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400">No insights match your filters</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredInsights.map((insight) => (
                <div 
                  key={insight.id}
                  className={`bg-white dark:bg-slate-700 rounded-xl p-4 border cursor-pointer transition-all ${
                    selectedInsight === insight.id 
                      ? 'border-blue-500 ring-2 ring-blue-500/20' 
                      : 'border-slate-200 dark:border-slate-600 hover:border-blue-300'
                  }`}
                  onClick={() => setSelectedInsight(insight.id)}
                >
                  <div className="flex items-start space-x-3">
                    {getTypeIcon(insight.type)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900 dark:text-white">{insight.title}</h4>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(insight.status)}
                          <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getImpactBadgeColor(insight.impact)}`}>
                            {insight.impact.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">{insight.description}</p>
                      <div className="flex items-center space-x-4 text-sm">
                        <span className="text-green-600">Confidence: {((insight.confidence || 0) * 100).toFixed(0)}%</span>
                        <span className={getImpactColor(insight.impact)}>Impact: {insight.impact}</span>
                        <span className="text-blue-600">Category: {insight.category}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        {insight.timestamp.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Insight Details */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <EyeIcon className="w-5 h-5 mr-2 text-purple-500" />
            Insight Details
          </h3>
          
          {selectedInsightData ? (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">{selectedInsightData.title}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">ID: {selectedInsightData.id}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(selectedInsightData.status)}
                    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getImpactBadgeColor(selectedInsightData.impact)}`}>
                      {selectedInsightData.impact.toUpperCase()}
                    </span>
                  </div>
                </div>
                
                <p className="text-gray-600 dark:text-gray-400 mb-4">{selectedInsightData.description}</p>
                
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Type:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedInsightData.type}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Category:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedInsightData.category}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Confidence:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{((selectedInsightData.confidence || 0) * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Status:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedInsightData.status.replace('_', ' ')}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600 dark:text-gray-400">Generated:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedInsightData.timestamp.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              {selectedInsightData.recommendations && selectedInsightData.recommendations.length > 0 && (
                <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                  <h5 className="font-semibold text-gray-900 dark:text-white mb-3">Recommendations</h5>
                  <ul className="space-y-2">
                    {selectedInsightData.recommendations.map((recommendation, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <CheckCircleIcon className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">{recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Buttons */}
              {selectedInsightData.status === 'new' && (
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleInsightAction(selectedInsightData.id, 'acknowledge')}
                    className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors"
                  >
                    Acknowledge
                  </button>
                  <button
                    onClick={() => handleInsightAction(selectedInsightData.id, 'act_upon')}
                    className="px-3 py-1 bg-green-500 text-white text-sm rounded-md hover:bg-green-600 transition-colors"
                  >
                    Act Upon
                  </button>
                  <button
                    onClick={() => handleInsightAction(selectedInsightData.id, 'dismiss')}
                    className="px-3 py-1 bg-gray-500 text-white text-sm rounded-md hover:bg-gray-600 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <LightBulbIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Select an insight to view details</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}; 