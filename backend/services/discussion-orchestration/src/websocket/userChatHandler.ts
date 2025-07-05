import { Server, Socket } from 'socket.io';
import { createLogger } from '@uaip/utils';
import { validateJWTToken } from '@uaip/middleware';

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
  private connectedUsers: Map<string, ConnectedUser> = new Map();
  private userSockets: Map<string, string> = new Map(); // userId -> socketId
  private logger = createLogger({
    serviceName: 'UserChatHandler',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  });

  constructor(io: Server) {
    this.io = io;
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: Socket) => {
      socket.on('user_connect', (data) => this.handleUserConnect(socket, data));
      socket.on('user_message', (data) => this.handleUserMessage(socket, data));
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
    // TODO: Implement database storage for message persistence
    // This would integrate with your existing database service
    try {
      // Store in database for offline delivery and history
      this.logger.debug(`Message stored: ${message.id}`);
    } catch (error) {
      this.logger.error('Failed to store message:', error);
    }
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