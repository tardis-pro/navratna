import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';
import { LLMTaskType, LLMProviderType } from '@uaip/types';

@Entity('user_llm_preferences')
@Index(['userId', 'taskType'], { unique: true }) // One preference per task type per user
@Index(['taskType', 'isActive'])
export class UserLLMPreference extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({
    type: 'enum',
    enum: LLMTaskType,
  })
  taskType!: LLMTaskType;

  @Column({
    type: 'enum',
    enum: LLMProviderType,
  })
  preferredProvider!: LLMProviderType;

  @Column({ type: 'varchar', length: 255 })
  preferredModel!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fallbackModel?: string;

  @Column({ type: 'json', nullable: true })
  settings?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    systemPrompt?: string;
    customSettings?: Record<string, any>;
  };

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', default: 50 })
  priority!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  // Performance tracking for optimization
  @Column({ type: 'bigint', default: 0 })
  usageCount!: string;

  @Column({ type: 'float', nullable: true })
  averageResponseTime?: number;

  @Column({ type: 'float', nullable: true })
  successRate?: number;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  // Relationships
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  // Helper methods
  updateUsageStats(responseTime: number, success: boolean): void {
    const currentUsage = BigInt(this.usageCount);
    const newUsage = currentUsage + BigInt(1);
    this.usageCount = newUsage.toString();

    // Update average response time
    if (this.averageResponseTime) {
      const totalTime = this.averageResponseTime * Number(currentUsage);
      this.averageResponseTime = (totalTime + responseTime) / Number(newUsage);
    } else {
      this.averageResponseTime = responseTime;
    }

    // Update success rate
    if (this.successRate !== undefined) {
      const totalSuccesses = this.successRate * Number(currentUsage);
      const newSuccesses = success ? totalSuccesses + 1 : totalSuccesses;
      this.successRate = newSuccesses / Number(newUsage);
    } else {
      this.successRate = success ? 1.0 : 0.0;
    }

    this.lastUsedAt = new Date();
  }

  getEffectiveSettings(): {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    systemPrompt?: string;
  } {
    return {
      temperature: this.settings?.temperature,
      maxTokens: this.settings?.maxTokens,
      topP: this.settings?.topP,
      systemPrompt: this.settings?.systemPrompt,
    };
  }

  getPerformanceScore(): number {
    // Calculate performance score based on success rate and response time
    const successWeight = 0.7;
    const speedWeight = 0.3;

    let score = 0;

    if (this.successRate !== undefined) {
      score += this.successRate * successWeight;
    }

    if (this.averageResponseTime !== undefined) {
      // Normalize response time: assume 5 seconds is "poor", 1 second is "excellent"
      const normalizedSpeed = Math.max(0, Math.min(1, (5 - this.averageResponseTime) / 4));
      score += normalizedSpeed * speedWeight;
    }

    return Math.min(1, Math.max(0, score));
  }
}
