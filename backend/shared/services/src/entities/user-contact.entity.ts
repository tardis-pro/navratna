import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';

export enum ContactStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  BLOCKED = 'blocked',
  REJECTED = 'rejected'
}

export enum ContactType {
  FRIEND = 'friend',
  COLLEAGUE = 'colleague',
  PUBLIC = 'public'
}

@Entity('user_contacts')
@Index(['requesterId', 'targetId'], { unique: true })
@Index(['requesterId'])
@Index(['targetId'])
@Index(['status'])
@Index(['type'])
export class UserContactEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'requester_id' })
  requesterId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester!: UserEntity;

  @Column({ type: 'uuid', name: 'target_id' })
  targetId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_id' })
  target!: UserEntity;

  @Column({ 
    type: 'enum', 
    enum: ContactStatus, 
    default: ContactStatus.PENDING 
  })
  status!: ContactStatus;

  @Column({ 
    type: 'enum', 
    enum: ContactType, 
    default: ContactType.FRIEND 
  })
  type!: ContactType;

  @Column({ type: 'text', nullable: true })
  message?: string;

  @Column({ type: 'timestamp', name: 'accepted_at', nullable: true })
  acceptedAt?: Date;

  @Column({ type: 'timestamp', name: 'blocked_at', nullable: true })
  blockedAt?: Date;
}