import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WhisperRailProps } from './home_shell_types';

export function WhisperRail({
  suggestions,
  isOpen,
  onToggle,
  onSelect,
  contextLabel,
  className,
}: WhisperRailProps) {
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-l border-border bg-card/95 shadow-2xl backdrop-blur-xl transition-[width,transform] duration-200 lg:shadow-none',
        isOpen ? 'w-72' : 'w-12',
        className
      )}
      aria-label="Whisper suggestions"
    >
      <div className="flex h-11 items-center justify-between border-b border-border px-3">
        {isOpen && (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Whisper
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={isOpen ? 'Collapse suggestions' : 'Expand suggestions'}
        >
          {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {isOpen ? (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{contextLabel}</p>
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => onSelect(suggestion)}
                className="block w-full rounded-lg border border-border/70 bg-background/70 p-2.5 text-left transition-colors hover:bg-muted/60"
              >
                <span className="block text-xs font-medium text-foreground">{suggestion.title}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                  {suggestion.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 justify-center pt-4">
          <Sparkles className="h-4 w-4 text-amber-500/80" />
        </div>
      )}
    </aside>
  );
}
