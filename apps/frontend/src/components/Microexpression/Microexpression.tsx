import { cva, type VariantProps } from 'class-variance-authority';
import type { Microexpression } from '@uaip/types';
import { MICROEXPRESSION_STYLES, MICROEXPRESSION_LABELS } from '@uaip/types';
import { MicroexpressionIcon } from './MicroexpressionIcon';
import { cn } from '@/lib/utils';

const indicatorVariants = cva(
  'microexpression inline-flex items-center justify-center rounded-full border-2 transition-all duration-300',
  {
    variants: {
      size: {
        sm: 'w-5 h-5',
        md: 'w-7 h-7',
        lg: 'w-9 h-9',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

interface MicroexpressionIndicatorProps extends VariantProps<typeof indicatorVariants> {
  expression: Microexpression;
  showLabel?: boolean;
  className?: string;
}

export function MicroexpressionIndicator({
  expression,
  size = 'md',
  showLabel = false,
  className,
}: MicroexpressionIndicatorProps) {
  const style = MICROEXPRESSION_STYLES[expression];
  const label = MICROEXPRESSION_LABELS[expression];

  const sizeForIcon = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(indicatorVariants({ size }), `microexpression--${expression}`, className)}
        style={{
          borderColor: style.borderColor,
          boxShadow: style.boxShadow,
          animation: style.animation,
          filter: style.filter,
        }}
        role="status"
        aria-label={label}
        title={label}
      >
        <MicroexpressionIcon type={expression} size={sizeForIcon} />
      </div>
      {showLabel && <span className="text-xs text-muted-foreground capitalize">{expression}</span>}
    </div>
  );
}

export { MicroexpressionIcon };
export type { MicroexpressionIndicatorProps };
