import React, { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface ThinkingIndicatorProps {
  /** Array of step names representing the plan */
  steps?: string[];
  /** Current step index (0-based) */
  currentStep?: number;
  /** Whether the agent is currently thinking */
  isThinking?: boolean;
  /** CSS className for custom styling */
  className?: string;
  /** Callback when step changes (can be used to subscribe to WebSocket events externally) */
  onStepChange?: (stepIndex: number, stepName: string) => void;
}

interface PlanStepEvent {
  step_index?: number;
  step_name?: string;
  step?: string;
  total_steps?: number;
}

/**
 * ThinkingIndicator - Shows agent's thinking state with animated steps
 *
 * Displays an animated indicator when the agent is thinking, with progress
 * through plan steps. When multiple steps are available, shows a progress-style
 * flow with the current step highlighted.
 */
export function ThinkingIndicator({
  steps = [],
  currentStep = 0,
  isThinking = false,
  className,
  onStepChange,
}: ThinkingIndicatorProps) {
  const [animatedStep, setAnimatedStep] = useState(currentStep);
  const [isPulsing, setIsPulsing] = useState(false);

  // Reset state when thinking stops
  useEffect(() => {
    if (!isThinking) {
      setAnimatedStep(0);
      setIsPulsing(false);
    } else {
      setIsPulsing(true);
    }
  }, [isThinking]);

  // Update animated step when currentStep prop changes
  useEffect(() => {
    if (currentStep !== animatedStep && isThinking) {
      setAnimatedStep(currentStep);
      onStepChange?.(currentStep, steps[currentStep] || '');
    }
  }, [currentStep, isThinking, steps, animatedStep, onStepChange]);

  // Pulse animation effect
  useEffect(() => {
    if (!isThinking) return;

    const interval = setInterval(() => {
      setIsPulsing((prev) => !prev);
    }, 800);

    return () => clearInterval(interval);
  }, [isThinking]);

  // If not thinking, return null to hide the component
  if (!isThinking) {
    return null;
  }

  const currentStepName = steps[animatedStep] || `Step ${animatedStep + 1}`;
  const totalSteps = steps.length;

  // Calculate progress percentage
  const progressPercentage =
    totalSteps > 0 ? Math.min(100, ((animatedStep + 1) / totalSteps) * 100) : 0;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Thinking indicator with current step */}
      <div className="flex items-center gap-3">
        {/* Animated pulsing indicator */}
        <div className="relative flex items-center justify-center">
          <span
            className={cn(
              'block h-3 w-3 rounded-full',
              isPulsing ? 'bg-blue-500 animate-pulse' : 'bg-blue-400 animate-pulse'
            )}
          />
          <span
            className={cn(
              'absolute inset-0 h-3 w-3 rounded-full bg-blue-400 opacity-75',
              isPulsing ? 'animate-ping' : 'opacity-0'
            )}
          />
        </div>

        {/* Current step name */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{currentStepName}</span>

          {/* Step counter badge */}
          {totalSteps > 0 && (
            <Badge variant="secondary" className="text-xs">
              {animatedStep + 1}/{totalSteps}
            </Badge>
          )}
        </div>
      </div>

      {/* Progress bar when multiple steps exist */}
      {totalSteps > 1 && (
        <div className="flex items-center gap-2 ml-1">
          {/* Step flow indicators */}
          <div className="flex items-center gap-1">
            {steps.map((step, idx) => (
              <React.Fragment key={`step-${step.substring(0, 20)}`}>
                <div
                  className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium transition-all duration-300',
                    idx < animatedStep
                      ? 'bg-green-500 text-white' // Completed
                      : idx === animatedStep
                        ? 'bg-blue-500 text-white ring-2 ring-blue-300 ring-offset-1' // Current
                        : 'bg-muted text-muted-foreground' // Pending
                  )}
                >
                  {idx < animatedStep ? (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>

                {/* Connector arrow between steps */}
                {idx < steps.length - 1 && (
                  <div
                    className={cn(
                      'w-4 h-0.5 transition-colors duration-300',
                      idx < animatedStep ? 'bg-green-500' : 'bg-muted'
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Simple progress bar for single step or when not showing flow */}
      {totalSteps <= 1 && (
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-in-out"
            style={{
              width: `${progressPercentage}%`,
              animation: 'progress-indeterminate 1.5s ease-in-out infinite',
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Hook to subscribe to WebSocket plan events
 * Returns current step index and step name
 */
export function usePlanEvents() {
  const [planState, setPlanState] = useState<{
    isThinking: boolean;
    currentStep: number;
    stepName: string;
    totalSteps: number;
  }>({
    isThinking: false,
    currentStep: 0,
    stepName: '',
    totalSteps: 0,
  });

  const handlePlanStepStarted = useCallback((event: PlanStepEvent) => {
    const stepIndex = event.step_index ?? 0;
    const stepName = event.step_name ?? event.step ?? `Step ${stepIndex + 1}`;
    const totalSteps = event.total_steps ?? 0;

    setPlanState((prev) => ({
      ...prev,
      isThinking: true,
      currentStep: stepIndex,
      stepName,
      totalSteps,
    }));
  }, []);

  const handlePlanStepCompleted = useCallback((event: PlanStepEvent) => {
    const stepIndex = event.step_index ?? 0;
    const stepName = event.step_name ?? event.step ?? '';

    setPlanState((prev) => {
      // If this was the last step, thinking is complete
      const isComplete = stepIndex >= prev.totalSteps - 1;

      return {
        ...prev,
        isThinking: !isComplete,
        currentStep: isComplete ? prev.currentStep : stepIndex + 1,
        stepName: isComplete ? '' : stepName,
      };
    });
  }, []);

  const handlePlanComplete = useCallback(() => {
    setPlanState((prev) => ({
      ...prev,
      isThinking: false,
    }));
  }, []);

  return {
    planState,
    handlePlanStepStarted,
    handlePlanStepCompleted,
    handlePlanComplete,
  };
}

export default ThinkingIndicator;
