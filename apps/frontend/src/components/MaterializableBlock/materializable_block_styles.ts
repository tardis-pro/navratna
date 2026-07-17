import type { CSSProperties } from 'react';
import type { Microexpression } from '@uaip/types';
import { MICROEXPRESSION_COLORS } from '@uaip/types';
import type { BlockVisibility, MaterializableBlockType } from './materializable_block_types';

// Restrained, theme-neutral elevation shadow shared by all cards so hierarchy
// stays consistent instead of each card emitting its own neon glow.
const CARD_ELEVATION = '0 1px 3px oklch(0% 0 0 / 0.08), 0 1px 2px oklch(0% 0 0 / 0.06)';

export const EXPRESSION_STYLES: Record<Microexpression, CSSProperties> = {
  calm: {
    borderColor: MICROEXPRESSION_COLORS.calm.border,
    boxShadow: CARD_ELEVATION,
  },
  attentive: {
    borderColor: MICROEXPRESSION_COLORS.attentive.border,
    boxShadow: CARD_ELEVATION,
  },
  working: {
    borderColor: MICROEXPRESSION_COLORS.working.border,
    boxShadow: CARD_ELEVATION,
  },
  alarmed: {
    borderColor: MICROEXPRESSION_COLORS.alarmed.border,
    boxShadow: `0 0 0 1px ${MICROEXPRESSION_COLORS.alarmed.border}, ${CARD_ELEVATION}`,
  },
  confused: {
    borderColor: MICROEXPRESSION_COLORS.confused.border,
    boxShadow: CARD_ELEVATION,
  },
  satisfied: {
    borderColor: MICROEXPRESSION_COLORS.satisfied.border,
    boxShadow: CARD_ELEVATION,
  },
  strained: {
    borderColor: MICROEXPRESSION_COLORS.strained.border,
    boxShadow: CARD_ELEVATION,
  },
};

export const VISIBILITY_STYLES: Record<BlockVisibility, CSSProperties> = {
  visible: {
    opacity: 1,
    pointerEvents: 'auto',
    transform: 'scale(1)',
  },
  faded: {
    opacity: 0.9,
    pointerEvents: 'auto',
    transform: 'scale(1)',
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
  // Card surface + border follow the light/dark theme tokens so cards adapt to
  // the OS theme. Only `accent` carries the per-type identity (used for a small
  // dot, icon tint, header strip, and progress bar) — kept restrained.
  agent: {
    bg: 'var(--color-card)',
    border: 'var(--color-border)',
    accent: 'oklch(58% 0.17 248)',
  },
  portal: {
    bg: 'var(--color-card)',
    border: 'var(--color-border)',
    accent: 'oklch(56% 0.19 290)',
  },
  artifact: {
    bg: 'var(--color-card)',
    border: 'var(--color-border)',
    accent: 'oklch(55% 0.15 145)',
  },
  discussion: {
    bg: 'var(--color-card)',
    border: 'var(--color-border)',
    accent: 'oklch(60% 0.16 50)',
  },
  task: {
    bg: 'var(--color-card)',
    border: 'var(--color-border)',
    accent: 'oklch(62% 0.15 75)',
  },
  workflow: {
    bg: 'var(--color-card)',
    border: 'var(--color-border)',
    accent: 'oklch(56% 0.14 200)',
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
  willChange: 'transform, opacity',
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
