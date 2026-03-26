export const DESIGN_TOKENS = {
  colors: {
    primary: 'from-blue-400 to-cyan-400',
    surface: 'bg-slate-900/90',
    surfaceHover: 'hover:bg-slate-700/50',
    border: 'border-slate-700/50',
    text: 'text-white',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-400',
  },
  spacing: {
    xs: 'gap-2',
    sm: 'gap-3',
    md: 'gap-4',
    lg: 'gap-6',
  },
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl',
    lg: 'rounded-2xl',
  },
  padding: {
    sm: 'p-1',
    md: 'p-2',
    lg: 'p-4',
  },
  backdrop: 'backdrop-blur-xl',
  transition: 'transition-all duration-200',
  shadow: 'shadow-xl',
};

export const PRIORITY_OPTION_VALUES = ['low', 'medium', 'high', 'urgent'] as const;
export type PriorityOptionValue = (typeof PRIORITY_OPTION_VALUES)[number];

export const TYPE_OPTION_VALUES = [
  'feature',
  'bug',
  'enhancement',
  'research',
  'documentation',
  'testing',
  'deployment',
  'maintenance',
] as const;
export type TypeOptionValue = (typeof TYPE_OPTION_VALUES)[number];
