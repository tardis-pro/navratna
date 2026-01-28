import { FindManyOptions, Between, MoreThan } from 'typeorm';
import { BaseRepository } from '../base/BaseRepository.js';
import {
  UserMessageEntity,
  MessageType,
  MessageStatus,
} from '../../entities/user-message.entity.js';

export class UserMessageRepository extends BaseRepository<UserMessageEntity> {
  constructor() {
    super(UserMessageEntity);
  }

  async create(messageData: Partial<UserMessageEntity>): Promise<UserMessageEntity> {
    const message = this.repository.create(messageData);
    return await this.repository.save(message);
  }

  async findById(id: string): Promise<UserMessageEntity | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['sender', 'receiver'],
    });
  }

  async findConversationMessages(
    userId1: string,
    userId2: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<UserMessageEntity[]> {
    return await this.repository.find({
      where: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
      relations: ['sender', 'receiver'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async findConversationById(
    conversationId: string,
    limit: number = 50
  ): Promise<UserMessageEntity[]> {
    return await this.repository.find({
      where: { conversationId },
      relations: ['sender', 'receiver'],
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  async findUserConversations(
    userId: string
  ): Promise<{ conversationId: string; lastMessage: UserMessageEntity }[]> {
    const conversations = await this.repository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('message.receiver', 'receiver')
      .where('message.senderId = :userId OR message.receiverId = :userId', { userId })
      .andWhere('message.deletedAt IS NULL')
      .orderBy('message.conversationId')
      .addOrderBy('message.createdAt', 'DESC')
      .getMany();

    // Group by conversation and get latest message for each
    const conversationMap = new Map<string, UserMessageEntity>();

    conversations.forEach((message) => {
      if (!conversationMap.has(message.conversationId)) {
        conversationMap.set(message.conversationId, message);
      }
    });

    return Array.from(conversationMap.entries()).map(([conversationId, lastMessage]) => ({
      conversationId,
      lastMessage,
    }));
  }

  async findUnreadMessages(userId: string): Promise<UserMessageEntity[]> {
    return await this.repository.find({
      where: {
        receiverId: userId,
        status: MessageStatus.DELIVERED,
        readAt: null,
        deletedAt: null,
      },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
    });
  }

  async markAsRead(messageId: string): Promise<UserMessageEntity | null> {
    const message = await this.findById(messageId);
    if (!message) return null;

    message.status = MessageStatus.READ;
    message.readAt = new Date();
    return await this.repository.save(message);
  }

  async markConversationAsRead(conversationId: string, userId: string): Promise<number> {
    const result = await this.repository.update(
      {
        conversationId,
        receiverId: userId,
        status: MessageStatus.DELIVERED,
        readAt: null,
      },
      {
        status: MessageStatus.READ,
        readAt: new Date(),
      }
    );

    return result.affected || 0;
  }

  async softDelete(messageId: string): Promise<boolean> {
    const result = await this.repository.update({ id: messageId }, { deletedAt: new Date() });

    return result.affected !== undefined && result.affected > 0;
  }

  async editMessage(messageId: string, newContent: string): Promise<UserMessageEntity | null> {
    const message = await this.findById(messageId);
    if (!message) return null;

    message.content = newContent;
    message.editedAt = new Date();
    return await this.repository.save(message);
  }

  async findMessagesByType(
    conversationId: string,
    type: MessageType,
    limit: number = 20
  ): Promise<UserMessageEntity[]> {
    return await this.repository.find({
      where: { conversationId, type },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findRecentMessages(
    userId: string,
    hours: number = 24,
    limit: number = 100
  ): Promise<UserMessageEntity[]> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    return await this.repository.find({
      where: [
        { senderId: userId, createdAt: MoreThan(since) },
        { receiverId: userId, createdAt: MoreThan(since) },
      ],
      relations: ['sender', 'receiver'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getMessageStats(userId: string): Promise<{
    totalSent: number;
    totalReceived: number;
    unreadCount: number;
    conversationCount: number;
  }> {
    const [totalSent, totalReceived, unreadCount] = await Promise.all([
      this.repository.count({ where: { senderId: userId, deletedAt: null } }),
      this.repository.count({ where: { receiverId: userId, deletedAt: null } }),
      this.repository.count({
        where: {
          receiverId: userId,
          status: MessageStatus.DELIVERED,
          readAt: null,
          deletedAt: null,
        },
      }),
    ]);

    const conversations = await this.findUserConversations(userId);

    return {
      totalSent,
      totalReceived,
      unreadCount,
      conversationCount: conversations.length,
    };
  }

  async searchMessages(
    userId: string,
    searchTerm: string,
    limit: number = 50
  ): Promise<UserMessageEntity[]> {
    return await this.repository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('message.receiver', 'receiver')
      .where('(message.senderId = :userId OR message.receiverId = :userId)', { userId })
      .andWhere('message.content ILIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
      .andWhere('message.deletedAt IS NULL')
      .orderBy('message.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }
}
