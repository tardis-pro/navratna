export interface WebSocketConnection {
  ws: unknown;
  discussionId: string;
  userId?: string;
  participantId?: string;
  isAlive: boolean;
  lastPing: Date;
  connectionId: string;
  authenticated: boolean;
  securityLevel: number;
  messageCount: number;
  lastActivity: Date;
  rateLimitReset: number;
}

export interface IWebSocketHandler {
  broadcastToDiscussion(discussionId: string, message: Record<string, unknown>): void;
  broadcastContextUpdate(discussionId: string, context: Record<string, unknown>): void;
}

export interface WebSocketSession {
  connectionId: string;
  userId: string;
  discussionId: string;
  participantId?: string;
  securityLevel: number;
  authenticated: boolean;
  connectedAt: Date;
  lastActivity: Date;
  messageCount: number;
  rateLimitReset: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface RateLimitData {
  messages: { count: number; resetTime: number };
  typing: { count: number; resetTime: number };
  reactions: { count: number; resetTime: number };
  turns: { count: number; resetTime: number };
}
