import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { Agent } from './agent.entity.js';
import { LLMTaskType, LLMProviderType } from '@uaip/types';

@Entity('agent_llm_preferences')
@Index(['agentId', 'taskType'], { unique: true }) // One preference per task type per agent
@Index(['taskType', 'isActive'])
export class AgentLLMPreference extends BaseEntity {
  
  @Column({ type: 'uuid' })
  agentId!: string;

  @Column({
    type: 'enum',
    enum: LLMTaskType
  })
  taskType!: LLMTaskType;

  @Column({
    type: 'enum',
    enum: LLMProviderType
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

  @Column({ type: 'varchar', length: 1000, nullable: true })
  reasoning?: string; // Why this agent has specific preferences for this task

  // Performance tracking specific to this agent
  @Column({ type: 'bigint', default: 0 })
  usageCount!: string;

  @Column({ type: 'float', nullable: true })
  averageResponseTime?: number;

  @Column({ type: 'float', nullable: true })
  successRate?: number;

  @Column({ type: 'float', nullable: true })
  qualityScore?: number; // Agent-specific quality metrics

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  // Relationships
  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agentId' })
  agent!: Agent;

  // Helper methods
  updateUsageStats(responseTime: number, success: boolean, quality?: number): void {
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

    // Update quality score if provided
    if (quality !== undefined) {
      if (this.qualityScore !== undefined) {
        const totalQuality = this.qualityScore * Number(currentUsage);
        this.qualityScore = (totalQuality + quality) / Number(newUsage);
      } else {
        this.qualityScore = quality;
      }
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
      systemPrompt: this.settings?.systemPrompt
    };
  }

  getPerformanceScore(): number {
    // Calculate comprehensive performance score for agent-specific preferences
    const successWeight = 0.4;
    const speedWeight = 0.2;
    const qualityWeight = 0.4;
    
    let score = 0;
    
    if (this.successRate !== undefined) {
      score += this.successRate * successWeight;
    }
    
    if (this.averageResponseTime !== undefined) {
      // Normalize response time: assume 5 seconds is "poor", 1 second is "excellent"
      const normalizedSpeed = Math.max(0, Math.min(1, (5 - this.averageResponseTime) / 4));
      score += normalizedSpeed * speedWeight;
    }

    if (this.qualityScore !== undefined) {
      score += this.qualityScore * qualityWeight;
    }
    
    return Math.min(1, Math.max(0, score));
  }

  isOptimalForTask(): boolean {
    // Determine if this agent's preference is performing well for this task
    const minUsage = 5; // Need at least 5 uses to be considered reliable
    const minPerformance = 0.7; // Need 70% performance score
    
    return (
      Number(this.usageCount) >= minUsage &&
      this.getPerformanceScore() >= minPerformance
    );
  }
}