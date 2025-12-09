import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { MFAMethod } from '@uaip/types';

@Entity('mfa_challenges')
@Index(['userId'])
@Index(['sessionId'])
@Index(['expiresAt'])
export class MFAChallengeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'enum', enum: MFAMethod })
  method!: MFAMethod;

  @Column({ type: 'text' })
  challenge!: string; // Encrypted

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'int', default: 3 })
  maxAttempts!: number;

  @Column({ type: 'boolean', default: false })
  isVerified!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;
}
