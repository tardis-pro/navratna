import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAgents } from '@/contexts/AgentContext';
import { ThreadDockCard } from './ThreadDockCard';
import { DiscussionConfigModal } from '@/components/DiscussionConfigModal';
import {
  Thread,
  ThreadParticipant,
  ThreadPresence,
  ThreadState,
  Discussion,
} from '@uaip/types';
import {
  MessageSquare,
  MessageSquarePlus,
  Bot,
  LayoutGrid,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Send,
} from 'lucide-react';
import { swift } from '@/lib/motion';
import { UnifiedChatSystem } from '@/components/futuristic/portals/UnifiedChatSystem';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { uaipAPI } from '@/utils/uaip_api';

interface Suggestion {
  title: string;
  description: string;
  agentId: string;
}

interface AnimatingRect {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  avatar?: string;
}

export const HomeSurface: React.FC = () => {
  const { agents } = useAgents();
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [whisperOpen, setWhisperOpen] = useState<boolean>(true);
  const [animatingCard, setAnimatingCard] = useState<AnimatingRect | null>(null);
  const [discussionModalOpen, setDiscussionModalOpen] = useState(false);

  const fetchDiscussions = useCallback(async () => {
    try {
      const response = await uaipAPI.discussions.list({ limit: 20 });
      if (Array.isArray(response)) {
        setDiscussions(response);
      }
    } catch {
      // Degrade silently per guidelines
    }
  }, []);

  // Load backend discussions on mount
  useEffect(() => {
    void fetchDiscussions();
  }, [fetchDiscussions]);

  useEffect(() => {
    const handleOpenDiscussion = () => {
      setDiscussionModalOpen(true);
    };

    window.addEventListener('open-discussion-config', handleOpenDiscussion);
    window.addEventListener('open-discussion-portal', handleOpenDiscussion);

    return () => {
      window.removeEventListener('open-discussion-config', handleOpenDiscussion);
      window.removeEventListener('open-discussion-portal', handleOpenDiscussion);
    };
  }, []);

  const handleDiscussionStarted = useCallback(
    (newDiscussionId: string, agentIds: string[]) => {
      void fetchDiscussions();
      const discussion = discussions.find((item) => item.id === newDiscussionId);
      const firstParticipant = discussion?.participants?.[0];
      const agentId = discussion?.metadata?.agentId || firstParticipant?.agentId || agentIds[0];
      if (typeof agentId === 'string') {
        setSelectedAgentId(agentId);
      }
    },
    [discussions, fetchDiscussions]
  );

  // Map discussions + active agents to Threads
  const threads = useMemo(() => {
    const existingThreads = discussions.map((disc) => {
      const primaryAgentId = disc.metadata?.agentId || (disc.participants && disc.participants[0]?.agentId);
      const agent = primaryAgentId ? agents[primaryAgentId] : undefined;

      const participants: ThreadParticipant[] = [
        {
          type: 'agent',
          agentId: primaryAgentId || 'default-agent',
          name: agent?.name || (disc.metadata?.agentName as string) || disc.title || 'Agent',
          avatar: (disc.metadata?.agentAvatar as string) || '',
          role: agent?.role || 'assistant',
        },
      ];

      return {
        id: disc.id,
        participants,
        messages: [],
        state: ThreadState.ACTIVE,
        presence: disc.status === 'active' ? ThreadPresence.BREATHING : ThreadPresence.RESTING,
        createdAt: typeof disc.createdAt === 'string' ? disc.createdAt : new Date(disc.createdAt).toISOString(),
        updatedAt: typeof disc.updatedAt === 'string' ? disc.updatedAt : new Date(disc.updatedAt).toISOString(),
        metadata: { ...disc.metadata, agentId: primaryAgentId },
      } as Thread;
    });

    const agentThreads = Object.values(agents)
      .filter((agent) => agent.isActive)
      .map((agent) => {
        const hasThread = existingThreads.some((t) => {
          const primary = t.participants[0];
          return primary && primary.type === 'agent' && primary.agentId === agent.id;
        });

        if (hasThread) return null;

        const participants: ThreadParticipant[] = [
          {
            type: 'agent',
            agentId: agent.id,
            name: agent.name,
            avatar: '',
            role: agent.role || 'assistant',
          },
        ];

        return {
          id: `agent-thread-${agent.id}`,
          participants,
          messages: [],
          state: ThreadState.EMPTY,
          presence: ThreadPresence.RESTING,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: { agentId: agent.id },
        } as Thread;
      })
      .filter((t): t is Thread => t !== null);

    return [...existingThreads, ...agentThreads];
  }, [discussions, agents]);

  // Construct suggestions for whisper strip
  const whisperSuggestions = useMemo<Suggestion[]>(() => {
    return Object.values(agents)
      .filter((a) => a.isActive)
      .map((agent) => ({
        title: `Summon ${agent.name}`,
        description: `Active role: ${agent.role || 'helper'}`,
        agentId: agent.id,
      }));
  }, [agents]);

  const handleSelectThread = (thread: Thread, e: React.MouseEvent<HTMLButtonElement>) => {
    const primary = thread.participants[0];
    if (!primary || primary.type !== 'agent') return;

    const rect = e.currentTarget.getBoundingClientRect();
    setAnimatingCard({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      name: primary.name,
      avatar: primary.avatar,
    });

    setSelectedAgentId(primary.agentId);

    setTimeout(() => {
      setAnimatingCard(null);
    }, 350);
  };

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    if (suggestion.agentId) {
      setSelectedAgentId(suggestion.agentId);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground relative">
      {/* Warm Dock (Periphery) */}
      <div className="w-80 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-base tracking-tight flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Threads
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDiscussionModalOpen(true)}
              className="h-8 px-2 text-xs gap-1"
            >
              <MessageSquarePlus className="h-4 w-4" />
              New
            </Button>
            <Link
              to="/explore"
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
              aria-label="Browse all portals"
            >
              <LayoutGrid className="h-4 w-4" />
              Browse all
            </Link>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {threads.map((thread) => (
            <ThreadDockCard
              key={thread.id}
              thread={thread}
              isSelected={selectedAgentId === (thread.metadata?.agentId as string)}
              onClick={(e) => handleSelectThread(thread, e)}
            />
          ))}
        </div>
      </div>

      {/* Active Thread Host (Center) */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-background">
        {selectedAgentId ? (
          <div className="flex-1 h-full w-full relative">
            <UnifiedChatSystem key={selectedAgentId} mode="portal" defaultAgentId={selectedAgentId} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
            {/* Ambient Breathing Glow */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-glow pointer-events-none" />

            <div className="z-10 text-center max-w-md space-y-6">
              <h1 className="text-2xl font-bold tracking-tight">Welcome Home</h1>
              <p className="text-sm text-muted-foreground">
                Navratna is ready. Select an agent from the dock or try one of the suggestions to start a thread.
              </p>

              {/* Starters */}
              <div className="grid grid-cols-1 gap-2 mt-4 text-left">
                {Object.values(agents).slice(0, 3).map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-all text-sm font-medium cursor-pointer"
                  >
                    <Bot className="h-5 w-5 text-primary" />
                    <span>Discuss {agent.role || 'tasks'} with {agent.name}</span>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>

              {/* Composer Placeholder */}
              <div className="mt-8 p-4 rounded-xl border border-border bg-card/50 backdrop-blur-md flex items-center gap-3 max-w-xl mx-auto w-full">
                <textarea
                  readOnly
                  onClick={() => {
                    const firstAgent = Object.values(agents).find((a) => a.isActive);
                    if (firstAgent) setSelectedAgentId(firstAgent.id);
                  }}
                  placeholder="Select an agent to start writing..."
                  className="flex-1 resize-none bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground h-10 py-2 cursor-pointer"
                />
                <button
                  disabled
                  className="p-2 rounded-lg bg-primary/10 text-primary-foreground/50 cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Surfacing Whisper Zone (Peripheral strip) */}
      <div className={cn(
        "border-l border-border bg-card flex flex-col transition-all duration-300 shrink-0",
        whisperOpen ? "w-64" : "w-12"
      )}>
        <div className="p-3 border-b border-border flex items-center justify-between">
          {whisperOpen && (
            <span className="font-semibold text-xs tracking-wider uppercase text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Whisper Line
            </span>
          )}
          <button
            onClick={() => setWhisperOpen(!whisperOpen)}
            className="p-1 rounded hover:bg-muted ml-auto cursor-pointer"
            aria-label={whisperOpen ? "Collapse suggestions" : "Expand suggestions"}
          >
            {whisperOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {whisperOpen ? (
          <div className="flex-1 p-3 space-y-3 overflow-y-auto">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Suggestions</p>
            <div className="space-y-2">
              {whisperSuggestions.map((sug) => (
                <button
                  key={sug.agentId}
                  onClick={() => handleSelectSuggestion(sug)}
                  className="w-full text-left p-2.5 rounded-lg border border-border bg-background hover:bg-muted/50 transition-all text-xs space-y-1 block cursor-pointer"
                >
                  <div className="font-medium text-foreground">{sug.title}</div>
                  <div className="text-muted-foreground text-[10px]">{sug.description}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center pt-4 space-y-4">
            <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
          </div>
        )}
      </div>

      {/* FLIP Animating overlay clone */}
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
          className="bg-card border border-border rounded-xl shadow-lg overflow-hidden p-6 flex flex-col justify-between"
        >
          <div className="flex items-center gap-3">
            <Bot className="h-10 w-10 text-primary" />
            <div>
              <h3 className="font-semibold text-sm">{animatingCard.name}</h3>
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
};
