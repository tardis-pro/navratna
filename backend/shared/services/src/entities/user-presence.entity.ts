import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';

export enum PresenceStatus {
  ONLINE = 'online',
  AWAY = 'away',
  BUSY = 'busy',
  OFFLINE = 'offline',
  INVISIBLE = 'invisible'
}

@Entity('user_presence')
@Index(['userId'], { unique: true })
@Index(['status'])
@Index(['lastSeenAt'])
export class UserPresenceEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ 
    type: 'enum', 
    enum: PresenceStatus, 
    default: PresenceStatus.OFFLINE 
  })
  status!: PresenceStatus;

  @Column({ type: 'text', nullable: true })
  customStatus?: string;

  @Column({ type: 'timestamp', name: 'last_seen_at', nullable: true })
  lastSeenAt?: Date;

  @Column({ type: 'json', nullable: true })
  activeDevices?: string[];

  @Column({ type: 'timestamp', name: 'status_expires_at', nullable: true })
  statusExpiresAt?: Date;
}