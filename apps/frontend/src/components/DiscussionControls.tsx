import React, { useState } from 'react';
import { cn } from "@/lib/utils";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  AlertCircle, 
  Users,
  MessageSquare,
  Clock,
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
      {/* Main Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Discussion Controls
          </h3>
          <div className="flex items-center space-x-2 text-sm text-slate-500">
            <Activity className={cn("w-4 h-4", isActive ? "text-green-500" : "text-slate-400")} />
            <span>{isActive ? "Active" : "Inactive"}</span>
          </div>
        </div>

        {/* Status Stats */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{agentCount}</div>
            <div className="text-xs text-slate-500">Agents</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{messageCount}</div>
            <div className="text-xs text-slate-500">Messages</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{currentRound}</div>
            <div className="text-xs text-slate-500">Round</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">0</div>
            <div className="text-xs text-slate-500">Active</div>
          </div>
        </div>

        {/* Primary Actions */}
        <div className="flex items-center space-x-2">
          {!isActive ? (
            <button
              onClick={handleStart}
              disabled={!canStart || isLoading}
              className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Play className="w-4 h-4" />
              <span>Start Discussion</span>
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Pause className="w-4 h-4" />
              <span>Stop</span>
            </button>
          )}
          
          <button
            onClick={handleReset}
            disabled={isLoading}
            className="flex items-center justify-center space-x-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset</span>
          </button>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {!canStart && (
          <div className="mt-3 flex items-center space-x-2 text-amber-600 dark:text-amber-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>Add at least 2 agents to start a discussion</span>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Quick Actions</h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleQuickAction('analyze')}
            disabled={isLoading || messageCount === 0}
            className="flex items-center space-x-2 p-3 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Brain className="w-4 h-4" />
            <span>Analyze</span>
          </button>
          
          <button
            onClick={() => handleQuickAction('sentiment')}
            disabled={isLoading || messageCount === 0}
            className="flex items-center space-x-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <TrendingUp className="w-4 h-4" />
            <span>Sentiment</span>
          </button>
          
          <button
            onClick={() => handleQuickAction('code')}
            disabled={isLoading}
            className="flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Code className="w-4 h-4" />
            <span>Generate Code</span>
          </button>
          
          <button
            onClick={() => handleQuickAction('summary')}
            disabled={isLoading || messageCount === 0}
            className="flex items-center space-x-2 p-3 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            <span>Summary</span>
          </button>
        </div>
      </div>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Advanced Settings</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Think Tokens</span>
              <button
                onClick={() => onThinkTokensToggle?.(!showThinkTokens)}
                className={cn(
                  "w-10 h-6 rounded-full transition-colors",
                  showThinkTokens ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                )}
              >
                <div className={cn(
                  "w-4 h-4 bg-white rounded-full transition-transform",
                  showThinkTokens ? "translate-x-5" : "translate-x-1"
                )} />
              </button>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="text-xs text-slate-500 space-y-1">
                <div>Security Gateway: ✅ Online</div>
                <div>Agent Intelligence: ✅ Online</div>
                <div>Discussion Orchestration: ✅ Online</div>
                <div>Capability Registry: ✅ Online</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 