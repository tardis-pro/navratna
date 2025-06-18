import React, { useState, useEffect } from 'react';
import { EnhancedAgentState } from '../../types/uaip-interfaces';
import { 
  SparklesIcon, 
  ChartBarIcon, 
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  CpuChipIcon,
  LightBulbIcon
} from '@heroicons/react/24/outline';

interface IntelligencePanelProps {
  agents: EnhancedAgentState[];
}

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

interface CognitiveInsight {
  id: string;
  type: 'pattern' | 'optimization' | 'risk' | 'opportunity';
  title: string;
  description: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  timestamp: Date;
}

export const IntelligencePanel: React.FC<IntelligencePanelProps> = ({ agents }) => {
  const [contextAnalyses, setContextAnalyses] = useState<ContextAnalysis[]>([]);
  const [decisionMetrics, setDecisionMetrics] = useState<DecisionMetrics>({
    totalDecisions: 0,
    successRate: 0,
    averageConfidence: 0,
    processingTime: 0,
    adaptationRate: 0
  });
  const [cognitiveInsights, setCognitiveInsights] = useState<CognitiveInsight[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  useEffect(() => {
    // Simulate real-time intelligence data
    const mockContextAnalyses: ContextAnalysis[] = [
      {
        conversationId: 'conv-1',
        intent: 'Code optimization request',
        confidence: 0.92,
        complexity: 7.5,
        entities: ['Python', 'performance', 'algorithm'],
        sentiment: 'neutral',
        timestamp: new Date(Date.now() - 300000)
      },
      {
        conversationId: 'conv-2',
        intent: 'Documentation generation',
        confidence: 0.88,
        complexity: 4.2,
        entities: ['API', 'documentation', 'Swagger'],
        sentiment: 'positive',
        timestamp: new Date(Date.now() - 600000)
      }
    ];

    const mockDecisionMetrics: DecisionMetrics = {
      totalDecisions: 156,
      successRate: 0.94,
      averageConfidence: 0.87,
      processingTime: 245,
      adaptationRate: 0.12
    };

    const mockInsights: CognitiveInsight[] = [
      {
        id: 'insight-1',
        type: 'pattern',
        title: 'Recurring Code Review Pattern',
        description: 'Agents consistently request additional context for security-related code reviews',
        confidence: 0.89,
        impact: 'medium',
        timestamp: new Date()
      },
      {
        id: 'insight-2',
        type: 'optimization',
        title: 'Decision Processing Optimization',
        description: 'Context analysis can be optimized by caching entity recognition results',
        confidence: 0.76,
        impact: 'high',
        timestamp: new Date()
      },
      {
        id: 'insight-3',
        type: 'opportunity',
        title: 'Cross-Agent Learning Opportunity',
        description: 'Knowledge sharing between Creative and Technical agents could improve outcomes',
        confidence: 0.82,
        impact: 'high',
        timestamp: new Date()
      }
    ];

    setContextAnalyses(mockContextAnalyses);
    setDecisionMetrics(mockDecisionMetrics);
    setCognitiveInsights(mockInsights);
  }, []);

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
      case 'high': return <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />;
      case 'medium': return <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />;
      default: return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
    }
  };

  const getInsightTypeIcon = (type: string) => {
    switch (type) {
      case 'pattern': return <ChartBarIcon className="w-5 h-5" />;
      case 'optimization': return <CpuChipIcon className="w-5 h-5" />;
      case 'opportunity': return <LightBulbIcon className="w-5 h-5" />;
      default: return <SparklesIcon className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-6">
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
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{decisionMetrics.processingTime}ms</p>
            </div>
            <ClockIcon className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Context Analyses */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <ChartBarIcon className="w-5 h-5 mr-2 text-blue-500" />
            Recent Context Analyses
          </h3>
          
          <div className="space-y-4">
            {contextAnalyses.map((analysis, index) => (
              <div key={index} className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-white">{analysis.intent}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {analysis.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${getConfidenceColor(analysis.confidence)}`}>
                      {(analysis.confidence * 100).toFixed(0)}% confidence
                    </span>
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${getComplexityColor(analysis.complexity)}`}>
                      {analysis.complexity.toFixed(1)} complexity
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-3">
                  {analysis.entities.map((entity, entityIndex) => (
                    <span 
                      key={entityIndex}
                      className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-md text-xs"
                    >
                      {entity}
                    </span>
                  ))}
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Sentiment: <span className={`font-medium ${
                      analysis.sentiment === 'positive' ? 'text-green-600' :
                      analysis.sentiment === 'negative' ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {analysis.sentiment}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cognitive Insights */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <LightBulbIcon className="w-5 h-5 mr-2 text-yellow-500" />
            Cognitive Insights
          </h3>
          
          <div className="space-y-4">
            {cognitiveInsights.map((insight) => (
              <div key={insight.id} className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${
                      insight.type === 'pattern' ? 'from-blue-500 to-purple-500' :
                      insight.type === 'optimization' ? 'from-green-500 to-blue-500' :
                      insight.type === 'opportunity' ? 'from-yellow-500 to-orange-500' :
                      'from-gray-500 to-slate-500'
                    } flex items-center justify-center`}>
                      {getInsightTypeIcon(insight.type)}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{insight.title}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{insight.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    {getImpactIcon(insight.impact)}
                    <span className="text-xs text-gray-500">{insight.impact}</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${getConfidenceColor(insight.confidence)}`}>
                    {(insight.confidence * 100).toFixed(0)}% confidence
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {insight.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Intelligence Breakdown */}
      <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
          <CpuChipIcon className="w-5 h-5 mr-2 text-indigo-500" />
          Agent Intelligence Metrics
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agents.filter(agent => agent && agent.persona).map((agent) => (
            <div key={agent.id} className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {agent.persona?.name?.charAt(0) || agent.name?.charAt(0) || 'A'}
                  </span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    {agent.persona?.name || agent.name || 'Unknown Agent'}
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {agent.persona?.role || agent.role || 'Agent'}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Decision Quality</span>
                  <span className="text-sm font-medium text-green-600">94%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Learning Rate</span>
                  <span className="text-sm font-medium text-blue-600">12%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Adaptation Score</span>
                  <span className="text-sm font-medium text-purple-600">8.7/10</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}; 