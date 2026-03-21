/**
 * Microexpression Types
 * 7-state expression engine for visual feedback on agent state
 */

/**
 * The 7 microexpression states representing different agent conditions
 */
export type Microexpression =
  | 'calm'
  | 'attentive'
  | 'working'
  | 'alarmed'
  | 'confused'
  | 'satisfied'
  | 'strained';

/**
 * Configuration for microexpression behavior
 */
export interface MicroexpressionConfig {
  /** Default state to revert to */
  defaultState: Microexpression;
  /** Transition duration in milliseconds */
  transitionDuration: number;
  /** Whether to auto-transition back to default state */
  autoTransition?: boolean;
  /** Delay before auto-reverting in milliseconds */
  autoTransitionDelay?: number;
}

/**
 * Visual styling for a microexpression state
 */
export interface ExpressionStyle {
  /** Border color for the indicator */
  borderColor: string;
  /** Optional background color */
  backgroundColor?: string;
  /** CSS animation string */
  animation?: string;
  /** Box shadow for glow effects */
  boxShadow?: string;
  /** CSS filter (e.g., brightness, blur) */
  filter?: string;
}

/**
 * Semantic color tokens for microexpression states
 * Using oklch color space for consistent perception
 */
export const MICROEXPRESSION_COLORS = {
  calm: {
    border: 'oklch(55% 0.02 264)',       // Neutral gray
    glow: 'oklch(55% 0.02 264 / 0.2)',
  },
  attentive: {
    border: 'oklch(55% 0.2 250)',        // Blue
    glow: 'oklch(55% 0.2 250 / 0.3)',
  },
  working: {
    border: 'oklch(60% 0.2 290)',        // Purple
    glow: 'oklch(60% 0.2 290 / 0.4)',
  },
  alarmed: {
    border: 'oklch(55% 0.22 25)',        // Red
    glow: 'oklch(55% 0.22 25 / 0.5)',
  },
  confused: {
    border: 'oklch(70% 0.18 75)',        // Amber
    glow: 'oklch(70% 0.18 75 / 0.3)',
  },
  satisfied: {
    border: 'oklch(60% 0.18 145)',       // Green
    glow: 'oklch(60% 0.18 145 / 0.3)',
  },
  strained: {
    border: 'oklch(68% 0.18 50)',        // Orange
    glow: 'oklch(68% 0.18 50 / 0.2)',
  },
} as const;

/**
 * Complete style configurations for each microexpression state
 */
export const MICROEXPRESSION_STYLES: Record<Microexpression, ExpressionStyle> = {
  calm: {
    borderColor: MICROEXPRESSION_COLORS.calm.border,
  },
  attentive: {
    borderColor: MICROEXPRESSION_COLORS.attentive.border,
    boxShadow: `0 0 0 2px ${MICROEXPRESSION_COLORS.attentive.glow}`,
  },
  working: {
    borderColor: MICROEXPRESSION_COLORS.working.border,
    animation: 'microexpression-pulse 2s ease-in-out infinite',
    boxShadow: `0 0 8px ${MICROEXPRESSION_COLORS.working.glow}`,
  },
  alarmed: {
    borderColor: MICROEXPRESSION_COLORS.alarmed.border,
    boxShadow: `0 0 12px ${MICROEXPRESSION_COLORS.alarmed.glow}`,
    animation: 'microexpression-alarm 0.5s ease-in-out infinite',
  },
  confused: {
    borderColor: MICROEXPRESSION_COLORS.confused.border,
    animation: 'microexpression-confused 1s ease-in-out infinite',
  },
  satisfied: {
    borderColor: MICROEXPRESSION_COLORS.satisfied.border,
    boxShadow: `0 0 10px ${MICROEXPRESSION_COLORS.satisfied.glow}`,
  },
  strained: {
    borderColor: MICROEXPRESSION_COLORS.strained.border,
    filter: 'brightness(0.85)',
    boxShadow: `0 0 4px ${MICROEXPRESSION_COLORS.strained.glow}`,
  },
};

/**
 * Labels for each microexpression state (for accessibility/debugging)
 */
export const MICROEXPRESSION_LABELS: Record<Microexpression, string> = {
  calm: 'Idle - No activity',
  attentive: 'Input detected',
  working: 'Task in progress',
  alarmed: 'Error or block detected',
  confused: 'Ambiguous input',
  satisfied: 'Task complete',
  strained: 'High load or delay',
};

/**
 * Default configuration for microexpression hook
 */
export const DEFAULT_MICROEXPRESSION_CONFIG: MicroexpressionConfig = {
  defaultState: 'calm',
  transitionDuration: 300,
  autoTransition: true,
  autoTransitionDelay: 3000,
};
