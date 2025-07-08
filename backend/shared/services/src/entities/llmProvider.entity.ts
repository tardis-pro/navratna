import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, BeforeInsert, BeforeUpdate } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import * as crypto from 'crypto';
import { LLMProviderStatus, LLMProviderType } from '@uaip/types';



@Entity('llm_providers')
@Index(['name'], { unique: true })
@Index(['type', 'isActive'])
export class LLMProvider extends BaseEntity {
  
  @Column({ type: 'varchar', length: 255, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: LLMProviderType,
    default: LLMProviderType.CUSTOM
  })
  type!: LLMProviderType;

  @Column({ type: 'varchar', length: 500 })
  baseUrl!: string;

  @Column({ type: 'text', nullable: true })
  apiKeyEncrypted?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  defaultModel?: string;


  @Column({ type: 'json', nullable: true })
  configuration?: {
    timeout?: number;
    retries?: number;
    rateLimit?: number;
    headers?: Record<string, string>;
    customEndpoints?: {
      models?: string;
      chat?: string;
      completions?: string;
    };
  };

  @Column({
    type: 'enum',
    enum: LLMProviderStatus,
    default: LLMProviderStatus.ACTIVE
  })
  status!: LLMProviderStatus;

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
  lastHealthCheckAt?: Date;

  @Column({ type: 'json', nullable: true })
  healthCheckResult?: {
    status: 'healthy' | 'unhealthy' | 'unknown';
    latency?: number;
    error?: string;
    checkedAt: Date;
  };

  @Column({ type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ type: 'uuid', nullable: true })
  updatedBy?: string;

  // Encryption key for API keys - should be set from environment
  private static readonly ENCRYPTION_KEY = process.env.LLM_PROVIDER_ENCRYPTION_KEY || 'default-key-change-in-production';

  // Get properly sized encryption key for AES-256 (32 bytes)
  private getEncryptionKey(): Buffer {
    const key = LLMProvider.ENCRYPTION_KEY;
    
    // For AES-256, we need exactly 32 bytes
    if (key.length === 32) {
      return Buffer.from(key, 'utf8');
    } else if (key.length > 32) {
      // Truncate if too long
      return Buffer.from(key.substring(0, 32), 'utf8');
    } else {
      // Pad with zeros if too short (not ideal, but better than crashing)
      const paddedKey = key.padEnd(32, '0');
      return Buffer.from(paddedKey, 'utf8');
    }
  }

  // Method to set API key (encrypts before storing)
  setApiKey(apiKey: string): void {
    if (!apiKey) {
      this.apiKeyEncrypted = undefined;
      return;
    }

    // Generate a random IV for each encryption
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.getEncryptionKey(), iv);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Store IV + encrypted data (IV is not secret)
    this.apiKeyEncrypted = iv.toString('hex') + ':' + encrypted;
  }

  // Method to get API key (decrypts from storage)
  getApiKey(): string | undefined {
    if (!this.apiKeyEncrypted) {
      return undefined;
    }

    try {
      // Split IV and encrypted data
      const parts = this.apiKeyEncrypted.split(':');
      if (parts.length !== 2) {
        console.error('Invalid encrypted API key format');
        return undefined;
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encryptedData = parts[1];
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.getEncryptionKey(), iv);
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
      return undefined;
    }
  }

  // Method to check if provider has valid API key
  hasApiKey(): boolean {
    return !!this.apiKeyEncrypted;
  }

  // Method to get provider configuration for LLM service
  getProviderConfig(): {
    type: LLMProviderType;
    baseUrl: string;
    apiKey?: string;
    defaultModel?: string;
    timeout?: number;
    retries?: number;
  } {
    return {
      type: this.type,
      baseUrl: this.baseUrl,
      apiKey: this.getApiKey(),
      defaultModel: this.defaultModel,
      timeout: this.configuration?.timeout,
      retries: this.configuration?.retries,
    };
  }

  // Method to update usage statistics
  updateUsageStats(tokensUsed: number, isError: boolean = false): void {
    this.totalTokensUsed = (BigInt(this.totalTokensUsed) + BigInt(tokensUsed)).toString();
    this.totalRequests = (BigInt(this.totalRequests) + BigInt(1)).toString();
    
    if (isError) {
      this.totalErrors = (BigInt(this.totalErrors) + BigInt(1)).toString();
    }
    
    this.lastUsedAt = new Date();
  }

  // Method to update health check result
  updateHealthCheck(result: { status: 'healthy' | 'unhealthy'; latency?: number; error?: string }): void {
    this.healthCheckResult = {
      ...result,
      checkedAt: new Date(),
    };
    this.lastHealthCheckAt = new Date();
    
    // Update status based on health check
    if (result.status === 'unhealthy') {
      this.status = LLMProviderStatus.INACTIVE;
    } else if (this.status === LLMProviderStatus.INACTIVE && result.status === 'healthy') {
      this.status = LLMProviderStatus.ACTIVE;
    }
  }

  @BeforeInsert()
  @BeforeUpdate()
  validateConfiguration(): void {
    // Validate required fields
    if (!this.name?.trim()) {
      throw new Error('Provider name is required');
    }

    if (!this.baseUrl?.trim()) {
      throw new Error('Provider base URL is required');
    }

    // Validate URL format
    try {
      new URL(this.baseUrl);
    } catch {
      throw new Error('Invalid base URL format');
    }

    // Set default priority if not specified
    if (this.priority === undefined || this.priority === null) {
      this.priority = 100;
    }

    // Ensure default values for counters
    if (!this.totalTokensUsed) this.totalTokensUsed = '0';
    if (!this.totalRequests) this.totalRequests = '0';
    if (!this.totalErrors) this.totalErrors = '0';
  }
} 