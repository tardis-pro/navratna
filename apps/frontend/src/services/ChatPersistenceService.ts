// Deprecated: This service is being replaced by direct backend API calls
// TODO: Update remaining components to use discussionsAPI directly

import { discussionsAPI } from '../api/discussions.api';
import { Discussion, CreateDiscussionRequest, TurnStrategy, MessageType } from '@uaip/types';

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

  private constructor() {}

  public static getInstance(): ChatPersistenceService {
    if (!ChatPersistenceService.instance) {
      ChatPersistenceService.instance = new ChatPersistenceService();
    }
    return ChatPersistenceService.instance;
  }

  /**
   * @deprecated Use discussionsAPI.create() and discussionsAPI.start() instead
   */
  public async createChatSession(
    agentId: string,
    agentName: string,
    makePersistent = true
  ): Promise<ChatSession> {
    console.warn(
      'ChatPersistenceService.createChatSession is deprecated. Use discussionsAPI.create() instead.'
    );

    const discussionRequest: CreateDiscussionRequest = {
      title: `Chat with ${agentName}`,
      description: `Direct chat conversation with agent ${agentName}`,
      topic: `Direct chat conversation with agent ${agentName}`,
      objectives: ['agent-chat'],
      initialParticipants: [
        {
          agentId: agentId,
          role: 'participant',
        },
      ],
      turnStrategy: {
        strategy: TurnStrategy.FREE_FORM,
        config: {
          type: 'free_form',
          cooldownPeriod: 5,
        },
      },
      settings: {
        maxParticipants: 2,
        maxDuration: 1440, // 24 hours in minutes
        autoModeration: false,
        requireApproval: false,
        allowInvites: false,
        allowFileSharing: true,
        allowAnonymous: false,
        recordTranscript: true,
        enableAnalytics: true,
        turnTimeout: 300,
        responseTimeout: 60,
        moderationRules: [],
      },
      metadata: {
        chatType: 'agent-chat',
        agentId: agentId,
        agentName: agentName,
        createdBy: 'current-user',
      },
    };

    const discussion = await discussionsAPI.create(discussionRequest);
    await discussionsAPI.start(discussion.id);

    const session: ChatSession = {
      id: discussion.id,
      agentId,
      agentName,
      discussionId: discussion.id,
      isPersistent: makePersistent,
      createdAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
    };

    return session;
  }

  /**
   * @deprecated Use discussionsAPI.getMessages() instead
   */
  public async getMessages(
    sessionId: string,
    limit = 50,
    offset = 0
  ): Promise<PersistentChatMessage[]> {
    console.warn(
      'ChatPersistenceService.getMessages is deprecated. Use discussionsAPI.getMessages() instead.'
    );

    try {
      const discussionMessages = await discussionsAPI.getMessages(sessionId, { limit, offset });

      return discussionMessages.map((msg) => ({
        id: msg.id,
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
        metadata: msg.metadata,
      }));
    } catch (error) {
      console.error('Failed to load messages from discussion service:', error);
      return [];
    }
  }

  /**
   * @deprecated Use discussionsAPI.list() instead
   */
  public async getAllSessions(): Promise<ChatSession[]> {
    console.warn(
      'ChatPersistenceService.getAllSessions is deprecated. Use discussionsAPI.list() instead.'
    );

    try {
      const discussions = await discussionsAPI.list({
        limit: 100,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });

      return discussions
        .filter((discussion) => discussion.metadata?.chatType === 'agent-chat')
        .map((discussion) => ({
          id: discussion.id,
          agentId: discussion.metadata?.agentId || '',
          agentName: discussion.metadata?.agentName || 'Unknown Agent',
          discussionId: discussion.id,
          isPersistent: true,
          createdAt: new Date(discussion.createdAt),
          lastActivity: new Date(discussion.updatedAt),
          messageCount: discussion.messageCount || 0,
        }));
    } catch (error) {
      console.error('Failed to load discussions:', error);
      return [];
    }
  }

  /**
   * @deprecated Use discussionsAPI.list() instead
   */
  public getAllChatSessions(): ChatSession[] {
    console.warn(
      'ChatPersistenceService.getAllChatSessions is deprecated. Use discussionsAPI.list() instead.'
    );
    // This is a synchronous method, so we can't easily convert it to async
    // Return empty array for now
    return [];
  }

  /**
   * @deprecated Use discussionsAPI.end() instead
   */
  public async deleteChatSession(sessionId: string): Promise<void> {
    console.warn(
      'ChatPersistenceService.deleteChatSession is deprecated. Use discussionsAPI.end() instead.'
    );

    try {
      await discussionsAPI.end(sessionId);
    } catch (error) {
      console.error('Failed to end discussion:', error);
    }
  }

  /**
   * @deprecated No longer needed - backend handles all persistence
   */
  public async clearSession(sessionId: string): Promise<void> {
    console.warn(
      'ChatPersistenceService.clearSession is deprecated. No action needed - backend handles all persistence.'
    );
    // No action needed - backend handles all persistence
  }

  /**
   * @deprecated Use discussionsAPI.sendMessage() instead
   */
  public async addMessage(sessionId: string, message: PersistentChatMessage): Promise<void> {
    console.warn(
      'ChatPersistenceService.addMessage is deprecated. Use discussionsAPI.sendMessage() instead.'
    );

    try {
      await discussionsAPI.sendMessage(sessionId, {
        content: message.content,
        metadata: {
          sender: message.sender,
          senderName: message.senderName,
          agentId: message.agentId,
          confidence: message.confidence,
          memoryEnhanced: message.memoryEnhanced,
          knowledgeUsed: message.knowledgeUsed,
          toolsExecuted: message.toolsExecuted,
          originalMessageId: message.id,
          ...message.metadata,
        },
      });
    } catch (error) {
      console.error('Failed to persist message to discussion service:', error);
    }
  }

  /**
   * @deprecated Use discussionsAPI.get() instead
   */
  public getChatSession(sessionId: string): ChatSession | undefined {
    console.warn(
      'ChatPersistenceService.getChatSession is deprecated. Use discussionsAPI.get() instead.'
    );
    // This is a synchronous method, so we can't easily convert it to async
    return undefined;
  }

  /**
   * @deprecated Use discussionsAPI.list() with agent filter instead
   */
  public findSessionByAgent(agentId: string): ChatSession | undefined {
    console.warn(
      'ChatPersistenceService.findSessionByAgent is deprecated. Use discussionsAPI.list() with agent filter instead.'
    );
    // This is a synchronous method, so we can't easily convert it to async
    return undefined;
  }
}

export const chatPersistenceService = ChatPersistenceService.getInstance();
