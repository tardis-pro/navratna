import React, { useState } from 'react';
import { cn } from "@/lib/utils";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Play as Resume, 
  AlertCircle, 
  User2, 
  Eye, 
  EyeOff,
  Settings,
  Users,
  MessageSquare,
  Clock,
  Activity
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
  const { isActive, currentTurn, start, stop, history, currentRound } = useDiscussion();
  const { agents } = useAgents();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const canStart = Object.keys(agents).length >= 2;
  const agentCount = Object.keys(agents).length;
  const messageCount = history?.length || 0;

  const handleStart = () => {
    if (canStart) {
      start();
    }
  };

  const handlePause = () => {
    stop();
  };

  const handleResume = () => {
    start();
  };

  const handleReset = () => {
    stop();
  };

  const handleThinkTokensToggle = (checked: boolean) => {
    onThinkTokensToggle?.(checked);
  };

  const getStatusColor = () => {
    if (!isActive) return "bg-slate-500";
    if (currentTurn) return "bg-green-500";
    return "bg-amber-500";
  };

  const getStatusText = () => {
    if (!isActive) return "Inactive";
    if (currentTurn) return "Active";
    return "Paused";
  };

  return (
    <div className={`p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Discussion Controls</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Manage conversation flow and settings</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
            <div className={cn("w-2 h-2 rounded-full transition-colors duration-200", getStatusColor())} />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{getStatusText()}</span>
          </div>
          
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="flex items-center space-x-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">{agentCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Agents</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">{messageCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Messages</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
            <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">{currentRound || 0}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Round</p>
          </div>
        </div>
      </div>

      {/* Main Controls */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          {!isActive ? (
            <button
              onClick={handleStart}
              disabled={!canStart}
              className={`flex items-center space-x-2 px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
                canStart
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02]'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
              }`}
            >
              <Play className="w-4 h-4" />
              <span>Start Discussion</span>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handlePause}
                className="flex items-center space-x-2 px-6 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-all duration-200"
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </button>
              <button
                onClick={handleReset}
                className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl font-medium transition-all duration-200 shadow-lg shadow-red-500/25 hover:shadow-red-500/40"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset</span>
              </button>
            </div>
          )}
          
          {isActive && !currentTurn && (
            <button
              onClick={handleResume}
              className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg shadow-green-500/25 hover:shadow-green-500/40"
            >
              <Resume className="w-4 h-4" />
              <span>Resume</span>
            </button>
          )}
        </div>

        {/* Current Speaker */}
        {currentTurn && (
          <div className="flex items-center space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-800 rounded-lg flex items-center justify-center">
              <User2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Current Speaker</p>
              <p className="text-xs text-blue-700 dark:text-blue-300">{agents[currentTurn]?.name}</p>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Controls */}
      {showAdvanced && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-6 space-y-4">
          <h3 className="font-medium text-slate-900 dark:text-white">Advanced Settings</h3>
          
          {/* Think Tokens Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                {showThinkTokens ? (
                  <Eye className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                ) : (
                  <EyeOff className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Show Think Tokens</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Display internal reasoning processes</p>
              </div>
            </div>
            <button
              onClick={() => handleThinkTokensToggle(!showThinkTokens)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                showThinkTokens ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                  showThinkTokens ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Warning Message */}
      {!canStart && (
        <div className="flex items-start space-x-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="w-8 h-8 bg-amber-100 dark:bg-amber-800 rounded-lg flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Insufficient Agents</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              Please add at least two agents to start the discussion.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}; 