import type { AgentChatResponse } from '@uaip/types';
import type { ChatMessage } from '../../chat/chat.types';

export type AgentChatResponseView = AgentChatResponse;

export interface ChatWindow {
  id: string;
  agentId: string;
  agentName: string;
  discussionId: string;
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
