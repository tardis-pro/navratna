import { uaipAPI } from '../utils/uaip-api';
import { Discussion, CreateDiscussionRequest, DiscussionMessage, MessageType, DiscussionStatus, TurnStrategy } from '@uaip/types';

export interface ChatSession {
  id: string;
  agentId: string;
  agentName: string;
  discussionId?: string;
  isPersistent: boolean;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
}

export interface PersistentChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'agent';
  senderName: string;
  timestamp: string;
  agentId?: string;
  messageType?: MessageType;
  confidence?: number;
  memoryEnhanced?: boolean;
  knowledgeUsed?: number;
  toolsExecuted?: Array<{
    toolId: string;
    toolName: string;
    success: boolean;
    result?: any;
    error?: string;
    timestamp: string;
  }>;
  metadata?: Record<string, any>;
}

export class ChatPersistenceService {
  private static instance: ChatPersistenceService;
  private chatSessions = new Map<string, ChatSession>();
  private messageCache = new Map<string, PersistentChatMessage[]>();

  private constructor() {
    this.loadChatSessions();
  }

  public static getInstance(): ChatPersistenceService {
    if (!ChatPersistenceService.instance) {
      ChatPersistenceService.instance = new ChatPersistenceService();
    }
    return ChatPersistenceService.instance;
  }

  /**
   * Create or retrieve a chat session for an agent
   */
  public async createChatSession(agentId: string, agentName: string, makePersistent = true, forceNew = false): Promise<ChatSession> {
    // If not forcing new, check for existing session
    if (!forceNew) {
      const existingSession = this.findSessionByAgent(agentId);
      if (existingSession) {
        existingSession.lastActivity = new Date();
        this.saveChatSessions();
        return existingSession;
      }
    }

    const session: ChatSession = {
      id: `chat-session-${Date.now()}-${agentId}`,
      agentId,
      agentName,
      isPersistent: makePersistent,
      createdAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0
    };

    if (makePersistent) {
      try {
        // Create discussion for persistent chat
        const discussionRequest: CreateDiscussionRequest = {
          title: `Chat with ${agentName}`,
          description: `Direct chat conversation with agent ${agentName}`,
          topic: 'agent-chat',
          createdBy: this.getCurrentUserId(),
          turnStrategy: {
            strategy: TurnStrategy.FREE_FORM,
            config: {
              type: 'free_form',
              cooldownPeriod: 5
            }
          },
          initialParticipants: [
            {
              agentId: agentId,
              role: 'participant'
            }
          ],
          settings: {
            allowAnonymous: false,
            requireModeration: false,
            maxParticipants: 2,
            allowGuestParticipants: false,
            autoArchiveAfter: 86400000, // 24 hours
            notificationSettings: {
              emailNotifications: false,
              pushNotifications: false,
              webhookUrl: undefined
            }
          }
        };

        const discussion = await uaipAPI.discussions.create(discussionRequest);
        session.discussionId = discussion.id;
        
        // Start the discussion
        await uaipAPI.discussions.start(discussion.id);
        
        console.log(`Created persistent chat discussion: ${discussion.id} for agent: ${agentName}`);
      } catch (error) {
        console.error('Failed to create persistent discussion, falling back to non-persistent:', error);
        session.isPersistent = false;
      }
    }

    this.chatSessions.set(session.id, session);
    this.saveChatSessions();
    return session;
  }

  /**
   * Get chat session by ID
   */
  public getChatSession(sessionId: string): ChatSession | undefined {
    return this.chatSessions.get(sessionId);
  }

  /**
   * Find chat session by agent ID
   */
  public findSessionByAgent(agentId: string): ChatSession | undefined {
    for (const session of this.chatSessions.values()) {
      if (session.agentId === agentId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Get all chat sessions
   */
  public getAllChatSessions(): ChatSession[] {
    return Array.from(this.chatSessions.values()).sort((a, b) => 
      b.lastActivity.getTime() - a.lastActivity.getTime()
    );
  }

  /**
   * Add message to chat session
   */
  public async addMessage(sessionId: string, message: PersistentChatMessage): Promise<void> {
    const session = this.chatSessions.get(sessionId);
    if (!session) {
      throw new Error(`Chat session not found: ${sessionId}`);
    }

    // Update session activity
    session.lastActivity = new Date();
    session.messageCount++;

    // Cache message locally
    const messages = this.messageCache.get(sessionId) || [];
    messages.push(message);
    this.messageCache.set(sessionId, messages);

    // Persist to discussion service if this is a persistent session
    if (session.isPersistent && session.discussionId) {
      try {
        await uaipAPI.discussions.sendMessage(session.discussionId, {
          content: message.content,
          messageType: message.messageType || MessageType.MESSAGE,
          metadata: {
            sender: message.sender,
            senderName: message.senderName,
            agentId: message.agentId,
            confidence: message.confidence,
            memoryEnhanced: message.memoryEnhanced,
            knowledgeUsed: message.knowledgeUsed,
            toolsExecuted: message.toolsExecuted,
            originalMessageId: message.id,
            ...message.metadata
          }
        });
      } catch (error) {
        console.error('Failed to persist message to discussion service:', error);
        // Continue with local storage only
      }
    }

    this.saveChatSessions();
  }

  /**
   * Get messages for a chat session
   */
  public async getMessages(sessionId: string, limit = 50, offset = 0): Promise<PersistentChatMessage[]> {
    const session = this.chatSessions.get(sessionId);
    if (!session) {
      throw new Error(`Chat session not found: ${sessionId}`);
    }

    // Check cache first
    const cachedMessages = this.messageCache.get(sessionId);
    if (cachedMessages && cachedMessages.length > 0) {
      return cachedMessages.slice(offset, offset + limit);
    }

    // Load from discussion service if persistent
    if (session.isPersistent && session.discussionId) {
      try {
        const discussionMessages = await uaipAPI.discussions.getMessages(session.discussionId, { limit, offset });
        
        // Transform discussion messages to chat messages
        const chatMessages: PersistentChatMessage[] = discussionMessages.map(msg => ({
          id: msg.metadata?.originalMessageId || msg.id,
          content: msg.content,
          sender: msg.metadata?.sender || (msg.metadata?.agentId ? 'agent' : 'user'),
          senderName: msg.metadata?.senderName || 'Unknown',
          timestamp: msg.createdAt || new Date().toISOString(),
          agentId: msg.metadata?.agentId,
          messageType: msg.messageType,
          confidence: msg.metadata?.confidence,
          memoryEnhanced: msg.metadata?.memoryEnhanced,
          knowledgeUsed: msg.metadata?.knowledgeUsed,
          toolsExecuted: msg.metadata?.toolsExecuted,
          metadata: msg.metadata
        }));

        // Cache the messages
        this.messageCache.set(sessionId, chatMessages);
        return chatMessages;
      } catch (error) {
        console.error('Failed to load messages from discussion service:', error);
        return [];
      }
    }

    return [];
  }

  /**
   * Delete chat session
   */
  public async deleteChatSession(sessionId: string): Promise<void> {
    const session = this.chatSessions.get(sessionId);
    if (!session) {
      return;
    }

    // End discussion if persistent
    if (session.isPersistent && session.discussionId) {
      try {
        await uaipAPI.discussions.end(session.discussionId);
      } catch (error) {
        console.error('Failed to end discussion:', error);
      }
    }

    // Remove from local storage
    this.chatSessions.delete(sessionId);
    this.messageCache.delete(sessionId);
    this.saveChatSessions();
  }

  /**
   * Convert in-memory chat to persistent
   */
  public async makePersistent(sessionId: string): Promise<void> {
    const session = this.chatSessions.get(sessionId);
    if (!session || session.isPersistent) {
      return;
    }

    const messages = this.messageCache.get(sessionId) || [];
    
    try {
      // Create discussion
      const discussionRequest: CreateDiscussionRequest = {
        title: `Chat with ${session.agentName}`,
        description: `Direct chat conversation with agent ${session.agentName}`,
        topic: 'agent-chat',
        createdBy: this.getCurrentUserId(),
        turnStrategy: {
          strategy: 'FREE_FORM',
          config: {
            type: 'free_form',
            cooldownPeriod: 5
          }
        },
        initialParticipants: [
          {
            agentId: session.agentId,
            role: 'participant'
          }
        ],
        settings: {
          allowAnonymous: false,
          requireModeration: false,
          maxParticipants: 2,
          allowGuestParticipants: false,
          autoArchiveAfter: 86400000,
          notificationSettings: {
            emailNotifications: false,
            pushNotifications: false,
            webhookUrl: undefined
          }
        }
      };

      const discussion = await uaipAPI.discussions.create(discussionRequest);
      session.discussionId = discussion.id;
      session.isPersistent = true;

      // Start discussion
      await uaipAPI.discussions.start(discussion.id);

      // Migrate existing messages
      for (const message of messages) {
        await uaipAPI.discussions.sendMessage(discussion.id, {
          content: message.content,
          messageType: message.messageType || MessageType.MESSAGE,
          metadata: {
            sender: message.sender,
            senderName: message.senderName,
            agentId: message.agentId,
            confidence: message.confidence,
            memoryEnhanced: message.memoryEnhanced,
            knowledgeUsed: message.knowledgeUsed,
            toolsExecuted: message.toolsExecuted,
            originalMessageId: message.id,
            migrated: true,
            ...message.metadata
          }
        });
      }

      this.saveChatSessions();
      console.log(`Converted chat session to persistent: ${discussion.id}`);
    } catch (error) {
      console.error('Failed to make chat persistent:', error);
      throw error;
    }
  }

  /**
   * Get current user ID
   */
  private getCurrentUserId(): string {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('userId') || sessionStorage.getItem('userId') || 'anonymous';
    }
    return 'anonymous';
  }

  /**
   * Load chat sessions from localStorage
   */
  private loadChatSessions(): void {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('uaip-chat-sessions');
        if (stored) {
          const sessions = JSON.parse(stored);
          for (const sessionData of sessions) {
            const session: ChatSession = {
              ...sessionData,
              createdAt: new Date(sessionData.createdAt),
              lastActivity: new Date(sessionData.lastActivity)
            };
            this.chatSessions.set(session.id, session);
          }
        }
      } catch (error) {
        console.error('Failed to load chat sessions:', error);
      }
    }
  }

  /**
   * Save chat sessions to localStorage
   */
  private saveChatSessions(): void {
    if (typeof window !== 'undefined') {
      try {
        const sessions = Array.from(this.chatSessions.values());
        localStorage.setItem('uaip-chat-sessions', JSON.stringify(sessions));
      } catch (error) {
        console.error('Failed to save chat sessions:', error);
      }
    }
  }
}

export const chatPersistenceService = ChatPersistenceService.getInstance();