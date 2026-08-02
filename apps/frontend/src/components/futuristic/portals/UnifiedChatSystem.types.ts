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
}
