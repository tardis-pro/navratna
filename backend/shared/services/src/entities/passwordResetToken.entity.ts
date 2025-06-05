import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { UserEntity } from './user.entity.js';

@Entity('password_reset_tokens')
@Index(['token'], { unique: true })
@Index(['userId'])
@Index(['expiresAt'])
@Index(['usedAt'])
export class PasswordResetTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 500, unique: true })
  token!: string;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'timestamp', name: 'used_at', nullable: true })
  usedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;
} 