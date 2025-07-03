import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useDiscussion } from '@/contexts/DiscussionContext';
import { useAgents } from '@/contexts/AgentContext';
import { 
  MessageSquare, 
  FileText, 
  Code, 
  Presentation, 
  Target,
  Users,
  Sparkles,
  Brain,
  Zap,
  Loader2
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

interface DiscussionTriggerProps {
  trigger: React.ReactNode;
  contextType?: 'knowledge' | 'chat' | 'general';
  contextData?: {
    knowledgeItem?: {
      id: string;
      content: string;
      type: string;
      tags: string[];
    };
    chatHistory?: Array<{
      content: string;
      sender: string;
      timestamp: string;
    }>;
    topic?: string;
  };
  preselectedAgents?: string[];
  className?: string;
}

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

export const DiscussionTrigger: React.FC<DiscussionTriggerProps> = ({
  trigger,
  contextType = 'general',
  contextData,
  preselectedAgents = [],
  className
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPurpose, setSelectedPurpose] = useState<DiscussionPurpose>('brainstorm');
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactType>('document');
  const [customTopic, setCustomTopic] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>(preselectedAgents);
  const [additionalContext, setAdditionalContext] = useState('');

  const { start, isLoading } = useDiscussion();
  const { agents } = useAgents();

  const agentList = Object.values(agents);
  const selectedPurposeData = DISCUSSION_PURPOSES.find(p => p.value === selectedPurpose);
  const availableArtifacts = selectedPurposeData?.artifacts || [];

  // Generate discussion topic based on context
  const generateTopic = () => {
    if (customTopic.trim()) return customTopic;

    let baseTopic = '';
    if (contextType === 'knowledge' && contextData?.knowledgeItem) {
      const item = contextData.knowledgeItem;
      baseTopic = `${selectedPurposeData?.label} session on ${item.type}: ${item.content.substring(0, 100)}...`;
    } else if (contextType === 'chat' && contextData?.topic) {
      baseTopic = `${selectedPurposeData?.label} discussion about: ${contextData.topic}`;
    } else {
      baseTopic = `${selectedPurposeData?.label} discussion session`;
    }

    return baseTopic;
  };

  const handleStartDiscussion = async () => {
    const topic = generateTopic();
    
    // Prepare enhanced context for discussion
    const discussionContext = {
      purpose: selectedPurpose,
      targetArtifact: selectedArtifact,
      contextType,
      originalContext: contextData,
      additionalContext: additionalContext.trim(),
      expectedOutcome: `Generate ${ARTIFACT_TYPES[selectedArtifact].label} through ${selectedPurposeData?.label.toLowerCase()}`
    };

    try {
      // Start discussion with selected agents and enhanced context
      await start(
        topic, 
        selectedAgents.length > 0 ? selectedAgents : undefined,
        discussionContext
      );
      
      setIsOpen(false);
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild className={className}>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Start Discussion Session
          </DialogTitle>
          <DialogDescription>
            Configure the purpose and expected outcomes for your agent discussion
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {/* Purpose Selection */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Discussion Purpose</label>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {DISCUSSION_PURPOSES.map((purpose) => (
                  <Card 
                    key={purpose.value}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedPurpose === purpose.value 
                        ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950' 
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
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
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {purpose.icon}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{purpose.label}</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
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
              <label htmlFor="topic" className="text-sm font-medium">
                Custom Topic (optional)
              </label>
              <Textarea
                id="topic"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Override the auto-generated topic with your custom description..."
                className="mt-1"
                rows={3}
              />
            </div>

            {/* Additional Context */}
            <div>
              <label htmlFor="context" className="text-sm font-medium">
                Additional Context
              </label>
              <Textarea
                id="context"
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Provide any additional context or constraints for the discussion..."
                className="mt-1"
                rows={3}
              />
            </div>
          </div>

          {/* Configuration Panel */}
          <div className="space-y-4">
            {/* Artifact Selection */}
            <div>
              <label className="text-sm font-medium">Expected Artifact</label>
              <Select value={selectedArtifact} onValueChange={(value: ArtifactType) => setSelectedArtifact(value)}>
                <SelectTrigger className="mt-1">
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
              <label className="text-sm font-medium">
                Select Agents ({selectedAgents.length} selected)
              </label>
              <div className="grid grid-cols-1 gap-2 mt-2 max-h-60 overflow-y-auto">
                {agentList.map((agent) => (
                  <Card
                    key={agent.id}
                    className={`cursor-pointer transition-all ${
                      selectedAgents.includes(agent.id)
                        ? 'ring-2 ring-green-500 bg-green-50 dark:bg-green-950'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => toggleAgent(agent.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-sm">{agent.name}</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {agent.role} • {agent.capabilities?.slice(0, 2).join(', ')}
                          </p>
                        </div>
                        <div className={`w-4 h-4 rounded border-2 ${
                          selectedAgents.includes(agent.id)
                            ? 'bg-green-500 border-green-500'
                            : 'border-gray-300'
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

            {/* Context Preview */}
            {contextData && (
              <div>
                <label className="text-sm font-medium">Context Data</label>
                <Card className="mt-1">
                  <CardContent className="p-3">
                    <div className="text-xs space-y-2">
                      <div><strong>Type:</strong> {contextType}</div>
                      {contextData.knowledgeItem && (
                        <>
                          <div><strong>Knowledge Type:</strong> {contextData.knowledgeItem.type}</div>
                          <div><strong>Tags:</strong> {contextData.knowledgeItem.tags.join(', ')}</div>
                          <div><strong>Content Preview:</strong> {contextData.knowledgeItem.content.substring(0, 150)}...</div>
                        </>
                      )}
                      {contextData.topic && (
                        <div><strong>Topic:</strong> {contextData.topic}</div>
                      )}
                      {contextData.chatHistory && (
                        <div><strong>Chat History:</strong> {contextData.chatHistory.length} messages</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {selectedAgents.length === 0 
              ? 'Auto-selecting best agents for discussion'
              : `${selectedAgents.length} agents selected`
            }
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleStartDiscussion} 
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
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