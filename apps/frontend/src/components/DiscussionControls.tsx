import React, { useState } from 'react';
import { cn } from "@/lib/utils";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  AlertCircle, 
  Activity,
  Settings,
  Brain,
  Code,
  FileText,
  TrendingUp
} from 'lucide-react';
import { useDiscussion } from '../contexts/DiscussionContext';
import { useAgents } from '../contexts/AgentContext';

interface DiscussionControlsProps {
  className?: string;
  onThinkTokensToggle?: (visible: boolean) => void;
  showThinkTokens?: boolean;
}

export const DiscussionControls: React.FC<DiscussionControlsProps> = ({ 
  className, 
  onThinkTokensToggle,
  showThinkTokens = false 
}) => {
  const { 
    isActive, 
    start, 
    stop, 
    reset,
    history, 
    currentRound,
    analyzeConversation,
    generateArtifact,
    discussionOrchestration
  } = useDiscussion();
  
  const { agents } = useAgents();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const canStart = Object.keys(agents).length >= 2;
  const agentCount = Object.keys(agents).length;
  const messageCount = history?.length || 0;

  const handleStart = async () => {
    if (!canStart) return;
    setIsLoading(true);
    try {
      await start();
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await stop();
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    setIsLoading(true);
    try {
      await reset();
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = async (action: string) => {
    setIsLoading(true);
    try {
      switch (action) {
        case 'analyze':
          await analyzeConversation();
          break;
        case 'sentiment':
          await discussionOrchestration.analyzeSentiment('current');
          break;
        case 'code':
          await generateArtifact('code', { language: 'typescript' });
          break;
        case 'summary':
          await discussionOrchestration.summarizeDiscussion('current');
          break;
      }
    } catch (error) {
      console.error('Quick action failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Status Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="text-center">
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{agentCount}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Agents</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-green-600 dark:text-green-400">{messageCount}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Messages</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{currentRound}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Round</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-orange-600 dark:text-orange-400">0</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Active</div>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="flex items-center gap-2 mb-4">
        {!isActive ? (
          <button
            onClick={handleStart}
            disabled={!canStart || isLoading}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            <span>Start Discussion</span>
          </button>
        ) : (
          <button
            onClick={handleStop}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Pause className="w-4 h-4" />
            <span>Stop</span>
          </button>
        )}
        
        <button
          onClick={handleReset}
          disabled={isLoading}
          className="flex items-center justify-center gap-1 bg-slate-600 hover:bg-slate-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset</span>
        </button>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center justify-center bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-2 py-2 rounded-lg transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {!canStart && (
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm mb-4">
          <AlertCircle className="w-4 h-4" />
          <span>Add at least 2 agents to start</span>
        </div>
      )}

      {/* Status Indicator */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-400">Status</span>
        <div className="flex items-center gap-2">
          <Activity className={cn("w-4 h-4", isActive ? "text-green-500" : "text-slate-400")} />
          <span className="text-slate-600 dark:text-slate-400">{isActive ? "Active" : "Inactive"}</span>
        </div>
      </div>

      {/* Quick Actions */}
      {showAdvanced && (
        <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <h4 className="text-sm font-medium text-slate-900 dark:text-white">Quick Actions</h4>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleQuickAction('analyze')}
              disabled={isLoading || messageCount === 0}
              className="flex items-center gap-2 p-2 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Brain className="w-4 h-4" />
              <span>Analyze</span>
            </button>
            
            <button
              onClick={() => handleQuickAction('sentiment')}
              disabled={isLoading || messageCount === 0}
              className="flex items-center gap-2 p-2 bg-emerald-100 dark:bg-emerald-900/30 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TrendingUp className="w-4 h-4" />
              <span>Sentiment</span>
            </button>
            
            <button
              onClick={() => handleQuickAction('code')}
              disabled={isLoading}
              className="flex items-center gap-2 p-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Code className="w-4 h-4" />
              <span>Code</span>
            </button>
            
            <button
              onClick={() => handleQuickAction('summary')}
              disabled={isLoading || messageCount === 0}
              className="flex items-center gap-2 p-2 bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-4 h-4" />
              <span>Summary</span>
            </button>
          </div>

          {/* Advanced Settings */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">Think Tokens</span>
              <button
                onClick={() => onThinkTokensToggle?.(!showThinkTokens)}
                className={cn(
                  "w-8 h-4 rounded-full transition-colors",
                  showThinkTokens ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                )}
              >
                <div className={cn(
                  "w-3 h-3 bg-white rounded-full transition-transform mt-0.5",
                  showThinkTokens ? "translate-x-4" : "translate-x-0.5"
                )} />
              </button>
            </div>
            
            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>Security Gateway</span>
                <span className="text-green-500">✅ Online</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Agent Intelligence</span>
                <span className="text-green-500">✅ Online</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Discussion Orchestration</span>
                <span className="text-green-500">✅ Online</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Capability Registry</span>
                <span className="text-green-500">✅ Online</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 