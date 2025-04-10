import React from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Play, Pause, RotateCcw, Play as Resume, AlertCircle, User2 } from 'lucide-react';
import { useDiscussion } from '../contexts/DiscussionContext';
import { useAgents } from '../contexts/AgentContext';

interface DiscussionControlsProps {
  className?: string;
}

export const DiscussionControls: React.FC<DiscussionControlsProps> = ({ className }) => {
  const { isActive, currentTurn, start, stop } = useDiscussion();
  const { agents } = useAgents();

  const canStart = Object.keys(agents).length >= 2;

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

  return (
    <Card className={cn(
      "bg-gradient-to-br from-gray-50/95 to-gray-100/95 dark:from-gray-900/95 dark:to-gray-800/95",
      "backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50",
      "p-4 shadow-sm",
      className
    )}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          {!isActive ? (
            <Button
              onClick={handleStart}
              disabled={!canStart}
              variant="default"
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Start Discussion
            </Button>
          ) : (
            <>
              <Button
                onClick={handlePause}
                variant="secondary"
                className="flex items-center gap-2"
              >
                <Pause className="h-4 w-4" />
                Pause
              </Button>
              <Button
                onClick={handleReset}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            </>
          )}
          
          {isActive && !currentTurn && (
            <Button
              onClick={handleResume}
              variant="default"
              className="flex items-center gap-2"
            >
              <Resume className="h-4 w-4" />
              Resume
            </Button>
          )}
        </div>

        {currentTurn && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <User2 className="h-4 w-4" />
            Current Speaker: {agents[currentTurn]?.name}
          </div>
        )}

        {!canStart && (
          <div className="flex items-start gap-2 p-3 bg-blue-500/10 dark:bg-blue-900/20 border border-blue-500/20 rounded-lg text-blue-600 dark:text-blue-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">
              Please select at least two agents to start the discussion.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}; 