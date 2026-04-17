import { z } from 'zod';

const ColorTokenSchema = z.object({
  value: z.string(),
  description: z.string().optional(),
});

const RadiusTokenSchema = z.object({
  sm: z.string(),
  md: z.string(),
  lg: z.string(),
  full: z.string(),
});

const ElevationTokenSchema = z.object({
  none: z.string(),
  sm: z.string(),
  md: z.string(),
  lg: z.string(),
  xl: z.string(),
});

const SpaceTokenSchema = z.object({
  xs: z.string(),
  sm: z.string(),
  md: z.string(),
  lg: z.string(),
  xl: z.string(),
  xxl: z.string(),
});

const TypeTokenSchema = z.object({
  xs: z.string(),
  sm: z.string(),
  md: z.string(),
  lg: z.string(),
  xl: z.string(),
  xxl: z.string(),
  mono: z.string(),
});

const MicroexpressionTokenSchema = z.object({
  calm: z.string(),
  attentive: z.string(),
  working: z.string(),
  alarmed: z.string(),
  confused: z.string(),
  satisfied: z.string(),
  strained: z.string(),
});

export const DesignTokenSchema = z.object({
  name: z.string(),
  version: z.string(),
  color: z.object({
    surface: z.object({
      primary: ColorTokenSchema,
      secondary: ColorTokenSchema,
      tertiary: ColorTokenSchema,
      inverse: ColorTokenSchema,
      overlay: ColorTokenSchema,
    }),
    text: z.object({
      primary: ColorTokenSchema,
      secondary: ColorTokenSchema,
      muted: ColorTokenSchema,
      inverse: ColorTokenSchema,
      accent: ColorTokenSchema,
    }),
    border: z.object({
      default: ColorTokenSchema,
      strong: ColorTokenSchema,
      subtle: ColorTokenSchema,
      focus: ColorTokenSchema,
    }),
    status: z.object({
      success: ColorTokenSchema,
      warning: ColorTokenSchema,
      error: ColorTokenSchema,
      info: ColorTokenSchema,
    }),
  }),
  radius: RadiusTokenSchema,
  elevation: ElevationTokenSchema,
  space: SpaceTokenSchema,
  type: TypeTokenSchema,
  microexpression: MicroexpressionTokenSchema,
});

export type DesignToken = z.infer<typeof DesignTokenSchema>;

export const DEFAULT_DESIGN_TOKENS: DesignToken = {
  name: 'navratna-default',
  version: '1.0.0',
  color: {
    surface: {
      primary: { value: 'oklch(15% 0.02 248 / 0.95)', description: 'Main background' },
      secondary: { value: 'oklch(18% 0.02 248 / 0.85)', description: 'Card/panel background' },
      tertiary: { value: 'oklch(22% 0.02 248 / 0.75)', description: 'Nested surface' },
      inverse: { value: 'oklch(98% 0.005 248)', description: 'Inverse surface' },
      overlay: { value: 'oklch(10% 0.01 248 / 0.8)', description: 'Modal overlay' },
    },
    text: {
      primary: { value: 'oklch(95% 0.01 248)', description: 'Primary text' },
      secondary: { value: 'oklch(70% 0.015 248)', description: 'Secondary text' },
      muted: { value: 'oklch(55% 0.01 248)', description: 'Muted/placeholder text' },
      inverse: { value: 'oklch(15% 0.02 248)', description: 'Text on inverse surface' },
      accent: { value: 'oklch(65% 0.22 248)', description: 'Accent/link text' },
    },
    border: {
      default: { value: 'oklch(35% 0.02 248 / 0.5)', description: 'Default border' },
      strong: { value: 'oklch(50% 0.03 248 / 0.7)', description: 'Emphasized border' },
      subtle: { value: 'oklch(25% 0.01 248 / 0.3)', description: 'Subtle border' },
      focus: { value: 'oklch(65% 0.22 248 / 0.8)', description: 'Focus ring' },
    },
    status: {
      success: { value: 'oklch(60% 0.18 145)', description: 'Success green' },
      warning: { value: 'oklch(70% 0.18 75)', description: 'Warning amber' },
      error: { value: 'oklch(55% 0.22 25)', description: 'Error red' },
      info: { value: 'oklch(62% 0.18 248)', description: 'Info blue' },
    },
  },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '0.75rem', full: '9999px' },
  elevation: {
    none: 'none',
    sm: '0 1px 2px oklch(0% 0 0 / 0.4)',
    md: '0 4px 8px oklch(0% 0 0 / 0.5)',
    lg: '0 8px 24px oklch(0% 0 0 / 0.6)',
    xl: '0 16px 48px oklch(0% 0 0 / 0.7)',
  },
  space: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', xxl: '3rem' },
  type: {
    xs: '0.625rem',
    sm: '0.75rem',
    md: '0.875rem',
    lg: '1rem',
    xl: '1.25rem',
    xxl: '1.5rem',
    mono: '"JetBrains Mono", monospace',
  },
  microexpression: {
    calm: 'oklch(55% 0.15 248 / 0.5)',
    attentive: 'oklch(65% 0.2 200 / 0.6)',
    working: 'oklch(65% 0.18 145 / 0.5)',
    alarmed: 'oklch(60% 0.22 25 / 0.7)',
    confused: 'oklch(68% 0.2 50 / 0.5)',
    satisfied: 'oklch(60% 0.18 145 / 0.6)',
    strained: 'oklch(62% 0.15 300 / 0.5)',
  },
};
