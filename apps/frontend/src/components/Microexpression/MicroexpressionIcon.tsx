import type { Microexpression } from '@uaip/types';
import { cn } from '@/lib/utils';

interface MicroexpressionIconProps {
  type: Microexpression;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export function MicroexpressionIcon({ type, size = 'md', className }: MicroexpressionIconProps) {
  const sizeClass = sizeMap[size];

  const icons: Record<Microexpression, React.ReactNode> = {
    calm: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn(sizeClass, 'text-muted-foreground', className)}
      >
        <circle cx="12" cy="12" r="8" />
      </svg>
    ),
    attentive: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={cn(sizeClass, 'text-blue-500', className)}
      >
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    working: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={cn(sizeClass, 'text-purple-500 animate-spin', className)}
      >
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
    alarmed: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn(sizeClass, 'text-red-500', className)}
      >
        <path d="M12 2L2 22h20L12 2zm0 4l7.5 14h-15L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z" />
      </svg>
    ),
    confused: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn(sizeClass, 'text-amber-500', className)}
      >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
      </svg>
    ),
    satisfied: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn(sizeClass, 'text-green-500', className)}
      >
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
      </svg>
    ),
    strained: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn(sizeClass, 'text-orange-500', className)}
      >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
      </svg>
    ),
  };

  return <div className="flex items-center justify-center">{icons[type]}</div>;
}
