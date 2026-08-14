import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import type { Discussion, DiscussionMessage, Thread, ThreadParticipant } from '@uaip/types';
import { ThreadPresence, ThreadState } from '@uaip/types';
import { IntentField } from '@/components/IntentField/IntentField';
import type { IntentOption } from '@/components/IntentField/intent_field_types';
import { useAgents } from '@/contexts/AgentContext';
import { DiscussionConfigModal } from '@/components/DiscussionConfigModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ExploreSurfaceProvider } from '@/components/TelescopeSurface/ExploreSurfaceProvider';
import { swift } from '@/lib/motion';
import { projectsAPI } from '@/api/projects_api';
import { uaipAPI } from '@/utils/uaip_api';
import { logger } from '@/utils/browser_logger';
import { ProjectChatSettingsModal } from './ProjectChatSettingsModal';
import { ShellHeader } from './ShellHeader';
import { ThreadDock } from './ThreadDock';
import { useDockProjects } from './use_dock_projects';
import { decodeThreadRouteId, encodeThreadRouteId } from './thread_route_id';
import { useAgentChatThreads } from './use_agent_chat_threads';
import { WhisperRail } from './WhisperRail';
import type {
  AnimatingThreadRect,
  HomeShellContextValue,
  WhisperSuggestion,
} from './home_shell_types';

function toIsoString(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function getThreadAgentId(thread: Thread): string | undefined {
  const metadataAgentId = getMetadataString(thread.metadata, 'agentId');
  if (metadataAgentId) return metadataAgentId;

  const primary = thread.participants[0];
  return primary?.type === 'agent' ? primary.agentId : undefined;
}

function createEmptyThreadMessages(): Thread['messages'] {
  return [];
}

function toPreviewMessages(
  threadId: string,
  preview: DiscussionMessage | undefined
): Thread['messages'] {
  if (!preview) return createEmptyThreadMessages();

  const metadata = preview.metadata as Record<string, unknown> | undefined;
  const authorType = metadata?.sender === 'user' ? 'user' : 'agent';

  return [
    {
      id: preview.id,
      threadId,
      authorId: getMetadataString(metadata, 'agentId') ?? authorType,
      authorType,
      content: preview.content,
      createdAt: toIsoString(preview.createdAt),
    },
  ];
}

export function HomeShellLayout() {
  const { agents } = useAgents();
  const navigate = useNavigate();
  const location = useLocation();
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [threadPreviews, setThreadPreviews] = useState<Record<string, DiscussionMessage>>({});
  const requestedPreviews = useRef<Set<string>>(new Set());
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | undefined>(undefined);
  const [whisperOpen, setWhisperOpen] = useState(false);
  const [threadDockOpen, setThreadDockOpen] = useState(false);
  const [animatingCard, setAnimatingCard] = useState<AnimatingThreadRect | null>(null);
  const [discussionModalOpen, setDiscussionModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(null);
  const [pendingThreadProject, setPendingThreadProject] = useState<{
    threadKey: string;
    projectId: string;
  } | null>(null);

  const { projects: dockProjects } = useDockProjects(true);

  const {
    threads: chatThreadSummaries,
    refresh: refreshChatThreads,
    rename: renameChatThread,
    archive: archiveChatThread,
  } = useAgentChatThreads(true);

  const fetchDiscussions = useCallback(async () => {
    try {
      const response = await uaipAPI.discussions.list({ limit: 20 });
      if (Array.isArray(response)) {
        setDiscussions(response);
      }
    } catch (error) {
      logger.warn('[HomeShell] discussion list unavailable; keeping local agent threads', error);
    }
  }, []);

  useEffect(() => {
    void fetchDiscussions();
  }, [fetchDiscussions]);

  // Previews are fetched only while the dock is open: the list endpoint carries no
  // last-message field, so this costs one request per thread and is wasted work
  // for a dock the user never opens.
  useEffect(() => {
    if (!threadDockOpen || discussions.length === 0) return;

    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        discussions.map(async (discussion) => {
          if (requestedPreviews.current.has(discussion.id)) return null;
          requestedPreviews.current.add(discussion.id);
          try {
            const [latest] = await uaipAPI.discussions.getMessages(discussion.id, {
              limit: 1,
              order: 'desc',
            });
            return latest ? ([discussion.id, latest] as const) : null;
          } catch (error) {
            requestedPreviews.current.delete(discussion.id);
            logger.warn('[HomeShell] thread preview unavailable', error);
            return null;
          }
        })
      );

      if (cancelled) return;
      const resolved = results.filter((entry): entry is readonly [string, DiscussionMessage] =>
        entry !== null
      );
      if (resolved.length > 0) {
        setThreadPreviews((prev) => ({ ...prev, ...Object.fromEntries(resolved) }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadDockOpen, discussions]);

  useEffect(() => {
    const handleOpenDiscussion = () => setDiscussionModalOpen(true);
    window.addEventListener('open-discussion-config', handleOpenDiscussion);
    window.addEventListener('open-discussion-portal', handleOpenDiscussion);

    return () => {
      window.removeEventListener('open-discussion-config', handleOpenDiscussion);
      window.removeEventListener('open-discussion-portal', handleOpenDiscussion);
    };
  }, []);

  useEffect(() => {
    setThreadDockOpen(false);
  }, [location.pathname]);

  const threads = useMemo<Thread[]>(() => {
    const chatThreads = chatThreadSummaries.map((summary) => {
      const primaryAgentId = summary.agentId ?? summary.agentIds[0];
      const agent = primaryAgentId ? agents[primaryAgentId] : undefined;

      return {
        id: encodeThreadRouteId({
          agentId: primaryAgentId ?? 'unknown',
          threadKey: summary.threadKey,
        }),
        participants: [
          {
            type: 'agent' as const,
            agentId: primaryAgentId ?? 'unknown',
            name: summary.title || agent?.name || 'Thread',
            avatar: '',
            role: agent?.role || 'assistant',
          },
        ],
        messages: createEmptyThreadMessages(),
        state: ThreadState.ACTIVE,
        presence: ThreadPresence.RESTING,
        createdAt: toIsoString(summary.createdAt),
        updatedAt: toIsoString(summary.updatedAt),
        metadata: {
          agentId: primaryAgentId,
          conversationId: summary.id,
          threadKey: summary.threadKey,
          // Absent on discussion threads below, which is what keeps them in the
          // dock's loose section rather than inside somebody's project.
          projectId: summary.projectId ?? undefined,
        },
      };
    });

    const discussionThreads = discussions.map((discussion) => {
      const firstParticipant = discussion.participants?.[0];
      const primaryAgentId =
        getMetadataString(discussion.metadata, 'agentId') ?? firstParticipant?.agentId;
      const agent = primaryAgentId ? agents[primaryAgentId] : undefined;
      const agentName = getMetadataString(discussion.metadata, 'agentName');
      const agentAvatar = getMetadataString(discussion.metadata, 'agentAvatar');
      const participants: ThreadParticipant[] = [
        {
          type: 'agent',
          agentId: primaryAgentId || 'default-agent',
          name: agent?.name || agentName || discussion.title || 'Agent',
          avatar: agentAvatar || '',
          role: agent?.role || 'assistant',
        },
      ];

      return {
        id: discussion.id,
        participants,
        messages: toPreviewMessages(discussion.id, threadPreviews[discussion.id]),
        state: ThreadState.ACTIVE,
        presence:
          discussion.status === 'active' ? ThreadPresence.BREATHING : ThreadPresence.RESTING,
        createdAt: toIsoString(discussion.createdAt),
        updatedAt: toIsoString(discussion.updatedAt),
        metadata: { ...discussion.metadata, agentId: primaryAgentId },
      };
    });

    // Only agents with no thread at all get a placeholder row, so a real thread is
    // never shadowed by an empty duplicate for the same agent.
    const representedAgentIds = new Set(
      [...chatThreads, ...discussionThreads]
        .map((thread) => getThreadAgentId(thread))
        .filter((agentId): agentId is string => typeof agentId === 'string')
    );

    const agentThreads = Object.values(agents)
      .filter((agent) => agent.isActive)
      .filter((agent) => !representedAgentIds.has(agent.id))
      .map((agent) => ({
        id: `agent-thread-${agent.id}`,
        participants: [
          {
            type: 'agent' as const,
            agentId: agent.id,
            name: agent.name,
            avatar: '',
            role: agent.role || 'assistant',
          },
        ],
        messages: createEmptyThreadMessages(),
        state: ThreadState.EMPTY,
        presence: ThreadPresence.RESTING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { agentId: agent.id },
      }));

    return [...chatThreads, ...discussionThreads, ...agentThreads];
  }, [agents, chatThreadSummaries, discussions, threadPreviews]);

  const whisperSuggestions = useMemo<WhisperSuggestion[]>(() => {
    if (location.pathname.startsWith('/explore')) {
      return [
        {
          id: '/explore/knowledge',
          title: 'Open knowledge',
          description: 'Search, upload, and connect what Navratna knows.',
        },
        {
          id: '/explore/unified-tool',
          title: 'Inspect tools',
          description: 'Browse connected capabilities and MCP tools.',
        },
        {
          id: '/explore/agent-manager',
          title: 'Manage agents',
          description: 'Tune roles, models, and active collaborators.',
        },
      ];
    }

    return Object.values(agents)
      .filter((agent) => agent.isActive)
      .slice(0, 6)
      .map((agent) => ({
        id: `agent:${agent.id}`,
        title: `Summon ${agent.name}`,
        description: `Continue with ${agent.role || 'this specialist'}.`,
      }));
  }, [agents, location.pathname]);

  const whisperContextLabel = location.pathname.startsWith('/explore')
    ? 'Your capability constellation stays warm while you move through the shell.'
    : selectedAgentId
      ? 'The active thread is preserved. Shift context without losing the conversation.'
      : 'Active agents are ready when you need a second perspective.';

  const selectAgent = useCallback(
    (agentId: string, threadKey?: string) => {
      setSelectedAgentId(agentId);
      setSelectedThreadKey(threadKey);
      void navigate(`/thread/${encodeURIComponent(encodeThreadRouteId({ agentId, threadKey }))}`);
    },
    [navigate]
  );

  /**
   * A fresh key is minted client-side rather than asking the server to create a
   * row: an empty thread that the user abandons should leave nothing behind, and
   * the conversation is created lazily by the first turn.
   */
  const startNewThread = useCallback(
    (agentId: string, projectId?: string) => {
      const threadKey = crypto.randomUUID();
      // Held client-side until the first turn creates the row. The server has no
      // thread to read a project off yet, so this is the only place that knows
      // which project the conversation is about to belong to.
      setPendingThreadProject(projectId ? { threadKey, projectId } : null);
      selectAgent(agentId, threadKey);
    },
    [selectAgent]
  );

  /**
   * Opens a new thread inside a project, using the agent the project pins.
   *
   * Falls back to the first active agent when nothing is pinned, rather than
   * refusing: a project with no default should still be usable, and the user can
   * switch agent inside the thread.
   */
  const startProjectThread = useCallback(
    async (projectId: string) => {
      let agentId: string | undefined;

      try {
        agentId = (await projectsAPI.getChatSettings(projectId)).defaultAgentId ?? undefined;
      } catch (error) {
        logger.warn('[HomeShell] could not read the project default agent', error);
      }

      // A pinned agent that no longer exists (deleted, or not assigned to this
      // user) must not open a thread against an id that resolves to nothing.
      if (!agentId || !agents[agentId]) {
        agentId = Object.values(agents).find((agent) => agent.isActive)?.id;
      }

      if (!agentId) {
        logger.warn('[HomeShell] no agent available to start a project thread', { projectId });
        return;
      }

      startNewThread(agentId, projectId);
    },
    [agents, startNewThread]
  );

  const selectThreadById = useCallback(
    (threadId: string) => {
      // The url is authoritative: it carries both the agent and the thread, so a
      // deep link resolves without waiting for the thread list to load.
      const route = decodeThreadRouteId(threadId);
      if (route) {
        setSelectedAgentId(route.agentId);
        setSelectedThreadKey(route.threadKey);
        return;
      }

      const thread = threads.find((candidate) => candidate.id === threadId);
      const agentId = thread ? getThreadAgentId(thread) : undefined;
      if (agentId) {
        setSelectedAgentId(agentId);
        setSelectedThreadKey(undefined);
      }
    },
    [threads]
  );

  const handleSelectThread = useCallback(
    (thread: Thread, event: MouseEvent<HTMLButtonElement>) => {
      const primary = thread.participants[0];
      const agentId = getThreadAgentId(thread);
      if (!primary || !agentId) return;

      const threadKey = getMetadataString(thread.metadata, 'threadKey');

      const rect = event.currentTarget.getBoundingClientRect();
      setAnimatingCard({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        name: primary.name,
      });
      setSelectedAgentId(agentId);
      setSelectedThreadKey(threadKey);
      void navigate(`/thread/${encodeURIComponent(thread.id)}`);
      setThreadDockOpen(false);
      window.setTimeout(() => setAnimatingCard(null), 350);
    },
    [navigate]
  );

  const handleDiscussionStarted = useCallback(
    (_discussionId: string, agentIds: string[]) => {
      void fetchDiscussions();
      const firstAgentId = agentIds[0];
      if (firstAgentId) selectAgent(firstAgentId);
    },
    [fetchDiscussions, selectAgent]
  );

  const openDiscussionComposer = useCallback(() => {
    setDiscussionModalOpen(true);
  }, []);

  const handleWhisperSelect = useCallback(
    (suggestion: WhisperSuggestion) => {
      if (suggestion.id.startsWith('agent:')) {
        selectAgent(suggestion.id.slice('agent:'.length));
      } else {
        void navigate(suggestion.id);
      }
      setWhisperOpen(false);
    },
    [navigate, selectAgent]
  );

  const handleIntentSelect = useCallback(
    (option: IntentOption) => {
      setSearchOpen(false);
      if (option.type === 'agent') {
        selectAgent(option.id);
        return;
      }
      void navigate(`/explore/${encodeURIComponent(option.id)}`);
    },
    [navigate, selectAgent]
  );

  /**
   * The stored thread wins: once the first turn has created the row, the server
   * is authoritative about which project the thread is in. The pending value is
   * only the bridge across that gap, and it is matched on threadKey so switching
   * to a different thread before sending cannot carry the project across.
   */
  const activeProjectId = useMemo(() => {
    const summary = chatThreadSummaries.find(
      (candidate) => candidate.threadKey === selectedThreadKey
    );
    if (summary?.projectId) return summary.projectId;

    // The null check is load-bearing: with no pending thread, `?.threadKey` is
    // undefined, which equals an undefined selectedThreadKey — so comparing the
    // keys alone takes this branch on null and dereferences it.
    if (!pendingThreadProject) return undefined;

    return pendingThreadProject.threadKey === selectedThreadKey
      ? pendingThreadProject.projectId
      : undefined;
  }, [chatThreadSummaries, pendingThreadProject, selectedThreadKey]);

  const shellContext = useMemo<HomeShellContextValue>(
    () => ({
      selectedAgentId,
      selectedThreadKey,
      activeProjectId,
      selectAgent,
      selectThreadById,
      openDiscussionComposer,
      startNewThread,
      onThreadActivity: () => void refreshChatThreads(),
    }),
    [
      activeProjectId,
      openDiscussionComposer,
      refreshChatThreads,
      selectAgent,
      selectThreadById,
      selectedAgentId,
      selectedThreadKey,
      startNewThread,
    ]
  );

  return (
    <ExploreSurfaceProvider>
      <div
        className="relative flex h-dvh w-screen flex-col overflow-hidden bg-background pb-[env(safe-area-inset-bottom)] text-foreground"
        data-testid="home-shell"
      >
        <ShellHeader
          onOpenThreads={() => setThreadDockOpen(true)}
          onNewDiscussion={openDiscussionComposer}
          onToggleWhisper={() => setWhisperOpen((open) => !open)}
          whisperOpen={whisperOpen}
          onOpenSearch={() => setSearchOpen(true)}
        />

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <ThreadDock
            threads={threads}
            projects={dockProjects}
            selectedAgentId={selectedAgentId}
            selectedThreadKey={selectedThreadKey}
            onSelectThread={handleSelectThread}
            onRenameThread={renameChatThread}
            onArchiveThread={archiveChatThread}
            onOpenProject={setSettingsProjectId}
            onNewThreadInProject={(projectId) => void startProjectThread(projectId)}
            className="hidden lg:flex"
          />

          {(threadDockOpen || whisperOpen) && (
            <button
              type="button"
              className="fixed inset-x-0 bottom-0 top-12 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
              onClick={() => {
                setThreadDockOpen(false);
                setWhisperOpen(false);
              }}
              aria-label="Close shell panel"
            />
          )}

          {threadDockOpen && (
            <ThreadDock
              threads={threads}
              projects={dockProjects}
              selectedAgentId={selectedAgentId}
              selectedThreadKey={selectedThreadKey}
              onSelectThread={handleSelectThread}
              onRenameThread={renameChatThread}
              onArchiveThread={archiveChatThread}
              onOpenProject={setSettingsProjectId}
              onNewThreadInProject={(projectId) => void startProjectThread(projectId)}
              onClose={() => setThreadDockOpen(false)}
              className="fixed bottom-0 left-0 top-12 z-50 w-[min(20rem,88vw)] shadow-2xl lg:hidden"
            />
          )}

          <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
            <ErrorBoundary key={location.pathname}>
              <Outlet context={shellContext} />
            </ErrorBoundary>
          </main>

          <WhisperRail
            suggestions={whisperSuggestions}
            isOpen={whisperOpen}
            onToggle={() => setWhisperOpen((open) => !open)}
            onSelect={handleWhisperSelect}
            contextLabel={whisperContextLabel}
            className="hidden lg:flex"
          />

          {whisperOpen && (
            <WhisperRail
              suggestions={whisperSuggestions}
              isOpen
              onToggle={() => setWhisperOpen(false)}
              onSelect={handleWhisperSelect}
              contextLabel={whisperContextLabel}
              className="fixed bottom-0 right-0 top-12 z-50 w-[min(20rem,88vw)] lg:hidden"
            />
          )}

          {animatingCard && (
            <motion.div
              style={{
                position: 'fixed',
                left: animatingCard.x,
                top: animatingCard.y,
                width: animatingCard.width,
                height: animatingCard.height,
                zIndex: 9999,
              }}
              animate={{
                left: 'calc(50vw - 200px)',
                top: 'calc(50vh - 250px)',
                width: 400,
                height: 500,
                opacity: [1, 0.9, 0],
              }}
              transition={swift}
              className="flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-6 shadow-lg"
            >
              <div className="flex items-center gap-3">
                <Bot className="h-10 w-10 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">{animatingCard.name}</h3>
                  <p className="text-xs text-muted-foreground">Connecting to hearth...</p>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <DiscussionConfigModal
          isOpen={discussionModalOpen}
          onClose={() => setDiscussionModalOpen(false)}
          onDiscussionStarted={handleDiscussionStarted}
        />

        {settingsProjectId && (
          <ProjectChatSettingsModal
            projectId={settingsProjectId}
            projectName={
              dockProjects.find((project) => project.id === settingsProjectId)?.name ?? 'Project'
            }
            onClose={() => setSettingsProjectId(null)}
          />
        )}

        <IntentField
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSelect={handleIntentSelect}
          placeholder="Search agents, portals, knowledge..."
          showTrigger={false}
        />
      </div>
    </ExploreSurfaceProvider>
  );
}
