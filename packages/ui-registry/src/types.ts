import type React from 'react';
import type { ZodTypeAny } from 'zod';
import type { FieldProjection, ActionProjection, LayoutHint } from '@uaip/types';

export type VerificationLevel = 'none' | 'basic' | 'verified' | 'certified';

export type VerificationStatus = {
  level: VerificationLevel;
  axeCompliant: boolean;
  touchTargetMin48px: boolean;
  contrastRatio: number;
  renderBudgetMs: number;
};

export type TokenSlot = {
  name: string;
  cssVar: string;
  description: string;
};

export type LayoutHints = Omit<LayoutHint, 'order' | 'pinned'> & {
  minHeight?: number;
  maxHeight?: number;
  aspectRatio?: string;
};

export type RendererProps = {
  title?: string;
  fields?: FieldProjection[];
  actions?: ActionProjection[];
  data?: Record<string, unknown>;
  onAction?: (action: ActionProjection) => void;
};

export type RegistryEntry = {
  kind: string;
  variant: string;
  propsSchema: ZodTypeAny;
  slotsSchema: ZodTypeAny;
  layoutHints: LayoutHints;
  tokenSlots: TokenSlot[];
  verification: VerificationStatus;
  verificationLevel: VerificationLevel;
  renderer: React.ComponentType<RendererProps>;
};
