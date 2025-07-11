import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { GlobalAutocomplete } from '@/components/ui/GlobalAutocomplete';
import { useDiscussion } from '@/contexts/DiscussionContext';
import { useAgents } from '@/contexts/AgentContext';
import { TurnStrategy, ParticipantRole, DiscussionVisibility } from '@uaip/types';
import type { Message } from '@/types/agent';
import { cn } from '@/lib/utils';
import uaipAPI from '@/utils/uaip-api';
import { DiscussionHistory } from './DiscussionHistory';
import {
  MessageSquare, Brain, Clock, User, Play, Users, AlertCircle, Loader2, Activity,
  Network, Zap, Eye, EyeOff, Filter, Search, Download, Pause, RotateCcw, Settings,
  FileText, Code, Presentation, Target, Sparkles, TrendingUp, Cpu, Plus, RefreshCw,
  Grid, List
} from 'lucide-react';

export type DiscussionPurpose = 
  | 'brainstorm'
  | 'analysis' 
  | 'code-generation'
  | 'documentation'
  | 'prd-creation'
  | 'problem-solving'
  | 'research'
  | 'decision-making';

export type ArtifactType = 
  | 'document'
  | 'code'
  | 'presentation'
  | 'prd'
  | 'analysis-report'
  | 'action-plan'
  | 'research-summary'
  | 'decision-matrix';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface DiscussionPortalProps {
  className?: string;
  viewport?: ViewportSize;
  defaultView?: 'grid' | 'list' | 'settings';
  mode?: 'discussion' | 'monitor' | 'manager';
}

// Discussion purpose configurations
const DISCUSSION_PURPOSES: Array<{
  value: DiscussionPurpose;
  label: string;
  description: string;
  icon: React.ReactNode;
  artifacts: ArtifactType[];
}> = [
  {
    value: 'brainstorm',
    label: 'Brainstorming',
    description: 'Generate creative ideas and solutions',
    icon: <Brain className="w-5 h-5" />,
    artifacts: ['document', 'action-plan', 'presentation']
  },
  {
    value: 'analysis',
    label: 'Analysis & Review',
    description: 'Deep dive analysis of content or concepts',
    icon: <Target className="w-5 h-5" />,
    artifacts: ['analysis-report', 'document', 'presentation']
  },
  {
    value: 'code-generation',
    label: 'Code Generation',
    description: 'Collaborative coding and development',
    icon: <Code className="w-5 h-5" />,
    artifacts: ['code', 'document', 'analysis-report']
  },
  {
    value: 'documentation',
    label: 'Documentation',
    description: 'Create comprehensive documentation',
    icon: <FileText className="w-5 h-5" />,
    artifacts: ['document', 'presentation', 'research-summary']
  },
  {
    value: 'prd-creation',
    label: 'PRD Creation',
    description: 'Product Requirements Document development',
    icon: <Presentation className="w-5 h-5" />,
    artifacts: ['prd', 'document', 'presentation']
  },
  {
    value: 'problem-solving',
    label: 'Problem Solving',
    description: 'Systematic problem resolution',
    icon: <Zap className="w-5 h-5" />,
    artifacts: ['action-plan', 'analysis-report', 'decision-matrix']
  },
  {
    value: 'research',
    label: 'Research & Investigation',
    description: 'Comprehensive research and fact-finding',
    icon: <Sparkles className="w-5 h-5" />,
    artifacts: ['research-summary', 'document', 'analysis-report']
  },
  {
    value: 'decision-making',
    label: 'Decision Making',
    description: 'Structured decision analysis and planning',
    icon: <Users className="w-5 h-5" />,
    artifacts: ['decision-matrix', 'analysis-report', 'action-plan']
  }
];

const ARTIFACT_TYPES: Record<ArtifactType, { label: string; description: string; icon: React.ReactNode }> = {
  'document': {
    label: 'Document',
    description: 'Comprehensive written document',
    icon: <FileText className="w-4 h-4" />
  },
  'code': {
    label: 'Code',
    description: 'Source code and implementation',
    icon: <Code className="w-4 h-4" />
  },
  'presentation': {
    label: 'Presentation',
    description: 'Slide deck or presentation format',
    icon: <Presentation className="w-4 h-4" />
  },
  'prd': {
    label: 'PRD',
    description: 'Product Requirements Document',
    icon: <Target className="w-4 h-4" />
  },
  'analysis-report': {
    label: 'Analysis Report',
    description: 'Detailed analysis with findings',
    icon: <Brain className="w-4 h-4" />
  },
  'action-plan': {
    label: 'Action Plan',
    description: 'Step-by-step execution plan',
    icon: <Zap className="w-4 h-4" />
  },
  'research-summary': {
    label: 'Research Summary',
    description: 'Consolidated research findings',
    icon: <Sparkles className="w-4 h-4" />
  },
  'decision-matrix': {
    label: 'Decision Matrix',
    description: 'Structured decision analysis framework',
    icon: <Users className="w-4 h-4" />
  }
};

// Function to parse and clean content with think tags
const parseMessageContent = (content: string, showThoughts: boolean): string => {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);

  if (thinkMatch && showThoughts) {
    const thoughtContent = thinkMatch[1].trim();
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    if (cleanContent && thoughtContent) {
      return `${cleanContent}\n\n💭 ${thoughtContent}`;
    }
    return thoughtContent || cleanContent;
  }

  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim() || content;
};

export const DiscussionPortal: React.FC<DiscussionPortalProps> = ({ 
  className, 
  viewport,
  defaultView = 'grid',
  mode = 'discussion'
}) => {
  // Default viewport if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  };

  const currentViewport = viewport || defaultViewport;
  // Portal-specific state management
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'settings'>('grid');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [selectedPurpose, setSelectedPurpose] = useState<DiscussionPurpose>('brainstorm');
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactType>('document');
  const [customTopic, setCustomTopic] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [additionalContext, setAdditionalContext] = useState('');
  const [showThinkTokens, setShowThinkTokens] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAgent, setFilterAgent] = useState('all');
  const [availableDiscussions, setAvailableDiscussions] = useState<any[]>([]);
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string>('');
  const [loadingDiscussions, setLoadingDiscussions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { 
    start, stop, pause, resume, history, isActive, discussionId, participants, lastError, 
    isWebSocketConnected, loadHistory, isLoading: discussionLoading 
  } = useDiscussion();
  const { agents } = useAgents();

  const agentList = Object.values(agents);
  const selectedPurposeData = DISCUSSION_PURPOSES.find(p => p.value === selectedPurpose);
  const availableArtifacts = selectedPurposeData?.artifacts || [];

  // Load available discussions on mount
  useEffect(() => {
    const loadAvailableDiscussions = async () => {
      try {
        setLoadingDiscussions(true);
        const response = await uaipAPI.discussions.list({
          limit: 50,
          status: ['active', 'completed']
        });
        setAvailableDiscussions(response?.discussions || []);

        if (discussionId && response?.discussions) {
          setSelectedDiscussionId(discussionId);
        }
      } catch (error) {
        console.error('Failed to load available discussions:', error);
      } finally {
        setLoadingDiscussions(false);
      }
    };

    loadAvailableDiscussions();
  }, [discussionId]);

  // Load historical messages when discussion ID becomes available
  useEffect(() => {
    const idToLoad = selectedDiscussionId || discussionId;
    if (idToLoad && loadHistory) {
      loadHistory(idToLoad);
    }
  }, [selectedDiscussionId, discussionId]); // Removed loadHistory from deps since it's now memoized

  // Listen for global discussion trigger events
  useEffect(() => {
    const handleOpenDiscussion = (e: CustomEvent) => {
      const { contextData, preselectedAgents } = e.detail;
      
      if (preselectedAgents) {
        setSelectedAgents(preselectedAgents);
      }
      
      setIsConfigOpen(true);
    };

    window.addEventListener('open-discussion-config', handleOpenDiscussion as EventListener);

    return () => {
      window.removeEventListener('open-discussion-config', handleOpenDiscussion as EventListener);
    };
  }, []);

  const generateTopic = () => {
    if (customTopic.trim()) return customTopic;
    return `${selectedPurposeData?.label} discussion session`;
  };

  const handleStartDiscussion = async () => {
    const topic = generateTopic();
    
    const discussionData = {
      title: topic,
      topic,
      description: additionalContext.trim() || `${selectedPurposeData?.description} session`,
      createdBy: 'current-user-id',
      initialParticipants: selectedAgents.map(agentId => ({
        agentId,
        role: ParticipantRole.PARTICIPANT
      })),
      turnStrategy: {
        strategy: TurnStrategy.ROUND_ROBIN,
        config: {
          type: 'round_robin' as const,
          skipInactive: true,
          maxSkips: 3
        }
      },
      visibility: DiscussionVisibility.PRIVATE,
      objectives: [
        `Generate ${ARTIFACT_TYPES[selectedArtifact].label} through ${selectedPurposeData?.label.toLowerCase()}`,
        ...(additionalContext.trim() ? [additionalContext.trim()] : [])
      ],
      tags: [selectedPurpose, selectedArtifact],
      metadata: {
        purpose: selectedPurpose,
        targetArtifact: selectedArtifact,
        expectedOutcome: `Generate ${ARTIFACT_TYPES[selectedArtifact].label} through ${selectedPurposeData?.label.toLowerCase()}`
      }
    };

    try {
      await start(
        topic,
        selectedAgents.length > 0 ? selectedAgents : undefined,
        discussionData
      );
      
      setIsConfigOpen(false);
    } catch (error) {
      console.error('Failed to start discussion:', error);
    }
  };

  const handleStop = async () => {
    try {
      await stop();
    } catch (error) {
      console.error('Failed to stop discussion:', error);
    }
  };

  const handlePause = async () => {
    try {
      await pause();
    } catch (error) {
      console.error('Failed to pause discussion:', error);
    }
  };

  const handleResume = async () => {
    try {
      await resume();
    } catch (error) {
      console.error('Failed to resume discussion:', error);
    }
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgents(prev => 
      prev.includes(agentId) 
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  // Filter and sort messages
  const messages = history
    ? history
        .filter(message => {
          const matchesSearch = !searchTerm ||
            message.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
            message.sender.toLowerCase().includes(searchTerm.toLowerCase());

          const matchesAgent = filterAgent === 'all' || message.sender === filterAgent;
          const matchesType = showThinkTokens || message.type !== 'thought';

          return matchesSearch && matchesAgent && matchesType;
        })
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    : [];

  const getAgentColor = (sender: string) => {
    const colors = ['blue', 'emerald', 'purple', 'orange', 'pink', 'indigo'];
    const agentNames = Object.values(agents).map(a => a.name);
    const index = agentNames.indexOf(sender);
    return colors[index >= 0 ? index % colors.length : 0];
  };

  const getAgentColorClasses = (color: string) => {
    const colorMap = {
      'blue': 'from-blue-500 to-blue-600 text-blue-300 bg-blue-500/20 border-blue-500/30',
      'emerald': 'from-emerald-500 to-emerald-600 text-emerald-300 bg-emerald-500/20 border-emerald-500/30',
      'purple': 'from-purple-500 to-purple-600 text-purple-300 bg-purple-500/20 border-purple-500/30',
      'orange': 'from-orange-500 to-orange-600 text-orange-300 bg-orange-500/20 border-orange-500/30',
      'pink': 'from-pink-500 to-pink-600 text-pink-300 bg-pink-500/20 border-pink-500/30',
      'indigo': 'from-indigo-500 to-indigo-600 text-indigo-300 bg-indigo-500/20 border-indigo-500/30'
    };
    return colorMap[color] || colorMap.blue;
  };

  const renderMessage = (message: Message, index: number) => {
    const agent = Object.values(agents).find(a => a.name === message.sender || a.id === message.sender);
    const isThought = message.type === 'thought';
    const content = parseMessageContent(message.content, showThinkTokens);
    const color = getAgentColor(agent?.name || message.sender);

    return (
      <motion.div
        key={message.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className="group relative"
      >
        <div className={cn(
          "relative p-4 rounded-xl transition-all duration-300",
          isThought
            ? "bg-gradient-to-br from-amber-900/20 to-amber-800/20 border border-amber-500/30"
            : "bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 hover:border-slate-600/50"
        )}>
          {/* Message Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <motion.div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br shadow-lg",
                  getAgentColorClasses(color).split(' ').slice(0, 2).join(' ')
                )}
                whileHover={{ scale: 1.1 }}
              >
                {isThought ? (
                  <Brain className="w-4 h-4 text-white" />
                ) : (
                  <User className="w-4 h-4 text-white" />
                )}
              </motion.div>

              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-white text-sm">
                    {agent?.name || message.sender}
                  </span>
                  {agent && (
                    <span className={`px-2 py-1 text-xs rounded-full border ${
                      getAgentColorClasses(color).split(' ').slice(2).join(' ')
                    }`}>
                      {agent.role}
                    </span>
                  )}
                  {isThought && (
                    <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded-full border border-amber-500/30">
                      thinking
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              <span>{format(message.timestamp, 'HH:mm:ss')}</span>
            </div>
          </div>

          {/* Message Content */}
          <div className={cn(
            "text-sm leading-relaxed whitespace-pre-wrap",
            isThought
              ? "text-amber-200/90 italic"
              : "text-slate-200"
          )}>
            {content}
          </div>
        </div>
      </motion.div>
    );
  };

  const agentCount = Object.keys(agents).length;
  const messageCount = history?.length || 0; // Use history length for actual DB count
  const participantCount = participants?.length || 0;
  const canStart = agentCount >= 2;

  const renderHeader = () => (
    <div className="flex items-center justify-between p-4 bg-slate-800/50 border-b border-slate-700/50">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isWebSocketConnected ? "bg-emerald-400" : "bg-red-400"
          )} />
          <span className="text-xs text-slate-400">
            {isWebSocketConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="h-4 w-px bg-slate-600"></div>
        <div className="text-sm text-slate-300">
          {mode === 'discussion' ? 'Configure and manage AI discussions' :
           mode === 'monitor' ? 'Monitor discussion performance and status' :
           `${messageCount} messages in ${availableDiscussions.length} discussion${availableDiscussions.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* View Mode Toggle */}
        <div className="flex items-center bg-slate-700/50 rounded-md p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1 rounded transition-all duration-200 ${
              viewMode === 'grid' 
                ? 'bg-blue-500/20 text-blue-400' 
                : 'text-slate-400 hover:text-white hover:bg-slate-600/50'
            }`}
            title="Grid View"
          >
            <Grid className="w-3 h-3" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1 rounded transition-all duration-200 ${
              viewMode === 'list' 
                ? 'bg-blue-500/20 text-blue-400' 
                : 'text-slate-400 hover:text-white hover:bg-slate-600/50'
            }`}
            title="List View"
          >
            <List className="w-3 h-3" />
          </button>
          <button
            onClick={() => setViewMode('settings')}
            className={`p-1 rounded transition-all duration-200 ${
              viewMode === 'settings' 
                ? 'bg-blue-500/20 text-blue-400' 
                : 'text-slate-400 hover:text-white hover:bg-slate-600/50'
            }`}
            title="Settings View"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>

        {/* Refresh Button */}
        <button
          onClick={() => {
            setRefreshing(true);
            // Refresh discussions and data
            setTimeout(() => setRefreshing(false), 1000);
          }}
          disabled={refreshing}
          className="p-1 bg-slate-700/50 hover:bg-slate-600/50 rounded text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh Data"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );

  return (
    <div className={`h-full w-full flex flex-col ${className}`}>
      {/* Portal Header */}
      {renderHeader()}
      
      {/* Portal Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full p-4 md:p-6 overflow-y-auto custom-scrollbar">
          <div className="space-y-6">
              
              {/* Discussion History Dropdown */}
              <DiscussionHistory 
                onSelectDiscussion={(discussionId) => console.log('Selected discussion:', discussionId)}
                className="mb-6"
              />

              {/* Stats Grid */}
              <div className={`grid gap-4 ${
                currentViewport.isMobile ? 'grid-cols-2' : 
                currentViewport.isTablet ? 'grid-cols-3' : 
                'grid-cols-4'
              }`}>
                {[
                  { label: 'Agents', value: agentCount, color: 'blue', icon: Brain },
                  { label: 'Messages', value: messageCount, color: 'emerald', icon: Network },
                  { label: 'Participants', value: participantCount, color: 'purple', icon: Activity },
                  { label: 'Status', value: isActive ? 'ACTIVE' : 'IDLE', color: 'orange', icon: Zap, isText: true }
                ].map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="p-3 bg-slate-800/60 hover:bg-slate-700/70 border border-slate-600/30 hover:border-slate-500/50 rounded-lg transition-all duration-200 shadow-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-bold text-white">
                          {stat.isText ? (
                            <span className={`text-sm font-semibold ${isActive ? 'text-green-400' : 'text-slate-400'}`}>
                              {stat.value}
                            </span>
                          ) : (
                            stat.value
                          )}
                        </div>
                        <div className="text-xs text-slate-400">{stat.label}</div>
                      </div>
                      <div className={`p-2 rounded-lg bg-gradient-to-br from-${stat.color}-500/20 to-${stat.color}-600/20 border border-${stat.color}-500/30`}>
                        <stat.icon className={`w-4 h-4 text-${stat.color}-400`} />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

      {/* Main Controls */}
      <div className="space-y-4">
        {/* Primary Controls */}
        <div className="flex gap-3">
          {!isActive ? (
            <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen} modal={true}>
              <DialogTrigger asChild>
                <Button
                  disabled={!canStart || discussionLoading}
                  className="flex-1 bg-gradient-to-r from-blue-600 via-blue-700 to-cyan-600 hover:from-blue-700 hover:via-blue-800 hover:to-cyan-700 disabled:from-slate-600 disabled:to-slate-700"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Start Discussion
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-slate-900/95 via-blue-900/30 to-purple-900/20 backdrop-blur-xl border border-slate-700/50 dialog-content z-[9999]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-white">
                    <MessageSquare className="w-5 h-5 text-cyan-400" />
                    Configure Discussion Session
                  </DialogTitle>
                  <DialogDescription className="text-slate-300">
                    Set up the purpose and expected outcomes for your agent discussion
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                  {/* Purpose Selection */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-white">Discussion Purpose</label>
                      <div className="grid grid-cols-1 gap-2 mt-2">
                        {DISCUSSION_PURPOSES.map((purpose) => (
                          <Card 
                            key={purpose.value}
                            className={`cursor-pointer transition-all hover:shadow-md ${
                              selectedPurpose === purpose.value 
                                ? 'ring-2 ring-blue-400 bg-gradient-to-br from-blue-900/30 to-blue-900/30 border-blue-400/50' 
                                : 'bg-slate-800/60 hover:bg-slate-700/70 border border-slate-600/30 hover:border-slate-500/50'
                            } border backdrop-blur-sm`}
                            onClick={() => {
                              setSelectedPurpose(purpose.value);
                              if (purpose.artifacts[0]) {
                                setSelectedArtifact(purpose.artifacts[0]);
                              }
                            }}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-lg ${
                                  selectedPurpose === purpose.value 
                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                    : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                                }`}>
                                  {purpose.icon}
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm text-white">{purpose.label}</h4>
                                  <p className="text-xs text-slate-400 mt-1">
                                    {purpose.description}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>

                    {/* Custom Topic */}
                    <div>
                      <label htmlFor="topic" className="text-sm font-medium text-white">
                        Custom Topic (optional)
                      </label>
                      <GlobalAutocomplete
                        value={customTopic}
                        onChange={setCustomTopic}
                        placeholder="Override the auto-generated topic..."
                        className="mt-1 bg-slate-800/50 border-slate-700 text-white placeholder-slate-400 focus:border-blue-500"
                        multiline
                        rows={3}
                        enhancementType="topic"
                        context={{
                          purpose: selectedPurpose,
                          selectedAgents,
                          discussionType: selectedPurposeData?.label
                        }}
                        onEnhance={(enhancedText) => {
                          setCustomTopic(enhancedText);
                        }}
                      />
                    </div>

                    {/* Additional Context */}
                    <div>
                      <label htmlFor="context" className="text-sm font-medium text-white">
                        Additional Context
                      </label>
                      <GlobalAutocomplete
                        value={additionalContext}
                        onChange={setAdditionalContext}
                        placeholder="Provide any additional context or constraints..."
                        className="mt-1 bg-slate-800/50 border-slate-700 text-white placeholder-slate-400 focus:border-blue-500"
                        multiline
                        rows={3}
                        enhancementType="context"
                        context={{
                          purpose: selectedPurpose,
                          selectedAgents,
                          discussionType: selectedPurposeData?.label
                        }}
                        onEnhance={(enhancedText) => {
                          setAdditionalContext(enhancedText);
                        }}
                      />
                    </div>
                  </div>

                  {/* Configuration Panel */}
                  <div className="space-y-4">
                    {/* Artifact Selection */}
                    <div>
                      <label className="text-sm font-medium text-white">Expected Artifact</label>
                      <Select value={selectedArtifact} onValueChange={(value: ArtifactType) => setSelectedArtifact(value)}>
                        <SelectTrigger className="mt-1 bg-slate-800/50 border-slate-700 text-white focus:border-blue-500">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableArtifacts.map((artifactType) => {
                            const artifact = ARTIFACT_TYPES[artifactType];
                            return (
                              <SelectItem key={artifactType} value={artifactType}>
                                <div className="flex items-center gap-2">
                                  {artifact.icon}
                                  <div>
                                    <div className="font-medium">{artifact.label}</div>
                                    <div className="text-xs text-gray-500">{artifact.description}</div>
                                  </div>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Agent Selection */}
                    <div>
                      <label className="text-sm font-medium text-white">
                        Select Agents ({selectedAgents.length} selected)
                      </label>
                      <p className="text-xs text-slate-400 mt-1">
                        Leave empty to auto-select best agents
                      </p>
                      <div className="grid grid-cols-1 gap-2 mt-2 max-h-60 overflow-y-auto">
                        {agentList.map((agent) => (
                          <Card
                            key={agent.id}
                            className={`cursor-pointer transition-all border backdrop-blur-sm ${
                              selectedAgents.includes(agent.id)
                                ? 'ring-2 ring-blue-400 bg-gradient-to-br from-blue-900/30 to-blue-900/30 border-blue-400/50'
                                : 'bg-slate-800/60 hover:bg-slate-700/70 border border-slate-600/30 hover:border-slate-500/50'
                            }`}
                            onClick={() => toggleAgent(agent.id)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-medium text-sm text-white">{agent.name}</h4>
                                  <p className="text-xs text-slate-400">
                                    {agent.role} • {agent.capabilities?.slice(0, 2).join(', ')}
                                  </p>
                                </div>
                                <div className={`w-4 h-4 rounded border-2 ${
                                  selectedAgents.includes(agent.id)
                                    ? 'bg-blue-500 border-blue-500'
                                    : 'border-slate-500'
                                }`}>
                                  {selectedAgents.includes(agent.id) && (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <div className="w-2 h-2 bg-white rounded-sm" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-700/50">
                  <div className="text-sm text-slate-400">
                    {selectedAgents.length === 0 
                      ? 'Auto-selecting best agents for discussion'
                      : `${selectedAgents.length} agents selected`
                    }
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsConfigOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleStartDiscussion} 
                      disabled={discussionLoading}
                      className="bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 border border-blue-500/30"
                    >
                      {discussionLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Start Discussion
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <div className="flex gap-2">
              <Button
                onClick={handlePause}
                disabled={discussionLoading}
                className="flex-1 bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800"
              >
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </Button>
              <Button
                onClick={handleResume}
                disabled={discussionLoading}
                className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
              >
                <Play className="w-4 h-4 mr-2" />
                Resume
              </Button>
              <Button
                onClick={handleStop}
                disabled={discussionLoading}
                className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Stop
              </Button>
            </div>
          )}
        </div>

        {/* Alert System */}
        <AnimatePresence>
          {!canStart && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex items-center gap-3 p-4 bg-gradient-to-r from-amber-900/30 to-orange-900/30 border border-amber-500/30 rounded-xl backdrop-blur-sm"
            >
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <span className="text-amber-300 font-medium block">
                  Insufficient Agents
                </span>
                <span className="text-amber-400/80 text-sm">
                  Minimum 2 agents required for discussion
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Discussion History */}
      {history && messages.length > 0 && (
        <div className="space-y-4">
          {/* Search and Filter */}
          <div className="flex items-center space-x-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search messages..."
                className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none transition-colors"
            >
              <option value="all">All Agents</option>
              {Object.values(agents).map(agent => (
                <option key={agent.name} value={agent.name}>{agent.name}</option>
              ))}
            </select>
            
            {/* Think Tokens Toggle */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400">Think</span>
              <motion.button
                onClick={() => setShowThinkTokens(!showThinkTokens)}
                className={`w-8 h-4 rounded-full transition-colors ${
                  showThinkTokens ? 'bg-blue-600' : 'bg-slate-600'
                }`}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  className="w-3 h-3 bg-white rounded-full mt-0.5"
                  animate={{ x: showThinkTokens ? 16 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </motion.button>
            </div>
          </div>

          {/* Messages */}
          <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-700/50 p-4">
            <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
              <AnimatePresence>
                {messages.map((message, index) => renderMessage(message, index))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

            {/* Error Display */}
            <AnimatePresence>
              {lastError && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 backdrop-blur-sm"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{lastError}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};