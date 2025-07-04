import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { logger } from '@/utils/browser-logger';
import { getWebSocketURL } from '@/config/apiConfig';

interface WebSocketEvent {
  type: string;
  payload: any;
  messageId?: string;
  timestamp?: string;
}

interface ConnectionConfig {
  url?: string;
  enableSocketIO?: boolean;
  enableFallback?: boolean;
  reconnectAttempts?: number;
  heartbeatInterval?: number;
}

interface WebSocketState {
  isConnected: boolean;
  connectionType: 'socket.io' | 'websocket' | null;
  lastEvent: WebSocketEvent | null;
  error: string | null;
  isReconnecting: boolean;
  reconnectAttempts: number;
  authStatus: 'authenticated' | 'unauthenticated' | 'pending';
}

export const useEnhancedWebSocket = (config: ConnectionConfig = {}) => {
  const {
    url = getWebSocketURL(),
    enableSocketIO = true,
    enableFallback = true,
    reconnectAttempts: maxReconnectAttempts = 5,
    heartbeatInterval = 30000
  } = config;

  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    connectionType: null,
    lastEvent: null,
    error: null,
    isReconnecting: false,
    reconnectAttempts: 0,
    authStatus: 'pending'
  });

  const socketRef = useRef<Socket | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventListeners = useRef<Map<string, ((event: WebSocketEvent) => void)[]>>(new Map());

  // Get authentication token
  const getAuthToken = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
  }, []);

  // Update state helper
  const updateState = useCallback((updates: Partial<WebSocketState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Socket.IO connection
  const connectSocketIO = useCallback(async (): Promise<boolean> => {
    const token = getAuthToken();
    if (!token) {
      updateState({ error: 'Authentication required', authStatus: 'unauthenticated' });
      return false;
    }

    try {
      const socket = io(url, {
        auth: { token },
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        maxReconnectionAttempts: maxReconnectAttempts
      });

      // Connection successful
      socket.on('connect', () => {
        updateState({
          isConnected: true,
          connectionType: 'socket.io',
          error: null,
          isReconnecting: false,
          reconnectAttempts: 0,
          authStatus: 'authenticated'
        });
        logger.info('[Enhanced WebSocket] Socket.IO connected successfully');
      });

      // Handle authentication response
      socket.on('auth_response', (data) => {
        if (data.success) {
          updateState({ authStatus: 'authenticated' });
        } else {
          updateState({ 
            authStatus: 'unauthenticated', 
            error: data.error || 'Authentication failed' 
          });
        }
      });

      // Handle all events
      socket.onAny((eventName: string, ...args: any[]) => {
        const event: WebSocketEvent = {
          type: eventName,
          payload: args[0] || {},
          messageId: args[0]?.messageId,
          timestamp: new Date().toISOString()
        };

        updateState({ lastEvent: event });

        // Notify event listeners
        const listeners = eventListeners.current.get(eventName) || [];
        listeners.forEach(listener => {
          try {
            listener(event);
          } catch (err) {
            logger.error('[Enhanced WebSocket] Event listener error:', err);
          }
        });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        updateState({
          isConnected: false,
          connectionType: null,
          error: `Disconnected: ${reason}`
        });
        logger.warn('[Enhanced WebSocket] Socket.IO disconnected:', reason);
      });

      // Handle connection errors
      socket.on('connect_error', (error) => {
        updateState({
          error: `Connection error: ${error.message}`,
          isReconnecting: false
        });
        logger.error('[Enhanced WebSocket] Socket.IO connection error:', error);
      });

      // Handle reconnection attempts
      socket.on('reconnect_attempt', (attemptNumber) => {
        updateState({
          isReconnecting: true,
          reconnectAttempts: attemptNumber
        });
        logger.info(`[Enhanced WebSocket] Reconnection attempt ${attemptNumber}`);
      });

      socketRef.current = socket;
      return true;
    } catch (error) {
      logger.error('[Enhanced WebSocket] Failed to create Socket.IO connection:', error);
      return false;
    }
  }, [url, getAuthToken, maxReconnectAttempts, updateState]);

  // Raw WebSocket connection (fallback)
  const connectWebSocket = useCallback(async (): Promise<boolean> => {
    const token = getAuthToken();
    if (!token) {
      updateState({ error: 'Authentication required', authStatus: 'unauthenticated' });
      return false;
    }

    try {
      const wsUrl = `${url.replace('http', 'ws')}/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        updateState({
          isConnected: true,
          connectionType: 'websocket',
          error: null,
          isReconnecting: false,
          reconnectAttempts: 0,
          authStatus: 'authenticated'
        });
        logger.info('[Enhanced WebSocket] Raw WebSocket connected successfully');

        // Start heartbeat
        heartbeatTimeoutRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
          }
        }, heartbeatInterval);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const wsEvent: WebSocketEvent = {
            type: data.type || 'message',
            payload: data.payload || data,
            messageId: data.messageId,
            timestamp: data.timestamp || new Date().toISOString()
          };

          updateState({ lastEvent: wsEvent });

          // Notify event listeners
          const listeners = eventListeners.current.get(wsEvent.type) || [];
          listeners.forEach(listener => {
            try {
              listener(wsEvent);
            } catch (err) {
              logger.error('[Enhanced WebSocket] Event listener error:', err);
            }
          });
        } catch (err) {
          logger.error('[Enhanced WebSocket] Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        updateState({
          isConnected: false,
          connectionType: null,
          error: 'WebSocket disconnected'
        });

        if (heartbeatTimeoutRef.current) {
          clearInterval(heartbeatTimeoutRef.current);
          heartbeatTimeoutRef.current = null;
        }

        logger.warn('[Enhanced WebSocket] Raw WebSocket disconnected');

        // Attempt reconnection
        if (state.reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000);
          updateState({
            isReconnecting: true,
            reconnectAttempts: state.reconnectAttempts + 1
          });

          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        updateState({ error: 'WebSocket connection error' });
        logger.error('[Enhanced WebSocket] Raw WebSocket error:', error);
      };

      wsRef.current = ws;
      return true;
    } catch (error) {
      logger.error('[Enhanced WebSocket] Failed to create WebSocket connection:', error);
      return false;
    }
  }, [url, getAuthToken, heartbeatInterval, maxReconnectAttempts, state.reconnectAttempts, updateState]);

  // Main connection function with Socket.IO first, WebSocket fallback
  const connect = useCallback(async () => {
    updateState({ error: null, isReconnecting: false });

    // Try Socket.IO first if enabled
    if (enableSocketIO) {
      const socketIOSuccess = await connectSocketIO();
      if (socketIOSuccess) return;

      logger.warn('[Enhanced WebSocket] Socket.IO failed, falling back to WebSocket');
    }

    // Fallback to raw WebSocket if enabled
    if (enableFallback) {
      await connectWebSocket();
    } else {
      updateState({ error: 'Connection failed and fallback disabled' });
    }
  }, [enableSocketIO, enableFallback, connectSocketIO, connectWebSocket, updateState]);

  // Disconnect function
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (heartbeatTimeoutRef.current) {
      clearInterval(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    updateState({
      isConnected: false,
      connectionType: null,
      isReconnecting: false,
      reconnectAttempts: 0
    });
  }, [updateState]);

  // Send message function
  const sendMessage = useCallback((message: any) => {
    const messageWithId = {
      ...message,
      messageId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    if (socketRef.current?.connected) {
      socketRef.current.emit(message.type, messageWithId);
      return true;
    } else if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(messageWithId));
      return true;
    } else {
      logger.warn('[Enhanced WebSocket] Cannot send message: not connected');
      return false;
    }
  }, []);

  // Event listener management
  const addEventListener = useCallback((eventType: string, listener: (event: WebSocketEvent) => void) => {
    const listeners = eventListeners.current.get(eventType) || [];
    listeners.push(listener);
    eventListeners.current.set(eventType, listeners);

    // Return cleanup function
    return () => {
      const currentListeners = eventListeners.current.get(eventType) || [];
      const index = currentListeners.indexOf(listener);
      if (index > -1) {
        currentListeners.splice(index, 1);
        eventListeners.current.set(eventType, currentListeners);
      }
    };
  }, []);

  // Don't auto-connect - let components control when to connect
  // This prevents premature connection attempts before authentication

  return {
    ...state,
    connect,
    disconnect,
    sendMessage,
    addEventListener
  };
};