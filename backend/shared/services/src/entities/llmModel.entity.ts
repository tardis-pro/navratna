import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { LLMProvider } from './llmProvider.entity.js';

@Entity('llm_models')
@Index(['name', 'providerId'], { unique: true })
@Index(['providerId', 'isAvailable'])
@Index(['isAvailable', 'isActive'])
export class LLMModel extends BaseEntity {
  
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({ type: 'uuid' })
  providerId!: string;

  @ManyToOne(() => LLMProvider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider!: LLMProvider;

  @Column({ type: 'varchar', length: 100, nullable: true })
  apiType?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  apiEndpoint?: string;

  @Column({ type: 'int', nullable: true })
  contextLength?: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  inputTokenCost?: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  outputTokenCost?: number;

  @Column({ type: 'json', nullable: true })
  capabilities?: {
    streaming?: boolean;
    functionCalling?: boolean;
    vision?: boolean;
    codeGeneration?: boolean;
    reasoning?: boolean;
  };

  @Column({ type: 'json', nullable: true })
  parameters?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };

  @Column({ type: 'boolean', default: true })
  isAvailable!: boolean;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ type: 'bigint', default: 0 })
  totalTokensUsed!: string;

  @Column({ type: 'bigint', default: 0 })
  totalRequests!: string;

  @Column({ type: 'bigint', default: 0 })
  totalErrors!: string;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastCheckedAt?: Date;

  @Column({ type: 'json', nullable: true })
  healthStatus?: {
    status: 'healthy' | 'unhealthy' | 'unknown';
    latency?: number;
    error?: string;
    checkedAt: Date;
  };

  @Column({ type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ type: 'uuid', nullable: true })
  updatedBy?: string;

  // Method to update usage statistics
  updateUsageStats(tokensUsed: number, isError: boolean = false): void {
    this.totalTokensUsed = (BigInt(this.totalTokensUsed) + BigInt(tokensUsed)).toString();
    this.totalRequests = (BigInt(this.totalRequests) + BigInt(1)).toString();
    
    if (isError) {
      this.totalErrors = (BigInt(this.totalErrors) + BigInt(1)).toString();
    }
    
    this.lastUsedAt = new Date();
  }

  // Method to update health status
  updateHealthStatus(result: { status: 'healthy' | 'unhealthy'; latency?: number; error?: string }): void {
    this.healthStatus = {
      ...result,
      checkedAt: new Date(),
    };
    this.lastCheckedAt = new Date();
    
    // Update availability based on health status
    if (result.status === 'unhealthy') {
      this.isAvailable = false;
    } else if (!this.isAvailable && result.status === 'healthy') {
      this.isAvailable = true;
    }
  }

  // Method to get model configuration for LLM service
  getModelConfig(): {
    name: string;
    providerId: string;
    apiType?: string;
    apiEndpoint?: string;
    contextLength?: number;
    capabilities?: any;
    parameters?: any;
  } {
    return {
      name: this.name,
      providerId: this.providerId,
      apiType: this.apiType,
      apiEndpoint: this.apiEndpoint,
      contextLength: this.contextLength,
      capabilities: this.capabilities,
      parameters: this.parameters,
    };
  }

  // Method to check if model is ready for use
  isReady(): boolean {
    return this.isActive && this.isAvailable;
  }
}