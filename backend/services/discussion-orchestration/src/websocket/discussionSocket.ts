import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger, ApiError } from '@uaip/utils';
import { DiscussionOrchestrationService } from '../services/discussionOrchestrationService.js';
import { DiscussionEvent, DiscussionEventType, MessageType } from '@uaip/types';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { config } from '@uaip/config';
import { authMiddleware, testJWTToken } from '@uaip/middleware';
import { RedisSessionManager } from './redis-session-manager.js';

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

interface SocketData {
  userId: string;
  participantId?: string;
  discussionId?: string;
  sessionId?: string;
  securityLevel?: number;
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

const StartDiscussionSchema = z.object({
  discussionId: z.string().uuid('Discussion ID must be a valid UUID'),
  startedBy: z.string().uuid('User ID must be a valid UUID').optional(),
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
    db: 2, // Use separate DB for WebSocket sessions
  });

  // Enhanced authentication middleware with proper JWT validation
  io.use((socket: AuthenticatedSocket, next) => {
    try {
      // Extract token from multiple possible sources
      let token = socket.handshake.auth?.token;

      if (!token && socket.handshake.headers.authorization) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }
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

      // Validate JWT token using existing auth infrastructure
      const tokenValidation = testJWTToken(token);

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

      if (!payload || !payload.userId) {
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
      const mockConnection = {
        connectionId: socket.sessionId,
        userId: payload.userId,
        discussionId: '', // Will be set when joining discussion
        authenticated: true,
        securityLevel: socket.securityLevel,
        messageCount: 0,
        lastActivity: new Date(),
        rateLimitReset: Date.now() + 60000,
      } as any;

      // Store session in Redis (without discussion ID initially) - async operation
      redisSessionManager
        .createSession(
          mockConnection,
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
    socket.onAny((eventName: string, ...args: any[]) => {
      logger.info('🎯 WebSocket event received', {
        socketId: socket.id,
        userId: socket.userId,
        eventName,
        data: args[0],
        totalArgs: args.length,
      });
    });

    // Join discussion room with enhanced validation
    socket.on('join_discussion', async (data: any) => {
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
        await socket.join(`discussion:${discussionId}`);
        socket.discussionId = discussionId;

        // Get participant info
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

        // Notify others that user joined
        socket.to(`discussion:${discussionId}`).emit('participant_joined', {
          participantId: socket.participantId,
          userId: socket.userId,
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
    socket.on('start_discussion', async (data: any) => {
      try {
        // Update activity timestamp
        socket.lastActivity = new Date();

        // Validate input data
        const validatedData = StartDiscussionSchema.parse(data);
        const { discussionId, startedBy } = validatedData;

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
          startedBy: startedBy || socket.userId,
        });

        // Start the discussion using orchestration service
        const result = await orchestrationService.startDiscussion(
          discussionId,
          startedBy || socket.userId!
        );

        if (result.success) {
          // Notify all participants that discussion has started
          socket.to(`discussion:${discussionId}`).emit('discussion_started', {
            discussionId,
            startedBy: startedBy || socket.userId,
            timestamp: new Date(),
            participants: result.data?.state?.activeParticipants || 0,
          });

          // Confirm to the starter
          socket.emit('discussion_started', {
            discussionId,
            startedBy: startedBy || socket.userId,
            timestamp: new Date(),
            participants: result.data?.state?.activeParticipants || 0,
            success: true,
          });

          logger.info('Discussion started successfully via WebSocket', {
            socketId: socket.id,
            userId: socket.userId,
            discussionId,
            activeParticipants: result.data?.state?.activeParticipants,
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
    socket.on('pause_discussion', async (data: any) => {
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

        const result = await orchestrationService.pauseDiscussion(discussionId, socket.userId!);

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
    socket.on('resume_discussion', async (data: any) => {
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

        const result = await orchestrationService.resumeDiscussion(discussionId, socket.userId!);

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
    socket.on('stop_discussion', async (data: any) => {
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

        await socket.leave(`discussion:${discussionId}`);

        // Notify others that user left
        socket.to(`discussion:${discussionId}`).emit('participant_left', {
          participantId: socket.participantId,
          userId: socket.userId,
          timestamp: new Date(),
        });

        socket.discussionId = undefined;
        socket.participantId = undefined;

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
    socket.on('send_message', async (data: any) => {
      try {
        // Update activity and check rate limits
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
        const validatedData = SendMessageSchema.parse(data);
        const { discussionId, content, messageType, replyToId, threadId } = validatedData;

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

        // Broadcast message to all participants in the discussion
        io.to(`discussion:${discussionId}`).emit('message_received', {
          message: message.data,
          timestamp: new Date(),
        });

        logger.info('Message sent via socket', {
          socketId: socket.id,
          discussionId,
          messageId: message.data?.id,
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
    socket.on('typing_start', async (data: any) => {
      try {
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

        const validatedData = TypingSchema.parse(data);

        if (socket.participantId) {
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

    socket.on('typing_stop', (data: any) => {
      try {
        socket.lastActivity = new Date();

        const validatedData = TypingSchema.parse(data);

        if (socket.participantId) {
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
    socket.on('request_turn', async (data: any) => {
      try {
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

        const validatedData = TypingSchema.parse(data); // Reuse schema since it has same structure

        if (!socket.participantId) {
          socket.emit('error', {
            code: 'NOT_IN_DISCUSSION',
            message: 'Must join discussion first',
          });
          return;
        }

        const result = await orchestrationService.requestTurn(
          validatedData.discussionId,
          socket.participantId
        );

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
        if (!socket.participantId) {
          socket.emit('error', { message: 'Must join discussion first' });
          return;
        }

        const result = await orchestrationService.endTurn(data.discussionId, socket.participantId);

        // Notify all participants about turn end
        io.to(`discussion:${data.discussionId}`).emit('turn_ended', {
          participantId: socket.participantId,
          userId: socket.userId,
          timestamp: new Date(),
          nextParticipant: result.data?.nextParticipant,
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
    socket.on('add_reaction', async (data: any) => {
      try {
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

        const validatedData = ReactionSchema.parse(data);

        if (!socket.participantId) {
          socket.emit('error', {
            code: 'NOT_IN_DISCUSSION',
            message: 'Must join discussion first',
          });
          return;
        }

        const reaction = await orchestrationService.addReaction(
          validatedData.discussionId,
          validatedData.messageId,
          socket.participantId,
          validatedData.emoji
        );

        // Broadcast reaction to all participants
        io.to(`discussion:${validatedData.discussionId}`).emit('reaction_added', {
          messageId: validatedData.messageId,
          reaction,
          timestamp: new Date(),
        });
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
