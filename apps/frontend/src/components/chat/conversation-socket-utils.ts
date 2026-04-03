import { io, Socket } from 'socket.io-client';
import { logger } from '@/utils/browser_logger';

export function createConversationIntelligenceSocket(
  token: string,
  agentId: string,
  conversationId?: string
): Socket {
  const socket = io('/conversation_intelligence', {
    auth: { token },
    query: { agentId, ...(conversationId ? { conversationId } : {}) },
  });
  socket.on('connected', () => {});
  socket.on('error', (error: unknown) => {
    logger.error('Conversation intelligence error:', error);
  });
  return socket;
}
