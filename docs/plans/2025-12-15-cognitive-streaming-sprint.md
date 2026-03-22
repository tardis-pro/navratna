# Cognitive Emergent Thinking System - Sprint Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate TanStack AI for streaming capabilities while adding the 4 missing cognitive features: LLM Token Streaming, Structured Thought Protocol, Self-Critique Loop, and Formal Debate/Consensus.

**Architecture:** Focused integration - TanStack AI replaces only the provider layer for streaming. Existing cognitive infrastructure (memory, knowledge emergence, uncertainty) remains unchanged. New cognitive features build on top of existing event-driven architecture.

**Tech Stack:** TanStack AI (@tanstack/ai, @tanstack/ai-react), Zod schemas, Socket.IO streaming, RabbitMQ events

---

## Sprint Overview

| Sprint | Feature                           | Duration | Dependencies |
| ------ | --------------------------------- | -------- | ------------ |
| 1      | TanStack AI Streaming Integration | 5 days   | None         |
| 2      | Structured Thought Protocol       | 3 days   | Sprint 1     |
| 3      | Self-Critique Loop                | 3 days   | Sprint 2     |
| 4      | Formal Debate & Consensus         | 4 days   | Sprint 1     |

---

# Sprint 1: TanStack AI Streaming Integration

## Task 1.1: Install TanStack AI Dependencies

**Files:**

- Modify: `package.json` (root)
- Modify: `backend/shared/llm-service/package.json`
- Modify: `apps/frontend/package.json`

**Step 1: Add backend dependencies**

```bash
cd /home/pronit/workspace/tardis/navratna
pnpm add -w @tanstack/ai zod
cd backend/shared/llm-service && pnpm add @tanstack/ai
```

**Step 2: Add frontend dependencies**

```bash
cd /home/pronit/workspace/tardis/navratna/apps/frontend
pnpm add @tanstack/ai-react @tanstack/ai-client
```

**Step 3: Verify installation**

```bash
pnpm ls @tanstack/ai
```

Expected: Shows @tanstack/ai in dependencies

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml */package.json
git commit -m "chore: add TanStack AI dependencies"
```

---

## Task 1.2: Create Streaming Types

**Files:**

- Create: `packages/shared-types/src/streaming.ts`
- Modify: `packages/shared-types/src/index.ts`

**Step 1: Write the streaming types**

Create `packages/shared-types/src/streaming.ts`:

```typescript
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
```

**Step 2: Export from index**

Add to `packages/shared-types/src/index.ts`:

```typescript
export * from './streaming';
```

**Step 3: Build shared types**

```bash
cd /home/pronit/workspace/tardis/navratna/packages/shared-types
pnpm build
```

Expected: Build succeeds without errors

**Step 4: Commit**

```bash
git add packages/shared-types/src/streaming.ts packages/shared-types/src/index.ts
git commit -m "feat(types): add streaming types for TanStack AI integration"
```

---

## Task 1.3: Create TanStack AI Provider Adapter

**Files:**

- Create: `backend/shared/llm-service/src/providers/TanStackProvider.ts`
- Modify: `backend/shared/llm-service/src/providers/index.ts`

**Step 1: Write the TanStack provider**

Create `backend/shared/llm-service/src/providers/TanStackProvider.ts`:

```typescript
import { chat, toStreamResponse } from '@tanstack/ai';
import { openai } from '@tanstack/ai-openai';
import { anthropic } from '@tanstack/ai-anthropic';
import { ollama } from '@tanstack/ai-ollama';
import { BaseProvider } from './BaseProvider.js';
import { LLMRequest, LLMResponse, LLMProviderConfig } from '../interfaces.js';
import { StreamChunk, StreamingLLMRequest, StreamingConfig } from '@uaip/types';

type TanStackAdapter =
  | ReturnType<typeof openai>
  | ReturnType<typeof anthropic>
  | ReturnType<typeof ollama>;

export class TanStackProvider extends BaseProvider {
  private adapter: TanStackAdapter;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.adapter = this.createAdapter();
  }

  private createAdapter(): TanStackAdapter {
    const { type, baseUrl, apiKey } = this.config;

    switch (type) {
      case 'openai':
        return openai({
          apiKey: apiKey,
          baseURL: baseUrl || 'https://api.openai.com/v1',
        });

      case 'anthropic':
        return anthropic({
          apiKey: apiKey,
          baseURL: baseUrl,
        });

      case 'ollama':
        return ollama({
          baseURL: baseUrl || 'http://localhost:11434',
        });

      default:
        // Fallback to OpenAI-compatible for custom providers
        return openai({
          apiKey: apiKey,
          baseURL: baseUrl,
        });
    }
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      messages.push({ role: 'user', content: request.prompt });

      const response = await chat({
        adapter: this.adapter,
        model: request.model || this.config.defaultModel || 'gpt-4o',
        messages,
        maxTokens: request.maxTokens || 2000,
        temperature: request.temperature || 0.7,
      });

      // Collect full response
      let content = '';
      let tokensUsed = 0;

      for await (const chunk of response) {
        if (chunk.type === 'content') {
          content += chunk.content;
        }
        if (chunk.type === 'done') {
          tokensUsed = chunk.usage?.totalTokens || 0;
        }
      }

      return {
        content,
        model: request.model || this.config.defaultModel || 'unknown',
        tokensUsed,
        confidence: 0.9,
        finishReason: 'stop',
      };
    } catch (error) {
      return this.handleError(error, 'generateResponse');
    }
  }

  /**
   * Stream response - yields chunks as they arrive
   */
  async *streamResponse(request: StreamingLLMRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });

    const stream = await chat({
      adapter: this.adapter,
      model: request.model || this.config.defaultModel || 'gpt-4o',
      messages,
      maxTokens: request.maxTokens || 2000,
      temperature: request.temperature || 0.7,
    });

    let tokenIndex = 0;

    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        yield {
          id: `chunk-${tokenIndex++}`,
          type: 'token',
          content: chunk.content,
          timestamp: Date.now(),
        };
      } else if (chunk.type === 'tool-call') {
        yield {
          id: `tool-${chunk.toolCallId}`,
          type: 'tool-call',
          content: JSON.stringify(chunk),
          timestamp: Date.now(),
          metadata: { toolName: chunk.toolName },
        };
      } else if (chunk.type === 'done') {
        yield {
          id: `done-${Date.now()}`,
          type: 'done',
          timestamp: Date.now(),
          metadata: { usage: chunk.usage },
        };
      }
    }
  }

  protected async fetchModelsFromProvider(): Promise<
    Array<{
      id: string;
      name: string;
      description?: string;
      source: string;
      apiEndpoint: string;
    }>
  > {
    // TanStack AI doesn't have a models endpoint - return configured models
    const defaultModels = this.getDefaultModelsForType();
    return defaultModels.map((model) => ({
      id: model,
      name: model,
      description: `${this.config.type} model: ${model}`,
      source: this.config.baseUrl || 'default',
      apiEndpoint: this.config.baseUrl || '',
    }));
  }

  private getDefaultModelsForType(): string[] {
    switch (this.config.type) {
      case 'openai':
        return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
      case 'anthropic':
        return ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'];
      case 'ollama':
        return ['llama3.2', 'mistral', 'codellama'];
      default:
        return ['default'];
    }
  }
}
```

**Step 2: Export from providers index**

Add to `backend/shared/llm-service/src/providers/index.ts`:

```typescript
export { TanStackProvider } from './TanStackProvider.js';
```

**Step 3: Build llm-service**

```bash
cd /home/pronit/workspace/tardis/navratna/backend/shared/llm-service
pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add backend/shared/llm-service/src/providers/TanStackProvider.ts
git add backend/shared/llm-service/src/providers/index.ts
git commit -m "feat(llm): add TanStack AI provider with streaming support"
```

---

## Task 1.4: Create Streaming Service

**Files:**

- Create: `backend/shared/llm-service/src/StreamingService.ts`
- Modify: `backend/shared/llm-service/src/index.ts`

**Step 1: Write the streaming service**

Create `backend/shared/llm-service/src/StreamingService.ts`:

```typescript
import { EventEmitter } from 'events';
import { TanStackProvider } from './providers/TanStackProvider.js';
import { LLMProviderConfig } from './interfaces.js';
import {
  StreamChunk,
  StreamSession,
  StreamingLLMRequest,
  StreamingEventType,
  TokenStreamEvent,
} from '@uaip/types';
import { EventBusService } from '@uaip/shared-services';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'StreamingService',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

interface ActiveStream {
  session: StreamSession;
  provider: TanStackProvider;
  abortController: AbortController;
  aggregatedContent: string;
  tokenCount: number;
}

export class StreamingService extends EventEmitter {
  private static instance: StreamingService;
  private activeStreams: Map<string, ActiveStream> = new Map();
  private eventBus: EventBusService;
  private providers: Map<string, TanStackProvider> = new Map();

  private constructor() {
    super();
    this.eventBus = EventBusService.getInstance();
  }

  static getInstance(): StreamingService {
    if (!StreamingService.instance) {
      StreamingService.instance = new StreamingService();
    }
    return StreamingService.instance;
  }

  /**
   * Register a provider for streaming
   */
  registerProvider(providerId: string, config: LLMProviderConfig): void {
    const provider = new TanStackProvider(config);
    this.providers.set(providerId, provider);
    logger.info(`Registered streaming provider: ${providerId}`);
  }

  /**
   * Start a streaming session
   */
  async startStream(request: StreamingLLMRequest, providerId: string = 'default'): Promise<string> {
    const sessionId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    const session: StreamSession = {
      sessionId,
      userId: request.userId,
      agentId: request.agentId || '',
      conversationId: request.conversationId,
      startedAt: Date.now(),
      status: 'active',
    };

    const activeStream: ActiveStream = {
      session,
      provider,
      abortController: new AbortController(),
      aggregatedContent: '',
      tokenCount: 0,
    };

    this.activeStreams.set(sessionId, activeStream);

    // Start streaming in background
    this.processStream(sessionId, request).catch((error) => {
      logger.error(`Stream error for session ${sessionId}:`, error);
      this.handleStreamError(sessionId, error);
    });

    // Emit start event
    this.emit(StreamingEventType.STREAM_START, { sessionId, session });

    // Publish to event bus for WebSocket distribution
    await this.eventBus.publish('llm.stream.start', {
      sessionId,
      userId: request.userId,
      agentId: request.agentId,
      conversationId: request.conversationId,
    });

    return sessionId;
  }

  /**
   * Process the stream and emit chunks
   */
  private async processStream(sessionId: string, request: StreamingLLMRequest): Promise<void> {
    const activeStream = this.activeStreams.get(sessionId);
    if (!activeStream) return;

    const { provider } = activeStream;

    try {
      for await (const chunk of provider.streamResponse(request)) {
        // Check if cancelled
        if (activeStream.abortController.signal.aborted) {
          break;
        }

        // Update aggregated content
        if (chunk.type === 'token' && chunk.content) {
          activeStream.aggregatedContent += chunk.content;
          activeStream.tokenCount++;
        }

        const event: TokenStreamEvent = {
          sessionId,
          chunk,
          aggregatedContent: activeStream.aggregatedContent,
          tokenCount: activeStream.tokenCount,
        };

        // Emit locally
        this.emit(StreamingEventType.STREAM_CHUNK, event);

        // Publish to event bus
        await this.eventBus.publish('llm.stream.chunk', event);

        // Call onChunk callback if provided
        if (request.streaming.onChunk) {
          request.streaming.onChunk(chunk);
        }

        // Handle done
        if (chunk.type === 'done') {
          activeStream.session.status = 'completed';
          this.emit(StreamingEventType.STREAM_END, {
            sessionId,
            finalContent: activeStream.aggregatedContent,
            totalTokens: activeStream.tokenCount,
          });

          await this.eventBus.publish('llm.stream.end', {
            sessionId,
            finalContent: activeStream.aggregatedContent,
            totalTokens: activeStream.tokenCount,
          });
        }
      }
    } finally {
      this.activeStreams.delete(sessionId);
    }
  }

  /**
   * Cancel an active stream
   */
  async cancelStream(sessionId: string): Promise<void> {
    const activeStream = this.activeStreams.get(sessionId);
    if (!activeStream) {
      logger.warn(`No active stream found for session: ${sessionId}`);
      return;
    }

    activeStream.abortController.abort();
    activeStream.session.status = 'cancelled';

    this.emit(StreamingEventType.STREAM_CANCEL, { sessionId });
    await this.eventBus.publish('llm.stream.cancel', { sessionId });

    this.activeStreams.delete(sessionId);
    logger.info(`Cancelled stream: ${sessionId}`);
  }

  /**
   * Handle stream errors
   */
  private async handleStreamError(sessionId: string, error: Error): Promise<void> {
    const activeStream = this.activeStreams.get(sessionId);
    if (activeStream) {
      activeStream.session.status = 'error';
    }

    this.emit(StreamingEventType.STREAM_ERROR, {
      sessionId,
      error: error.message,
    });

    await this.eventBus.publish('llm.stream.error', {
      sessionId,
      error: error.message,
    });

    this.activeStreams.delete(sessionId);
  }

  /**
   * Get active stream info
   */
  getStreamInfo(sessionId: string): StreamSession | null {
    const activeStream = this.activeStreams.get(sessionId);
    return activeStream?.session || null;
  }

  /**
   * Get all active streams for a user
   */
  getActiveStreamsForUser(userId: string): StreamSession[] {
    return Array.from(this.activeStreams.values())
      .filter((s) => s.session.userId === userId)
      .map((s) => s.session);
  }
}
```

**Step 2: Export from index**

Add to `backend/shared/llm-service/src/index.ts`:

```typescript
export { StreamingService } from './StreamingService.js';
```

**Step 3: Build and verify**

```bash
cd /home/pronit/workspace/tardis/navratna/backend/shared/llm-service
pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add backend/shared/llm-service/src/StreamingService.ts
git add backend/shared/llm-service/src/index.ts
git commit -m "feat(llm): add StreamingService for real-time token streaming"
```

---

## Task 1.5: Create WebSocket Streaming Handler

**Files:**

- Create: `backend/services/discussion-orchestration/src/websocket/streamingHandler.ts`
- Modify: `backend/services/discussion-orchestration/src/index.ts`

**Step 1: Write the streaming WebSocket handler**

Create `backend/services/discussion-orchestration/src/websocket/streamingHandler.ts`:

```typescript
import { Server, Socket } from 'socket.io';
import { EventBusService } from '@uaip/shared-services';
import { validateJWTToken } from '@uaip/middleware';
import { createLogger } from '@uaip/utils';
import { StreamingEventType, TokenStreamEvent } from '@uaip/types';

const logger = createLogger({
  serviceName: 'StreamingHandler',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

interface StreamingConnection {
  userId: string;
  socketId: string;
  subscribedSessions: Set<string>;
}

export class StreamingHandler {
  private io: Server;
  private eventBus: EventBusService;
  private connections: Map<string, StreamingConnection> = new Map();
  private sessionSubscribers: Map<string, Set<string>> = new Map(); // sessionId -> Set<socketId>

  constructor(io: Server, eventBus: EventBusService) {
    this.io = io;
    this.eventBus = eventBus;
    this.setupNamespace();
    this.subscribeToEventBus();
  }

  private setupNamespace(): void {
    const streamNamespace = this.io.of('/streaming');

    streamNamespace.on('connection', async (socket: Socket) => {
      try {
        // Authenticate
        const token = socket.handshake.auth.token;
        if (!token) {
          socket.emit('error', { message: 'Authentication required' });
          socket.disconnect();
          return;
        }

        const decoded = await validateJWTToken(token);
        if (!decoded?.valid || !decoded?.userId) {
          socket.emit('error', { message: 'Invalid token' });
          socket.disconnect();
          return;
        }

        const connection: StreamingConnection = {
          userId: decoded.userId,
          socketId: socket.id,
          subscribedSessions: new Set(),
        };

        this.connections.set(socket.id, connection);

        logger.info('Streaming connection established', {
          socketId: socket.id,
          userId: decoded.userId,
        });

        // Handle subscription to a stream session
        socket.on('subscribe', (sessionId: string) => {
          connection.subscribedSessions.add(sessionId);

          if (!this.sessionSubscribers.has(sessionId)) {
            this.sessionSubscribers.set(sessionId, new Set());
          }
          this.sessionSubscribers.get(sessionId)!.add(socket.id);

          logger.debug('Socket subscribed to stream', { socketId: socket.id, sessionId });
        });

        // Handle unsubscription
        socket.on('unsubscribe', (sessionId: string) => {
          connection.subscribedSessions.delete(sessionId);
          this.sessionSubscribers.get(sessionId)?.delete(socket.id);

          logger.debug('Socket unsubscribed from stream', { socketId: socket.id, sessionId });
        });

        // Handle stream cancellation request
        socket.on('cancel-stream', async (sessionId: string) => {
          await this.eventBus.publish('llm.stream.cancel.request', {
            sessionId,
            userId: decoded.userId,
          });
        });

        // Cleanup on disconnect
        socket.on('disconnect', () => {
          const conn = this.connections.get(socket.id);
          if (conn) {
            conn.subscribedSessions.forEach((sessionId) => {
              this.sessionSubscribers.get(sessionId)?.delete(socket.id);
            });
          }
          this.connections.delete(socket.id);
          logger.info('Streaming connection closed', { socketId: socket.id });
        });

        socket.emit('connected', { userId: decoded.userId });
      } catch (error) {
        logger.error('Streaming connection error:', error);
        socket.emit('error', { message: 'Connection failed' });
        socket.disconnect();
      }
    });
  }

  private subscribeToEventBus(): void {
    // Stream start
    this.eventBus.subscribe('llm.stream.start', async (event) => {
      this.broadcastToSession(event.sessionId, StreamingEventType.STREAM_START, event);
    });

    // Stream chunks
    this.eventBus.subscribe('llm.stream.chunk', async (event: TokenStreamEvent) => {
      this.broadcastToSession(event.sessionId, StreamingEventType.STREAM_CHUNK, event);
    });

    // Stream end
    this.eventBus.subscribe('llm.stream.end', async (event) => {
      this.broadcastToSession(event.sessionId, StreamingEventType.STREAM_END, event);
      // Cleanup subscribers
      this.sessionSubscribers.delete(event.sessionId);
    });

    // Stream error
    this.eventBus.subscribe('llm.stream.error', async (event) => {
      this.broadcastToSession(event.sessionId, StreamingEventType.STREAM_ERROR, event);
      this.sessionSubscribers.delete(event.sessionId);
    });

    // Stream cancelled
    this.eventBus.subscribe('llm.stream.cancel', async (event) => {
      this.broadcastToSession(event.sessionId, StreamingEventType.STREAM_CANCEL, event);
      this.sessionSubscribers.delete(event.sessionId);
    });

    logger.info('Subscribed to streaming events');
  }

  private broadcastToSession(sessionId: string, eventType: string, data: unknown): void {
    const subscribers = this.sessionSubscribers.get(sessionId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const streamNamespace = this.io.of('/streaming');

    subscribers.forEach((socketId) => {
      const socket = streamNamespace.sockets.get(socketId);
      if (socket) {
        socket.emit(eventType, data);
      }
    });
  }

  /**
   * Get connection stats
   */
  getStats(): { connections: number; activeSessions: number } {
    return {
      connections: this.connections.size,
      activeSessions: this.sessionSubscribers.size,
    };
  }
}
```

**Step 2: Wire into discussion-orchestration service**

Add to `backend/services/discussion-orchestration/src/index.ts` after other handler initializations:

```typescript
import { StreamingHandler } from './websocket/streamingHandler.js';

// In the initialize method, after other handlers:
this.streamingHandler = new StreamingHandler(this.io, this.eventBus);
```

**Step 3: Build and verify**

```bash
cd /home/pronit/workspace/tardis/navratna/backend/services/discussion-orchestration
pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add backend/services/discussion-orchestration/src/websocket/streamingHandler.ts
git add backend/services/discussion-orchestration/src/index.ts
git commit -m "feat(ws): add WebSocket streaming handler for token distribution"
```

---

## Task 1.6: Create Frontend Streaming Hook

**Files:**

- Create: `apps/frontend/src/hooks/useStreamingChat.ts`

**Step 1: Write the streaming hook**

Create `apps/frontend/src/hooks/useStreamingChat.ts`:

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { StreamChunk, StreamingEventType, TokenStreamEvent } from '@uaip/types';

interface UseStreamingChatOptions {
  baseUrl?: string;
  token: string;
  onChunk?: (chunk: StreamChunk) => void;
  onComplete?: (content: string) => void;
  onError?: (error: string) => void;
}

interface StreamingState {
  isStreaming: boolean;
  content: string;
  tokenCount: number;
  error: string | null;
  sessionId: string | null;
}

export function useStreamingChat(options: UseStreamingChatOptions) {
  const { baseUrl = '', token, onChunk, onComplete, onError } = options;

  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    content: '',
    tokenCount: 0,
    error: null,
    sessionId: null,
  });

  const socketRef = useRef<Socket | null>(null);
  const currentSessionRef = useRef<string | null>(null);

  // Connect to streaming namespace
  useEffect(() => {
    const socket = io(`${baseUrl}/streaming`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
    });

    socket.on('connected', () => {
      console.log('Streaming socket connected');
    });

    socket.on(StreamingEventType.STREAM_START, (event: { sessionId: string }) => {
      setState((prev) => ({
        ...prev,
        isStreaming: true,
        content: '',
        tokenCount: 0,
        error: null,
        sessionId: event.sessionId,
      }));
    });

    socket.on(StreamingEventType.STREAM_CHUNK, (event: TokenStreamEvent) => {
      if (event.sessionId !== currentSessionRef.current) return;

      setState((prev) => ({
        ...prev,
        content: event.aggregatedContent || prev.content + (event.chunk.content || ''),
        tokenCount: event.tokenCount || prev.tokenCount + 1,
      }));

      if (onChunk && event.chunk) {
        onChunk(event.chunk);
      }
    });

    socket.on(
      StreamingEventType.STREAM_END,
      (event: { sessionId: string; finalContent: string }) => {
        if (event.sessionId !== currentSessionRef.current) return;

        setState((prev) => ({
          ...prev,
          isStreaming: false,
          content: event.finalContent,
        }));

        if (onComplete) {
          onComplete(event.finalContent);
        }
      }
    );

    socket.on(StreamingEventType.STREAM_ERROR, (event: { sessionId: string; error: string }) => {
      if (event.sessionId !== currentSessionRef.current) return;

      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: event.error,
      }));

      if (onError) {
        onError(event.error);
      }
    });

    socket.on(StreamingEventType.STREAM_CANCEL, (event: { sessionId: string }) => {
      if (event.sessionId !== currentSessionRef.current) return;

      setState((prev) => ({
        ...prev,
        isStreaming: false,
      }));
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [baseUrl, token, onChunk, onComplete, onError]);

  // Start streaming
  const startStream = useCallback(
    async (request: {
      prompt: string;
      systemPrompt?: string;
      agentId?: string;
      conversationId?: string;
    }) => {
      try {
        // Call API to start stream
        const response = await fetch(`${baseUrl}/api/v1/llm/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error('Failed to start stream');
        }

        const { sessionId } = await response.json();
        currentSessionRef.current = sessionId;

        // Subscribe to the session
        socketRef.current?.emit('subscribe', sessionId);

        return sessionId;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setState((prev) => ({ ...prev, error: message }));
        throw error;
      }
    },
    [baseUrl, token]
  );

  // Cancel streaming
  const cancelStream = useCallback(() => {
    if (currentSessionRef.current && socketRef.current) {
      socketRef.current.emit('cancel-stream', currentSessionRef.current);
      socketRef.current.emit('unsubscribe', currentSessionRef.current);
      currentSessionRef.current = null;
    }
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setState({
      isStreaming: false,
      content: '',
      tokenCount: 0,
      error: null,
      sessionId: null,
    });
    currentSessionRef.current = null;
  }, []);

  return {
    ...state,
    startStream,
    cancelStream,
    reset,
  };
}
```

**Step 2: Build frontend**

```bash
cd /home/pronit/workspace/tardis/navratna/apps/frontend
pnpm build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/frontend/src/hooks/useStreamingChat.ts
git commit -m "feat(frontend): add useStreamingChat hook for real-time streaming"
```

---

## Task 1.7: Add Streaming API Endpoint

**Files:**

- Modify: `backend/services/llm-service/src/routes/llm.routes.ts`

**Step 1: Add streaming endpoint**

Add to `backend/services/llm-service/src/routes/llm.routes.ts`:

```typescript
import { StreamingService } from '@uaip/llm-service';
import { StreamingLLMRequest } from '@uaip/types';

// Initialize streaming service
const streamingService = StreamingService.getInstance();

// POST /api/v1/llm/stream - Start a streaming response
router.post('/stream', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { prompt, systemPrompt, model, maxTokens, agentId, conversationId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const request: StreamingLLMRequest = {
      prompt,
      systemPrompt,
      model,
      maxTokens,
      userId,
      agentId,
      conversationId,
      streaming: {
        enabled: true,
      },
    };

    const sessionId = await streamingService.startStream(request);

    res.json({ sessionId, status: 'streaming' });
  } catch (error) {
    logger.error('Streaming start error:', error);
    res.status(500).json({ error: 'Failed to start streaming' });
  }
});

// POST /api/v1/llm/stream/:sessionId/cancel - Cancel a stream
router.post('/stream/:sessionId/cancel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    await streamingService.cancelStream(sessionId);
    res.json({ status: 'cancelled' });
  } catch (error) {
    logger.error('Stream cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel stream' });
  }
});

// GET /api/v1/llm/stream/:sessionId - Get stream status
router.get('/stream/:sessionId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const info = streamingService.getStreamInfo(sessionId);

    if (!info) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    res.json(info);
  } catch (error) {
    logger.error('Stream status error:', error);
    res.status(500).json({ error: 'Failed to get stream status' });
  }
});
```

**Step 2: Build and test**

```bash
cd /home/pronit/workspace/tardis/navratna/backend/services/llm-service
pnpm build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add backend/services/llm-service/src/routes/llm.routes.ts
git commit -m "feat(api): add streaming endpoints to LLM service"
```

---

# Sprint 2: Structured Thought Protocol

## Task 2.1: Define Thought Types

**Files:**

- Create: `packages/shared-types/src/thought.ts`
- Modify: `packages/shared-types/src/index.ts`

**Step 1: Create thought type definitions**

Create `packages/shared-types/src/thought.ts`:

```typescript
import { z } from 'zod';

// Thought step types for chain-of-thought reasoning
export const ThoughtTypeSchema = z.enum([
  'observation', // What the agent notices/perceives
  'hypothesis', // Tentative explanation or theory
  'reasoning', // Logical deduction or inference
  'conclusion', // Final determination
  'uncertainty', // Explicit acknowledgment of unknowns
  'question', // Questions for clarification or exploration
  'critique', // Self-evaluation of reasoning
  'refinement', // Improvement to previous thought
]);

export type ThoughtType = z.infer<typeof ThoughtTypeSchema>;

// Individual thought step
export const ThoughtStepSchema = z.object({
  id: z.string(),
  type: ThoughtTypeSchema,
  content: z.string(),
  confidence: z.number().min(0).max(1),
  timestamp: z.number(),
  dependencies: z.array(z.string()).default([]), // IDs of thoughts this builds on
  alternatives: z.array(z.lazy(() => ThoughtStepSchema)).optional(), // Branching thoughts
  metadata: z.record(z.unknown()).optional(),
});

export type ThoughtStep = z.infer<typeof ThoughtStepSchema>;

// Complete thought chain
export const ThoughtChainSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  conversationId: z.string().optional(),
  startedAt: z.number(),
  completedAt: z.number().optional(),
  status: z.enum(['thinking', 'concluded', 'abandoned', 'paused']),
  steps: z.array(ThoughtStepSchema),
  finalConclusion: z.string().optional(),
  overallConfidence: z.number().min(0).max(1).optional(),
  metadata: z
    .object({
      totalSteps: z.number(),
      branchCount: z.number(),
      uncertaintyCount: z.number(),
      refinementCount: z.number(),
    })
    .optional(),
});

export type ThoughtChain = z.infer<typeof ThoughtChainSchema>;

// Streaming thought event
export const ThoughtStreamEventSchema = z.object({
  chainId: z.string(),
  step: ThoughtStepSchema,
  chainProgress: z.object({
    currentStep: z.number(),
    estimatedTotal: z.number().optional(),
    confidence: z.number(),
  }),
});

export type ThoughtStreamEvent = z.infer<typeof ThoughtStreamEventSchema>;

// Thought streaming configuration
export interface ThoughtStreamingConfig {
  showReasoning: boolean; // Show reasoning steps to user
  showUncertainties: boolean; // Show uncertainty acknowledgments
  collapseIntermediateSteps: boolean; // Collapse intermediate reasoning
  minConfidenceToShow: number; // Minimum confidence for display
}

// Prompt template for structured thinking
export const THOUGHT_SYSTEM_PROMPT = `You are a reasoning agent that thinks step-by-step. Structure your thinking as follows:

For each thought, output in this format:
[THOUGHT type="<type>" confidence="<0.0-1.0>"]
<your thought content>
[/THOUGHT]

Types:
- observation: What you notice about the input/context
- hypothesis: Your tentative explanation or approach
- reasoning: Your logical deduction
- uncertainty: What you're unsure about (be explicit!)
- question: Questions that would help clarify
- critique: Self-evaluation of your reasoning
- conclusion: Your final answer

Rules:
1. Start with observations
2. Form hypotheses before reasoning
3. Always acknowledge uncertainties
4. Critique your own reasoning
5. Only conclude when confidence > 0.7

Example:
[THOUGHT type="observation" confidence="0.9"]
The user is asking about implementing a cache system.
[/THOUGHT]

[THOUGHT type="uncertainty" confidence="0.4"]
I'm not sure about the expected scale - is this for 100 or 100,000 users?
[/THOUGHT]
`;
```

**Step 2: Export from index**

Add to `packages/shared-types/src/index.ts`:

```typescript
export * from './thought';
```

**Step 3: Build**

```bash
cd /home/pronit/workspace/tardis/navratna/packages/shared-types
pnpm build
```

**Step 4: Commit**

```bash
git add packages/shared-types/src/thought.ts packages/shared-types/src/index.ts
git commit -m "feat(types): add structured thought protocol types"
```

---

## Task 2.2: Create Thought Parser Service

**Files:**

- Create: `backend/shared/services/src/cognitive/thought-parser.service.ts`

**Step 1: Write thought parser**

Create `backend/shared/services/src/cognitive/thought-parser.service.ts`:

```typescript
import { ThoughtStep, ThoughtChain, ThoughtType, ThoughtStepSchema } from '@uaip/types';
import { createLogger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger({
  serviceName: 'ThoughtParserService',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

// Regex to parse thought blocks from LLM output
const THOUGHT_REGEX =
  /\[THOUGHT\s+type="(\w+)"\s+confidence="([\d.]+)"\s*\]([\s\S]*?)\[\/THOUGHT\]/g;

export class ThoughtParserService {
  private static instance: ThoughtParserService;

  static getInstance(): ThoughtParserService {
    if (!ThoughtParserService.instance) {
      ThoughtParserService.instance = new ThoughtParserService();
    }
    return ThoughtParserService.instance;
  }

  /**
   * Parse LLM output into structured thought steps
   */
  parseThoughts(content: string): ThoughtStep[] {
    const thoughts: ThoughtStep[] = [];
    let match;

    while ((match = THOUGHT_REGEX.exec(content)) !== null) {
      const [, type, confidence, thoughtContent] = match;

      try {
        const step: ThoughtStep = {
          id: uuidv4(),
          type: type as ThoughtType,
          content: thoughtContent.trim(),
          confidence: parseFloat(confidence),
          timestamp: Date.now(),
          dependencies: [],
        };

        // Validate with Zod
        ThoughtStepSchema.parse(step);
        thoughts.push(step);
      } catch (error) {
        logger.warn('Failed to parse thought step:', { type, error });
      }
    }

    // Infer dependencies based on order and references
    this.inferDependencies(thoughts);

    return thoughts;
  }

  /**
   * Parse streaming content incrementally
   */
  parseStreamingThought(buffer: string): { thought: ThoughtStep | null; remaining: string } {
    const match =
      /\[THOUGHT\s+type="(\w+)"\s+confidence="([\d.]+)"\s*\]([\s\S]*?)\[\/THOUGHT\]/.exec(buffer);

    if (!match) {
      return { thought: null, remaining: buffer };
    }

    const [fullMatch, type, confidence, content] = match;

    const thought: ThoughtStep = {
      id: uuidv4(),
      type: type as ThoughtType,
      content: content.trim(),
      confidence: parseFloat(confidence),
      timestamp: Date.now(),
      dependencies: [],
    };

    const remaining = buffer.slice(buffer.indexOf(fullMatch) + fullMatch.length);

    return { thought, remaining };
  }

  /**
   * Create a thought chain from parsed steps
   */
  createChain(agentId: string, steps: ThoughtStep[], conversationId?: string): ThoughtChain {
    const conclusions = steps.filter((s) => s.type === 'conclusion');
    const uncertainties = steps.filter((s) => s.type === 'uncertainty');
    const refinements = steps.filter((s) => s.type === 'refinement');

    // Calculate branches (thoughts with alternatives)
    const branchCount = steps.filter((s) => s.alternatives && s.alternatives.length > 0).length;

    // Calculate overall confidence
    const avgConfidence =
      steps.length > 0 ? steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length : 0;

    return {
      id: uuidv4(),
      agentId,
      conversationId,
      startedAt: steps[0]?.timestamp || Date.now(),
      completedAt: conclusions.length > 0 ? Date.now() : undefined,
      status: conclusions.length > 0 ? 'concluded' : 'thinking',
      steps,
      finalConclusion: conclusions[conclusions.length - 1]?.content,
      overallConfidence: avgConfidence,
      metadata: {
        totalSteps: steps.length,
        branchCount,
        uncertaintyCount: uncertainties.length,
        refinementCount: refinements.length,
      },
    };
  }

  /**
   * Infer dependencies between thoughts
   */
  private inferDependencies(thoughts: ThoughtStep[]): void {
    const typeOrder: Record<ThoughtType, number> = {
      observation: 0,
      question: 1,
      hypothesis: 2,
      uncertainty: 3,
      reasoning: 4,
      critique: 5,
      refinement: 6,
      conclusion: 7,
    };

    for (let i = 1; i < thoughts.length; i++) {
      const current = thoughts[i];
      const currentOrder = typeOrder[current.type];

      // Find dependencies: thoughts that logically precede this one
      for (let j = 0; j < i; j++) {
        const previous = thoughts[j];
        const previousOrder = typeOrder[previous.type];

        // Conclusions depend on reasoning
        if (current.type === 'conclusion' && previous.type === 'reasoning') {
          current.dependencies.push(previous.id);
        }
        // Reasoning depends on hypotheses
        else if (current.type === 'reasoning' && previous.type === 'hypothesis') {
          current.dependencies.push(previous.id);
        }
        // Hypotheses depend on observations
        else if (current.type === 'hypothesis' && previous.type === 'observation') {
          current.dependencies.push(previous.id);
        }
        // Refinements depend on critiques
        else if (current.type === 'refinement' && previous.type === 'critique') {
          current.dependencies.push(previous.id);
        }
        // Critiques depend on reasoning
        else if (current.type === 'critique' && previous.type === 'reasoning') {
          current.dependencies.push(previous.id);
        }
      }
    }
  }

  /**
   * Extract final answer from thought chain
   */
  extractFinalAnswer(chain: ThoughtChain): string {
    if (chain.finalConclusion) {
      return chain.finalConclusion;
    }

    // If no conclusion, return last reasoning step
    const reasoningSteps = chain.steps.filter((s) => s.type === 'reasoning');
    if (reasoningSteps.length > 0) {
      return reasoningSteps[reasoningSteps.length - 1].content;
    }

    // Fallback: concatenate all content
    return chain.steps.map((s) => s.content).join('\n');
  }

  /**
   * Get uncertainties from chain
   */
  getUncertainties(chain: ThoughtChain): ThoughtStep[] {
    return chain.steps.filter((s) => s.type === 'uncertainty');
  }

  /**
   * Check if chain has sufficient confidence to conclude
   */
  canConclude(chain: ThoughtChain, threshold: number = 0.7): boolean {
    const conclusions = chain.steps.filter((s) => s.type === 'conclusion');
    if (conclusions.length === 0) return false;

    const lastConclusion = conclusions[conclusions.length - 1];
    return lastConclusion.confidence >= threshold;
  }
}
```

**Step 2: Export from services index**

Add to `backend/shared/services/src/index.ts`:

```typescript
export { ThoughtParserService } from './cognitive/thought-parser.service.js';
```

**Step 3: Build**

```bash
cd /home/pronit/workspace/tardis/navratna/backend/shared/services
pnpm build
```

**Step 4: Commit**

```bash
git add backend/shared/services/src/cognitive/thought-parser.service.ts
git add backend/shared/services/src/index.ts
git commit -m "feat(cognitive): add ThoughtParserService for structured reasoning"
```

---

## Task 2.3: Integrate Thought Protocol with Agent Response

**Files:**

- Modify: `backend/services/agent-intelligence/src/services/agent-discussion.service.ts`

**Step 1: Add thought parsing to agent responses**

Add imports and modify the `generateChatResponse` method in `agent-discussion.service.ts`:

```typescript
import { ThoughtParserService, ThoughtChain, THOUGHT_SYSTEM_PROMPT } from '@uaip/shared-services';

// In the class:
private thoughtParser = ThoughtParserService.getInstance();

// Modify generateChatResponse to support structured thinking:
async generateChatResponseWithThoughts(
  agentId: string,
  userId: string,
  message: string,
  conversationId?: string,
  options?: { enableStructuredThinking?: boolean }
): Promise<{ response: string; thoughtChain?: ThoughtChain }> {
  const agent = await this.getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Build system prompt with thought protocol if enabled
  let systemPrompt = this.buildAgentPersonaPrompt(agent);
  if (options?.enableStructuredThinking) {
    systemPrompt = `${systemPrompt}\n\n${THOUGHT_SYSTEM_PROMPT}`;
  }

  const llmResponse = await this.requestLLMResponse({
    agent,
    messages: [{ id: 'user-msg', content: message, sender: 'user', timestamp: new Date().toISOString(), type: 'user' }],
    context: undefined,
  }, userId);

  let responseContent = llmResponse?.content || '';
  let thoughtChain: ThoughtChain | undefined;

  // Parse thoughts if structured thinking was enabled
  if (options?.enableStructuredThinking && responseContent) {
    const thoughts = this.thoughtParser.parseThoughts(responseContent);

    if (thoughts.length > 0) {
      thoughtChain = this.thoughtParser.createChain(agentId, thoughts, conversationId);

      // Extract final answer (removes thought markup)
      responseContent = this.thoughtParser.extractFinalAnswer(thoughtChain);

      // Emit thought chain event for real-time display
      await this.eventBus.publish('agent.thought.chain', {
        agentId,
        userId,
        conversationId,
        thoughtChain,
      });
    }
  }

  return { response: responseContent, thoughtChain };
}
```

**Step 2: Build and test**

```bash
cd /home/pronit/workspace/tardis/navratna/backend/services/agent-intelligence
pnpm build
```

**Step 3: Commit**

```bash
git add backend/services/agent-intelligence/src/services/agent-discussion.service.ts
git commit -m "feat(agent): integrate structured thought protocol into agent responses"
```

---

# Sprint 3: Self-Critique Loop

## Task 3.1: Create Critique Tool Definition

**Files:**

- Create: `packages/shared-types/src/critique.ts`

**Step 1: Define critique types**

Create `packages/shared-types/src/critique.ts`:

```typescript
import { z } from 'zod';

// Critique criteria
export const CritiqueCriteriaSchema = z.enum([
  'accuracy', // Is the information correct?
  'completeness', // Does it fully address the question?
  'clarity', // Is it easy to understand?
  'relevance', // Does it answer what was asked?
  'consistency', // Is it internally consistent?
  'safety', // Is it safe/appropriate?
]);

export type CritiqueCriteria = z.infer<typeof CritiqueCriteriaSchema>;

// Individual critique item
export const CritiqueItemSchema = z.object({
  criteria: CritiqueCriteriaSchema,
  score: z.number().min(0).max(1),
  issue: z.string().optional(),
  suggestion: z.string().optional(),
});

export type CritiqueItem = z.infer<typeof CritiqueItemSchema>;

// Full critique result
export const CritiqueResultSchema = z.object({
  id: z.string(),
  responseId: z.string(),
  timestamp: z.number(),
  overallScore: z.number().min(0).max(1),
  items: z.array(CritiqueItemSchema),
  shouldRevise: z.boolean(),
  majorIssues: z.array(z.string()),
  suggestedImprovements: z.array(z.string()),
  revisedResponse: z.string().optional(),
});

export type CritiqueResult = z.infer<typeof CritiqueResultSchema>;

// Critique configuration
export interface CritiqueConfig {
  enabled: boolean;
  criteria: CritiqueCriteria[];
  minScoreThreshold: number; // Below this triggers revision
  maxRevisions: number; // Maximum revision attempts
  strictMode: boolean; // Require all criteria to pass
}

// Default critique config
export const DEFAULT_CRITIQUE_CONFIG: CritiqueConfig = {
  enabled: true,
  criteria: ['accuracy', 'completeness', 'clarity', 'relevance'],
  minScoreThreshold: 0.7,
  maxRevisions: 2,
  strictMode: false,
};

// Critique prompt template
export const CRITIQUE_SYSTEM_PROMPT = `You are a critical evaluator. Analyze the response for quality issues.

Evaluate on these criteria (score 0.0-1.0):
- accuracy: Is the information factually correct?
- completeness: Does it fully address the question?
- clarity: Is it easy to understand?
- relevance: Does it answer what was asked?

Output format:
[CRITIQUE criteria="<criteria>" score="<0.0-1.0>"]
Issue: <specific issue if score < 0.8>
Suggestion: <how to improve>
[/CRITIQUE]

[VERDICT]
overall_score: <average score>
should_revise: <true/false>
major_issues: <comma-separated list>
[/VERDICT]

Be strict but fair. Only flag genuine issues.`;
```

**Step 2: Export**

Add to `packages/shared-types/src/index.ts`:

```typescript
export * from './critique';
```

**Step 3: Build and commit**

```bash
cd /home/pronit/workspace/tardis/navratna/packages/shared-types
pnpm build
git add packages/shared-types/src/critique.ts packages/shared-types/src/index.ts
git commit -m "feat(types): add self-critique types and configuration"
```

---

## Task 3.2: Create Critique Service

**Files:**

- Create: `backend/shared/services/src/cognitive/critique.service.ts`

**Step 1: Write critique service**

Create `backend/shared/services/src/cognitive/critique.service.ts`:

```typescript
import {
  CritiqueResult,
  CritiqueItem,
  CritiqueConfig,
  CritiqueCriteria,
  DEFAULT_CRITIQUE_CONFIG,
  CRITIQUE_SYSTEM_PROMPT,
} from '@uaip/types';
import { EventBusService } from '../eventBusService.js';
import { createLogger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger({
  serviceName: 'CritiqueService',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

// Regex patterns for parsing critique output
const CRITIQUE_REGEX =
  /\[CRITIQUE\s+criteria="(\w+)"\s+score="([\d.]+)"\]([\s\S]*?)\[\/CRITIQUE\]/g;
const VERDICT_REGEX = /\[VERDICT\]([\s\S]*?)\[\/VERDICT\]/;

export class CritiqueService {
  private static instance: CritiqueService;
  private eventBus: EventBusService;
  private config: CritiqueConfig;

  private constructor() {
    this.eventBus = EventBusService.getInstance();
    this.config = DEFAULT_CRITIQUE_CONFIG;
  }

  static getInstance(): CritiqueService {
    if (!CritiqueService.instance) {
      CritiqueService.instance = new CritiqueService();
    }
    return CritiqueService.instance;
  }

  /**
   * Configure critique settings
   */
  configure(config: Partial<CritiqueConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Request critique of a response
   */
  async critiqueResponse(
    response: string,
    originalQuery: string,
    userId: string,
    config?: Partial<CritiqueConfig>
  ): Promise<CritiqueResult> {
    const effectiveConfig = { ...this.config, ...config };

    // Build critique prompt
    const critiquePrompt = `Original question: ${originalQuery}

Response to evaluate:
${response}

Evaluate this response using the criteria specified.`;

    // Request LLM critique via event bus
    const requestId = uuidv4();

    const critiqueResponse = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Critique request timeout'));
      }, 30000);

      this.eventBus.subscribe(`llm.response.${requestId}`, async (event) => {
        clearTimeout(timeout);
        resolve(event.content || '');
      });

      this.eventBus.publish('llm.global.request', {
        requestId,
        prompt: critiquePrompt,
        systemPrompt: CRITIQUE_SYSTEM_PROMPT,
        maxTokens: 1000,
        temperature: 0.3, // Lower temperature for more consistent evaluation
      });
    });

    // Parse critique response
    const result = this.parseCritiqueResponse(critiqueResponse, response, requestId);

    // Emit critique event
    await this.eventBus.publish('agent.critique.completed', {
      userId,
      result,
    });

    return result;
  }

  /**
   * Run self-critique loop until quality threshold met
   */
  async selfCritiqueLoop(
    generateResponse: () => Promise<string>,
    originalQuery: string,
    userId: string,
    config?: Partial<CritiqueConfig>
  ): Promise<{ finalResponse: string; critiques: CritiqueResult[]; revisionCount: number }> {
    const effectiveConfig = { ...this.config, ...config };
    const critiques: CritiqueResult[] = [];
    let revisionCount = 0;
    let currentResponse = await generateResponse();

    while (revisionCount < effectiveConfig.maxRevisions) {
      const critique = await this.critiqueResponse(
        currentResponse,
        originalQuery,
        userId,
        effectiveConfig
      );
      critiques.push(critique);

      if (!critique.shouldRevise || critique.overallScore >= effectiveConfig.minScoreThreshold) {
        // Quality threshold met
        logger.info('Self-critique loop completed', {
          revisionCount,
          finalScore: critique.overallScore,
        });
        break;
      }

      // Generate improved response based on critique
      const improvementPrompt = this.buildImprovementPrompt(
        originalQuery,
        currentResponse,
        critique
      );

      // Request improved response
      const improvedResponse = await this.requestImprovedResponse(improvementPrompt, userId);
      currentResponse = improvedResponse;
      revisionCount++;

      logger.info('Self-critique revision', {
        revisionCount,
        previousScore: critique.overallScore,
        issues: critique.majorIssues,
      });
    }

    return {
      finalResponse: currentResponse,
      critiques,
      revisionCount,
    };
  }

  /**
   * Parse LLM critique output
   */
  private parseCritiqueResponse(
    content: string,
    originalResponse: string,
    responseId: string
  ): CritiqueResult {
    const items: CritiqueItem[] = [];
    let match;

    // Parse individual critique items
    while ((match = CRITIQUE_REGEX.exec(content)) !== null) {
      const [, criteria, score, details] = match;

      const issueMatch = details.match(/Issue:\s*(.+?)(?=Suggestion:|$)/s);
      const suggestionMatch = details.match(/Suggestion:\s*(.+)/s);

      items.push({
        criteria: criteria as CritiqueCriteria,
        score: parseFloat(score),
        issue: issueMatch?.[1]?.trim(),
        suggestion: suggestionMatch?.[1]?.trim(),
      });
    }

    // Parse verdict
    const verdictMatch = VERDICT_REGEX.exec(content);
    let overallScore =
      items.length > 0 ? items.reduce((sum, i) => sum + i.score, 0) / items.length : 0.5;
    let shouldRevise = overallScore < this.config.minScoreThreshold;
    let majorIssues: string[] = [];

    if (verdictMatch) {
      const verdictContent = verdictMatch[1];
      const scoreMatch = verdictContent.match(/overall_score:\s*([\d.]+)/);
      const reviseMatch = verdictContent.match(/should_revise:\s*(true|false)/i);
      const issuesMatch = verdictContent.match(/major_issues:\s*(.+)/);

      if (scoreMatch) overallScore = parseFloat(scoreMatch[1]);
      if (reviseMatch) shouldRevise = reviseMatch[1].toLowerCase() === 'true';
      if (issuesMatch)
        majorIssues = issuesMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    }

    return {
      id: uuidv4(),
      responseId,
      timestamp: Date.now(),
      overallScore,
      items,
      shouldRevise,
      majorIssues,
      suggestedImprovements: items.filter((i) => i.suggestion).map((i) => i.suggestion!),
    };
  }

  /**
   * Build prompt for improved response
   */
  private buildImprovementPrompt(
    originalQuery: string,
    previousResponse: string,
    critique: CritiqueResult
  ): string {
    const issues = critique.items
      .filter((i) => i.issue)
      .map((i) => `- ${i.criteria}: ${i.issue}`)
      .join('\n');

    const suggestions = critique.suggestedImprovements.map((s) => `- ${s}`).join('\n');

    return `Original question: ${originalQuery}

Your previous response:
${previousResponse}

Issues identified:
${issues}

Suggested improvements:
${suggestions}

Please provide an improved response that addresses these issues while maintaining what was good about the original.`;
  }

  /**
   * Request improved response via event bus
   */
  private async requestImprovedResponse(prompt: string, userId: string): Promise<string> {
    const requestId = uuidv4();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Improvement request timeout'));
      }, 60000);

      this.eventBus.subscribe(`llm.response.${requestId}`, async (event) => {
        clearTimeout(timeout);
        resolve(event.content || '');
      });

      this.eventBus.publish('llm.user.request', {
        requestId,
        userId,
        prompt,
        maxTokens: 2000,
        temperature: 0.7,
      });
    });
  }
}
```

**Step 2: Export and build**

```bash
# Add to backend/shared/services/src/index.ts:
export { CritiqueService } from './cognitive/critique.service.js';

cd /home/pronit/workspace/tardis/navratna/backend/shared/services
pnpm build
```

**Step 3: Commit**

```bash
git add backend/shared/services/src/cognitive/critique.service.ts
git add backend/shared/services/src/index.ts
git commit -m "feat(cognitive): add CritiqueService for self-evaluation loop"
```

---

# Sprint 4: Formal Debate & Consensus

## Task 4.1: Define Debate Types

**Files:**

- Create: `packages/shared-types/src/debate.ts`

**Step 1: Create debate type definitions**

Create `packages/shared-types/src/debate.ts`:

```typescript
import { z } from 'zod';

// Argument stance
export const StanceSchema = z.enum(['support', 'oppose', 'neutral', 'abstain']);
export type Stance = z.infer<typeof StanceSchema>;

// Argument structure
export const ArgumentSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  stance: StanceSchema,
  claim: z.string(),
  evidence: z.array(z.string()),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
  rebuttals: z.array(z.string()).default([]), // IDs of arguments this rebuts
  timestamp: z.number(),
});

export type Argument = z.infer<typeof ArgumentSchema>;

// Vote structure
export const VoteSchema = z.object({
  agentId: z.string(),
  stance: StanceSchema,
  weight: z.number().min(0).max(1).default(1), // Expertise-weighted voting
  reasoning: z.string().optional(),
  timestamp: z.number(),
});

export type Vote = z.infer<typeof VoteSchema>;

// Debate round
export const DebateRoundSchema = z.object({
  roundNumber: z.number(),
  arguments: z.array(ArgumentSchema),
  phase: z.enum(['opening', 'rebuttal', 'closing', 'voting']),
});

export type DebateRound = z.infer<typeof DebateRoundSchema>;

// Full debate structure
export const DebateSchema = z.object({
  id: z.string(),
  topic: z.string(),
  proposition: z.string(), // The statement being debated
  discussionId: z.string().optional(),
  participants: z.array(z.string()), // Agent IDs
  status: z.enum(['active', 'voting', 'concluded', 'deadlocked']),
  rounds: z.array(DebateRoundSchema),
  votes: z.array(VoteSchema),
  consensus: z
    .object({
      reached: z.boolean(),
      stance: StanceSchema.optional(),
      confidence: z.number().min(0).max(1),
      dissent: z.array(z.string()), // Agent IDs that dissented
    })
    .optional(),
  startedAt: z.number(),
  concludedAt: z.number().optional(),
  metadata: z
    .object({
      totalArguments: z.number(),
      totalRebuttals: z.number(),
      avgConfidence: z.number(),
      participationRate: z.number(),
    })
    .optional(),
});

export type Debate = z.infer<typeof DebateSchema>;

// Consensus calculation result
export const ConsensusResultSchema = z.object({
  reached: z.boolean(),
  stance: StanceSchema,
  supportPercentage: z.number(),
  opposePercentage: z.number(),
  neutralPercentage: z.number(),
  confidence: z.number(),
  unanimity: z.boolean(),
  strongConsensus: z.boolean(), // >75% agreement
  weakConsensus: z.boolean(), // 50-75% agreement
  deadlock: z.boolean(), // No clear majority
});

export type ConsensusResult = z.infer<typeof ConsensusResultSchema>;

// Debate configuration
export interface DebateConfig {
  maxRounds: number;
  maxArgumentsPerRound: number;
  consensusThreshold: number; // Percentage needed for consensus
  requireEvidence: boolean;
  allowAbstention: boolean;
  weightByExpertise: boolean;
}

export const DEFAULT_DEBATE_CONFIG: DebateConfig = {
  maxRounds: 3,
  maxArgumentsPerRound: 2,
  consensusThreshold: 0.66, // 2/3 majority
  requireEvidence: true,
  allowAbstention: true,
  weightByExpertise: true,
};

// Debate prompts
export const DEBATE_ARGUMENT_PROMPT = `You are participating in a structured debate. Present your argument clearly.

Format your response as:
[ARGUMENT stance="<support|oppose|neutral>"]
Claim: <your main point in one sentence>
Evidence:
- <supporting fact or data>
- <another piece of evidence>
Reasoning: <logical connection between evidence and claim>
Confidence: <0.0-1.0>
[/ARGUMENT]

Rules:
1. Base arguments on evidence
2. Address counter-arguments if rebutting
3. Be concise but thorough
4. Acknowledge uncertainty`;

export const DEBATE_VOTE_PROMPT = `Based on all arguments presented, cast your vote.

Format:
[VOTE stance="<support|oppose|neutral|abstain>"]
Reasoning: <brief explanation of your decision>
Confidence: <0.0-1.0>
[/VOTE]

Consider:
1. Quality of evidence presented
2. Logical soundness of arguments
3. How well rebuttals addressed concerns
4. Your own expertise in the topic`;
```

**Step 2: Export and build**

```bash
# Add to packages/shared-types/src/index.ts:
export * from './debate';

cd /home/pronit/workspace/tardis/navratna/packages/shared-types
pnpm build
git add packages/shared-types/src/debate.ts packages/shared-types/src/index.ts
git commit -m "feat(types): add formal debate and consensus types"
```

---

## Task 4.2: Create Debate Orchestrator Service

**Files:**

- Create: `backend/shared/services/src/cognitive/debate-orchestrator.service.ts`

**Step 1: Write debate orchestrator**

Create `backend/shared/services/src/cognitive/debate-orchestrator.service.ts`:

```typescript
import {
  Debate,
  DebateRound,
  Argument,
  Vote,
  Stance,
  ConsensusResult,
  DebateConfig,
  DEFAULT_DEBATE_CONFIG,
  DEBATE_ARGUMENT_PROMPT,
  DEBATE_VOTE_PROMPT,
} from '@uaip/types';
import { EventBusService } from '../eventBusService.js';
import { createLogger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger({
  serviceName: 'DebateOrchestrator',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

// Regex for parsing debate outputs
const ARGUMENT_REGEX = /\[ARGUMENT\s+stance="(\w+)"\]([\s\S]*?)\[\/ARGUMENT\]/;
const VOTE_REGEX = /\[VOTE\s+stance="(\w+)"\]([\s\S]*?)\[\/VOTE\]/;

export class DebateOrchestratorService {
  private static instance: DebateOrchestratorService;
  private eventBus: EventBusService;
  private activeDebates: Map<string, Debate> = new Map();
  private config: DebateConfig;

  private constructor() {
    this.eventBus = EventBusService.getInstance();
    this.config = DEFAULT_DEBATE_CONFIG;
    this.setupEventHandlers();
  }

  static getInstance(): DebateOrchestratorService {
    if (!DebateOrchestratorService.instance) {
      DebateOrchestratorService.instance = new DebateOrchestratorService();
    }
    return DebateOrchestratorService.instance;
  }

  private setupEventHandlers(): void {
    // Listen for debate-related events
    this.eventBus.subscribe('debate.argument.submitted', async (event) => {
      await this.handleArgumentSubmission(event);
    });

    this.eventBus.subscribe('debate.vote.submitted', async (event) => {
      await this.handleVoteSubmission(event);
    });
  }

  /**
   * Start a new debate
   */
  async startDebate(
    topic: string,
    proposition: string,
    participants: string[],
    discussionId?: string,
    config?: Partial<DebateConfig>
  ): Promise<Debate> {
    const effectiveConfig = { ...this.config, ...config };

    const debate: Debate = {
      id: uuidv4(),
      topic,
      proposition,
      discussionId,
      participants,
      status: 'active',
      rounds: [
        {
          roundNumber: 1,
          arguments: [],
          phase: 'opening',
        },
      ],
      votes: [],
      startedAt: Date.now(),
    };

    this.activeDebates.set(debate.id, debate);

    // Emit debate started event
    await this.eventBus.publish('debate.started', {
      debateId: debate.id,
      topic,
      proposition,
      participants,
    });

    logger.info('Debate started', {
      debateId: debate.id,
      topic,
      participantCount: participants.length,
    });

    // Trigger opening arguments from all participants
    await this.requestArgumentsFromParticipants(debate, 'opening');

    return debate;
  }

  /**
   * Request arguments from all participants
   */
  private async requestArgumentsFromParticipants(debate: Debate, phase: string): Promise<void> {
    const currentRound = debate.rounds[debate.rounds.length - 1];
    const previousArguments = this.getAllArguments(debate);

    for (const agentId of debate.participants) {
      const prompt = this.buildArgumentPrompt(debate, agentId, phase, previousArguments);

      await this.eventBus.publish('debate.argument.request', {
        debateId: debate.id,
        agentId,
        phase,
        prompt,
        systemPrompt: DEBATE_ARGUMENT_PROMPT,
      });
    }
  }

  /**
   * Build argument prompt with context
   */
  private buildArgumentPrompt(
    debate: Debate,
    agentId: string,
    phase: string,
    previousArguments: Argument[]
  ): string {
    let prompt = `Debate Topic: ${debate.topic}\n`;
    prompt += `Proposition: ${debate.proposition}\n`;
    prompt += `Phase: ${phase}\n\n`;

    if (previousArguments.length > 0) {
      prompt += 'Previous arguments:\n';
      previousArguments.forEach((arg, i) => {
        prompt += `${i + 1}. [${arg.stance.toUpperCase()}] ${arg.claim}\n`;
        prompt += `   Evidence: ${arg.evidence.join('; ')}\n`;
        prompt += `   Confidence: ${arg.confidence}\n\n`;
      });
    }

    if (phase === 'rebuttal') {
      prompt += '\nAddress the strongest opposing arguments in your rebuttal.';
    } else if (phase === 'closing') {
      prompt += '\nSummarize your position considering all arguments presented.';
    }

    return prompt;
  }

  /**
   * Handle argument submission
   */
  private async handleArgumentSubmission(event: {
    debateId: string;
    agentId: string;
    content: string;
  }): Promise<void> {
    const debate = this.activeDebates.get(event.debateId);
    if (!debate) {
      logger.warn('Debate not found for argument submission', { debateId: event.debateId });
      return;
    }

    const argument = this.parseArgument(event.content, event.agentId);
    if (!argument) {
      logger.warn('Failed to parse argument', { agentId: event.agentId });
      return;
    }

    const currentRound = debate.rounds[debate.rounds.length - 1];
    currentRound.arguments.push(argument);

    // Emit argument added event
    await this.eventBus.publish('debate.argument.added', {
      debateId: debate.id,
      argument,
    });

    // Check if all participants have submitted
    const allSubmitted = debate.participants.every((p) =>
      currentRound.arguments.some((a) => a.agentId === p)
    );

    if (allSubmitted) {
      await this.advanceDebate(debate);
    }
  }

  /**
   * Parse argument from LLM output
   */
  private parseArgument(content: string, agentId: string): Argument | null {
    const match = ARGUMENT_REGEX.exec(content);
    if (!match) return null;

    const [, stance, body] = match;

    const claimMatch = body.match(/Claim:\s*(.+?)(?=Evidence:|$)/s);
    const evidenceMatch = body.match(/Evidence:\s*([\s\S]*?)(?=Reasoning:|$)/);
    const reasoningMatch = body.match(/Reasoning:\s*(.+?)(?=Confidence:|$)/s);
    const confidenceMatch = body.match(/Confidence:\s*([\d.]+)/);

    const evidence = evidenceMatch
      ? evidenceMatch[1]
          .split('\n')
          .map((e) => e.replace(/^-\s*/, '').trim())
          .filter(Boolean)
      : [];

    return {
      id: uuidv4(),
      agentId,
      stance: stance as Stance,
      claim: claimMatch?.[1]?.trim() || '',
      evidence,
      reasoning: reasoningMatch?.[1]?.trim() || '',
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
      rebuttals: [],
      timestamp: Date.now(),
    };
  }

  /**
   * Advance debate to next phase/round
   */
  private async advanceDebate(debate: Debate): Promise<void> {
    const currentRound = debate.rounds[debate.rounds.length - 1];

    if (currentRound.phase === 'opening') {
      currentRound.phase = 'rebuttal';
      await this.requestArgumentsFromParticipants(debate, 'rebuttal');
    } else if (currentRound.phase === 'rebuttal') {
      if (debate.rounds.length < this.config.maxRounds) {
        // Start new round
        debate.rounds.push({
          roundNumber: debate.rounds.length + 1,
          arguments: [],
          phase: 'opening',
        });
        await this.requestArgumentsFromParticipants(debate, 'opening');
      } else {
        // Move to voting
        currentRound.phase = 'voting';
        debate.status = 'voting';
        await this.requestVotes(debate);
      }
    }
  }

  /**
   * Request votes from all participants
   */
  private async requestVotes(debate: Debate): Promise<void> {
    const allArguments = this.getAllArguments(debate);
    const summary = this.buildArgumentSummary(allArguments);

    for (const agentId of debate.participants) {
      await this.eventBus.publish('debate.vote.request', {
        debateId: debate.id,
        agentId,
        prompt: `${summary}\n\nBased on all arguments, cast your vote on the proposition: "${debate.proposition}"`,
        systemPrompt: DEBATE_VOTE_PROMPT,
      });
    }
  }

  /**
   * Handle vote submission
   */
  private async handleVoteSubmission(event: {
    debateId: string;
    agentId: string;
    content: string;
  }): Promise<void> {
    const debate = this.activeDebates.get(event.debateId);
    if (!debate) return;

    const vote = this.parseVote(event.content, event.agentId);
    if (!vote) return;

    debate.votes.push(vote);

    await this.eventBus.publish('debate.vote.added', {
      debateId: debate.id,
      vote,
    });

    // Check if all votes are in
    if (debate.votes.length >= debate.participants.length) {
      await this.concludeDebate(debate);
    }
  }

  /**
   * Parse vote from LLM output
   */
  private parseVote(content: string, agentId: string): Vote | null {
    const match = VOTE_REGEX.exec(content);
    if (!match) return null;

    const [, stance, body] = match;
    const reasoningMatch = body.match(/Reasoning:\s*(.+?)(?=Confidence:|$)/s);
    const confidenceMatch = body.match(/Confidence:\s*([\d.]+)/);

    return {
      agentId,
      stance: stance as Stance,
      weight: 1, // Could be modified by expertise weighting
      reasoning: reasoningMatch?.[1]?.trim(),
      timestamp: Date.now(),
    };
  }

  /**
   * Conclude debate and calculate consensus
   */
  private async concludeDebate(debate: Debate): Promise<void> {
    const consensus = this.calculateConsensus(debate.votes);

    debate.consensus = {
      reached: consensus.reached,
      stance: consensus.stance,
      confidence: consensus.confidence,
      dissent: debate.votes.filter((v) => v.stance !== consensus.stance).map((v) => v.agentId),
    };

    debate.status = consensus.deadlock ? 'deadlocked' : 'concluded';
    debate.concludedAt = Date.now();

    // Calculate metadata
    const allArguments = this.getAllArguments(debate);
    debate.metadata = {
      totalArguments: allArguments.length,
      totalRebuttals: allArguments.filter((a) => a.rebuttals.length > 0).length,
      avgConfidence: allArguments.reduce((s, a) => s + a.confidence, 0) / allArguments.length,
      participationRate:
        debate.votes.filter((v) => v.stance !== 'abstain').length / debate.participants.length,
    };

    await this.eventBus.publish('debate.concluded', {
      debateId: debate.id,
      consensus,
      metadata: debate.metadata,
    });

    logger.info('Debate concluded', {
      debateId: debate.id,
      consensusReached: consensus.reached,
      stance: consensus.stance,
      confidence: consensus.confidence,
    });
  }

  /**
   * Calculate consensus from votes
   */
  calculateConsensus(votes: Vote[]): ConsensusResult {
    const validVotes = votes.filter((v) => v.stance !== 'abstain');
    const totalWeight = validVotes.reduce((sum, v) => sum + v.weight, 0);

    const stanceCounts: Record<Stance, number> = {
      support: 0,
      oppose: 0,
      neutral: 0,
      abstain: 0,
    };

    validVotes.forEach((v) => {
      stanceCounts[v.stance] += v.weight;
    });

    const supportPct = totalWeight > 0 ? stanceCounts.support / totalWeight : 0;
    const opposePct = totalWeight > 0 ? stanceCounts.oppose / totalWeight : 0;
    const neutralPct = totalWeight > 0 ? stanceCounts.neutral / totalWeight : 0;

    // Determine winning stance
    let winningStance: Stance = 'neutral';
    let maxPct = 0;

    if (supportPct > maxPct) {
      maxPct = supportPct;
      winningStance = 'support';
    }
    if (opposePct > maxPct) {
      maxPct = opposePct;
      winningStance = 'oppose';
    }
    if (neutralPct > maxPct) {
      maxPct = neutralPct;
      winningStance = 'neutral';
    }

    const reached = maxPct >= this.config.consensusThreshold;
    const unanimity = maxPct === 1;
    const strongConsensus = maxPct >= 0.75;
    const weakConsensus = maxPct >= 0.5 && maxPct < 0.75;
    const deadlock = maxPct < 0.5 || (supportPct > 0.4 && opposePct > 0.4);

    return {
      reached,
      stance: winningStance,
      supportPercentage: supportPct,
      opposePercentage: opposePct,
      neutralPercentage: neutralPct,
      confidence: maxPct,
      unanimity,
      strongConsensus,
      weakConsensus,
      deadlock,
    };
  }

  /**
   * Get all arguments from all rounds
   */
  private getAllArguments(debate: Debate): Argument[] {
    return debate.rounds.flatMap((r) => r.arguments);
  }

  /**
   * Build summary of all arguments
   */
  private buildArgumentSummary(arguments_: Argument[]): string {
    const support = arguments_.filter((a) => a.stance === 'support');
    const oppose = arguments_.filter((a) => a.stance === 'oppose');

    let summary = 'Arguments FOR the proposition:\n';
    support.forEach((a, i) => {
      summary += `${i + 1}. ${a.claim} (confidence: ${a.confidence})\n`;
    });

    summary += '\nArguments AGAINST the proposition:\n';
    oppose.forEach((a, i) => {
      summary += `${i + 1}. ${a.claim} (confidence: ${a.confidence})\n`;
    });

    return summary;
  }

  /**
   * Get active debate
   */
  getDebate(debateId: string): Debate | undefined {
    return this.activeDebates.get(debateId);
  }

  /**
   * List active debates
   */
  listActiveDebates(): Debate[] {
    return Array.from(this.activeDebates.values()).filter(
      (d) => d.status === 'active' || d.status === 'voting'
    );
  }
}
```

**Step 2: Export and build**

```bash
# Add to backend/shared/services/src/index.ts:
export { DebateOrchestratorService } from './cognitive/debate-orchestrator.service.js';

cd /home/pronit/workspace/tardis/navratna/backend/shared/services
pnpm build
```

**Step 3: Commit**

```bash
git add backend/shared/services/src/cognitive/debate-orchestrator.service.ts
git add backend/shared/services/src/index.ts
git commit -m "feat(cognitive): add DebateOrchestratorService for formal consensus"
```

---

## Task 4.3: Integrate Debate with Discussion Orchestration

**Files:**

- Modify: `backend/services/discussion-orchestration/src/index.ts`
- Create: `backend/services/discussion-orchestration/src/handlers/debateHandler.ts`

**Step 1: Create debate event handler**

Create `backend/services/discussion-orchestration/src/handlers/debateHandler.ts`:

```typescript
import { Server } from 'socket.io';
import { EventBusService, DebateOrchestratorService } from '@uaip/shared-services';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'DebateHandler',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export class DebateHandler {
  private io: Server;
  private eventBus: EventBusService;
  private debateOrchestrator: DebateOrchestratorService;

  constructor(io: Server, eventBus: EventBusService) {
    this.io = io;
    this.eventBus = eventBus;
    this.debateOrchestrator = DebateOrchestratorService.getInstance();
    this.setupEventSubscriptions();
  }

  private setupEventSubscriptions(): void {
    // Broadcast debate events to WebSocket clients
    this.eventBus.subscribe('debate.started', async (event) => {
      this.broadcastToDiscussion(event.discussionId, 'debate:started', event);
    });

    this.eventBus.subscribe('debate.argument.added', async (event) => {
      const debate = this.debateOrchestrator.getDebate(event.debateId);
      if (debate?.discussionId) {
        this.broadcastToDiscussion(debate.discussionId, 'debate:argument', event);
      }
    });

    this.eventBus.subscribe('debate.vote.added', async (event) => {
      const debate = this.debateOrchestrator.getDebate(event.debateId);
      if (debate?.discussionId) {
        this.broadcastToDiscussion(debate.discussionId, 'debate:vote', event);
      }
    });

    this.eventBus.subscribe('debate.concluded', async (event) => {
      const debate = this.debateOrchestrator.getDebate(event.debateId);
      if (debate?.discussionId) {
        this.broadcastToDiscussion(debate.discussionId, 'debate:concluded', {
          debateId: event.debateId,
          consensus: event.consensus,
          metadata: event.metadata,
        });
      }
    });

    // Handle debate argument requests - route to agents
    this.eventBus.subscribe('debate.argument.request', async (event) => {
      await this.eventBus.publish('agent.discussion.participate', {
        agentId: event.agentId,
        discussionId: event.debateId,
        prompt: event.prompt,
        systemPrompt: event.systemPrompt,
        responseType: 'debate_argument',
      });
    });

    // Handle debate vote requests
    this.eventBus.subscribe('debate.vote.request', async (event) => {
      await this.eventBus.publish('agent.discussion.participate', {
        agentId: event.agentId,
        discussionId: event.debateId,
        prompt: event.prompt,
        systemPrompt: event.systemPrompt,
        responseType: 'debate_vote',
      });
    });

    logger.info('Debate event subscriptions initialized');
  }

  private broadcastToDiscussion(
    discussionId: string | undefined,
    event: string,
    data: unknown
  ): void {
    if (!discussionId) return;
    this.io.to(`discussion:${discussionId}`).emit(event, data);
  }

  /**
   * Start a debate within a discussion
   */
  async startDebateInDiscussion(
    discussionId: string,
    topic: string,
    proposition: string,
    participants: string[]
  ): Promise<string> {
    const debate = await this.debateOrchestrator.startDebate(
      topic,
      proposition,
      participants,
      discussionId
    );

    return debate.id;
  }
}
```

**Step 2: Wire into discussion-orchestration service**

Add to `backend/services/discussion-orchestration/src/index.ts`:

```typescript
import { DebateHandler } from './handlers/debateHandler.js';

// In initialize method:
this.debateHandler = new DebateHandler(this.io, this.eventBus);
```

**Step 3: Build and commit**

```bash
cd /home/pronit/workspace/tardis/navratna/backend/services/discussion-orchestration
pnpm build

git add backend/services/discussion-orchestration/src/handlers/debateHandler.ts
git add backend/services/discussion-orchestration/src/index.ts
git commit -m "feat(discussion): integrate formal debate system into discussions"
```

---

# Final Integration & Testing

## Task 5.1: Integration Test Suite

**Files:**

- Create: `backend/shared/services/src/cognitive/__tests__/cognitive.integration.test.ts`

**Step 1: Write integration tests**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ThoughtParserService } from '../thought-parser.service';
import { CritiqueService } from '../critique.service';
import { DebateOrchestratorService } from '../debate-orchestrator.service';

describe('Cognitive Services Integration', () => {
  let thoughtParser: ThoughtParserService;
  let critiqueService: CritiqueService;
  let debateOrchestrator: DebateOrchestratorService;

  beforeAll(() => {
    thoughtParser = ThoughtParserService.getInstance();
    critiqueService = CritiqueService.getInstance();
    debateOrchestrator = DebateOrchestratorService.getInstance();
  });

  describe('ThoughtParserService', () => {
    it('should parse thought steps from LLM output', () => {
      const content = `
[THOUGHT type="observation" confidence="0.9"]
The user is asking about caching.
[/THOUGHT]

[THOUGHT type="hypothesis" confidence="0.7"]
Redis would be a good fit for this use case.
[/THOUGHT]
`;
      const thoughts = thoughtParser.parseThoughts(content);

      expect(thoughts).toHaveLength(2);
      expect(thoughts[0].type).toBe('observation');
      expect(thoughts[0].confidence).toBe(0.9);
      expect(thoughts[1].type).toBe('hypothesis');
    });

    it('should create thought chain with metadata', () => {
      const thoughts = [
        {
          id: '1',
          type: 'observation' as const,
          content: 'Test',
          confidence: 0.9,
          timestamp: Date.now(),
          dependencies: [],
        },
        {
          id: '2',
          type: 'conclusion' as const,
          content: 'Final',
          confidence: 0.8,
          timestamp: Date.now(),
          dependencies: [],
        },
      ];

      const chain = thoughtParser.createChain('agent-1', thoughts, 'conv-1');

      expect(chain.status).toBe('concluded');
      expect(chain.finalConclusion).toBe('Final');
      expect(chain.metadata?.totalSteps).toBe(2);
    });
  });

  describe('DebateOrchestratorService', () => {
    it('should calculate consensus correctly', () => {
      const votes = [
        { agentId: 'a1', stance: 'support' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a2', stance: 'support' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a3', stance: 'oppose' as const, weight: 1, timestamp: Date.now() },
      ];

      const consensus = debateOrchestrator.calculateConsensus(votes);

      expect(consensus.supportPercentage).toBeCloseTo(0.67, 1);
      expect(consensus.opposePercentage).toBeCloseTo(0.33, 1);
      expect(consensus.reached).toBe(true);
      expect(consensus.stance).toBe('support');
    });

    it('should detect deadlock', () => {
      const votes = [
        { agentId: 'a1', stance: 'support' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a2', stance: 'oppose' as const, weight: 1, timestamp: Date.now() },
      ];

      const consensus = debateOrchestrator.calculateConsensus(votes);

      expect(consensus.deadlock).toBe(true);
      expect(consensus.reached).toBe(false);
    });
  });
});
```

**Step 2: Run tests**

```bash
cd /home/pronit/workspace/tardis/navratna/backend/shared/services
pnpm test
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/shared/services/src/cognitive/__tests__/cognitive.integration.test.ts
git commit -m "test: add cognitive services integration tests"
```

---

## Summary

This sprint plan covers:

| Sprint       | Deliverables                      | Files Created/Modified  |
| ------------ | --------------------------------- | ----------------------- |
| **Sprint 1** | TanStack AI streaming integration | 8 new files, 4 modified |
| **Sprint 2** | Structured thought protocol       | 3 new files, 1 modified |
| **Sprint 3** | Self-critique loop                | 2 new files             |
| **Sprint 4** | Formal debate & consensus         | 3 new files, 1 modified |
| **Testing**  | Integration tests                 | 1 new file              |

**Total: ~17 new files, ~6 modified files**

---

Plan complete and saved to `docs/plans/2025-12-15-cognitive-streaming-sprint.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
