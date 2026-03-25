import type { CSSProperties } from 'react';
import type { Microexpression } from '@uaip/types';
import { MICROEXPRESSION_COLORS } from '@uaip/types';
import type { BlockVisibility, MaterializableBlockType } from './MaterializableBlock.types';

export const EXPRESSION_STYLES: Record<Microexpression, CSSProperties> = {
  calm: {
    borderColor: MICROEXPRESSION_COLORS.calm.border,
  },
  attentive: {
    borderColor: MICROEXPRESSION_COLORS.attentive.border,
    boxShadow: `0 0 0 2px ${MICROEXPRESSION_COLORS.attentive.glow}`,
  },
  working: {
    borderColor: MICROEXPRESSION_COLORS.working.border,
    boxShadow: `0 0 8px ${MICROEXPRESSION_COLORS.working.glow}`,
  },
  alarmed: {
    borderColor: MICROEXPRESSION_COLORS.alarmed.border,
    boxShadow: `0 0 12px ${MICROEXPRESSION_COLORS.alarmed.glow}`,
  },
  confused: {
    borderColor: MICROEXPRESSION_COLORS.confused.border,
  },
  satisfied: {
    borderColor: MICROEXPRESSION_COLORS.satisfied.border,
    boxShadow: `0 0 10px ${MICROEXPRESSION_COLORS.satisfied.glow}`,
  },
  strained: {
    borderColor: MICROEXPRESSION_COLORS.strained.border,
    boxShadow: `0 0 4px ${MICROEXPRESSION_COLORS.strained.glow}`,
    filter: 'brightness(0.85)',
  },
};

export const VISIBILITY_STYLES: Record<BlockVisibility, CSSProperties> = {
  visible: {
    opacity: 1,
    pointerEvents: 'auto',
    transform: 'scale(1)',
  },
  faded: {
    opacity: 0.5,
    pointerEvents: 'auto',
    transform: 'scale(0.98)',
  },
  hidden: {
    opacity: 0,
    pointerEvents: 'none',
    transform: 'scale(0.8)',
  },
};

export const BLOCK_TYPE_COLORS: Record<
  MaterializableBlockType,
  { bg: string; border: string; accent: string }
> = {
  agent: {
    bg: 'oklch(20% 0.02 250 / 0.8)',
    border: 'oklch(55% 0.2 250 / 0.4)',
    accent: 'oklch(60% 0.2 250)',
  },
  portal: {
    bg: 'oklch(20% 0.02 290 / 0.8)',
    border: 'oklch(60% 0.2 290 / 0.4)',
    accent: 'oklch(65% 0.22 290)',
  },
  artifact: {
    bg: 'oklch(20% 0.02 145 / 0.8)',
    border: 'oklch(60% 0.18 145 / 0.4)',
    accent: 'oklch(65% 0.2 145)',
  },
  discussion: {
    bg: 'oklch(20% 0.02 50 / 0.8)',
    border: 'oklch(68% 0.18 50 / 0.4)',
    accent: 'oklch(72% 0.2 50)',
  },
  task: {
    bg: 'oklch(20% 0.02 75 / 0.8)',
    border: 'oklch(70% 0.18 75 / 0.4)',
    accent: 'oklch(75% 0.2 75)',
  },
};

export function getExpressionColor(expression: Microexpression): string {
  return MICROEXPRESSION_COLORS[expression].border;
}

export function getExpressionGlow(expression: Microexpression): string {
  return MICROEXPRESSION_COLORS[expression].glow;
}

export function getBlockBaseStyle(
  type: MaterializableBlockType,
  expression: Microexpression,
  visibility: BlockVisibility
): CSSProperties {
  const typeColors = BLOCK_TYPE_COLORS[type];
  const expressionStyle = EXPRESSION_STYLES[expression];
  const visibilityStyle = VISIBILITY_STYLES[visibility];

  return {
    backgroundColor: typeColors.bg,
    borderWidth: 2,
    borderStyle: 'solid',
    borderRadius: '1rem',
    transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    ...expressionStyle,
    ...visibilityStyle,
  };
}

export const CONTAINER_STYLES: CSSProperties = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

export const HEADER_STYLES: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.75rem 1rem',
  borderBottomWidth: 1,
  borderBottomStyle: 'solid',
  flexShrink: 0,
};

export const CONTENT_STYLES: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '1rem',
};

export const EXPRESSION_INDICATOR_STYLES: CSSProperties = {
  position: 'absolute',
  top: '0.5rem',
  right: '0.5rem',
  width: '0.5rem',
  height: '0.5rem',
  borderRadius: '50%',
  transition: 'all 300ms ease',
};

export const SCORE_BADGE_STYLES: CSSProperties = {
  position: 'absolute',
  bottom: '0.5rem',
  right: '0.5rem',
  padding: '0.125rem 0.5rem',
  borderRadius: '0.375rem',
  fontSize: '0.625rem',
  fontWeight: 600,
  opacity: 0.7,
};

export const KEYFRAME_ANIMATIONS = `
@keyframes materializable-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes materializable-alarm {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

@keyframes materializable-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes materializable-enter {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes materializable-exit {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.9);
  }
}
`;

export const cn = (...classes: (string | boolean | undefined | null)[]): string =>
  classes.filter(Boolean).join(' ');
