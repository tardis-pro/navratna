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
  reconnectAttempts?: number;
}

interface WebSocketState {
  isConnected: boolean;
  connectionType: 'socket.io' | null;
  lastEvent: WebSocketEvent | null;
  error: string | null;
  isReconnecting: boolean;
  reconnectAttempts: number;
  authStatus: 'authenticated' | 'unauthenticated' | 'pending';
}

/**
 * Enhanced WebSocket Hook - Socket.IO Only
 * 
 * Clean implementation using ONLY Socket.IO for real-time communication.
 * No WebSocket fallback to prevent protocol conflicts.
 */
export const useEnhancedWebSocket = (config: ConnectionConfig = {}) => {
  const {
    url = getWebSocketURL(),
    reconnectAttempts: maxReconnectAttempts = 5,
  } = config;

  // State management
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    connectionType: null,
    lastEvent: null,
    error: null,
    isReconnecting: false,
    reconnectAttempts: 0,
    authStatus: 'unauthenticated'
  });

  // Refs for managing connections and timeouts
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to update state
  const updateState = useCallback((updates: Partial<WebSocketState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Get auth token from localStorage
  const getAuthToken = useCallback(() => {
    return localStorage.getItem('authToken') || localStorage.getItem('auth_token');
  }, []);

  // Socket.IO connection function
  const connectSocketIO = useCallback(async (): Promise<boolean> => {
    const token = getAuthToken();
    if (!token) {
      updateState({ 
        error: 'Authentication required - please log in', 
        authStatus: 'unauthenticated' 
      });
      return false;
    }

    try {
      logger.info('[Socket.IO] Attempting connection', { url });

      const socket = io(url, {
        auth: { token },
        query: { token }, // Backup token passing method
        extraHeaders: {
          'Authorization': `Bearer ${token}`
        },
        transports: ['websocket', 'polling'], // Socket.IO transports only
        upgrade: true,
        rememberUpgrade: true,
        timeout: 10000,
        reconnection: false, // We'll handle reconnection manually
        forceNew: false,
        autoConnect: true
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
        logger.info('✅ Socket.IO connected successfully', { socketId: socket.id });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        updateState({
          isConnected: false,
          connectionType: null,
          error: `Disconnected: ${reason}`
        });
        logger.warn('[Socket.IO] Disconnected:', reason);

        // Attempt reconnection for certain disconnect reasons
        if (reason === 'io server disconnect' || reason === 'transport close') {
          attemptReconnection();
        }
      });

      // Handle connection errors
      socket.on('connect_error', (error) => {
        logger.error('[Socket.IO] Connection error:', error);
        
        if (error.message.includes('Authentication') || error.message.includes('token')) {
          updateState({ 
            error: `Authentication failed: ${error.message}`,
            authStatus: 'unauthenticated',
            isReconnecting: false 
          });
        } else if (error.message.includes('timeout')) {
          updateState({ 
            error: 'Connection timeout - server may be unavailable',
            isReconnecting: true 
          });
          attemptReconnection();
        } else {
          updateState({ 
            error: `Connection failed: ${error.message}`,
            isReconnecting: false 
          });
        }
      });

      // Handle all Socket.IO events
      socket.onAny((eventName: string, ...args: any[]) => {
        const event: WebSocketEvent = {
          type: eventName,
          payload: args[0] || {},
          messageId: args[0]?.messageId,
          timestamp: new Date().toISOString()
        };

        updateState({ lastEvent: event });
        logger.debug('[Socket.IO] Event received:', eventName, args[0]);
      });

      // Handle authentication events specifically
      socket.on('auth_success', (data) => {
        updateState({ authStatus: 'authenticated' });
        logger.info('[Socket.IO] Authentication successful');
      });

      socket.on('auth_failure', (data) => {
        updateState({ 
          authStatus: 'unauthenticated', 
          error: data.message || 'Authentication failed' 
        });
        logger.error('[Socket.IO] Authentication failed:', data);
      });

      socketRef.current = socket;
      return true;
    } catch (error) {
      logger.error('[Socket.IO] Failed to create connection:', error);
      updateState({ 
        error: 'Failed to initialize Socket.IO connection',
        authStatus: 'unauthenticated' 
      });
      return false;
    }
  }, [url, getAuthToken, updateState]);

  // Reconnection logic
  const attemptReconnection = useCallback(() => {
    if (state.reconnectAttempts >= maxReconnectAttempts) {
      updateState({ 
        error: `Max reconnection attempts (${maxReconnectAttempts}) reached`,
        isReconnecting: false 
      });
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000);
    updateState({
      isReconnecting: true,
      reconnectAttempts: state.reconnectAttempts + 1
    });

    logger.info(`[Socket.IO] Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts + 1}/${maxReconnectAttempts})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      connectSocketIO();
    }, delay);
  }, [state.reconnectAttempts, maxReconnectAttempts, connectSocketIO, updateState]);

  // Main connect function
  const connect = useCallback(async () => {
    updateState({ error: null, isReconnecting: false });
    logger.info('[Enhanced WebSocket] Connecting via Socket.IO only');
    
    const success = await connectSocketIO();
    if (!success) {
      updateState({ 
        error: 'Socket.IO connection failed - please check your authentication and network',
        authStatus: 'unauthenticated'
      });
    }
  }, [connectSocketIO, updateState]);

  // Disconnect function
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    updateState({
      isConnected: false,
      connectionType: null,
      error: null,
      isReconnecting: false,
      reconnectAttempts: 0
    });

    logger.info('[Socket.IO] Disconnected manually');
  }, [updateState]);

  // Send message function
  const sendMessage = useCallback((type: string, payload: any) => {
    if (!socketRef.current || !state.isConnected) {
      logger.warn('[Socket.IO] Cannot send message - not connected');
      return false;
    }

    try {
      socketRef.current.emit(type, payload);
      logger.debug('[Socket.IO] Message sent:', type, payload);
      return true;
    } catch (error) {
      logger.error('[Socket.IO] Failed to send message:', error);
      return false;
    }
  }, [state.isConnected]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Connection state
    isConnected: state.isConnected,
    connectionType: state.connectionType,
    error: state.error,
    isReconnecting: state.isReconnecting,
    reconnectAttempts: state.reconnectAttempts,
    authStatus: state.authStatus,
    
    // Last received event
    lastEvent: state.lastEvent,
    
    // Connection methods
    connect,
    disconnect,
    sendMessage,
    
    // Socket.IO instance (for advanced usage)
    socket: socketRef.current
  };
};

export default useEnhancedWebSocket;