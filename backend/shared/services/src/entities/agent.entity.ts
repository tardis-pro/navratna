import { Entity, Column, Index, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import {
  AgentRole,
  AgentPersona,
  AgentIntelligenceConfig,
  AgentSecurityContext,
  AgentSkill,
} from '@uaip/types';

// Related entities will be referenced by string to avoid circular dependencies
// Type-only imports are safe - they are erased at compile time
import type { Operation } from './operation.entity';
import type { ConversationContext } from './conversationContext.entity';
import type { AgentCapabilityMetric } from './agentCapabilityMetric.entity';
import type { ToolUsageRecord } from './toolUsageRecord.entity';
import type { ToolAssignment } from './toolAssignment.entity';
import type { Persona } from './persona.entity';

/**
 * Enhanced Agent Entity with comprehensive intelligence and security features
 * Implements the enhanced agent model from the TypeORM migration plan
 *
 * COMPOSITION MODEL: Agent → Persona
 * - Agent handles capabilities, execution, and intelligence
 * - Persona handles personality, behavior, and conversation style
 * - Agent references a Persona via personaId
 */
@Entity('agents')
@Index(['name'], { unique: true })
@Index(['role', 'isActive'])
@Index(['createdBy'])
@Index(['lastActiveAt'])
@Index(['securityLevel'])
@Index(['personaId']) // Add index for persona relationship
export class Agent extends BaseEntity {
  @Column({ length: 255, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: AgentRole })
  role: AgentRole;

  // COMPOSITION: Reference to Persona entity
  @Column({ name: 'persona_id', type: 'uuid' })
  personaId: string;

  @ManyToOne('Persona', { nullable: false })
  @JoinColumn({ name: 'persona_id' })
  persona: Persona; // Will be populated when queried with relations

  // Legacy persona field - keeping for backwards compatibility during migration
  // TODO: Remove this field after migration is complete
  @Column({ name: 'legacy_persona', type: 'jsonb', nullable: true })
  legacyPersona?: AgentPersona;

  @Column({ name: 'intelligence_config', type: 'jsonb' })
  intelligenceConfig: AgentIntelligenceConfig;

  @Column({ name: 'security_context', type: 'jsonb' })
  securityContext: AgentSecurityContext;

  // Status and activity
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string;

  @Column({ name: 'last_active_at', type: 'timestamp', nullable: true })
  lastActiveAt?: Date;

  @Column({
    type: 'enum',
    enum: [
      'initializing',
      'idle',
      'active',
      'busy',
      'error',
      'offline',
      'shutting_down',
      'inactive',
      'deleted',
    ],
    default: 'idle',
  })
  status: string;

  // Enhanced capabilities tracking
  @Column({ type: 'jsonb', default: '[]' })
  capabilities: string[];

  // Skills System - OpenCode-compatible skill definitions stored as JSONB
  @Column({ type: 'jsonb', default: '[]' })
  skills: AgentSkill[];

  @Column({ name: 'capability_scores', type: 'jsonb', nullable: true })
  capabilityScores?: Record<string, number>;

  @Column({ name: 'learning_history', type: 'jsonb', default: '[]' })
  learningHistory: Record<string, unknown>[];

  @Column({ name: 'performance_metrics', type: 'jsonb', nullable: true })
  performanceMetrics?: Record<string, unknown>;

  // Security and compliance
  @Column({
    name: 'security_level',
    type: 'enum',
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  })
  securityLevel: 'low' | 'medium' | 'high' | 'critical';

  @Column({ name: 'compliance_tags', type: 'jsonb', default: '[]' })
  complianceTags: string[];

  @Column({ name: 'audit_trail', type: 'jsonb', default: '[]' })
  auditTrail: Record<string, unknown>[];

  // Configuration and preferences
  @Column({ type: 'jsonb', nullable: true })
  configuration?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  preferences?: Record<string, unknown>;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  // Version and deployment
  @Column({ length: 50, default: '1.0.0' })
  version: string;

  @Column({ name: 'deployment_environment', length: 50, nullable: true })
  deploymentEnvironment?: string;

  // Analytics and monitoring
  @Column({ name: 'total_operations', default: 0 })
  totalOperations: number;

  @Column({ name: 'successful_operations', default: 0 })
  successfulOperations: number;

  @Column({
    name: 'average_response_time',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  averageResponseTime?: number;

  @Column({ name: 'last_performance_review', type: 'timestamp', nullable: true })
  lastPerformanceReview?: Date;

  // Tool System Integration - Enhanced from migration plan
  @Column({ name: 'tool_permissions', type: 'jsonb', nullable: true })
  toolPermissions?: Record<string, unknown>;

  @Column({ name: 'tool_preferences', type: 'jsonb', nullable: true })
  toolPreferences?: Record<string, unknown>;

  @Column({ name: 'tool_budget', type: 'jsonb', nullable: true })
  toolBudget?: Record<string, unknown>;

  @Column({ name: 'max_concurrent_tools', default: 3 })
  maxConcurrentTools: number;

  // MCP Tool System Integration - New feature for granular tool access
  @Column({ name: 'assigned_mcp_tools', type: 'jsonb', default: '[]' })
  assignedMCPTools: Array<{
    toolId: string;
    toolName: string;
    serverName: string;
    enabled: boolean;
    priority?: number;
    parameters?: Record<string, unknown>;
  }>;

  @Column({ name: 'mcp_tool_settings', type: 'jsonb', nullable: true })
  mcpToolSettings?: {
    allowedServers?: string[];
    blockedServers?: string[];
    maxToolsPerServer?: number;
    autoDiscoveryEnabled?: boolean;
  };

  // Model Configuration - Enhanced from migration plan
  @Column({ name: 'model_id', nullable: true })
  modelId?: string;

  @Column({
    name: 'api_type',
    type: 'enum',
    enum: ['ollama', 'llmstudio', 'openai', 'anthropic', 'custom'],
    nullable: true,
  })
  apiType?: 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom';

  // User LLM Provider Configuration - ties agent to user's specific provider
  @Column({ name: 'user_llm_provider_id', type: 'uuid', nullable: true })
  userLLMProviderId?: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  temperature?: number;

  @Column({ name: 'max_tokens', nullable: true })
  maxTokens?: number;

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt?: string;

  // Relationships
  @OneToMany('Operation', 'agent')
  operations: Operation[];

  @OneToMany('ConversationContext', 'agent')
  conversations: ConversationContext[];

  @OneToMany('AgentCapabilityMetric', 'agent')
  capabilityMetrics: AgentCapabilityMetric[];

  @OneToMany('ToolUsageRecord', 'agent')
  toolUsageRecords: ToolUsageRecord[];

  @OneToMany('ToolAssignment', 'agent')
  toolAssignments: ToolAssignment[];
}
