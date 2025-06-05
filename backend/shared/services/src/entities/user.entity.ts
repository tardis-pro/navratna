import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { SecurityLevel } from '@uaip/types';

@Entity('users')
@Index(['email'], { unique: true })
@Index(['isActive'])
@Index(['role'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, name: 'first_name', nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 255, name: 'last_name', nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  department?: string;

  @Column({ type: 'varchar', length: 50 })
  role!: string;

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash!: string;

  @Column({ 
    type: 'enum', 
    enum: SecurityLevel, 
    name: 'security_clearance',
    default: SecurityLevel.MEDIUM 
  })
  securityClearance!: SecurityLevel;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'integer', name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts!: number;

  @Column({ type: 'timestamp', name: 'locked_until', nullable: true })
  lockedUntil?: Date;

  @Column({ type: 'timestamp', name: 'password_changed_at', nullable: true })
  passwordChangedAt?: Date;

  @Column({ type: 'timestamp', name: 'last_login_at', nullable: true })
  lastLoginAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
} 