import { z } from 'zod';
import { IDSchema } from './common.js';
import { DiscussionEventType } from './discussion';

// WebSocket connection types
export enum WebSocketConnectionStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

export const WebSocketConfigSchema = z.object({
  url: z.string().url(),
  autoConnect: z.boolean().default(true),
  reconnectAttempts: z.number().min(0).default(5),
  reconnectDelay: z.number().min(100).default(1000),
  heartbeatInterval: z.number().min(1000).default(30000),
  timeout: z.number().min(1000).default(10000),
  protocols: z.array(z.string()).optional(),
  headers: z.record(z.string()).optional()
});

export type WebSocketConfig = z.infer<typeof WebSocketConfigSchema>;

// Turn info for discussions
export const TurnInfoSchema = z.object({
  currentParticipantId: IDSchema,
  turnNumber: z.number().min(0),
  timeRemaining: z.number().min(0), // seconds
  nextParticipantId: IDSchema,
  canAdvance: z.boolean(),
  startedAt: z.date(),
  expectedEndAt: z.date().optional(),
  turnTimeout: z.number().min(0).default(300), // seconds
  metadata: z.record(z.any()).optional()
});

export type TurnInfo = z.infer<typeof TurnInfoSchema>;

// WebSocket event types
export enum WebSocketEventType {
  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  RECONNECT = 'reconnect',
  ERROR = 'error',
  
  // Discussion events
  DISCUSSION_STARTED = 'discussion_started',
  DISCUSSION_ENDED = 'discussion_ended',
  DISCUSSION_PAUSED = 'discussion_paused',
  DISCUSSION_RESUMED = 'discussion_resumed',
  
  // Participant events
  PARTICIPANT_JOINED = 'participant_joined',
  PARTICIPANT_LEFT = 'participant_left',
  PARTICIPANT_TYPING = 'participant_typing',
  PARTICIPANT_STOPPED_TYPING = 'participant_stopped_typing',
  
  // Message events
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_UPDATED = 'message_updated',
  MESSAGE_DELETED = 'message_deleted',
  MESSAGE_REACTION_ADDED = 'message_reaction_added',
  MESSAGE_REACTION_REMOVED = 'message_reaction_removed',
  
  // Turn events
  TURN_STARTED = 'turn_started',
  TURN_ENDED = 'turn_ended',
  TURN_ADVANCED = 'turn_advanced',
  TURN_TIMEOUT_WARNING = 'turn_timeout_warning',
  
  // Agent events
  AGENT_STATUS_CHANGED = 'agent_status_changed',
  AGENT_THINKING = 'agent_thinking',
  AGENT_RESPONSE_READY = 'agent_response_ready',
  
  // System events
  SYSTEM_MAINTENANCE = 'system_maintenance',
  SYSTEM_ALERT = 'system_alert',
  NOTIFICATION = 'notification'
}

// Base WebSocket event
export const WebSocketEventSchema = z.object({
  id: IDSchema,
  type: z.nativeEnum(WebSocketEventType),
  timestamp: z.date(),
  source: z.string(),
  target: z.string().optional(),
  data: z.record(z.any()),
  metadata: z.record(z.any()).optional()
});

export type WebSocketEvent = z.infer<typeof WebSocketEventSchema>;

// Discussion-specific WebSocket event
export const DiscussionWebSocketEventSchema = z.object({
  id: IDSchema,
  type: z.nativeEnum(DiscussionEventType),
  discussionId: IDSchema,
  participantId: IDSchema.optional(),
  timestamp: z.date(),
  data: z.record(z.any()),
  metadata: z.record(z.any()).optional()
});

export type DiscussionWebSocketEvent = z.infer<typeof DiscussionWebSocketEventSchema>;

// Typing indicator
export const TypingIndicatorSchema = z.object({
  participantId: IDSchema,
  discussionId: IDSchema,
  isTyping: z.boolean(),
  timestamp: z.date(),
  estimatedFinishTime: z.date().optional()
});

export type TypingIndicator = z.infer<typeof TypingIndicatorSchema>;

// Presence status
export enum PresenceStatus {
  ONLINE = 'online',
  AWAY = 'away',
  BUSY = 'busy',
  OFFLINE = 'offline'
}

export const PresenceSchema = z.object({
  userId: IDSchema,
  status: z.nativeEnum(PresenceStatus),
  lastSeen: z.date(),
  activity: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export type Presence = z.infer<typeof PresenceSchema>;

// Real-time notification
export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

export const RealtimeNotificationSchema = z.object({
  id: IDSchema,
  userId: IDSchema,
  title: z.string(),
  message: z.string(),
  priority: z.nativeEnum(NotificationPriority).default(NotificationPriority.NORMAL),
  category: z.string().optional(),
  actionUrl: z.string().url().optional(),
  actionText: z.string().optional(),
  expiresAt: z.date().optional(),
  readAt: z.date().optional(),
  dismissedAt: z.date().optional(),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date()
});

export type RealtimeNotification = z.infer<typeof RealtimeNotificationSchema>;

// WebSocket client interface
export interface WebSocketClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(event: WebSocketEvent): Promise<void>;
  subscribe(eventType: WebSocketEventType, handler: (event: WebSocketEvent) => void): void;
  unsubscribe(eventType: WebSocketEventType, handler?: (event: WebSocketEvent) => void): void;
  getConnectionStatus(): WebSocketConnectionStatus;
  isConnected(): boolean;
}

// Room management for discussions
export const RoomSchema = z.object({
  id: IDSchema,
  name: z.string(),
  type: z.enum(['discussion', 'collaboration', 'notification', 'system']),
  participants: z.array(IDSchema),
  maxParticipants: z.number().min(1).optional(),
  isPrivate: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date(),
  lastActivity: z.date()
});

export type Room = z.infer<typeof RoomSchema>;

// WebSocket authentication
export const WebSocketAuthSchema = z.object({
  token: z.string(),
  userId: IDSchema,
  sessionId: z.string(),
  permissions: z.array(z.string()).default([]),
  expiresAt: z.date().optional()
});

export type WebSocketAuth = z.infer<typeof WebSocketAuthSchema>; 