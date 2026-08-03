import { useState } from 'react';
import { Archive, MessageSquare, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThreadDockCard } from './ThreadDockCard';
import type { ThreadDockProps } from './home_shell_types';

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

export function ThreadDock({
  threads,
  selectedAgentId,
  selectedThreadKey,
  onSelectThread,
  onRenameThread,
  onArchiveThread,
  onClose,
  className,
}: ThreadDockProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

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
        {threads.map((thread) => {
          const agentId = getMetadataString(thread.metadata, 'agentId');
          const threadKey = getMetadataString(thread.metadata, 'threadKey');
          const conversationId = getMetadataString(thread.metadata, 'conversationId');

          // Both halves must match: with several threads per agent, comparing the
          // agent alone would highlight every thread the agent appears in.
          const isSelected = selectedAgentId === agentId && selectedThreadKey === threadKey;

          if (renamingId === conversationId && conversationId) {
            return (
              <form
                key={thread.id}
                className="px-1 py-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  onRenameThread?.(conversationId, draftTitle);
                  setRenamingId(null);
                }}
              >
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={() => setRenamingId(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setRenamingId(null);
                  }}
                  aria-label="Thread title"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                />
              </form>
            );
          }

          return (
            <div key={thread.id} className="group relative">
              <ThreadDockCard
                thread={thread}
                isSelected={isSelected}
                onClick={(event) => onSelectThread(thread, event)}
              />

              {conversationId && (
                <div className="absolute right-2 top-2 hidden gap-0.5 group-hover:flex group-focus-within:flex">
                  {onRenameThread && (
                    <button
                      type="button"
                      aria-label={`Rename ${thread.participants[0]?.name ?? 'thread'}`}
                      onClick={() => {
                        setRenamingId(conversationId);
                        setDraftTitle(thread.participants[0]?.name ?? '');
                      }}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onArchiveThread && (
                    <button
                      type="button"
                      aria-label={`Archive ${thread.participants[0]?.name ?? 'thread'}`}
                      onClick={() => onArchiveThread(conversationId)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
