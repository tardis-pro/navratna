import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getWebSocketURL } from '@/config/apiConfig';
import { logger } from '@/utils/browser-logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export type WAConnectionState = 'disconnected' | 'connecting' | 'qr' | 'connected';

export interface WAConnectedInfo {
  phoneNumber: string;
  name: string;
}

export interface WAIncomingMessage {
  id: string;
  from: string;
  fromName: string;
  text: string;
  timestamp: number;
  isGroup: boolean;
  groupJid?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'unsupported';
}

interface UseWhatsAppReturn {
  /** Current Baileys connection state */
  state: WAConnectionState;
  /** Raw QR string to render as QR code (only set when state === 'qr') */
  qrString: string | null;
  /** Info about the linked WhatsApp account (only set when state === 'connected') */
  connectedInfo: WAConnectedInfo | null;
  /** Recent incoming messages (newest first, capped at 100) */
  messages: WAIncomingMessage[];
  /** True while the Socket.IO connection to the /whatsapp namespace is live */
  isSocketConnected: boolean;
  /** Trigger a new WhatsApp connection / QR generation */
  connect: () => void;
  /** Disconnect without logging out */
  disconnect: () => void;
  /** Log out from WhatsApp and clear stored credentials */
  logout: () => void;
  /** Manually send a WhatsApp message (admin use) */
  sendMessage: (jid: string, text: string) => void;
  /** Last error from the socket or WhatsApp layer */
  error: string | null;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

const MAX_MESSAGES = 100;

function getAuthToken(): string | null {
  return (
    localStorage.getItem('authToken') ||
    localStorage.getItem('auth_token') ||
    localStorage.getItem('accessToken') ||
    sessionStorage.getItem('accessToken')
  );
}

export function useWhatsApp(): UseWhatsAppReturn {
  const [state, setState] = useState<WAConnectionState>('disconnected');
  const [qrString, setQrString] = useState<string | null>(null);
  const [connectedInfo, setConnectedInfo] = useState<WAConnectedInfo | null>(null);
  const [messages, setMessages] = useState<WAIncomingMessage[]>([]);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    const wsUrl = getWebSocketURL();

    const socket = io(`${wsUrl}/whatsapp`, {
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    // ── Socket lifecycle ──

    socket.on('connect', () => {
      setIsSocketConnected(true);
      setError(null);
      logger.info('[WhatsApp] Socket.IO connected to /whatsapp namespace');
    });

    socket.on('disconnect', (reason) => {
      setIsSocketConnected(false);
      logger.warn('[WhatsApp] Socket.IO disconnected', { reason });
    });

    socket.on('connect_error', (err) => {
      setError(`Connection error: ${err.message}`);
      logger.error('[WhatsApp] Socket.IO connection error', err);
    });

    // ── WhatsApp events ──

    socket.on('wa:status', ({ state: s }: { state: WAConnectionState }) => {
      setState(s);
      if (s !== 'qr') setQrString(null);
      logger.debug('[WhatsApp] State update', { state: s });
    });

    socket.on('wa:qr', ({ qr }: { qr: string }) => {
      setQrString(qr);
      setState('qr');
      setError(null);
      logger.info('[WhatsApp] QR code received');
    });

    socket.on('wa:connected', (info: WAConnectedInfo) => {
      setConnectedInfo(info);
      setQrString(null);
      setState('connected');
      setError(null);
      logger.info('[WhatsApp] Account connected', info);
    });

    socket.on('wa:disconnected', ({ reason }: { reason: string }) => {
      setConnectedInfo(null);
      setQrString(null);
      setState('disconnected');
      logger.info('[WhatsApp] Disconnected', { reason });
    });

    socket.on('wa:message', (msg: WAIncomingMessage) => {
      setMessages((prev) => [msg, ...prev].slice(0, MAX_MESSAGES));
    });

    socket.on('wa:error', ({ message }: { message: string }) => {
      setError(message);
      logger.error('[WhatsApp] Server-side error', { message });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // intentionally empty — reconnects via socket.io built-in

  // ─── Commands ──────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    socketRef.current?.emit('wa:connect');
    setState('connecting');
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.emit('wa:disconnect');
  }, []);

  const logout = useCallback(() => {
    socketRef.current?.emit('wa:logout');
  }, []);

  const sendMessage = useCallback((jid: string, text: string) => {
    socketRef.current?.emit('wa:send', { jid, text });
  }, []);

  return {
    state,
    qrString,
    connectedInfo,
    messages,
    isSocketConnected,
    connect,
    disconnect,
    logout,
    sendMessage,
    error,
  };
}
