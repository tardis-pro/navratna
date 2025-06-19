import React, { useState, useEffect } from 'react';
import { useUAIP } from '../../contexts/UAIPContext';
import { 
  SparklesIcon, 
  ChartBarIcon, 
  ClockIcon,
  LightBulbIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  EyeIcon
} from '@heroicons/react/24/outline';

interface ContextAnalysis {
  conversationId: string;
  intent: string;
  confidence: number;
  complexity: number;
  entities: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  timestamp: Date;
}

interface DecisionMetrics {
  totalDecisions: number;
  successRate: number;
  averageConfidence: number;
  processingTime: number;
  adaptationRate: number;
}

export const IntelligencePanel: React.FC = () => {
  const { agents, insights, systemMetrics, refreshData, isWebSocketConnected } = useUAIP();
  const [contextAnalyses, setContextAnalyses] = useState<ContextAnalysis[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Calculate decision metrics from real agent data
  const decisionMetrics: DecisionMetrics = React.useMemo(() => {
    const agentData = agents.data;
    const activeAgents = agentData.filter(agent => agent.status === 'active');
    const totalOperations = agentData.reduce((sum, agent) => sum + agent.metrics.totalOperations, 0);
    const avgSuccessRate = activeAgents.length > 0 
      ? activeAgents.reduce((sum, agent) => sum + agent.metrics.successRate, 0) / activeAgents.length
      : 0;
    const avgResponseTime = activeAgents.length > 0
      ? activeAgents.reduce((sum, agent) => sum + agent.metrics.averageResponseTime, 0) / activeAgents.length
      : 0;

    return {
      totalDecisions: totalOperations,
      successRate: avgSuccessRate,
      averageConfidence: activeAgents.length > 0 
        ? activeAgents.reduce((sum, agent) => sum + agent.intelligenceMetrics.decisionAccuracy, 0) / activeAgents.length
        : 0,
      processingTime: avgResponseTime,
      adaptationRate: activeAgents.length > 0 
        ? activeAgents.reduce((sum, agent) => sum + agent.intelligenceMetrics.adaptationRate, 0) / activeAgents.length
        : 0
    };
  }, [agents.data]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-100';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getComplexityColor = (complexity: number) => {
    if (complexity >= 7) return 'text-red-600 bg-red-100';
    if (complexity >= 4) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'high': return <LightBulbIcon className="w-4 h-4 text-red-500" />;
      case 'medium': return <LightBulbIcon className="w-4 h-4 text-yellow-500" />;
      default: return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
    }
  };

  const getInsightTypeIcon = (type: string) => {
    switch (type) {
      case 'pattern': return <ChartBarIcon className="w-5 h-5" />;
      case 'optimization': return <ArrowTrendingUpIcon className="w-5 h-5" />;
      case 'opportunity': return <LightBulbIcon className="w-5 h-5" />;
      default: return <SparklesIcon className="w-5 h-5" />;
    }
  };

  const getInsightTypeColor = (type: string) => {
    switch (type) {
      case 'pattern': return 'text-blue-500';
      case 'optimization': return 'text-green-500';
      case 'opportunity': return 'text-yellow-500';
      case 'risk': return 'text-red-500';
      default: return 'text-purple-500';
    }
  };

  // Show error state
  if (agents.error || insights.error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-500 dark:text-red-400">Failed to load intelligence data</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
              {agents.error?.message || insights.error?.message}
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
  if (agents.isLoading || insights.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ArrowPathIcon className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading intelligence data...</p>
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
          <SparklesIcon className="w-6 h-6 mr-2 text-blue-500" />
          Intelligence Panel
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
            title="Refresh intelligence data"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          {agents.lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated: {agents.lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Intelligence Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Decisions</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{decisionMetrics.totalDecisions}</p>
            </div>
            <SparklesIcon className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">Success Rate</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{(decisionMetrics.successRate * 100).toFixed(1)}%</p>
            </div>
            <CheckCircleIcon className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Avg Confidence</p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{(decisionMetrics.averageConfidence * 100).toFixed(1)}%</p>
            </div>
            <ArrowTrendingUpIcon className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-600 dark:text-orange-400">Avg Processing</p>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{decisionMetrics.processingTime.toFixed(0)}ms</p>
            </div>
            <ClockIcon className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Insights */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <LightBulbIcon className="w-5 h-5 mr-2 text-yellow-500" />
            AI Insights ({insights.data.length})
          </h3>

          {insights.data.length > 0 ? (
            <div className="space-y-4">
              {insights.data.slice(0, 5).map((insight) => (
                <div key={insight.id} className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                  <div className="flex items-start space-x-3">
                    <div className={`${getInsightTypeColor(insight.type)}`}>
                      {getInsightTypeIcon(insight.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900 dark:text-white">{insight.title}</h4>
                        <div className="flex items-center space-x-2">
                          {getImpactIcon(insight.impact)}
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            insight.impact === 'high' ? 'bg-red-100 text-red-700' :
                            insight.impact === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {insight.impact.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">{insight.description}</p>
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-blue-600 dark:text-blue-400">
                          Confidence: {(insight.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="text-gray-500">
                          {insight.timestamp.toLocaleTimeString()}
                        </span>
                      </div>

                      {insight.recommendations && insight.recommendations.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Recommendations:</p>
                          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                            {insight.recommendations.slice(0, 2).map((rec, index) => (
                              <li key={index} className="flex items-start">
                                <span className="text-blue-500 mr-1">•</span>
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <div className="text-center">
                <LightBulbIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">No insights available</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">Insights will appear as agents become active</p>
              </div>
            </div>
          )}
        </div>

        {/* Agent Intelligence Metrics */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <ChartBarIcon className="w-5 h-5 mr-2 text-blue-500" />
            Agent Intelligence Metrics
          </h3>

          {agents.data.length > 0 ? (
            <div className="space-y-4">
              {agents.data.slice(0, 4).map((agent) => (
                <div 
                  key={agent.id} 
                  className={`bg-white dark:bg-slate-700 rounded-xl p-4 border cursor-pointer transition-all ${
                    selectedAgent === agent.id 
                      ? 'border-blue-500 ring-2 ring-blue-500/20' 
                      : 'border-slate-200 dark:border-slate-600 hover:border-blue-300'
                  }`}
                  onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        agent.status === 'active' ? 'bg-green-500' :
                        agent.status === 'busy' ? 'bg-yellow-500' :
                        agent.status === 'idle' ? 'bg-blue-500' : 'bg-gray-500'
                      }`} />
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">{agent.name}</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{agent.role}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      agent.status === 'active' ? 'bg-green-100 text-green-700' :
                      agent.status === 'busy' ? 'bg-yellow-100 text-yellow-700' :
                      agent.status === 'idle' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {agent.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Decision Accuracy</span>
                      <div className="flex items-center mt-1">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2 mr-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full" 
                            style={{ width: `${agent.intelligenceMetrics.decisionAccuracy * 100}%` }}
                          />
                        </div>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {(agent.intelligenceMetrics.decisionAccuracy * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Context Understanding</span>
                      <div className="flex items-center mt-1">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2 mr-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full" 
                            style={{ width: `${agent.intelligenceMetrics.contextUnderstanding * 100}%` }}
                          />
                        </div>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {(agent.intelligenceMetrics.contextUnderstanding * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedAgent === agent.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Adaptation Rate</span>
                          <div className="flex items-center mt-1">
                            <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2 mr-2">
                              <div 
                                className="bg-purple-500 h-2 rounded-full" 
                                style={{ width: `${agent.intelligenceMetrics.adaptationRate * 100}%` }}
                              />
                            </div>
                            <span className="text-gray-900 dark:text-white font-medium">
                              {(agent.intelligenceMetrics.adaptationRate * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Learning Progress</span>
                          <div className="flex items-center mt-1">
                            <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2 mr-2">
                              <div 
                                className="bg-orange-500 h-2 rounded-full" 
                                style={{ width: `${agent.intelligenceMetrics.learningProgress * 100}%` }}
                              />
                            </div>
                            <span className="text-gray-900 dark:text-white font-medium">
                              {(agent.intelligenceMetrics.learningProgress * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        <p>Operations: {agent.metrics.totalOperations} | Success Rate: {(agent.metrics.successRate * 100).toFixed(1)}%</p>
                        <p>Avg Response: {agent.metrics.averageResponseTime}ms | Capabilities: {agent.capabilities.length}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <div className="text-center">
                <ChartBarIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">No agents available</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">Agent metrics will appear when agents are active</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 