import { z } from 'zod';
import type React from 'react';
import type { RegistryEntry, RendererProps, VerificationStatus } from './types.js';

const verified: VerificationStatus = {
  level: 'verified',
  axeCompliant: true,
  touchTargetMin48px: true,
  contrastRatio: 4.5,
  renderBudgetMs: 16,
};

const basicVerified: VerificationStatus = {
  level: 'basic',
  axeCompliant: true,
  touchTargetMin48px: false,
  contrastRatio: 4.5,
  renderBudgetMs: 16,
};

const fieldProjectionSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'currency', 'date', 'status', 'link', 'badge', 'progress']),
  format: z.string().optional(),
});

const actionProjectionSchema = z.object({
  label: z.string(),
  type: z.enum(['approve', 'reject', 'retry', 'skip', 'custom']),
  stepId: z.string().optional(),
  confirmation: z.string().optional(),
});

const basePropsSchema = z.object({
  title: z.string().optional(),
  fields: z.array(fieldProjectionSchema).optional(),
  actions: z.array(actionProjectionSchema).optional(),
  data: z.record(z.unknown()).optional(),
});

const noSlotsSchema = z.object({});

function stubRenderer(_displayType: string): React.ComponentType<RendererProps> {
  return function StubRenderer() { return null; };
}

const entries: RegistryEntry[] = [
  {
    kind: 'card',
    variant: 'summary',
    propsSchema: basePropsSchema,
    slotsSchema: noSlotsSchema,
    layoutHints: { span: 'half' },
    tokenSlots: [
      { name: 'cardBackground', cssVar: '--card', description: 'Card background color' },
      { name: 'cardBorder', cssVar: '--border', description: 'Card border color' },
    ],
    verification: verified,
    verificationLevel: 'verified',
    renderer: stubRenderer('card'),
  },
  {
    kind: 'card',
    variant: 'kv',
    propsSchema: basePropsSchema,
    slotsSchema: noSlotsSchema,
    layoutHints: { span: 'half' },
    tokenSlots: [
      { name: 'cardBackground', cssVar: '--card', description: 'Card background color' },
    ],
    verification: verified,
    verificationLevel: 'verified',
    renderer: stubRenderer('card'),
  },
  {
    kind: 'form',
    variant: 'input-list',
    propsSchema: basePropsSchema.extend({
      fields: z.array(fieldProjectionSchema.extend({
        required: z.boolean().optional(),
        placeholder: z.string().optional(),
      })),
    }),
    slotsSchema: noSlotsSchema,
    layoutHints: { span: 'full' },
    tokenSlots: [
      { name: 'inputBackground', cssVar: '--input', description: 'Input field background' },
      { name: 'inputBorder', cssVar: '--border', description: 'Input border color' },
    ],
    verification: verified,
    verificationLevel: 'verified',
    renderer: stubRenderer('form'),
  },
  {
    kind: 'chart',
    variant: 'bar',
    propsSchema: basePropsSchema,
    slotsSchema: noSlotsSchema,
    layoutHints: { span: 'full', minHeight: 200 },
    tokenSlots: [
      { name: 'chartBar', cssVar: '--primary', description: 'Bar fill color' },
      { name: 'chartBackground', cssVar: '--muted', description: 'Chart background' },
    ],
    verification: basicVerified,
    verificationLevel: 'basic',
    renderer: stubRenderer('chart'),
  },
  {
    kind: 'table',
    variant: 'default',
    propsSchema: basePropsSchema,
    slotsSchema: noSlotsSchema,
    layoutHints: { span: 'full' },
    tokenSlots: [
      { name: 'tableHeaderBackground', cssVar: '--muted', description: 'Table header background' },
      { name: 'tableBorder', cssVar: '--border', description: 'Table border color' },
    ],
    verification: verified,
    verificationLevel: 'verified',
    renderer: stubRenderer('table'),
  },
  {
    kind: 'timeline',
    variant: 'default',
    propsSchema: basePropsSchema,
    slotsSchema: noSlotsSchema,
    layoutHints: { span: 'full' },
    tokenSlots: [
      { name: 'timelineDot', cssVar: '--primary', description: 'Timeline dot color' },
      { name: 'timelineLine', cssVar: '--border', description: 'Timeline connector line' },
    ],
    verification: basicVerified,
    verificationLevel: 'basic',
    renderer: stubRenderer('timeline'),
  },
  {
    kind: 'approval-prompt',
    variant: 'default',
    propsSchema: basePropsSchema.extend({
      blastRadius: z.enum(['low', 'medium', 'high']).optional(),
    }),
    slotsSchema: noSlotsSchema,
    layoutHints: { span: 'half' },
    tokenSlots: [
      { name: 'approveButton', cssVar: '--primary', description: 'Approve action button' },
      { name: 'rejectButton', cssVar: '--destructive', description: 'Reject action button' },
    ],
    verification: verified,
    verificationLevel: 'verified',
    renderer: stubRenderer('approval-prompt'),
  },
  {
    kind: 'status-badge',
    variant: 'default',
    propsSchema: basePropsSchema,
    slotsSchema: noSlotsSchema,
    layoutHints: { span: 'quarter' },
    tokenSlots: [
      { name: 'badgeSuccess', cssVar: '--primary', description: 'Success state badge' },
      { name: 'badgeError', cssVar: '--destructive', description: 'Error state badge' },
    ],
    verification: verified,
    verificationLevel: 'verified',
    renderer: stubRenderer('status-badge'),
  },
  {
    kind: 'custom-url',
    variant: 'external-embed',
    propsSchema: basePropsSchema.extend({
      url: z.string().url(),
      sandbox: z.string().optional(),
    }),
    slotsSchema: noSlotsSchema,
    layoutHints: { span: 'full', minHeight: 256 },
    tokenSlots: [],
    verification: basicVerified,
    verificationLevel: 'basic',
    renderer: stubRenderer('custom-url'),
  },
];

const registryMap = new Map<string, RegistryEntry>();

for (const entry of entries) {
  registryMap.set(`${entry.kind}.${entry.variant}`, entry);
}

export function resolve(kind: string, variant: string): RegistryEntry | undefined {
  return registryMap.get(`${kind}.${variant}`);
}

export function resolveWithFallback(kind: string, variant: string): RegistryEntry {
  const entry = resolve(kind, variant);
  if (entry) return entry;

  const defaultVariant = resolveDefaultVariant(kind);
  if (defaultVariant) return defaultVariant;

  const fallback = entries[0];
  if (!fallback) throw new Error(`ui-registry: no entries registered — cannot provide fallback`);
  return fallback;
}

function resolveDefaultVariant(kind: string): RegistryEntry | undefined {
  return entries.find((e) => e.kind === kind && e.variant === 'default')
    ?? entries.find((e) => e.kind === kind);
}

export function list(): readonly RegistryEntry[] {
  return entries;
}

export function listKinds(): string[] {
  return [...new Set(entries.map((e) => e.kind))];
}
