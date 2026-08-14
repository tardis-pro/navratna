import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  MessageSquare,
  Pencil,
  Plus,
  Settings2,
  X,
} from 'lucide-react';
import type { Thread } from '@uaip/types';
import { cn } from '@/lib/utils';
import { ThreadDockCard } from './ThreadDockCard';
import type { DockProject, ThreadDockProps } from './home_shell_types';

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

interface ThreadRowProps {
  thread: Thread;
  selectedAgentId: string | null;
  selectedThreadKey?: string;
  renamingId: string | null;
  draftTitle: string;
  onDraftTitleChange: (value: string) => void;
  onStartRename: (conversationId: string, currentTitle: string) => void;
  onCancelRename: () => void;
  onSelectThread: (thread: Thread, event: MouseEvent<HTMLButtonElement>) => void;
  onRenameThread?: (conversationId: string, title: string) => void;
  onArchiveThread?: (conversationId: string) => void;
}

/**
 * One row of the dock. Extracted so a thread renders identically whether it sits
 * inside a project group or in the loose list below — duplicating it would let
 * the two drift, and selection/rename behaviour is the fiddly part.
 */
function ThreadRow({
  thread,
  selectedAgentId,
  selectedThreadKey,
  renamingId,
  draftTitle,
  onDraftTitleChange,
  onStartRename,
  onCancelRename,
  onSelectThread,
  onRenameThread,
  onArchiveThread,
}: ThreadRowProps) {
  const agentId = getMetadataString(thread.metadata, 'agentId');
  const threadKey = getMetadataString(thread.metadata, 'threadKey');
  const conversationId = getMetadataString(thread.metadata, 'conversationId');

  // Both halves must match: with several threads per agent, comparing the
  // agent alone would highlight every thread the agent appears in.
  const isSelected = selectedAgentId === agentId && selectedThreadKey === threadKey;

  if (renamingId === conversationId && conversationId) {
    return (
      <form
        className="px-1 py-1"
        onSubmit={(event) => {
          event.preventDefault();
          onRenameThread?.(conversationId, draftTitle);
          onCancelRename();
        }}
      >
        <input
          autoFocus
          value={draftTitle}
          onChange={(event) => onDraftTitleChange(event.target.value)}
          onBlur={onCancelRename}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onCancelRename();
          }}
          aria-label="Thread title"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
      </form>
    );
  }

  return (
    <div className="group relative">
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
              onClick={() =>
                onStartRename(conversationId, thread.participants[0]?.name ?? '')
              }
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
}

export function ThreadDock({
  threads,
  projects,
  selectedAgentId,
  selectedThreadKey,
  onSelectThread,
  onRenameThread,
  onArchiveThread,
  onOpenProject,
  onNewThreadInProject,
  onClose,
  className,
}: ThreadDockProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  /**
   * Threads are bucketed by project rather than filtered per project inside the
   * render, which would be O(projects × threads) and re-run on every keystroke
   * of a rename.
   */
  const { byProject, looseThreads } = useMemo(() => {
    const grouped = new Map<string, Thread[]>();
    const loose: Thread[] = [];

    for (const thread of threads) {
      const projectId = getMetadataString(thread.metadata, 'projectId');
      if (!projectId) {
        loose.push(thread);
        continue;
      }
      const bucket = grouped.get(projectId);
      if (bucket) bucket.push(thread);
      else grouped.set(projectId, [thread]);
    }

    return { byProject: grouped, looseThreads: loose };
  }, [threads]);

  /**
   * A thread whose project is not in the list — deleted, or not yet loaded —
   * shows in the loose section instead of vanishing. Dropping it silently is how
   * a user loses a conversation they can still see in the database.
   */
  const visibleProjects: DockProject[] = useMemo(() => projects ?? [], [projects]);
  const knownProjectIds = useMemo(
    () => new Set(visibleProjects.map((project) => project.id)),
    [visibleProjects]
  );
  const orphanedThreads = useMemo(() => {
    const orphans: Thread[] = [];
    for (const [projectId, projectThreads] of byProject) {
      if (!knownProjectIds.has(projectId)) orphans.push(...projectThreads);
    }
    return orphans;
  }, [byProject, knownProjectIds]);

  const rowProps = {
    selectedAgentId,
    selectedThreadKey,
    renamingId,
    draftTitle,
    onDraftTitleChange: setDraftTitle,
    onStartRename: (conversationId: string, currentTitle: string) => {
      setRenamingId(conversationId);
      setDraftTitle(currentTitle);
    },
    onCancelRename: () => setRenamingId(null),
    onSelectThread,
    onRenameThread,
    onArchiveThread,
  };

  const toggleProject = (projectId: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

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

      <div className="flex-1 overflow-y-auto p-2">
        {visibleProjects.length > 0 && (
          <div className="mb-2 space-y-1">
            {visibleProjects.map((project) => {
              const projectThreads = byProject.get(project.id) ?? [];
              const isCollapsed = collapsed.has(project.id);

              return (
                <div key={project.id}>
                  <div className="group/project flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleProject(project.id)}
                      aria-expanded={!isCollapsed}
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">{project.name}</span>
                      <span className="ml-auto shrink-0 tabular-nums opacity-60">
                        {projectThreads.length}
                      </span>
                    </button>

                    {onNewThreadInProject && (
                      <button
                        type="button"
                        aria-label={`New thread in ${project.name}`}
                        onClick={() => onNewThreadInProject(project.id)}
                        className="hidden shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground group-hover/project:block group-focus-within/project:block"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {onOpenProject && (
                      <button
                        type="button"
                        aria-label={`${project.name} settings`}
                        onClick={() => onOpenProject(project.id)}
                        className="hidden shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground group-hover/project:block group-focus-within/project:block"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {!isCollapsed && (
                    <div className="ml-3 space-y-1 border-l border-border pl-1">
                      {projectThreads.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">
                          No threads yet
                        </p>
                      ) : (
                        projectThreads.map((thread) => (
                          <ThreadRow key={thread.id} thread={thread} {...rowProps} />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-1">
          {[...looseThreads, ...orphanedThreads].map((thread) => (
            <ThreadRow key={thread.id} thread={thread} {...rowProps} />
          ))}
        </div>
      </div>
    </aside>
  );
}
