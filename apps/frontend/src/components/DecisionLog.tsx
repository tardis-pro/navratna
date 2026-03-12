import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface DecisionLogProps {
  /** Confidence score between 0 and 1 */
  confidence: number;
  /** The action being taken */
  action: string;
  /** Optional risk level indicator */
  riskLevel?: RiskLevel;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show the percentage or just a colored indicator */
  showPercentage?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

function getConfidenceColor(confidenceValue: number): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  if (confidenceValue > 0.8) {
    return {
      bg: 'bg-green-500/15',
      text: 'text-green-700 dark:text-green-300',
      border: 'border-green-500/30',
      label: 'High',
    };
  }
  if (confidenceValue >= 0.5) {
    return {
      bg: 'bg-yellow-500/15',
      text: 'text-yellow-700 dark:text-yellow-300',
      border: 'border-yellow-500/30',
      label: 'Medium',
    };
  }
  return {
    bg: 'bg-red-500/15',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-500/30',
    label: 'Low',
  };
}

function getRiskBadgeStyles(risk: RiskLevel): {
  variant: 'default' | 'secondary' | 'destructive';
  label: string;
} {
  switch (risk) {
    case 'low':
      return { variant: 'default', label: 'Low Risk' };
    case 'medium':
      return { variant: 'secondary', label: 'Medium Risk' };
    case 'high':
      return { variant: 'destructive', label: 'High Risk' };
  }
}

function getRiskBadgeColor(risk: RiskLevel): string {
  switch (risk) {
    case 'low':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
    case 'medium':
      return 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30';
    case 'high':
      return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30';
  }
}

const sizeClasses = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-2.5 py-1.5',
};

/**
 * DecisionLog - Displays a confidence score badge alongside agent actions
 *
 * Shows "[action] (Confidence: X%)" with color-coded confidence indicator.
 * Optional risk level badge can be displayed for additional context.
 * Designed for inline use in chat message rows.
 */
export function DecisionLog({
  confidence,
  action,
  riskLevel,
  className,
  showPercentage = true,
  size = 'sm',
}: DecisionLogProps) {
  const normalizedConfidence = Math.max(0, Math.min(1, confidence));
  const percentage = Math.round(normalizedConfidence * 100);
  const confidenceStyles = getConfidenceColor(normalizedConfidence);

  return (
    <div className={cn('inline-flex items-center gap-2 flex-wrap', sizeClasses[size], className)}>
      {/* Action text */}
      <span className="text-foreground font-medium">{action}</span>

      {/* Confidence indicator */}
      {showPercentage && (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-0.5',
            confidenceStyles.bg,
            confidenceStyles.text,
            confidenceStyles.border
          )}
        >
          <span className="text-xs font-medium">Confidence: {percentage}%</span>

          {/* Visual confidence bar */}
          <div className="flex items-center gap-0.5 ml-1">
            {[1, 2, 3, 4, 5].map((level) => (
              <div
                key={level}
                className={cn(
                  'w-1 h-3 rounded-sm transition-colors',
                  percentage >= level * 20
                    ? level <= 2
                      ? 'bg-green-500'
                      : level <= 4
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    : 'bg-muted'
                )}
              />
            ))}
          </div>
        </span>
      )}

      {/* Simple confidence pill when not showing percentage */}
      {!showPercentage && (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
            confidenceStyles.bg,
            confidenceStyles.text,
            confidenceStyles.border
          )}
        >
          <span className="w-2 h-2 rounded-full bg-current" />
          <span className="text-xs font-medium">{confidenceStyles.label}</span>
        </span>
      )}

      {/* Risk level badge */}
      {riskLevel && (
        <Badge
          className={cn('border text-xs font-medium', getRiskBadgeColor(riskLevel))}
          variant="outline"
        >
          {getRiskBadgeStyles(riskLevel).label}
        </Badge>
      )}
    </div>
  );
}

/**
 * Compact version of DecisionLog for tighter spaces
 */
export function CompactDecisionLog({
  confidence,
  action,
  riskLevel,
  className,
}: Omit<DecisionLogProps, 'showPercentage' | 'size'>) {
  const normalizedConfidence = Math.max(0, Math.min(1, confidence));
  const percentage = Math.round(normalizedConfidence * 100);
  const confidenceStyles = getConfidenceColor(normalizedConfidence);

  return (
    <div className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
      <span className="text-muted-foreground">{action}</span>
      <span
        className={cn(
          'inline-flex items-center rounded px-1.5 py-0.5 font-medium',
          confidenceStyles.bg,
          confidenceStyles.text
        )}
      >
        {percentage}%
      </span>
      {riskLevel && (
        <span
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
            getRiskBadgeColor(riskLevel)
          )}
        >
          {riskLevel}
        </span>
      )}
    </div>
  );
}

export default DecisionLog;
