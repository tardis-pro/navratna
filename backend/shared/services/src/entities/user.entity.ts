import { Entity, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { SecurityLevel } from '@uaip/types';

@Entity('users')
@Index(['email'], { unique: true })
@Index(['isActive'])
@Index(['role'])
export class UserEntity extends BaseEntity {
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

  @Column({ type: 'json', nullable: true })
  permissions?: string[];

  @Column({ type: 'json', nullable: true, name: 'user_persona' })
  userPersona?: {
    workStyle: 'collaborative' | 'independent' | 'hybrid';
    communicationPreference: 'brief' | 'detailed' | 'visual';
    domainExpertise: string[];
    toolPreferences: string[];
    workflowStyle: 'structured' | 'flexible' | 'experimental';
    problemSolvingApproach: 'analytical' | 'creative' | 'pragmatic';
    decisionMaking: 'quick' | 'deliberate' | 'consensus';
    learningStyle: 'hands-on' | 'theoretical' | 'collaborative';
    timeManagement: 'deadline-driven' | 'flexible' | 'time-blocked';
    riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  };

  @Column({ type: 'json', nullable: true, name: 'onboarding_progress' })
  onboardingProgress?: {
    isCompleted: boolean;
    currentStep: number;
    completedSteps: string[];
    startedAt?: Date;
    completedAt?: Date;
    responses: Record<string, any>;
  };

  @Column({ type: 'json', nullable: true, name: 'behavioral_patterns' })
  behavioralPatterns?: {
    sessionDuration: number;
    activeHours: string[];
    frequentlyUsedTools: string[];
    preferredAgents: string[];
    workflowPatterns: string[];
    interactionStyle: 'direct' | 'exploratory' | 'methodical';
    feedbackPreference: 'immediate' | 'summary' | 'detailed';
  };

  // Computed properties
  get name(): string {
    if (this.firstName && this.lastName) {
      return `${this.firstName} ${this.lastName}`;
    }
    if (this.firstName) {
      return this.firstName;
    }
    if (this.lastName) {
      return this.lastName;
    }
    return this.email;
  }
} 