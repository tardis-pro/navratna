import type { AgentChatResponse } from '@uaip/types';
import type { ChatMessage } from '../../chat/chat.types';

export type AgentChatResponseView = AgentChatResponse;

export interface ChatWindow {
  id: string;
  agentId: string;
  agentName: string;
  /**
   * Set only for a window resumed from a multi-agent discussion. A direct 1:1
   * chat has none — it is stored as an agent-chat conversation keyed by
   * (user, agent), which the server resolves from the authenticated caller.
   */
  discussionId?: string;
  messages: ChatMessage[];
  isMinimized: boolean;
  isMaximized?: boolean;
  isLoading: boolean;
  error: string | null;
  hasLoadedHistory: boolean;
  totalMessages: number;
  canLoadMore: boolean;
  mode: 'floating' | 'portal';
  sessionId?: string;
}

export interface UnifiedChatSystemProps {
  className?: string;
  mode?: 'floating' | 'portal' | 'hybrid';
  defaultAgentId?: string;
  /** Which thread to load and post to. Undefined keeps the agent's default. */
  threadKey?: string;
  /**
   * The project this thread belongs to. Takes precedence over a project context
   * chip: the chip is a transient pick, while this is what the thread is filed
   * under — and on a thread's FIRST turn it is what files it there, so letting a
   * stale chip win would put the thread in the wrong project permanently.
   */
  projectId?: string;
  /** Opens another thread with the same agent, leaving this one untouched. */
  onStartNewThread?: () => void;
  /** Fires after a turn so the thread list can pick up a new or renamed thread. */
  onThreadActivity?: () => void;
}
