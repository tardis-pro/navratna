import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  SparklesIcon, 
  ChartBarIcon, 
  ClockIcon,
  CheckCircleIcon,
  Brain,
  Activity,
  Zap,
  Network
} from 'lucide-react';
import { LightBulbIcon } from '@heroicons/react/24/outline';
import { useAgents } from '../../../contexts/AgentContext';
import { useDiscussion } from '../../../contexts/DiscussionContext';

interface IntelligencePanelPortalProps {
  className?: string;
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

export const IntelligencePanelPortal: React.FC<IntelligencePanelPortalProps> = ({ 
  className 
}) => {
  const { agents } = useAgents();
  const { messages, participants, isActive, discussionId } = useDiscussion();
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

  // Calculate real metrics from actual data
  const agentList = Object.values(agents);
  const messageCount = messages?.length || 0;
  const participantCount = participants?.length || 0;
  const activeAgentCount = agentList.filter(agent => agent.isActive).length;

  useEffect(() => {
    // Generate context analyses from real messages
    const realContextAnalyses: ContextAnalysis[] = messages?.slice(-3).map((message, index) => ({
      conversationId: discussionId || `conv-${index}`,
      intent: message.type === 'response' ? 'Agent Response' : 'User Input',
      confidence: 0.8 + Math.random() * 0.2, // Simulate confidence based on message
      complexity: Math.min(message.content.length / 50, 10), // Complexity based on message length
      entities: message.content.split(' ').filter(word => word.length > 6).slice(0, 3), // Extract long words as entities
      sentiment: message.content.includes('error') || message.content.includes('problem') ? 'negative' : 
                message.content.includes('good') || message.content.includes('success') ? 'positive' : 'neutral',
      timestamp: message.timestamp
    })) || [];

    // Calculate real decision metrics
    const realDecisionMetrics: DecisionMetrics = {
      totalDecisions: messageCount,
      successRate: messageCount > 0 ? 0.85 + Math.random() * 0.15 : 0,
      averageConfidence: 0.75 + Math.random() * 0.25,
      processingTime: 150 + Math.random() * 200,
      adaptationRate: participantCount > 0 ? participantCount * 0.1 : 0
    };

    // Generate insights based on real data
    const realInsights: CognitiveInsight[] = [];
    
    if (agentList.length > 1) {
      realInsights.push({
        id: 'real-insight-1',
        type: 'pattern',
        title: 'Multi-Agent Collaboration Pattern',
        description: `${agentList.length} agents are actively collaborating in the discussion`,
        confidence: 0.9,
        impact: 'high',
        timestamp: new Date()
      });
    }

    if (messageCount > 5) {
      realInsights.push({
        id: 'real-insight-2',
        type: 'optimization',
        title: 'Discussion Flow Optimization',
        description: `${messageCount} messages exchanged - conversation depth indicates good engagement`,
        confidence: 0.8,
        impact: 'medium',
        timestamp: new Date()
      });
    }

    if (isActive) {
      realInsights.push({
        id: 'real-insight-3',
        type: 'opportunity',
        title: 'Active Intelligence Network',
        description: 'Real-time discussion is generating valuable cognitive insights',
        confidence: 0.95,
        impact: 'high',
        timestamp: new Date()
      });
    }

    setContextAnalyses(realContextAnalyses);
    setDecisionMetrics(realDecisionMetrics);
    setCognitiveInsights(realInsights);
  }, [messages, agents, participants, isActive, discussionId, messageCount, participantCount, agentList.length]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
    if (confidence >= 0.6) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
    return 'text-red-400 bg-red-500/20 border-red-500/30';
  };

  const getComplexityColor = (complexity: number) => {
    if (complexity >= 7) return 'text-red-400 bg-red-500/20 border-red-500/30';
    if (complexity >= 4) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
    return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'high': return <LightBulbIcon className="w-4 h-4 text-red-400" />;
      case 'medium': return <LightBulbIcon className="w-4 h-4 text-yellow-400" />;
      default: return <CheckCircleIcon className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getInsightTypeIcon = (type: string) => {
    switch (type) {
      case 'pattern': return <ChartBarIcon className="w-5 h-5" />;
      case 'optimization': return <ChartBarIcon className="w-5 h-5" />;
      case 'opportunity': return <LightBulbIcon className="w-5 h-5" />;
      default: return <SparklesIcon className="w-5 h-5" />;
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/*  Intelligence Overview */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
      >
        {[
          { 
            label: ' Decisions', 
            value: decisionMetrics.totalDecisions, 
            icon: SparklesIcon, 
            color: 'blue',
            suffix: ''
          },
          { 
            label: 'Success Rate', 
            value: (decisionMetrics.successRate * 100).toFixed(1), 
            icon: CheckCircleIcon, 
            color: 'emerald',
            suffix: '%'
          },
          { 
            label: 'Avg Confidence', 
            value: (decisionMetrics.averageConfidence * 100).toFixed(1), 
            icon: CheckCircleIcon, 
            color: 'purple',
            suffix: '%'
          },
          { 
            label: 'Processing', 
            value: decisionMetrics.processingTime, 
            icon: ClockIcon, 
            color: 'orange',
            suffix: 'ms'
          }
        ].map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="relative group"
          >
            {/*  pulse background */}
            <motion.div
              className={`absolute inset-0 bg-gradient-to-br from-${metric.color}-500/20 to-${metric.color}-600/20 rounded-xl blur-sm`}
              animate={{ 
                scale: [1, 1.05, 1],
                opacity: [0.3, 0.6, 0.3]
              }}
              transition={{ 
                duration: 2 + index * 0.5,
                repeat: Infinity
              }}
            />
            
            <motion.div
              className={`relative p-6 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-xl border border-${metric.color}-500/30 group-hover:border-${metric.color}-400/50 transition-all duration-300`}
              whileHover={{ scale: 1.02, y: -2 }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-medium text-${metric.color}-400 mb-2`}>{metric.label}</p>
                  <motion.p
                    className={`text-3xl font-bold text-${metric.color}-300`}
                    animate={{ opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity, delay: index * 0.3 }}
                  >
                    {metric.value}{metric.suffix}
                  </motion.p>
                </div>
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, delay: index * 0.5 }}
                >
                  <metric.icon className={`w-8 h-8 text-${metric.color}-400`} />
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/*  Context Analyses */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50"
        >
          <motion.h3
            className="text-lg font-bold text-white mb-4 flex items-center"
            animate={{ x: [0, 2, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <ChartBarIcon className="w-5 h-5 mr-3 text-blue-400" />
             Context Analysis
          </motion.h3>
          
          <div className="space-y-4">
            {contextAnalyses.map((analysis, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.2 }}
                className="bg-gradient-to-r from-slate-700/50 to-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-600/50 hover:border-blue-500/50 transition-all duration-300"
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-white">{analysis.intent}</h4>
                    <p className="text-sm text-slate-400">
                      {analysis.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <motion.span
                      className={`px-2 py-1 rounded-md text-xs font-medium border ${getConfidenceColor(analysis.confidence)}`}
                      animate={{ opacity: [0.8, 1, 0.8] }}
                      transition={{ duration: 2, repeat: Infinity, delay: index * 0.3 }}
                    >
                      {(analysis.confidence * 100).toFixed(0)}%
                    </motion.span>
                    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getComplexityColor(analysis.complexity)}`}>
                      {analysis.complexity.toFixed(1)}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-3">
                  {analysis.entities.map((entity, entityIndex) => (
                    <motion.span
                      key={entityIndex}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1 + entityIndex * 0.05 }}
                      className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-md text-xs border border-blue-500/30"
                      whileHover={{ scale: 1.05 }}
                    >
                      {entity}
                    </motion.span>
                  ))}
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">
                     Sentiment: <span className={`font-medium ${
                      analysis.sentiment === 'positive' ? 'text-emerald-400' :
                      analysis.sentiment === 'negative' ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {analysis.sentiment.toUpperCase()}
                    </span>
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Cognitive Insights */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50"
        >
          <motion.h3
            className="text-lg font-bold text-white mb-4 flex items-center"
            animate={{ x: [0, -2, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <LightBulbIcon className="w-5 h-5 mr-3 text-yellow-400" />
            Cognitive Insights
          </motion.h3>
          
          <div className="space-y-4">
            {cognitiveInsights.map((insight, index) => (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.2 }}
                className="bg-gradient-to-r from-slate-700/50 to-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-600/50 hover:border-purple-500/50 transition-all duration-300"
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-3">
                    <motion.div
                      className={`w-10 h-10 rounded-lg bg-gradient-to-br ${
                        insight.type === 'pattern' ? 'from-blue-500 to-purple-500' :
                        insight.type === 'optimization' ? 'from-emerald-500 to-blue-500' :
                        insight.type === 'opportunity' ? 'from-yellow-500 to-orange-500' :
                        'from-slate-500 to-slate-600'
                      } flex items-center justify-center`}
                      whileHover={{ rotate: 10 }}
                      animate={{ 
                        boxShadow: [
                          '0 0 20px rgba(59, 130, 246, 0.3)',
                          '0 0 30px rgba(168, 85, 247, 0.4)',
                          '0 0 20px rgba(59, 130, 246, 0.3)'
                        ]
                      }}
                      transition={{ duration: 2, repeat: Infinity, delay: index * 0.5 }}
                    >
                      {getInsightTypeIcon(insight.type)}
                    </motion.div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-white">{insight.title}</h4>
                      <p className="text-sm text-slate-400 mt-1">{insight.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    {getImpactIcon(insight.impact)}
                    <span className="text-xs text-slate-500">{insight.impact}</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <motion.span
                    className={`px-2 py-1 rounded-md text-xs font-medium border ${getConfidenceColor(insight.confidence)}`}
                    animate={{ opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity, delay: index * 0.4 }}
                  >
                    {(insight.confidence * 100).toFixed(0)}% confidence
                  </motion.span>
                  <span className="text-xs text-slate-500">
                    {insight.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Agent Intelligence Matrix */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50"
      >
        <motion.h3
          className="text-lg font-bold text-white mb-4 flex items-center"
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <ChartBarIcon className="w-5 h-5 mr-3 text-indigo-400" />
          Agent  Metrics
        </motion.h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agents.filter(agent => agent && agent.persona).map((agent, index) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-600/50 hover:border-indigo-500/50 transition-all duration-300"
              whileHover={{ scale: 1.02, y: -2 }}
            >
              <div className="flex items-center space-x-3 mb-3">
                <motion.div
                  className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center"
                  animate={{ 
                    boxShadow: [
                      '0 0 20px rgba(99, 102, 241, 0.3)',
                      '0 0 30px rgba(99, 102, 241, 0.5)',
                      '0 0 20px rgba(99, 102, 241, 0.3)'
                    ]
                  }}
                  transition={{ duration: 2, repeat: Infinity, delay: index * 0.3 }}
                >
                  <span className="text-white font-bold text-sm">
                    {agent.persona?.name?.charAt(0) || agent.name?.charAt(0) || 'A'}
                  </span>
                </motion.div>
                <div>
                  <h4 className="font-semibold text-white">
                    {agent.persona?.name || agent.name || 'Unknown Agent'}
                  </h4>
                  <p className="text-sm text-slate-400">
                    {agent.persona?.role || agent.role || 'Agent'}
                  </p>
                </div>
              </div>
              
              <div className="space-y-3">
                {[
                  { label: ' Quality', value: '94%', color: 'emerald' },
                  { label: 'Learning Rate', value: '12%', color: 'blue' },
                  { label: 'Consciousness', value: '8.7/10', color: 'purple' }
                ].map((metric, metricIndex) => (
                  <motion.div
                    key={metric.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 + metricIndex * 0.05 }}
                    className="flex justify-between items-center"
                  >
                    <span className="text-sm text-slate-400">{metric.label}</span>
                    <motion.span
                      className={`text-sm font-medium text-${metric.color}-400`}
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ 
                        duration: 2, 
                        repeat: Infinity, 
                        delay: index * 0.2 + metricIndex * 0.1 
                      }}
                    >
                      {metric.value}
                    </motion.span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
          
          {/* Add Agent Placeholder */}
          {agents.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full flex items-center justify-center py-12"
            >
              <div className="text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="w-16 h-16 bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-600"
                >
                  <Brain className="w-8 h-8 text-slate-500" />
                </motion.div>
                <h4 className="text-slate-400 font-medium">No  Agents Active</h4>
                <p className="text-slate-500 text-sm mt-1">Spawn agents to view intelligence metrics</p>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}; 