import type { AgentResponseRequest, Message } from '../interfaces.js';

export type AgentContextMessage = Message & {
  sender: string;
};

type AgentContextMessageInput = AgentResponseRequest['messages'][number] & {
  timestamp?: string;
};

function toMessageRole(message: AgentContextMessageInput): Message['role'] {
  if (message.type === 'assistant' || message.sender === 'assistant' || message.sender === 'agent') {
    return 'assistant' as Message['role'];
  }
  if (message.type === 'system' || message.sender === 'system') {
    return 'system' as Message['role'];
  }
  return 'user' as Message['role'];
}

function toMessageTimestamp(timestamp: string | undefined): Date {
  if (!timestamp) return new Date(0);
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

export function normalizeAgentContextMessages(
  messages: AgentContextMessageInput[]
): AgentContextMessage[] {
  return messages.map((message) => {
    const role = toMessageRole(message);
    return {
      id: message.id,
      role,
      content: message.content,
      timestamp: toMessageTimestamp(message.timestamp),
      sender: message.sender || role,
      metadata: message.toolCallId ? { toolCallId: message.toolCallId } : undefined,
    };
  });
}
