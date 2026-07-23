import { useState, useCallback, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { StreamChunk, StreamingEventType, TokenStreamEvent } from '@uaip/types';
import { edenRequest } from '@/api/eden';

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

interface StartStreamRequest {
  prompt: string;
  systemPrompt?: string;
  agentId?: string;
  conversationId?: string;
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

  useEffect(() => {
    const socket = io(`${baseUrl}/streaming`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
    });

    socket.on('connected', () => {});

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
    async (request: StartStreamRequest): Promise<string> => {
      try {
        const socket = socketRef.current;
        if (!socket?.connected) {
          throw new Error('Streaming socket is not connected');
        }

        const { sessionId } = await edenRequest<{ sessionId: string }>('/api/v1/llm/stream', { method: 'POST', body: request });
        if (!socket.connected) {
          throw new Error('Streaming socket disconnected before subscription');
        }
        currentSessionRef.current = sessionId;

        // Subscribe to the session
        socket.emit('subscribe', sessionId);

        return sessionId;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setState((prev) => ({ ...prev, error: message }));
        throw error;
      }
    },
    []
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
