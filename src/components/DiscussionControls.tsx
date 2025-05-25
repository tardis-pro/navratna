import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Clock
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
    if (!isActive) return "bg-gray-500";
    if (currentTurn) return "bg-green-500";
    return "bg-yellow-500";
  };

  const getStatusText = () => {
    if (!isActive) return "Inactive";
    if (currentTurn) return "Active";
    return "Paused";
  };

  return (
    <Card className={cn(
      "bg-gradient-to-br from-white/95 to-gray-50/95 dark:from-gray-900/95 dark:to-gray-800/95",
      "backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/60",
      "shadow-lg shadow-gray-200/20 dark:shadow-gray-900/20",
      "transition-all duration-200 hover:shadow-xl hover:shadow-gray-200/30 dark:hover:shadow-gray-900/30",
      className
    )}>
      <div className="p-6 space-y-6">
        {/* Header with Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-3 h-3 rounded-full transition-colors duration-200",
                getStatusColor()
              )} />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Discussion Controls
              </h3>
            </div>
            <Badge variant="outline" className="text-xs">
              {getStatusText()}
            </Badge>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Users className="h-4 w-4" />
            <span>{agentCount} agents</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <MessageSquare className="h-4 w-4" />
            <span>{messageCount} messages</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Clock className="h-4 w-4" />
            <span>Round {currentRound || 0}</span>
          </div>
        </div>

        <Separator />

        {/* Main Controls */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            {!isActive ? (
              <Button
                onClick={handleStart}
                disabled={!canStart}
                variant="default"
                size="lg"
                className={cn(
                  "flex items-center gap-2 font-medium transition-all duration-200",
                  "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800",
                  "shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40",
                  "disabled:from-gray-400 disabled:to-gray-500 disabled:shadow-none"
                )}
              >
                <Play className="h-4 w-4" />
                Start Discussion
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handlePause}
                  variant="secondary"
                  size="lg"
                  className="flex items-center gap-2 font-medium"
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </Button>
                <Button
                  onClick={handleReset}
                  variant="destructive"
                  size="lg"
                  className="flex items-center gap-2 font-medium"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              </div>
            )}
            
            {isActive && !currentTurn && (
              <Button
                onClick={handleResume}
                variant="default"
                size="lg"
                className="flex items-center gap-2 font-medium bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
              >
                <Resume className="h-4 w-4" />
                Resume
              </Button>
            )}
          </div>

          {/* Current Speaker */}
          {currentTurn && (
            <div className="flex items-center gap-3 p-4 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <User2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-900 dark:text-blue-100">
                  Current Speaker:
                </span>
              </div>
              <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
                {agents[currentTurn]?.name}
              </Badge>
            </div>
          )}
        </div>

        {/* Advanced Controls */}
        {showAdvanced && (
          <>
            <Separator />
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Advanced Settings
              </h4>
              
              {/* Think Tokens Toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50/50 dark:bg-gray-800/50 rounded-lg border border-gray-200/50 dark:border-gray-700/50">
                <div className="flex items-center gap-3">
                  {showThinkTokens ? (
                    <Eye className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Show Think Tokens
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Display internal reasoning processes
                    </p>
                  </div>
                </div>
                <Switch
                  checked={showThinkTokens}
                  onCheckedChange={handleThinkTokensToggle}
                />
              </div>
            </div>
          </>
        )}

        {/* Warning Message */}
        {!canStart && (
          <div className="flex items-start gap-3 p-4 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/60 rounded-lg">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Insufficient Agents
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Please select at least two agents to start the discussion.
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}; 