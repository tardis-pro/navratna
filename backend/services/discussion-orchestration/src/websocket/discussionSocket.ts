import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger, ApiError } from '@uaip/utils';
import { DiscussionOrchestrationService } from '@/services/discussionOrchestrationService';
import { 
  DiscussionEvent, 
  DiscussionEventType,
  MessageType 
} from '@uaip/types';

interface AuthenticatedSocket extends Socket {
  userId?: string;
   participantId?: number;
  discussionId?: string;
}

interface SocketData {
  userId: number;
   participantId?: number;
  discussionId?: string;
}

export function setupWebSocketHandlers(
  io: SocketIOServer, 
  orchestrationService: DiscussionOrchestrationService
): void {
  
  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // TODO: Validate token and extract user info
      // For now, we'll extract from the token directly
      const userId = socket.handshake.auth.userId;
      
      if (!userId) {
        return next(new Error('Invalid authentication token'));
      }

      socket.userId = userId;
      logger.debug('Socket authenticated', { 
        socketId: socket.id, 
        userId 
      });
      
      next();
    } catch (error) {
      logger.error('Socket authentication failed', {
        socketId: socket.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info('Client connected to discussion socket', {
      socketId: socket.id,
      userId: socket.userId
    });

    // Join discussion room
    socket.on('join_discussion', async (data: { discussionId: number }) => {
      try {
        const { discussionId } = data;
        
        if (!discussionId) {
          socket.emit('error', { message: 'Discussion ID is required' });
          return;
        }

        // Verify user has access to this discussion
        const hasAccess = await orchestrationService.verifyParticipantAccess(
          discussionId, 
          socket.userId!
        );

        if (!hasAccess) {
          socket.emit('error', { message: 'Access denied to discussion' });
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
          participantId: socket.participantId
        });

        // Notify others that user joined
        socket.to(`discussion:${discussionId}`).emit('participant_joined', {
          participantId: socket.participantId,
          userId: socket.userId,
          timestamp: new Date()
        });

        logger.info('User joined discussion room', {
          socketId: socket.id,
          userId: socket.userId,
          discussionId,
          participantId: socket.participantId
        });

      } catch (error) {
        logger.error('Failed to join discussion', {
          socketId: socket.id,
          userId: socket.userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        socket.emit('error', { message: 'Failed to join discussion' });
      }
    });

    // Leave discussion room
    socket.on('leave_discussion', async (data: { discussionId: number }) => {
      try {
        const { discussionId } = data;
        
        await socket.leave(`discussion:${discussionId}`);
        
        // Notify others that user left
        socket.to(`discussion:${discussionId}`).emit('participant_left', {
          participantId: socket.participantId,
          userId: socket.userId,
          timestamp: new Date()
        });

        socket.discussionId = undefined;
        socket.participantId = undefined;

        socket.emit('left_discussion', { discussionId });

        logger.info('User left discussion room', {
          socketId: socket.id,
          userId: socket.userId,
          discussionId
        });

      } catch (error) {
        logger.error('Failed to leave discussion', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Send message
    socket.on('send_message', async (data: {
      discussionId: number;
      content: string;
      messageType?: MessageType;
      replyToId?: string;
      threadId?: string;
    }) => {
      try {
        const { discussionId, content, messageType, replyToId, threadId } = data;

        if (!socket.participantId) {
          socket.emit('error', { message: 'Must join discussion first' });
          return;
        }

        const message = await orchestrationService.sendMessage(
          discussionId,
          socket.participantId,
          content,
          messageType || MessageType.MESSAGE,
          { replyToId, threadId }
        );

        // Broadcast message to all participants in the discussion
        io.to(`discussion:${discussionId}`).emit('message_received', {
          message: message.data,
          timestamp: new Date()
        });

        logger.info('Message sent via socket', {
          socketId: socket.id,
          discussionId,
          messageId: message.data?.id,
          participantId: socket.participantId
        });

      } catch (error) {
        logger.error('Failed to send message via socket', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicators
    socket.on('typing_start', (data: { discussionId: number }) => {
      if (socket.participantId) {
        socket.to(`discussion:${data.discussionId}`).emit('user_typing', {
          participantId: socket.participantId,
          userId: socket.userId,
          timestamp: new Date()
        });
      }
    });

    socket.on('typing_stop', (data: { discussionId: number }) => {
      if (socket.participantId) {
        socket.to(`discussion:${data.discussionId}`).emit('user_stopped_typing', {
          participantId: socket.participantId,
          userId: socket.userId,
          timestamp: new Date()
        });
      }
    });

    // Turn management
    socket.on('request_turn', async (data: { discussionId: number }) => {
      try {
        if (!socket.participantId) {
          socket.emit('error', { message: 'Must join discussion first' });
          return;
        }

        const result = await orchestrationService.requestTurn(
          data.discussionId,
          socket.participantId
        );

        // Notify all participants about turn request
        io.to(`discussion:${data.discussionId}`).emit('turn_requested', {
          participantId: socket.participantId,
          userId: socket.userId,
          timestamp: new Date(),
          result
        });

      } catch (error) {
        logger.error('Failed to request turn', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        socket.emit('error', { message: 'Failed to request turn' });
      }
    });

    socket.on('end_turn', async (data: { discussionId: number }) => {
      try {
        if (!socket.participantId) {
          socket.emit('error', { message: 'Must join discussion first' });
          return;
        }

        const result = await orchestrationService.endTurn(
          data.discussionId,
          socket.participantId
        );

        // Notify all participants about turn end
        io.to(`discussion:${data.discussionId}`).emit('turn_ended', {
          participantId: socket.participantId,
          userId: socket.userId,
          timestamp: new Date(),
          nextParticipant: result.data?.nextParticipant
        });

      } catch (error) {
        logger.error('Failed to end turn', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        socket.emit('error', { message: 'Failed to end turn' });
      }
    });

    // Reactions
    socket.on('add_reaction', async (data: {
      discussionId: number;
      messageId: number;
      emoji: string;
    }) => {
      try {
        if (!socket.participantId) {
          socket.emit('error', { message: 'Must join discussion first' });
          return;
        }

        const reaction = await orchestrationService.addReaction(
          data.discussionId,
          data.messageId,
          socket.participantId,
          data.emoji
        );

        // Broadcast reaction to all participants
        io.to(`discussion:${data.discussionId}`).emit('reaction_added', {
          messageId: data.messageId,
          reaction,
          timestamp: new Date()
        });

      } catch (error) {
        logger.error('Failed to add reaction', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        socket.emit('error', { message: 'Failed to add reaction' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected from discussion socket', {
        socketId: socket.id,
        userId: socket.userId,
        discussionId: socket.discussionId,
        reason
      });

      // Notify discussion participants if user was in a discussion
      if (socket.discussionId && socket.participantId) {
        socket.to(`discussion:${socket.discussionId}`).emit('participant_disconnected', {
          participantId: socket.participantId,
          userId: socket.userId,
          timestamp: new Date()
        });
      }
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error('Socket error', {
        socketId: socket.id,
        userId: socket.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
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