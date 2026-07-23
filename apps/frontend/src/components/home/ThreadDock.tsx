import { MessageSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThreadDockCard } from './ThreadDockCard';
import type { ThreadDockProps } from './home_shell_types';

function getThreadAgentId(metadata: Record<string, unknown> | undefined): string | undefined {
  const agentId = metadata?.agentId;
  return typeof agentId === 'string' ? agentId : undefined;
}

export function ThreadDock({
  threads,
  selectedAgentId,
  onSelectThread,
  onClose,
  className,
}: ThreadDockProps) {
  return (
    <aside
      className={cn(
        'flex w-72 shrink-0 flex-col border-r border-border bg-card/95 backdrop-blur-xl',
        className
      )}
      aria-label="Threads"
    >
      <div className="flex h-12 items-center justify-between border-b border-border px-3 lg:h-11">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <MessageSquare className="h-4 w-4 text-primary" />
          Threads
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Close threads"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {threads.map((thread) => (
          <ThreadDockCard
            key={thread.id}
            thread={thread}
            isSelected={selectedAgentId === getThreadAgentId(thread.metadata)}
            onClick={(event) => onSelectThread(thread, event)}
          />
        ))}
      </div>
    </aside>
  );
}
