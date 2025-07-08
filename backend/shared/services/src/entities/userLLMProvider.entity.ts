import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, BeforeInsert, BeforeUpdate, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';
import * as crypto from 'crypto';

export type UserLLMProviderType = 'openai' | 'anthropic' | 'google' | 'ollama' | 'llmstudio' | 'custom';
export type UserLLMProviderStatus = 'active' | 'inactive' | 'error' | 'testing';

@Entity('user_llm_providers')
@Index(['userId', 'name'], { unique: true }) // Unique name per user (allows multiple providers of same type)
@Index(['userId', 'isActive'])
@Index(['userId', 'type', 'priority']) // For efficient provider selection by type and priority
export class UserLLMProvider extends BaseEntity {
  
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 255 })
  name!: string; // User-friendly name like "My OpenAI Account"

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: ['openai', 'anthropic', 'google', 'ollama', 'llmstudio', 'custom']
  })
  type!: UserLLMProviderType;

  @Column({ type: 'varchar', length: 500, nullable: true })
  baseUrl?: string; // Optional for custom endpoints

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
    enum: ['active', 'inactive', 'error', 'testing'],
    default: 'testing'
  })
  status!: UserLLMProviderStatus;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', default: 0 })
  priority!: number; // User can set priority for provider selection

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

  // Encryption key for API keys - should be set from environment
  private static readonly ENCRYPTION_KEY = process.env.USER_LLM_PROVIDER_ENCRYPTION_KEY || process.env.LLM_PROVIDER_ENCRYPTION_KEY || 'default-key-change-in-production';

  // Get properly sized encryption key for AES-256 (32 bytes)
  private getEncryptionKey(): Buffer {
    const key = UserLLMProvider.ENCRYPTION_KEY;
    
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
    type: UserLLMProviderType;
    baseUrl?: string;
    apiKey?: string;
    defaultModel?: string;
    timeout?: number;
    retries?: number;
  } {
    return {
      type: this.type,
      baseUrl: this.baseUrl || this.getDefaultBaseUrl(),
      apiKey: this.getApiKey(),
      defaultModel: this.defaultModel,
      timeout: this.configuration?.timeout,
      retries: this.configuration?.retries,
    };
  }

  // Get default base URL for provider type
  private getDefaultBaseUrl(): string {
    switch (this.type) {
      case 'openai':
        return 'https://api.openai.com';
      case 'anthropic':
        return 'https://api.anthropic.com';
      case 'google':
        return 'https://generativelanguage.googleapis.com';
      case 'ollama':
        return 'http://localhost:11434';
      case 'llmstudio':
        return 'http://localhost:1234';
      default:
        return this.baseUrl || '';
    }
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
      this.status = 'error';
    } else if (this.status === 'error' && result.status === 'healthy') {
      this.status = 'active';
    }
  }

  @BeforeInsert()
  @BeforeUpdate()
  validateConfiguration(): void {
    // Validate required fields
    if (!this.name?.trim()) {
      throw new Error('Provider name is required');
    }

    if (!this.userId) {
      throw new Error('User ID is required');
    }

    // Validate URL format if provided
    if (this.baseUrl) {
      try {
        new URL(this.baseUrl);
      } catch {
        throw new Error('Invalid base URL format');
      }
    }

    // Set default priority if not specified
    if (this.priority === undefined || this.priority === null) {
      this.priority = 100;
    }

    // Validate that API key is provided for cloud providers
    if (['openai', 'anthropic', 'google'].includes(this.type) && !this.hasApiKey()) {
      throw new Error(`API key is required for ${this.type} provider`);
    }
  }
} 