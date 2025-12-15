import { z } from 'zod';

// Streaming chunk types
export const StreamChunkSchema = z.object({
  id: z.string(),
  type: z.enum(['token', 'thought', 'tool-call', 'tool-result', 'done', 'error']),
  content: z.string().optional(),
  timestamp: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

export type StreamChunk = z.infer<typeof StreamChunkSchema>;

// Streaming session
export const StreamSessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  agentId: z.string(),
  conversationId: z.string().optional(),
  startedAt: z.number(),
  status: z.enum(['active', 'completed', 'error', 'cancelled']),
});

export type StreamSession = z.infer<typeof StreamSessionSchema>;

// Streaming events for WebSocket
export enum StreamingEventType {
  STREAM_START = 'stream:start',
  STREAM_CHUNK = 'stream:chunk',
  STREAM_END = 'stream:end',
  STREAM_ERROR = 'stream:error',
  STREAM_CANCEL = 'stream:cancel',
}

// Token streaming event payload
export interface TokenStreamEvent {
  sessionId: string;
  chunk: StreamChunk;
  aggregatedContent?: string;
  tokenCount?: number;
}

// Streaming configuration
export interface StreamingConfig {
  enabled: boolean;
  chunkSize?: number;
  flushInterval?: number;
  maxTokens?: number;
  onChunk?: (chunk: StreamChunk) => void;
}

// Streaming request extension
export interface StreamingLLMRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  userId: string;
  agentId?: string;
  conversationId?: string;
  streaming: StreamingConfig;
}
