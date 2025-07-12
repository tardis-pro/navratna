import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { GlobalAutocomplete } from '@/components/ui/GlobalAutocomplete';
import { useDiscussion } from '@/contexts/DiscussionContext';
import { useAgents } from '@/contexts/AgentContext';
import { TurnStrategy, ParticipantRole, DiscussionVisibility } from '@uaip/types';
import { 
  MessageSquare, Brain, Loader2, FileText, Code, Presentation, 
  Target, Sparkles, Zap, Users 
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

interface DiscussionConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDiscussionStarted?: (discussionId: string) => void;
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

// Turn strategy options with descriptions
const TURN_STRATEGIES = [
  {
    value: TurnStrategy.CONTEXT_AWARE,
    label: 'Context Aware (AI)',
    description: 'AI selects next speaker based on expertise and topic relevance',
    icon: <Brain className="w-4 h-4" />
  },
  {
    value: TurnStrategy.ROUND_ROBIN,
    label: 'Round Robin',
    description: 'Participants take turns in order',
    icon: <Users className="w-4 h-4" />
  },
  {
    value: TurnStrategy.EXPERTISE_DRIVEN,
    label: 'Expertise Driven',
    description: 'Technical experts speak first on relevant topics',
    icon: <Target className="w-4 h-4" />
  },
  {
    value: TurnStrategy.FREE_FORM,
    label: 'Free Form',
    description: 'Open discussion, no turn restrictions',
    icon: <MessageSquare className="w-4 h-4" />
  },
  {
    value: TurnStrategy.MODERATED,
    label: 'Moderated',
    description: 'Human moderator controls speaking order',
    icon: <Zap className="w-4 h-4" />
  }
];

// Generate turn strategy configuration based on selected strategy
const generateTurnStrategyConfig = (strategy: TurnStrategy) => {
  switch (strategy) {
    case TurnStrategy.ROUND_ROBIN:
      return {
        strategy: TurnStrategy.ROUND_ROBIN,
        config: {
          type: 'round_robin' as const,
          skipInactive: true,
          maxSkips: 3
        }
      };
    case TurnStrategy.CONTEXT_AWARE:
      return {
        strategy: TurnStrategy.CONTEXT_AWARE,
        config: {
          type: 'context_aware' as const,
          relevanceThreshold: 0.7,
          expertiseWeight: 0.3,
          engagementWeight: 0.2
        }
      };
    case TurnStrategy.EXPERTISE_DRIVEN:
      return {
        strategy: TurnStrategy.EXPERTISE_DRIVEN,
        config: {
          type: 'expertise_driven' as const,
          expertiseThreshold: 0.8,
          fallbackToRoundRobin: true
        }
      };
    case TurnStrategy.FREE_FORM:
      return {
        strategy: TurnStrategy.FREE_FORM,
        config: {
          type: 'free_form' as const,
          cooldownPeriod: 5
        }
      };
    case TurnStrategy.MODERATED:
      return {
        strategy: TurnStrategy.MODERATED,
        config: {
          type: 'moderated' as const,
          requireApproval: true,
          autoAdvance: false
        }
      };
    default:
      return {
        strategy: TurnStrategy.CONTEXT_AWARE,
        config: {
          type: 'context_aware' as const,
          relevanceThreshold: 0.7,
          expertiseWeight: 0.3,
          engagementWeight: 0.2
        }
      };
  }
};

export const DiscussionConfigModal: React.FC<DiscussionConfigModalProps> = ({ 
  isOpen, 
  onClose, 
  onDiscussionStarted 
}) => {
  const [selectedPurpose, setSelectedPurpose] = useState<DiscussionPurpose>('brainstorm');
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactType>('document');
  const [selectedStrategy, setSelectedStrategy] = useState<TurnStrategy>(TurnStrategy.CONTEXT_AWARE);
  const [customTopic, setCustomTopic] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [additionalContext, setAdditionalContext] = useState('');

  const { 
    start, 
    isLoading: discussionLoading 
  } = useDiscussion();
  const { agents } = useAgents();

  const agentList = Object.values(agents);
  const selectedPurposeData = DISCUSSION_PURPOSES.find(p => p.value === selectedPurpose);
  const availableArtifacts = selectedPurposeData?.artifacts || [];

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedPurpose('brainstorm');
      setSelectedArtifact('document');
      setSelectedStrategy(TurnStrategy.CONTEXT_AWARE);
      setCustomTopic('');
      setSelectedAgents([]);
      setAdditionalContext('');
    }
  }, [isOpen]);

  // Update artifact when purpose changes
  useEffect(() => {
    if (selectedPurposeData?.artifacts[0]) {
      setSelectedArtifact(selectedPurposeData.artifacts[0]);
    }
  }, [selectedPurpose, selectedPurposeData]);

  // Listen for global discussion trigger events
  useEffect(() => {
    const handleOpenDiscussion = (e: CustomEvent) => {
      const { contextData, preselectedAgents } = e.detail;
      
      if (preselectedAgents) {
        setSelectedAgents(preselectedAgents);
      }
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
    console.log(topic.slice(0,20));
    const discussionData = {
      title: topic.slice(0,20),
      topic,
      description: additionalContext.trim() || `${selectedPurposeData?.description} session`,
      createdBy: 'current-user-id',
      initialParticipants: selectedAgents.map(agentId => ({
        agentId,
        role: ParticipantRole.PARTICIPANT
      })),
      turnStrategy: generateTurnStrategyConfig(selectedStrategy),
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
      const result = await start(
        topic,
        selectedAgents.length > 0 ? selectedAgents : undefined,
        discussionData
      );
      
      onClose();
      
      // Trigger portal opening after discussion starts
      if (onDiscussionStarted && result?.discussionId) {
        onDiscussionStarted(result.discussionId);
      }
    } catch (error) {
      console.error('Failed to start discussion:', error);
    }
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgents(prev => 
      prev.includes(agentId) 
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-slate-900/95 via-blue-900/30 to-purple-900/20 backdrop-blur-xl border border-slate-700/50 dialog-content z-[9999]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <MessageSquare className="w-5 h-5 text-cyan-400" />
            Configure Discussion Session1
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

            {/* Turn Strategy Selection */}
            <div>
              <label className="text-sm font-medium text-white">Discussion Flow Strategy</label>
              <p className="text-xs text-slate-400 mt-1">
                How should participants take turns in the discussion?
              </p>
              <Select value={selectedStrategy} onValueChange={(value: TurnStrategy) => setSelectedStrategy(value)}>
                <SelectTrigger className="mt-1 bg-slate-800/50 border-slate-700 text-white focus:border-blue-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TURN_STRATEGIES.map((strategy) => (
                    <SelectItem key={strategy.value} value={strategy.value}>
                      <div className="flex items-center gap-2">
                        {strategy.icon}
                        <div>
                          <div className="font-medium">{strategy.label}</div>
                          <div className="text-xs text-gray-500">{strategy.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
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
              <div className="grid grid-cols-1 gap-2 mt-2 max-h-80 overflow-y-auto">
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
            <Button variant="outline" onClick={onClose}>
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
  );
};