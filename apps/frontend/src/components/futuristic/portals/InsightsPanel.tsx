import React, { useState, useEffect as _useEffect } from 'react';
import { useUAIP } from '@/contexts/UAIPContext';
import {
  Lightbulb,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  Eye,
  CheckCircle,
  X,
} from 'lucide-react';
import { ViewportSize, useViewport } from '@/hooks/use_viewport';
import {
  PortalContainer,
  PortalLoadingState,
  PortalEmptyState,
  PortalErrorState,
  PortalHeader,
} from './portal-shared-components';

interface InsightsPanelPortalProps {
  className?: string;
  viewport?: ViewportSize;
}

export const InsightsPanel: React.FC<InsightsPanelPortalProps> = ({ className, viewport }) => {
  const {
    insights,
    agents: _agents,
    operations: _operations,
    systemMetrics: _systemMetrics,
    refreshData,
    isWebSocketConnected,
  } = useUAIP();
  const [selectedInsight, setSelectedInsight] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const currentViewport = useViewport(viewport);

  // Filter insights based on type and status
  const filteredInsights = insights.data.filter((insight) => {
    const matchesType = filterType === 'all' || insight.type === filterType;
    const matchesStatus = filterStatus === 'all' || insight.status === filterStatus;
    return matchesType && matchesStatus;
  });

  // Extract unique types and statuses for filters
  const insightTypes: string[] = [
    'all',
    ...Array.from(new Set<string>(insights.data.map((insight) => insight.type))),
  ];
  const insightStatuses: string[] = [
    'all',
    ...Array.from(new Set<string>(insights.data.map((insight) => insight.status))),
  ];

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'critical':
        return 'text-red-600';
      case 'high':
        return 'text-orange-600';
      case 'medium':
        return 'text-yellow-600';
      default:
        return 'text-green-600';
    }
  };

  const getImpactBadgeColor = (impact: string) => {
    switch (impact) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'pattern':
        return <BarChart3 className="w-6 h-6 text-blue-500" />;
      case 'optimization':
        return <TrendingUp className="w-6 h-6 text-green-500" />;
      case 'opportunity':
        return <Lightbulb className="w-6 h-6 text-yellow-500" />;
      case 'risk':
        return <AlertTriangle className="w-6 h-6 text-red-500" />;
      case 'anomaly':
        return <X className="w-6 h-6 text-purple-500" />;
      default:
        return <Lightbulb className="w-6 h-6 text-purple-500" />;
    }
  };

  const _getTypeColor = (type: string) => {
    switch (type) {
      case 'pattern':
        return 'text-blue-500';
      case 'optimization':
        return 'text-green-500';
      case 'opportunity':
        return 'text-yellow-500';
      case 'risk':
        return 'text-red-500';
      case 'anomaly':
        return 'text-purple-500';
      default:
        return 'text-purple-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new':
        return <Lightbulb className="w-4 h-4 text-blue-500" />;
      case 'acknowledged':
        return <Eye className="w-4 h-4 text-yellow-500" />;
      case 'acted_upon':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'dismissed':
        return <X className="w-4 h-4 text-gray-500" />;
      default:
        return <Lightbulb className="w-4 h-4 text-gray-400" />;
    }
  };

  const handleInsightAction = (
    _insightId: string,
    _action: 'acknowledge' | 'act_upon' | 'dismiss'
  ) => {
    // This would trigger an API call to update the insight status
    // In a real implementation, this would call an API endpoint
    // and then refresh the insights data
  };

  const selectedInsightData = insights.data.find((insight) => insight.id === selectedInsight);

  // Calculate insight statistics
  const insightStats = {
    total: insights.data.length,
    new: insights.data.filter((i) => i.status === 'new').length,
    processed: insights.data.filter((i) => ['acknowledged', 'acted_upon', 'dismissed'].includes(i.status)).length,
    high_impact: insights.data.filter((i) => i.impact === 'high' || i.impact === 'critical').length,
  };

  // Show error state
  if (insights.error) {
    return (
      <PortalContainer className={className}>
        <PortalErrorState
          message="Failed to load insights"
          detail={insights.error.message}
          onRetry={refreshData}
        />
      </PortalContainer>
    );
  }

  if (insights.isLoading) {
    return (
      <PortalContainer className={className}>
        <PortalLoadingState message="Loading insights..." />
      </PortalContainer>
    );
  }

  if (insights.data.length === 0) {
    return (
      <PortalContainer className={className}>
        <PortalHeader
          icon={<Lightbulb className="w-6 h-6 mr-2 text-yellow-500" />}
          title="AI Insights Panel"
          isConnected={isWebSocketConnected}
          onRefresh={refreshData}
        />

        <PortalEmptyState
          icon={<Lightbulb className="w-8 h-8 text-gray-400 mx-auto mb-2" />}
          title="No insights available yet"
          description="Insights will appear as the system learns and analyzes patterns"
        />
      </PortalContainer>
    );
  }

  return (
    <PortalContainer className={className}>
      <PortalHeader
        icon={<Lightbulb className="w-6 h-6 mr-2 text-yellow-500" />}
        title="AI Insights Panel"
        isConnected={isWebSocketConnected}
        onRefresh={refreshData}
      />

      {/* Insight Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 backdrop-blur-xl">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-100">
              {insightStats.total}
            </div>
            <div className="text-sm text-slate-400">Total</div>
          </div>
        </div>
        <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 backdrop-blur-xl">
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">
              {insightStats.new}
            </div>
            <div className="text-sm text-slate-400">New</div>
          </div>
        </div>
        <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 backdrop-blur-xl">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              {insightStats.processed}
            </div>
            <div className="text-sm text-slate-400">Processed</div>
          </div>
        </div>
        <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 backdrop-blur-xl">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">
              {insightStats.high_impact}
            </div>
            <div className="text-sm text-slate-400">High Impact</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-slate-300">Type:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1 border border-slate-700/60 rounded-lg bg-slate-900/50 text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-xl"
          >
            {insightTypes.map((typeStr) => (
              <option key={typeStr} value={typeStr}>
                {typeStr.charAt(0).toUpperCase() + typeStr.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-slate-300">Status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1 border border-slate-700/60 rounded-lg bg-slate-900/50 text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-xl"
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
          <h3 className="text-lg font-bold text-slate-100 flex items-center">
            <Lightbulb className="w-5 h-5 mr-2 text-yellow-500" />
            AI Insights ({filteredInsights.length})
          </h3>

          {filteredInsights.length === 0 ? (
            <div className="text-center py-8">
              <Lightbulb className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-slate-400">No insights match your filters</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredInsights.map((insight) => (
                <div
                  key={insight.id}
                  className={`bg-slate-900/40 rounded-xl p-4 border cursor-pointer transition-all backdrop-blur-xl ${
                    selectedInsight === insight.id
                      ? 'border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-slate-700/50 hover:border-blue-400/50'
                  }`}
                  onClick={() => setSelectedInsight(insight.id)}
                >
                  <div className="flex items-start space-x-3">
                    {getTypeIcon(insight.type)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-slate-100">
                          {insight.title}
                        </h4>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(insight.status)}
                          <span
                            className={`px-2 py-1 rounded-md text-xs font-medium border ${getImpactBadgeColor(insight.impact)}`}
                          >
                            {insight.impact.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <p className="text-slate-400 text-sm mb-3">
                        {insight.description}
                      </p>
                      <div className="flex items-center space-x-4 text-sm">
                        <span className="text-green-400">
                          Confidence: {((insight.confidence || 0) * 100).toFixed(0)}%
                        </span>
                        <span className={getImpactColor(insight.impact)}>
                          Impact: {insight.impact}
                        </span>
                        <span className="text-blue-400">Category: {insight.category}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-2">
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
        <div className="bg-slate-900/40 rounded-2xl p-6 border border-slate-700/50 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center">
            <Eye className="w-5 h-5 mr-2 text-purple-500" />
            Insight Details
          </h3>

          {selectedInsightData ? (
            <div className="space-y-4">
              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-slate-100">
                      {selectedInsightData.title}
                    </h4>
                    <p className="text-sm text-slate-400">
                      ID: {selectedInsightData.id}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(selectedInsightData.status)}
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-medium border ${getImpactBadgeColor(selectedInsightData.impact)}`}
                    >
                      {selectedInsightData.impact.toUpperCase()}
                    </span>
                  </div>
                </div>

                <p className="text-slate-300 mb-4">
                  {selectedInsightData.description}
                </p>

                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <span className="text-slate-400">Type:</span>
                    <span className="ml-2 text-slate-100">
                      {selectedInsightData.type}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Category:</span>
                    <span className="ml-2 text-slate-100">
                      {selectedInsightData.category}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Confidence:</span>
                    <span className="ml-2 text-slate-100">
                      {((selectedInsightData.confidence || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Status:</span>
                    <span className="ml-2 text-slate-100">
                      {selectedInsightData.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400">Generated:</span>
                    <span className="ml-2 text-slate-100">
                      {selectedInsightData.timestamp.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              {selectedInsightData.recommendations &&
                selectedInsightData.recommendations.length > 0 && (
                  <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
                    <h5 className="font-semibold text-slate-100 mb-3">
                      Recommendations
                    </h5>
                    <ul className="space-y-2">
                      {selectedInsightData.recommendations.map((recommendation, _index) => (
                        <li
                          key={`recommendation-${recommendation.substring(0, 20)}`}
                          className="flex items-start space-x-2"
                        >
                          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-slate-300">
                            {recommendation}
                          </span>
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
                    className="px-3 py-1 bg-slate-800/80 border border-slate-700/60 text-slate-300 text-sm rounded-md hover:bg-slate-700/60 transition-colors"
                  >
                    Acknowledge
                  </button>
                  <button
                    onClick={() => handleInsightAction(selectedInsightData.id, 'act_upon')}
                    className="px-3 py-1 bg-slate-800/80 border border-slate-700/60 text-slate-300 text-sm rounded-md hover:bg-slate-700/60 transition-colors"
                  >
                    Act Upon
                  </button>
                  <button
                    onClick={() => handleInsightAction(selectedInsightData.id, 'dismiss')}
                    className="px-3 py-1 bg-slate-800/80 border border-slate-700/60 text-slate-300 text-sm rounded-md hover:bg-slate-700/60 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Lightbulb className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400">Select an insight to view details</p>
            </div>
          )}
        </div>
      </div>
    </PortalContainer>
  );
};
