// Chat UI types — shared rendering layer for portal + floating chat modes.
//
// Thread domain types come from @uaip/types (see thread.ts). The chat renderer
// consumes the local ChatMessage view-model (one shape for both modes) and can
// adapt canonical ThreadMessage objects via `chatMessageFromThreadMessage`.

import type { ThreadMessage, MessageType } from '@uaip/types';

export type { Thread, ThreadMessage, ThreadParticipant, ThreadAttachment, MessageType } from '@uaip/types';
export { ThreadState, ThreadPresence, ThreadCompanionKind } from '@uaip/types';

// Who authored a chat message. 'system' is a local-only error/notice class and
// maps to the agent (left-aligned) rendering lane.
export type ChatRole = 'user' | 'agent' | 'system';

// A tool execution surfaced in the message metadata footer.
export interface ChatToolExecution {
  toolId: string;
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  timestamp: string;
}

// A tool the agent wanted to call but that was withheld pending human approval.
// Without surfacing this the turn is indistinguishable from the agent simply
// choosing not to act, which reads as the integration being broken.
export interface ChatToolWithheld {
  toolId: string;
  toolName: string;
  reasoning?: string;
}

// View-model consumed by MessageBubble/MessageStream. Plain-data only — all
// socket/persistence logic stays in the container that owns the messages.
export interface ChatMessage {
  id: string;
  content: string;
  sender: ChatRole;
  senderName: string;
  timestamp: string; // ISO-8601
  agentId?: string;
  messageType?: MessageType;
  confidence?: number;
  memoryEnhanced?: boolean;
  knowledgeUsed?: number;
  toolsExecuted?: ChatToolExecution[];
  toolsWithheld?: ChatToolWithheld[];
  metadata?: Record<string, unknown>;
}

// Rendering variant for the shared chat components.
// 'portal'  — full-size bubbles, larger avatars, timestamp under the bubble.
// 'floating' — compact bubbles for the draggable window chrome.
export type ChatMode = 'portal' | 'floating';

// State of the agent-is-working indicator rendered at the end of the stream.
export interface TypingState {
  isTyping: boolean;
  loadingText?: string;
  progress?: number;
}

// Thread-level UI state for the extracted containers. Companion is an empty
// layout slot until WS-3 mounts real companion panes.
export interface ChatUIState {
  mode: ChatMode;
  companionOpen: boolean;
}

// Adapt a canonical ThreadMessage to the chat view-model. `currentUserId`
// decides the user lane; 'human' authors render on the agent (left) lane.
export function chatMessageFromThreadMessage(
  message: ThreadMessage,
  currentUserId: string,
  authorName?: string
): ChatMessage {
  const metadata = message.metadata ?? {};
  return {
    id: message.id,
    content: message.content,
    sender:
      message.authorType === 'user' && message.authorId === currentUserId ? 'user' : 'agent',
    senderName: authorName ?? message.authorId,
    timestamp: message.createdAt,
    agentId: message.authorType === 'agent' ? message.authorId : undefined,
    confidence: typeof metadata.confidence === 'number' ? metadata.confidence : undefined,
    memoryEnhanced:
      typeof metadata.memoryEnhanced === 'boolean' ? metadata.memoryEnhanced : undefined,
    knowledgeUsed: typeof metadata.knowledgeUsed === 'number' ? metadata.knowledgeUsed : undefined,
    toolsExecuted: Array.isArray(metadata.toolsExecuted)
      ? (metadata.toolsExecuted as ChatToolExecution[])
      : undefined,
    metadata: message.metadata,
  };
}
