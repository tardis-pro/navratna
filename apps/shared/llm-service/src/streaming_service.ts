import { EventEmitter } from 'events';
import { TanStackProvider } from './providers/tan_stack_provider.js';
import { LLMProviderConfig } from './interfaces.js';
import {
  StreamSession,
  StreamingLLMRequest,
  StreamingEventType,
  TokenStreamEvent,
} from '@uaip/types';
import { EventBusService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';

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
    if (!this.eventBus) {
      throw new Error('EventBus is not configured for StreamingService');
    }

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
    this.processStream(sessionId, request).catch((error: unknown) => {
      logger.error(`Stream error for session ${sessionId}:`, error);
      this.handleStreamError(sessionId, error instanceof Error ? error : new Error(String(error)));
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
  async cancelStream(sessionId: string): Promise<boolean> {
    const activeStream = this.activeStreams.get(sessionId);
    if (!activeStream) {
      logger.warn(`No active stream found for session: ${sessionId}`);
      return false;
    }

    activeStream.abortController.abort();
    activeStream.session.status = 'cancelled';

    this.emit(StreamingEventType.STREAM_CANCEL, { sessionId });
    if (this.eventBus) {
      await this.eventBus.publish('llm.stream.cancel', { sessionId });
    }

    this.activeStreams.delete(sessionId);
    logger.info(`Cancelled stream: ${sessionId}`);
    return true;
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
