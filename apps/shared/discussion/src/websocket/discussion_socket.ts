import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '@uaip/utils';
import { DiscussionOrchestrationService } from '../services/discussion_orchestration_service.js';
import { DiscussionEvent, DiscussionEventType, MessageType, WebSocketConnection } from '@uaip/types';
import { z } from 'zod';
import { testJWTToken } from '@uaip/middleware';
import { RedisSessionManager } from './redis_session_manager.js';
import { extractAccessTokenFromCookieHeader } from './websocket_security_utils.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  participantId?: string;
  discussionId?: string;
  sessionId?: string;
  securityLevel?: number;
  lastActivity?: Date;
  messageCount?: number;
  rateLimitReset?: number;
}

type AuthPayload = {
  userId: string;
  role?: string;
  isExpired?: boolean;
  exp?: Date | number | string;
};

function isAuthPayload(value: unknown): value is AuthPayload {
  return typeof value === 'object' && value !== null && 'userId' in value && typeof value.userId === 'string';
}

// Validation schemas for incoming WebSocket messages
const JoinDiscussionSchema = z.object({
  discussionId: z.string().uuid('Discussion ID must be a valid UUID'),
});

const SendMessageSchema = z.object({
  discussionId: z.string().uuid('Discussion ID must be a valid UUID'),
  content: z
    .string()
    .min(1, 'Message content cannot be empty')
    .max(10000, 'Message content too long'),
  messageType: z.nativeEnum(MessageType).optional(),
  replyToId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
});

const ReactionSchema = z.object({
  discussionId: z.string().uuid('Discussion ID must be a valid UUID'),
  messageId: z.string().uuid('Message ID must be a valid UUID'),
  emoji: z.string().min(1).max(10, 'Emoji must be 1-10 characters'),
});

const TypingSchema = z.object({
  discussionId: z.string().uuid('Discussion ID must be a valid UUID'),
});

// No startedBy: the actor is always the authenticated socket user.
const StartDiscussionSchema = z.object({
  discussionId: z.string().uuid('Discussion ID must be a valid UUID'),
});

const DiscussionControlSchema = z.object({
  discussionId: z.string().uuid('Discussion ID must be a valid UUID'),
});

// Rate limiting configuration
const RATE_LIMITS = {
  MESSAGES_PER_MINUTE: 30,
  TYPING_EVENTS_PER_MINUTE: 60,
  REACTIONS_PER_MINUTE: 20,
  TURN_REQUESTS_PER_MINUTE: 10,
};

// Redis session manager instance
let redisSessionManager: RedisSessionManager;

export function setupWebSocketHandlers(
  io: SocketIOServer,
  orchestrationService: DiscussionOrchestrationService
): void {
  // Initialize Redis session manager
  redisSessionManager = new RedisSessionManager({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_WS_DB || process.env.REDIS_DB || '0'),
  });

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const preAuthenticatedUserId = typeof socket.data?.user?.userId === 'string' ? socket.data.user.userId : undefined;
      if (preAuthenticatedUserId) {
        socket.userId = preAuthenticatedUserId;
        socket.sessionId =
          (typeof socket.data?.user?.sessionId === 'string' ? socket.data.user.sessionId : undefined) ||
          `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        socket.securityLevel =
          (typeof socket.data?.user?.securityLevel === 'number' ? socket.data.user.securityLevel : undefined) ||
          getSecurityLevelFromRole((typeof socket.data?.user?.role === 'string' ? socket.data.user.role : undefined) || 'user');
        socket.lastActivity = new Date();
        socket.messageCount = 0;
        socket.rateLimitReset = Date.now() + 60000;
        logger.info('WebSocket authenticated successfully', {
          socketId: socket.id,
          userId: preAuthenticatedUserId,
          authMethod: 'nginx_pre_auth',
        });
        return next();
      }

      // Extract token from multiple possible sources, tracking auth method for observability
      let token = socket.handshake.auth?.token;
      let authMethod = 'handshake_auth';

      if (!token && socket.handshake.headers.authorization) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
          authMethod = 'authorization_header';
        }
      }

      if (!token && typeof socket.handshake.query?.token === 'string') {
        token = socket.handshake.query.token;
        authMethod = 'query_param';
      }

      if (!token) {
        token = extractAccessTokenFromCookieHeader(socket.handshake.headers.cookie);
        if (token) authMethod = 'cookie';
      }

      if (!token) {
        logger.warn('WebSocket connection attempted without token', {
          socketId: socket.id,
          ip: socket.handshake.address,
          origin: socket.handshake.headers.origin,
          userAgent: socket.handshake.headers['user-agent'],
        });
        return next(new Error('AUTH_TOKEN_REQUIRED'));
      }

      const tokenValidation = await testJWTToken(token);

      if (!tokenValidation.isValid) {
        logger.warn('Invalid JWT token for WebSocket connection', {
          socketId: socket.id,
          error: tokenValidation.error,
          ip: socket.handshake.address,
          diagnostics: tokenValidation.diagnostics,
        });
        return next(new Error('INVALID_TOKEN'));
      }

      const payload = tokenValidation.payload;

      if (!isAuthPayload(payload)) {
        logger.warn('JWT token missing required user information', {
          socketId: socket.id,
          hasPayload: !!payload,
          payloadKeys: payload ? Object.keys(payload) : [],
        });
        return next(new Error('INVALID_TOKEN_PAYLOAD'));
      }

      // Check token expiration
      if (payload.isExpired) {
        logger.warn('Expired JWT token for WebSocket connection', {
          socketId: socket.id,
          userId: payload.userId,
          expiredAt: payload.exp,
        });
        return next(new Error('TOKEN_EXPIRED'));
      }

      // Set authenticated user information
      socket.userId = payload.userId;
      socket.sessionId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      socket.securityLevel = getSecurityLevelFromRole(payload.role);
      socket.lastActivity = new Date();
      socket.messageCount = 0;
      socket.rateLimitReset = Date.now() + 60000; // Reset every minute

      // Create session in Redis (async operation wrapped)
      const sessionConnection: WebSocketConnection = {
        ws: null, // Placeholder - not used for session tracking
        connectionId: socket.sessionId!,
        userId: payload.userId,
        discussionId: '', // Will be set when joining discussion
        isAlive: true,
        lastPing: new Date(),
        authenticated: true,
        securityLevel: socket.securityLevel!,
        messageCount: 0,
        lastActivity: new Date(),
        rateLimitReset: Date.now() + 60000,
      };

      // Store session in Redis (without discussion ID initially) - async operation
      redisSessionManager
        .createSession(
          sessionConnection,
          socket.handshake.address,
          socket.handshake.headers['user-agent']
        )
        .catch((error) => {
          logger.error('Failed to create Redis session', {
            socketId: socket.id,
            userId: payload.userId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });

      logger.info('WebSocket authenticated successfully', {
        socketId: socket.id,
        userId: payload.userId,
        role: payload.role,
        securityLevel: socket.securityLevel,
        sessionId: socket.sessionId,
        authMethod,
      });

      next();
    } catch (error) {
      logger.error('WebSocket authentication error', {
        socketId: socket.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        ip: socket.handshake.address,
      });
      next(new Error('AUTHENTICATION_FAILED'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info('Client connected to discussion socket', {
      socketId: socket.id,
      userId: socket.userId,
    });

    // Debug: Log all incoming events
    socket.onAny((eventName: string, ...args: unknown[]) => {
      logger.info('🎯 WebSocket event received', {
        socketId: socket.id,
        userId: socket.userId,
        eventName,
        data: args[0],
        totalArgs: args.length,
      });
    });

    // Join discussion room with enhanced validation
    socket.on('join_discussion', async (data: z.input<typeof JoinDiscussionSchema>) => {
      try {
        // Update activity timestamp
        socket.lastActivity = new Date();

        // Validate input data
        const validatedData = JoinDiscussionSchema.parse(data);
        const { discussionId } = validatedData;

        // Verify user has access to this discussion
        const hasAccess = await orchestrationService.verifyParticipantAccess(
          discussionId,
          socket.userId!
        );

        if (!hasAccess) {
          logger.warn('WebSocket access denied to discussion', {
            socketId: socket.id,
            userId: socket.userId,
            discussionId,
            securityLevel: socket.securityLevel,
          });
          socket.emit('error', {
            code: 'ACCESS_DENIED',
            message: 'Access denied to discussion',
          });
          return;
        }

        // Join the discussion room
        // Else the socket stays in the old room, which the leave guard now refuses to leave.
        if (socket.discussionId && socket.discussionId !== discussionId) {
          const previousRoom = `discussion:${socket.discussionId}`;
          const previousParticipantId = socket.participantId;
          await socket.leave(previousRoom);
          socket.to(previousRoom).emit('participant_disconnected', {
            participantId: previousParticipantId,
            userId: socket.userId,
            sessionId: socket.sessionId,
            timestamp: new Date(),
          });
        }

        await socket.join(`discussion:${discussionId}`);
        socket.discussionId = discussionId;

        // SECURITY: unconditional — a stale participantId must not carry over.
        socket.participantId = undefined;

        const participant = await orchestrationService.getParticipantByUserId(
          discussionId,
          socket.userId!
        );

        if (participant) {
          socket.participantId = participant.id;
        }

        socket.emit('joined_discussion', {
          discussionId,
          participantId: socket.participantId,
        });

        // Presence, not roster: joining a room never calls addParticipant, so
        // this pairs with participant_disconnected — NOT with participant_joined,
        // which orchestration reserves for actual roster changes.
        socket.to(`discussion:${discussionId}`).emit('participant_connected', {
          participantId: socket.participantId,
          userId: socket.userId,
          sessionId: socket.sessionId,
          timestamp: new Date(),
        });

        logger.info('User joined discussion room', {
          socketId: socket.id,
          userId: socket.userId,
          discussionId,
          participantId: socket.participantId,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.warn('Invalid join discussion data', {
            socketId: socket.id,
            userId: socket.userId,
            validationErrors: error.errors,
            data,
          });
          socket.emit('error', {
            code: 'VALIDATION_ERROR',
            message: 'Invalid discussion data',
            details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
          });
        } else {
          logger.error('Failed to join discussion', {
            socketId: socket.id,
            userId: socket.userId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          });
          socket.emit('error', {
            code: 'JOIN_FAILED',
            message: 'Failed to join discussion',
          });
        }
      }
    });

    // Start discussion with agent participation
    socket.on('start_discussion', async (data: z.input<typeof StartDiscussionSchema>) => {
      try {
        // Update activity timestamp
        socket.lastActivity = new Date();

        // Validate input data
        const validatedData = StartDiscussionSchema.parse(data);
        // SECURITY: never trust client startedBy — startDiscussion authorizes
        // whoever it is given, so a participant could pass the owner's id.
        const { discussionId } = validatedData;
        const startedBy = socket.userId!;

        // Verify user has permission to start this discussion
        const hasAccess = await orchestrationService.verifyParticipantAccess(
          discussionId,
          socket.userId!
        );

        if (!hasAccess) {
          logger.warn('WebSocket access denied to start discussion', {
            socketId: socket.id,
            userId: socket.userId,
            discussionId,
            securityLevel: socket.securityLevel,
          });
          socket.emit('error', {
            code: 'ACCESS_DENIED',
            message: 'No permission to start this discussion',
          });
          return;
        }

        logger.info('Starting discussion via WebSocket', {
          socketId: socket.id,
          userId: socket.userId,
          discussionId,
          startedBy,
        });

        // Start the discussion using orchestration service
        const result = await orchestrationService.startDiscussion(
          discussionId,
          startedBy
        );

        if (result.success) {
          // Notify all participants that discussion has started
          const stateRaw = result.data?.['state'];
          const activeParticipants = typeof stateRaw === 'object' && stateRaw !== null && 'activeParticipants' in stateRaw
            ? stateRaw.activeParticipants
            : 0;
          socket.to(`discussion:${discussionId}`).emit('discussion_started', {
            discussionId,
            startedBy,
            timestamp: new Date(),
            participants: activeParticipants || 0,
          });

          // Confirm to the starter
          socket.emit('discussion_started', {
            discussionId,
            startedBy,
            timestamp: new Date(),
            participants: activeParticipants || 0,
            success: true,
          });

          logger.info('Discussion started successfully via WebSocket', {
            socketId: socket.id,
            userId: socket.userId,
            discussionId,
            activeParticipants,
          });
        } else {
          socket.emit('error', {
            code: 'START_FAILED',
            message: result.error || 'Failed to start discussion',
          });
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.warn('Invalid start discussion data', {
            socketId: socket.id,
            userId: socket.userId,
            validationErrors: error.errors,
            data,
          });
          socket.emit('error', {
            code: 'VALIDATION_ERROR',
            message: 'Invalid discussion start data',
            details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
          });
        } else {
          logger.error('Failed to start discussion', {
            socketId: socket.id,
            userId: socket.userId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          });
          socket.emit('error', {
            code: 'START_FAILED',
            message: 'Failed to start discussion',
          });
        }
      }
    });

    // Pause discussion
    socket.on('pause_discussion', async (data: z.input<typeof DiscussionControlSchema>) => {
      try {
        socket.lastActivity = new Date();

        const validatedData = DiscussionControlSchema.parse(data);
        const { discussionId } = validatedData;

        // Verify user has permission to pause this discussion
        const hasAccess = await orchestrationService.verifyParticipantAccess(
          discussionId,
          socket.userId!
        );

        if (!hasAccess) {
          socket.emit('error', {
            code: 'ACCESS_DENIED',
            message: 'No permission to pause this discussion',
          });
          return;
        }

        const result = await orchestrationService.pauseDiscussionAsUser(discussionId, socket.userId!);

        if (result.success) {
          io.to(`discussion:${discussionId}`).emit('discussion_paused', {
            discussionId,
            pausedBy: socket.userId,
            timestamp: new Date(),
          });

          socket.emit('discussion_paused', {
            discussionId,
            pausedBy: socket.userId,
            timestamp: new Date(),
            success: true,
          });
        } else {
          socket.emit('error', {
            code: 'PAUSE_FAILED',
            message: result.error || 'Failed to pause discussion',
          });
        }
      } catch (error) {
        logger.error('Failed to pause discussion', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        socket.emit('error', {
          code: 'PAUSE_FAILED',
          message: 'Failed to pause discussion',
        });
      }
    });

    // Resume discussion
    socket.on('resume_discussion', async (data: z.input<typeof DiscussionControlSchema>) => {
      try {
        socket.lastActivity = new Date();

        const validatedData = DiscussionControlSchema.parse(data);
        const { discussionId } = validatedData;

        // Verify user has permission to resume this discussion
        const hasAccess = await orchestrationService.verifyParticipantAccess(
          discussionId,
          socket.userId!
        );

        if (!hasAccess) {
          socket.emit('error', {
            code: 'ACCESS_DENIED',
            message: 'No permission to resume this discussion',
          });
          return;
        }

        const result = await orchestrationService.resumeDiscussionAsUser(discussionId, socket.userId!);

        if (result.success) {
          io.to(`discussion:${discussionId}`).emit('discussion_resumed', {
            discussionId,
            resumedBy: socket.userId,
            timestamp: new Date(),
          });

          socket.emit('discussion_resumed', {
            discussionId,
            resumedBy: socket.userId,
            timestamp: new Date(),
            success: true,
          });
        } else {
          socket.emit('error', {
            code: 'RESUME_FAILED',
            message: result.error || 'Failed to resume discussion',
          });
        }
      } catch (error) {
        logger.error('Failed to resume discussion', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        socket.emit('error', {
          code: 'RESUME_FAILED',
          message: 'Failed to resume discussion',
        });
      }
    });

    // Stop discussion
    socket.on('stop_discussion', async (data: z.input<typeof DiscussionControlSchema>) => {
      try {
        socket.lastActivity = new Date();

        const validatedData = DiscussionControlSchema.parse(data);
        const { discussionId } = validatedData;

        // Verify user has permission to stop this discussion
        const hasAccess = await orchestrationService.verifyParticipantAccess(
          discussionId,
          socket.userId!
        );

        if (!hasAccess) {
          socket.emit('error', {
            code: 'ACCESS_DENIED',
            message: 'No permission to stop this discussion',
          });
          return;
        }

        const result = await orchestrationService.stopDiscussion(discussionId, socket.userId!);

        if (result.success) {
          io.to(`discussion:${discussionId}`).emit('discussion_stopped', {
            discussionId,
            stoppedBy: socket.userId,
            timestamp: new Date(),
          });

          socket.emit('discussion_stopped', {
            discussionId,
            stoppedBy: socket.userId,
            timestamp: new Date(),
            success: true,
          });
        } else {
          socket.emit('error', {
            code: 'STOP_FAILED',
            message: result.error || 'Failed to stop discussion',
          });
        }
      } catch (error) {
        logger.error('Failed to stop discussion', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        socket.emit('error', {
          code: 'STOP_FAILED',
          message: 'Failed to stop discussion',
        });
      }
    });

    // Leave discussion room
    socket.on('leave_discussion', async (data: { discussionId: string }) => {
      try {
        const { discussionId } = data;

        // SECURITY: else a client can spoof a disconnect for any room.
        if (!socket.discussionId || socket.discussionId !== discussionId) {
          socket.emit('error', { message: 'Not joined to this discussion' });
          return;
        }

        const departingParticipantId = socket.participantId;

        await socket.leave(`discussion:${discussionId}`);

        socket.discussionId = undefined;
        socket.participantId = undefined;

        socket.to(`discussion:${discussionId}`).emit('participant_disconnected', {
          participantId: departingParticipantId,
          userId: socket.userId,
          sessionId: socket.sessionId,
          timestamp: new Date(),
        });

        socket.emit('left_discussion', { discussionId });

        logger.info('User left discussion room', {
          socketId: socket.id,
          userId: socket.userId,
          discussionId,
        });
      } catch (error) {
        logger.error('Failed to leave discussion', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Send message with rate limiting and validation
    socket.on('send_message', async (data: z.input<typeof SendMessageSchema>) => {
      try {
        // Room check BEFORE any counter: a foreign discussionId must not be
        // able to consume this session's message budget.
        const preValidated = SendMessageSchema.safeParse(data);
        if (!preValidated.success || !inJoinedDiscussion(socket, preValidated.data.discussionId)) {
          if (preValidated.success) return;
          socket.emit('error', { code: 'INVALID_DATA', message: 'Invalid message data' });
          return;
        }

        socket.lastActivity = new Date();
        socket.messageCount = (socket.messageCount || 0) + 1;

        if (
          !(await redisSessionManager.checkRateLimit(
            socket.sessionId!,
            'messages',
            RATE_LIMITS.MESSAGES_PER_MINUTE
          ))
        ) {
          logger.warn('Message rate limit exceeded', {
            socketId: socket.id,
            sessionId: socket.sessionId,
            userId: socket.userId,
            messageCount: socket.messageCount,
          });
          socket.emit('error', {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many messages sent. Please slow down.',
          });
          return;
        }

        // Validate input data
        const { discussionId, content, messageType, replyToId, threadId } = preValidated.data;

        if (!socket.participantId) {
          socket.emit('error', {
            code: 'NOT_IN_DISCUSSION',
            message: 'Must join discussion first',
          });
          return;
        }

        // Additional content sanitization
        const sanitizedContent = sanitizeMessageContent(content);

        const message = await orchestrationService.sendMessage(
          discussionId,
          socket.participantId,
          sanitizedContent,
          messageType || MessageType.MESSAGE,
          { replyToId, threadId }
        );

        logger.info('Message sent via socket', {
          socketId: socket.id,
          discussionId,
          messageId: message.data?.['id'],
          participantId: socket.participantId,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.warn('Invalid message data', {
            socketId: socket.id,
            userId: socket.userId,
            validationErrors: error.errors,
            data,
          });
          socket.emit('error', {
            code: 'VALIDATION_ERROR',
            message: 'Invalid message data',
            details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
          });
        } else {
          logger.error('Failed to send message via socket', {
            socketId: socket.id,
            userId: socket.userId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          });
          socket.emit('error', {
            code: 'MESSAGE_SEND_FAILED',
            message: 'Failed to send message',
          });
        }
      }
    });

    // Typing indicators with rate limiting
    socket.on('typing_start', async (data: z.input<typeof TypingSchema>) => {
      try {
        const preValidated = TypingSchema.safeParse(data);
        if (!preValidated.success || socket.discussionId !== preValidated.data.discussionId) {
          return;
        }

        socket.lastActivity = new Date();

        if (
          !(await redisSessionManager.checkRateLimit(
            socket.sessionId!,
            'typing',
            RATE_LIMITS.TYPING_EVENTS_PER_MINUTE
          ))
        ) {
          return; // Silently ignore typing events if rate limited
        }

        const validatedData = preValidated.data;

        if (socket.discussionId === validatedData.discussionId && socket.participantId) {
          socket.to(`discussion:${validatedData.discussionId}`).emit('user_typing', {
            participantId: socket.participantId,
            userId: socket.userId,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        // Silently ignore typing validation errors to avoid spam
        logger.debug('Invalid typing start data', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    socket.on('typing_stop', (data: z.input<typeof TypingSchema>) => {
      try {
        socket.lastActivity = new Date();

        const validatedData = TypingSchema.parse(data);

        if (socket.discussionId === validatedData.discussionId && socket.participantId) {
          socket.to(`discussion:${validatedData.discussionId}`).emit('user_stopped_typing', {
            participantId: socket.participantId,
            userId: socket.userId,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        // Silently ignore typing validation errors
        logger.debug('Invalid typing stop data', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Turn management with rate limiting
    socket.on('request_turn', async (data: z.input<typeof TypingSchema>) => {
      try {
        const preValidated = TypingSchema.safeParse(data);
        if (!preValidated.success || !inJoinedDiscussion(socket, preValidated.data.discussionId)) {
          if (preValidated.success) return;
          socket.emit('error', { code: 'INVALID_DATA', message: 'Invalid turn request data' });
          return;
        }

        socket.lastActivity = new Date();

        if (
          !(await redisSessionManager.checkRateLimit(
            socket.sessionId!,
            'turns',
            RATE_LIMITS.TURN_REQUESTS_PER_MINUTE
          ))
        ) {
          socket.emit('error', {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many turn requests. Please wait.',
          });
          return;
        }

        const validatedData = preValidated.data;

        const result = await orchestrationService.requestTurn(
          validatedData.discussionId,
          socket.participantId
        );
        if (!result.success) {
          socket.emit('error', { code: 'TURN_REQUEST_FAILED', message: result.error });
          return;
        }

        // Notify all participants about turn request
        io.to(`discussion:${validatedData.discussionId}`).emit('turn_requested', {
          participantId: socket.participantId,
          userId: socket.userId,
          timestamp: new Date(),
          result,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          socket.emit('error', {
            code: 'VALIDATION_ERROR',
            message: 'Invalid turn request data',
          });
        } else {
          logger.error('Failed to request turn', {
            socketId: socket.id,
            userId: socket.userId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          socket.emit('error', {
            code: 'TURN_REQUEST_FAILED',
            message: 'Failed to request turn',
          });
        }
      }
    });

    socket.on('end_turn', async (data: { discussionId: string }) => {
      try {
        if (!inJoinedDiscussion(socket, data.discussionId)) return;

        const result = await orchestrationService.endTurn(data.discussionId, socket.participantId);
        if (!result.success) {
          socket.emit('error', { code: 'END_TURN_FAILED', message: result.error });
          return;
        }

        // Notify all participants about turn end
        io.to(`discussion:${data.discussionId}`).emit('turn_ended', {
          participantId: socket.participantId,
          userId: socket.userId,
          timestamp: new Date(),
          nextParticipant: result.data?.['nextParticipant'],
        });
      } catch (error) {
        logger.error('Failed to end turn', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        socket.emit('error', { message: 'Failed to end turn' });
      }
    });

    // Reactions with validation and rate limiting
    socket.on('add_reaction', async (data: z.input<typeof ReactionSchema>) => {
      try {
        const preValidated = ReactionSchema.safeParse(data);
        if (!preValidated.success || !inJoinedDiscussion(socket, preValidated.data.discussionId)) {
          if (preValidated.success) return;
          socket.emit('error', { code: 'INVALID_DATA', message: 'Invalid reaction data' });
          return;
        }

        socket.lastActivity = new Date();

        if (
          !(await redisSessionManager.checkRateLimit(
            socket.sessionId!,
            'reactions',
            RATE_LIMITS.REACTIONS_PER_MINUTE
          ))
        ) {
          socket.emit('error', {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many reactions. Please slow down.',
          });
          return;
        }

        const validatedData = preValidated.data;

        const reaction = await orchestrationService.addReaction(
          validatedData.discussionId,
          validatedData.messageId,
          socket.participantId,
          validatedData.emoji
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          socket.emit('error', {
            code: 'VALIDATION_ERROR',
            message: 'Invalid reaction data',
            details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
          });
        } else {
          logger.error('Failed to add reaction', {
            socketId: socket.id,
            userId: socket.userId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          socket.emit('error', {
            code: 'REACTION_FAILED',
            message: 'Failed to add reaction',
          });
        }
      }
    });

    // Handle disconnection with cleanup
    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected from discussion socket', {
        socketId: socket.id,
        userId: socket.userId,
        discussionId: socket.discussionId,
        sessionId: socket.sessionId,
        messageCount: socket.messageCount,
        lastActivity: socket.lastActivity,
        reason,
      });

      // Clean up Redis session
      if (socket.sessionId) {
        redisSessionManager.removeSession(socket.sessionId).catch((error) => {
          logger.error('Failed to remove Redis session on disconnect', {
            socketId: socket.id,
            sessionId: socket.sessionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }

      // Notify discussion participants if user was in a discussion
      if (socket.discussionId && socket.participantId) {
        socket.to(`discussion:${socket.discussionId}`).emit('participant_disconnected', {
          participantId: socket.participantId,
          userId: socket.userId,
          sessionId: socket.sessionId,
          timestamp: new Date(),
        });
      }
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error('Socket error', {
        socketId: socket.id,
        userId: socket.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  });

  // Handle discussion events from the orchestration service
  orchestrationService.on('discussion_event', (event: DiscussionEvent) => {
    const room = `discussion:${event.discussionId}`;

    switch (event.type) {
      case DiscussionEventType.TURN_CHANGED:
        io.to(room).emit('turn_changed', event);
        break;
      case DiscussionEventType.STATUS_CHANGED:
        io.to(room).emit('status_changed', event);
        break;
      case DiscussionEventType.PARTICIPANT_JOINED:
        io.to(room).emit('participant_joined', event);
        break;
      case DiscussionEventType.PARTICIPANT_LEFT:
        io.to(room).emit('participant_left', event);
        break;
      case DiscussionEventType.MESSAGE_SENT:
        io.to(room).emit('message_received', event);
        break;
      case DiscussionEventType.REACTION_ADDED:
        io.to(room).emit('reaction_added', event);
        break;
      case DiscussionEventType.SETTINGS_UPDATED:
        io.to(room).emit('settings_updated', event);
        break;
      default:
        io.to(room).emit('discussion_event', event);
    }
  });

  logger.info('WebSocket handlers configured for discussion orchestration');
}

// Helper functions for security and rate limiting

/**
 * A participant-scoped action must target the room this socket actually joined.
 * Without it a client can name any discussionId and inject events into rooms it
 * never joined, since only join_discussion verifies access.
 */
export function inJoinedDiscussion(
  socket: Pick<AuthenticatedSocket, 'discussionId' | 'participantId' | 'emit'>,
  discussionId: string
): boolean {
  if (socket.discussionId === discussionId && socket.participantId) {
    return true;
  }

  socket.emit('error', {
    code: 'NOT_IN_DISCUSSION',
    message: 'Join this discussion before acting in it',
  });
  return false;
}

function getSecurityLevelFromRole(role: string): number {
  switch (role) {
    case 'admin':
      return 5;
    case 'operator':
      return 4;
    case 'moderator':
      return 3;
    case 'user':
      return 2;
    default:
      return 1;
  }
}

// Redis session manager cleanup
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, cleaning up Redis connections...');
  if (redisSessionManager) {
    await redisSessionManager.destroy();
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, cleaning up Redis connections...');
  if (redisSessionManager) {
    await redisSessionManager.destroy();
  }
});

function sanitizeMessageContent(content: string): string {
  // Basic content sanitization - remove potential script injections
  return content
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

// Periodic cleanup of expired Redis sessions
setInterval(
  async () => {
    if (redisSessionManager) {
      try {
        await redisSessionManager.cleanupExpiredSessions();

        // Log session statistics
        const stats = await redisSessionManager.getSessionStats();
        logger.debug('WebSocket session stats', stats);
      } catch (error) {
        logger.error('Failed to cleanup expired sessions', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  },
  5 * 60 * 1000
); // Run cleanup every 5 minutes
