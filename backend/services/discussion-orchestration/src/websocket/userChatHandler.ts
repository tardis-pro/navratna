import { Server, Socket } from 'socket.io';
import { createLogger } from '@uaip/utils';
import { validateJWTToken } from '@uaip/middleware';
import { EventBusService } from '@uaip/shared-services';

interface UserMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'file' | 'system';
  status: 'sending' | 'sent' | 'delivered' | 'read';
  metadata?: Record<string, any>;
}

interface CallSignaling {
  type: 'call_offer' | 'call_answer' | 'ice_candidate' | 'call_end';
  callId: string;
  callerId: string;
  targetUserId: string;
  data: any;
}

interface ConnectedUser {
  userId: string;
  socketId: string;
  username: string;
  status: 'online' | 'busy' | 'away';
  lastActivity: Date;
}

export class UserChatHandler {
  private io: Server;
  private eventBusService: EventBusService;
  private connectedUsers: Map<string, ConnectedUser> = new Map();
  private userSockets: Map<string, string> = new Map(); // userId -> socketId
  private logger = createLogger({
    serviceName: 'UserChatHandler',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  });

  constructor(io: Server, eventBusService: EventBusService) {
    this.io = io;
    this.eventBusService = eventBusService;
    this.setupEventHandlers();
    this.setupEventBusSubscriptions();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: Socket) => {
      socket.on('user_connect', (data) => this.handleUserConnect(socket, data));
      socket.on('user_message', (data) => this.handleUserMessage(socket, data));
      socket.on('agent_chat', (data) => this.handleAgentChat(socket, data));
      socket.on('chat_window_closed', (data) => this.handleChatWindowClosed(socket, data));
      socket.on('call_offer', (data) => this.handleCallSignaling(socket, { ...data, type: 'call_offer' }));
      socket.on('call_answer', (data) => this.handleCallSignaling(socket, { ...data, type: 'call_answer' }));
      socket.on('ice_candidate', (data) => this.handleCallSignaling(socket, { ...data, type: 'ice_candidate' }));
      socket.on('call_end', (data) => this.handleCallSignaling(socket, { ...data, type: 'call_end' }));
      socket.on('user_typing', (data) => this.handleUserTyping(socket, data));
      socket.on('user_status_change', (data) => this.handleStatusChange(socket, data));
      socket.on('disconnect', () => this.handleUserDisconnect(socket));
    });
  }

  private async handleUserConnect(socket: Socket, data: { token: string; username: string }) {
    try {
      // Validate JWT token
      const decoded = await validateJWTToken(data.token);
      if (!decoded || !decoded.userId) {
        socket.emit('auth_error', { error: 'Invalid authentication token' });
        return;
      }

      const user: ConnectedUser = {
        userId: decoded.userId,
        socketId: socket.id,
        username: data.username || decoded.username || 'Unknown',
        status: 'online',
        lastActivity: new Date()
      };

      // Store user connection
      this.connectedUsers.set(socket.id, user);
      this.userSockets.set(user.userId, socket.id);

      // Join user to their personal room
      socket.join(`user_${user.userId}`);

      // Notify other users of new connection
      socket.broadcast.emit('user_connected', {
        userId: user.userId,
        username: user.username,
        status: user.status
      });

      // Send current online users list
      const onlineUsers = Array.from(this.connectedUsers.values())
        .map(u => ({
          userId: u.userId,
          username: u.username,
          status: u.status,
          lastActivity: u.lastActivity
        }));

      socket.emit('users_list', { users: onlineUsers });

      this.logger.info(`User connected: ${user.username} (${user.userId})`);
    } catch (error) {
      this.logger.error('User connection failed:', error);
      socket.emit('auth_error', { error: 'Authentication failed' });
    }
  }

  private async handleUserMessage(socket: Socket, data: { targetUser: string; message: UserMessage }) {
    try {
      const sender = this.connectedUsers.get(socket.id);
      if (!sender) {
        socket.emit('error', { error: 'User not authenticated' });
        return;
      }

      const { targetUser, message } = data;
      const targetSocketId = this.userSockets.get(targetUser);

      // Validate message
      if (!message.content || !targetUser) {
        socket.emit('error', { error: 'Invalid message data' });
        return;
      }

      // Create complete message object
      const completeMessage: UserMessage = {
        ...message,
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        senderId: sender.userId,
        receiverId: targetUser,
        timestamp: new Date(),
        status: 'sent'
      };

      // Send to target user if online
      if (targetSocketId) {
        this.io.to(`user_${targetUser}`).emit('user_message', {
          type: 'user_message',
          data: completeMessage
        });
        
        // Update message status to delivered
        completeMessage.status = 'delivered';
      }

      // Confirm to sender
      socket.emit('message_sent', {
        messageId: completeMessage.id,
        status: completeMessage.status,
        timestamp: completeMessage.timestamp
      });

      // TODO: Store message in database for offline delivery
      await this.storeMessage(completeMessage);

      this.logger.info(`Message sent from ${sender.username} to ${targetUser}`);
    } catch (error) {
      this.logger.error('Failed to handle user message:', error);
      socket.emit('error', { error: 'Failed to send message' });
    }
  }

  private async handleCallSignaling(socket: Socket, data: CallSignaling) {
    try {
      const sender = this.connectedUsers.get(socket.id);
      if (!sender) {
        socket.emit('error', { error: 'User not authenticated' });
        return;
      }

      const { targetUserId, type, data: signalData } = data;
      const targetSocketId = this.userSockets.get(targetUserId);

      if (targetSocketId) {
        // Forward signaling data to target user
        this.io.to(`user_${targetUserId}`).emit('call_signaling', {
          type,
          data: {
            ...signalData,
            callerId: sender.userId,
            callerName: sender.username
          }
        });

        this.logger.info(`Call signaling (${type}) from ${sender.username} to ${targetUserId}`);
      } else {
        // Target user offline
        socket.emit('call_error', { 
          error: 'Target user is not available',
          targetUserId 
        });
      }
    } catch (error) {
      this.logger.error('Failed to handle call signaling:', error);
      socket.emit('error', { error: 'Call signaling failed' });
    }
  }

  private handleUserTyping(socket: Socket, data: { targetUser: string; isTyping: boolean }) {
    try {
      const sender = this.connectedUsers.get(socket.id);
      if (!sender) return;

      const { targetUser, isTyping } = data;
      const targetSocketId = this.userSockets.get(targetUser);

      if (targetSocketId) {
        this.io.to(`user_${targetUser}`).emit('user_typing', {
          userId: sender.userId,
          username: sender.username,
          isTyping
        });
      }
    } catch (error) {
      this.logger.error('Failed to handle typing indicator:', error);
    }
  }

  private handleStatusChange(socket: Socket, data: { status: 'online' | 'busy' | 'away' }) {
    try {
      const user = this.connectedUsers.get(socket.id);
      if (!user) return;

      user.status = data.status;
      user.lastActivity = new Date();

      // Broadcast status change to all users
      socket.broadcast.emit('user_status_changed', {
        userId: user.userId,
        username: user.username,
        status: user.status,
        lastActivity: user.lastActivity
      });

      this.logger.info(`User ${user.username} changed status to ${data.status}`);
    } catch (error) {
      this.logger.error('Failed to handle status change:', error);
    }
  }

  private handleUserDisconnect(socket: Socket) {
    try {
      const user = this.connectedUsers.get(socket.id);
      if (!user) return;

      // Remove from connected users
      this.connectedUsers.delete(socket.id);
      this.userSockets.delete(user.userId);

      // Notify other users of disconnection
      socket.broadcast.emit('user_disconnected', {
        userId: user.userId,
        username: user.username
      });

      this.logger.info(`User disconnected: ${user.username} (${user.userId})`);
    } catch (error) {
      this.logger.error('Failed to handle user disconnect:', error);
    }
  }

  private async storeMessage(message: UserMessage): Promise<void> {
    try {
      // Store in database for offline delivery and history
      // This will be implemented based on your database schema
      // For now, we'll just log the message storage
      this.logger.debug(`Message stored: ${message.id}`, {
        senderId: message.senderId,
        receiverId: message.receiverId,
        content: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
        timestamp: message.timestamp,
        status: message.status
      });
      
      // TODO: Implement actual database storage
      // await this.databaseService.messages.create({
      //   id: message.id,
      //   senderId: message.senderId,
      //   receiverId: message.receiverId,
      //   content: message.content,
      //   timestamp: message.timestamp,
      //   type: message.type,
      //   status: message.status,
      //   metadata: message.metadata
      // });
    } catch (error) {
      this.logger.error('Failed to store message:', error);
    }
  }

  private async handleChatWindowClosed(socket: Socket, data: any) {
    try {
      // Get user info from socket.data (set by Socket.IO authentication middleware)
      const socketUser = socket.data?.user;
      if (!socketUser || !socketUser.userId) {
        socket.emit('error', { error: 'User not authenticated' });
        this.logger.warn('Chat window closed attempted without authentication', { socketId: socket.id });
        return;
      }

      const { agentId, sessionId, conversationId, timestamp } = data;

      this.logger.info('Processing chat window closure', { 
        userId: socketUser.userId, 
        agentId, 
        sessionId,
        conversationId,
        socketId: socket.id
      });

      // Publish chat window closed event to event bus for cleanup
      await this.publishToEventBus('chat.window.closed', {
        userId: socketUser.userId,
        agentId,
        sessionId,
        conversationId,
        timestamp: timestamp || new Date().toISOString(),
        socketId: socket.id
      });

      // Send acknowledgment to client
      socket.emit('chat_window_closed_ack', {
        agentId,
        sessionId,
        timestamp: new Date().toISOString()
      });

      this.logger.info('Chat window closure processed successfully', { 
        agentId, 
        sessionId,
        userId: socketUser.userId
      });

    } catch (error) {
      this.logger.error('Chat window closure handling error:', error);
      socket.emit('error', { error: 'Chat window closure processing failed' });
    }
  }

  private async handleAgentChat(socket: Socket, data: any) {
    try {
      // Get user info from socket.data (set by Socket.IO authentication middleware)
      const socketUser = socket.data?.user;
      if (!socketUser || !socketUser.userId) {
        socket.emit('error', { error: 'User not authenticated' });
        this.logger.warn('Agent chat attempted without authentication', { socketId: socket.id });
        return;
      }

      const { agentId, message, conversationHistory, context, messageId } = data;

      // Validate agent chat payload
      if (!agentId || !message || typeof message !== 'string' || message.length === 0) {
        socket.emit('error', { error: 'Invalid agent chat payload' });
        return;
      }

      this.logger.info('Processing agent chat request via Socket.IO', { 
        userId: socketUser.userId, 
        agentId, 
        messageLength: message.length,
        socketId: socket.id
      });

      // Forward agent chat request to agent intelligence service via event bus
      const chatRequest = {
        userId: socketUser.userId,
        agentId,
        message,
        conversationHistory: conversationHistory || [],
        context: context || {},
        messageId: messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        socketId: socket.id // Include socket ID for direct response
      };

      // Use event bus to forward to agent intelligence service
      // This will be handled by the enterprise WebSocket handler's event bus subscriptions
      await this.publishToEventBus('agent.chat.request', chatRequest);

      // Send acknowledgment to client
      socket.emit('agent_chat_received', {
        messageId: chatRequest.messageId,
        agentId,
        timestamp: chatRequest.timestamp
      });

      this.logger.info('Agent chat request forwarded successfully', { 
        agentId, 
        messageId: chatRequest.messageId,
        userId: socketUser.userId
      });

    } catch (error) {
      this.logger.error('Agent chat handling error:', error);
      socket.emit('error', { error: 'Agent chat processing failed' });
    }
  }

  private async publishToEventBus(eventType: string, data: any): Promise<void> {
    try {
      await this.eventBusService.publish(eventType, data);
      this.logger.debug(`Event published successfully: ${eventType}`, data);
    } catch (error) {
      this.logger.error(`Failed to publish event: ${eventType}`, { error, data });
      throw error;
    }
  }

  private setupEventBusSubscriptions(): void {
    // Subscribe to agent chat responses to forward them back to Socket.IO clients
    this.eventBusService.subscribe('agent.chat.response', async (event) => {
      const { socketId, agentId, response, agentName, messageId, ...metadata } = event.data;
      
      // Find the socket by ID and send the response
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('agent_response', {
          agentId,
          response,
          agentName,
          messageId,
          timestamp: new Date().toISOString(),
          ...metadata
        });
        
        this.logger.info('Agent response forwarded to Socket.IO client', { 
          socketId, 
          agentId, 
          agentName,
          messageId
        });
      } else {
        this.logger.warn('Socket not found for agent response', { 
          socketId, 
          agentId,
          messageId
        });
      }
    });

    this.logger.info('UserChatHandler event bus subscriptions established');
  }

  // Public methods for external access
  public getConnectedUsers(): ConnectedUser[] {
    return Array.from(this.connectedUsers.values());
  }

  public getUserStatus(userId: string): ConnectedUser | null {
    const socketId = this.userSockets.get(userId);
    return socketId ? this.connectedUsers.get(socketId) || null : null;
  }

  public isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  public sendSystemMessage(userId: string, message: string): void {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.io.to(`user_${userId}`).emit('system_message', {
        content: message,
        timestamp: new Date()
      });
    }
  }
}