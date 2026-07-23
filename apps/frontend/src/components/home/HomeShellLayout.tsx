import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { motion } from 'framer-motion';
import { Bot, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import type { Discussion, Thread, ThreadParticipant } from '@uaip/types';
import { ThreadPresence, ThreadState } from '@uaip/types';
import { useAgents } from '@/contexts/AgentContext';
import { DiscussionConfigModal } from '@/components/DiscussionConfigModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ExploreSurfaceProvider } from '@/components/TelescopeSurface/ExploreSurfaceProvider';
import { cn } from '@/lib/utils';
import { swift } from '@/lib/motion';
import { uaipAPI } from '@/utils/uaip_api';
import { logger } from '@/utils/browser_logger';
import { ThreadDock } from './ThreadDock';
import type {
  AnimatingThreadRect,
  HomeShellContextValue,
  HomeSuggestion,
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

export function HomeShellLayout() {
  const { agents } = useAgents();
  const navigate = useNavigate();
  const location = useLocation();
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [whisperOpen, setWhisperOpen] = useState(false);
  const [animatingCard, setAnimatingCard] = useState<AnimatingThreadRect | null>(null);
  const [discussionModalOpen, setDiscussionModalOpen] = useState(false);

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

  useEffect(() => {
    const handleOpenDiscussion = () => setDiscussionModalOpen(true);
    window.addEventListener('open-discussion-config', handleOpenDiscussion);
    window.addEventListener('open-discussion-portal', handleOpenDiscussion);

    return () => {
      window.removeEventListener('open-discussion-config', handleOpenDiscussion);
      window.removeEventListener('open-discussion-portal', handleOpenDiscussion);
    };
  }, []);

  const threads = useMemo<Thread[]>(() => {
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
        messages: createEmptyThreadMessages(),
        state: ThreadState.ACTIVE,
        presence:
          discussion.status === 'active' ? ThreadPresence.BREATHING : ThreadPresence.RESTING,
        createdAt: toIsoString(discussion.createdAt),
        updatedAt: toIsoString(discussion.updatedAt),
        metadata: { ...discussion.metadata, agentId: primaryAgentId },
      };
    });

    const agentThreads = Object.values(agents)
      .filter((agent) => agent.isActive)
      .filter(
        (agent) =>
          !discussionThreads.some((thread) => getThreadAgentId(thread) === agent.id)
      )
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

    return [...discussionThreads, ...agentThreads];
  }, [agents, discussions]);

  const whisperSuggestions = useMemo<HomeSuggestion[]>(
    () =>
      Object.values(agents)
        .filter((agent) => agent.isActive)
        .map((agent) => ({
          title: `Summon ${agent.name}`,
          description: `Active role: ${agent.role || 'helper'}`,
          agentId: agent.id,
        })),
    [agents]
  );

  const selectAgent = useCallback(
    (agentId: string) => {
      setSelectedAgentId(agentId);
      void navigate(`/thread/${encodeURIComponent(`agent-thread-${agentId}`)}`);
    },
    [navigate]
  );

  const selectThreadById = useCallback(
    (threadId: string) => {
      const thread = threads.find((candidate) => candidate.id === threadId);
      const agentId = thread ? getThreadAgentId(thread) : undefined;
      if (agentId) setSelectedAgentId(agentId);
    },
    [threads]
  );

  const handleSelectThread = useCallback(
    (thread: Thread, event: MouseEvent<HTMLButtonElement>) => {
      const primary = thread.participants[0];
      const agentId = getThreadAgentId(thread);
      if (!primary || !agentId) return;

      const rect = event.currentTarget.getBoundingClientRect();
      setAnimatingCard({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        name: primary.name,
      });
      setSelectedAgentId(agentId);
      void navigate(`/thread/${encodeURIComponent(thread.id)}`);
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

  const shellContext = useMemo<HomeShellContextValue>(
    () => ({
      selectedAgentId,
      selectAgent,
      selectThreadById,
      openDiscussionComposer,
    }),
    [openDiscussionComposer, selectAgent, selectThreadById, selectedAgentId]
  );

  return (
    <div
      className="relative flex h-screen w-screen overflow-hidden bg-background text-foreground"
      data-testid="home-shell"
    >
      <ThreadDock
        threads={threads}
        selectedAgentId={selectedAgentId}
        onNewDiscussion={() => setDiscussionModalOpen(true)}
        onSelectThread={handleSelectThread}
      />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <ExploreSurfaceProvider>
          <ErrorBoundary key={location.pathname}>
            <Outlet context={shellContext} />
          </ErrorBoundary>
        </ExploreSurfaceProvider>
      </main>

      <aside
        className={cn(
          'flex shrink-0 flex-col border-l border-border bg-card transition-all duration-300',
          whisperOpen ? 'w-64' : 'w-12'
        )}
        aria-label="Whisper suggestions"
      >
        <div className="flex items-center justify-between border-b border-border p-3">
          {whisperOpen && (
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Whisper
            </span>
          )}
          <button
            type="button"
            onClick={() => setWhisperOpen((open) => !open)}
            className="ml-auto cursor-pointer rounded p-1 hover:bg-muted"
            aria-label={whisperOpen ? 'Collapse suggestions' : 'Expand suggestions'}
          >
            {whisperOpen ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {whisperOpen ? (
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Suggestions
            </p>
            <div className="space-y-2">
              {whisperSuggestions.map((suggestion) => (
                <button
                  key={suggestion.agentId}
                  type="button"
                  onClick={() => selectAgent(suggestion.agentId)}
                  className="block w-full cursor-pointer space-y-1 rounded-lg border border-border bg-background p-2.5 text-left text-xs transition-all hover:bg-muted/50"
                >
                  <span className="block font-medium text-foreground">{suggestion.title}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {suggestion.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center space-y-4 pt-4">
            <Sparkles className="h-4 w-4 animate-pulse text-amber-500" />
          </div>
        )}
      </aside>

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

      <DiscussionConfigModal
        isOpen={discussionModalOpen}
        onClose={() => setDiscussionModalOpen(false)}
        onDiscussionStarted={handleDiscussionStarted}
      />
    </div>
  );
}
