import { LayoutGrid, MessageSquare, MessageSquarePlus } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ThreadDockCard } from './ThreadDockCard';
import type { ThreadDockProps } from './home_shell_types';

function getThreadAgentId(metadata: Record<string, unknown> | undefined): string | undefined {
  const agentId = metadata?.agentId;
  return typeof agentId === 'string' ? agentId : undefined;
}

export function ThreadDock({
  threads,
  selectedAgentId,
  onNewDiscussion,
  onSelectThread,
}: ThreadDockProps) {
  return (
    <aside
      className="flex w-80 shrink-0 flex-col border-r border-border bg-card"
      aria-label="Threads"
    >
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <MessageSquare className="h-5 w-5 text-primary" />
          Threads
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewDiscussion}
            className="h-8 gap-1 px-2 text-xs"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New
          </Button>
          <Link
            to="/explore"
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
            aria-label="Explore capabilities"
          >
            <LayoutGrid className="h-4 w-4" />
            Explore
          </Link>
        </div>
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
