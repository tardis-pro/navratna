import { FindManyOptions, FindOneOptions } from 'typeorm';
import { BaseRepository } from '../base/BaseRepository.js';
import { UserContactEntity, ContactStatus, ContactType } from '../../entities/user-contact.entity.js';

export class UserContactRepository extends BaseRepository<UserContactEntity> {
  constructor() {
    super(UserContactEntity);
  }

  async create(contactData: Partial<UserContactEntity>): Promise<UserContactEntity> {
    const contact = this.repository.create(contactData);
    return await this.repository.save(contact);
  }

  async findById(id: string): Promise<UserContactEntity | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['requester', 'target']
    });
  }

  async findUserContacts(userId: string, status?: ContactStatus): Promise<UserContactEntity[]> {
    const whereCondition: any = [
      { requesterId: userId },
      { targetId: userId }
    ];

    if (status) {
      whereCondition.forEach((condition: any) => {
        condition.status = status;
      });
    }

    return await this.repository.find({
      where: whereCondition,
      relations: ['requester', 'target'],
      order: { createdAt: 'DESC' }
    });
  }

  async findContactByUsers(requesterId: string, targetId: string): Promise<UserContactEntity | null> {
    return await this.repository.findOne({
      where: [
        { requesterId, targetId },
        { requesterId: targetId, targetId: requesterId }
      ],
      relations: ['requester', 'target']
    });
  }

  async findPendingRequests(userId: string): Promise<UserContactEntity[]> {
    return await this.repository.find({
      where: {
        targetId: userId,
        status: ContactStatus.PENDING
      },
      relations: ['requester'],
      order: { createdAt: 'DESC' }
    });
  }

  async findAcceptedContacts(userId: string, type?: ContactType): Promise<UserContactEntity[]> {
    const whereCondition: any = [
      { requesterId: userId, status: ContactStatus.ACCEPTED },
      { targetId: userId, status: ContactStatus.ACCEPTED }
    ];

    if (type) {
      whereCondition.forEach((condition: any) => {
        condition.type = type;
      });
    }

    return await this.repository.find({
      where: whereCondition,
      relations: ['requester', 'target'],
      order: { acceptedAt: 'DESC' }
    });
  }

  async findPublicUsers(excludeUserId: string, limit: number = 50): Promise<UserContactEntity[]> {
    // This would typically involve a more complex query to find users marked as public
    // For now, we'll find users who have accepted public contacts
    return await this.repository.find({
      where: {
        type: ContactType.PUBLIC,
        status: ContactStatus.ACCEPTED
      },
      relations: ['requester', 'target'],
      take: limit,
      order: { createdAt: 'DESC' }
    });
  }

  async updateStatus(id: string, status: ContactStatus): Promise<UserContactEntity | null> {
    const contact = await this.findById(id);
    if (!contact) return null;

    contact.status = status;
    if (status === ContactStatus.ACCEPTED) {
      contact.acceptedAt = new Date();
    } else if (status === ContactStatus.BLOCKED) {
      contact.blockedAt = new Date();
    }

    return await this.repository.save(contact);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected !== undefined && result.affected > 0;
  }

  async blockContact(requesterId: string, targetId: string): Promise<UserContactEntity | null> {
    const contact = await this.findContactByUsers(requesterId, targetId);
    if (contact) {
      return await this.updateStatus(contact.id, ContactStatus.BLOCKED);
    }

    // Create a new blocked contact entry
    return await this.create({
      requesterId,
      targetId,
      status: ContactStatus.BLOCKED,
      type: ContactType.FRIEND,
      blockedAt: new Date()
    });
  }

  async unblockContact(requesterId: string, targetId: string): Promise<boolean> {
    const contact = await this.findContactByUsers(requesterId, targetId);
    if (contact && contact.status === ContactStatus.BLOCKED) {
      return await this.delete(contact.id);
    }
    return false;
  }
}