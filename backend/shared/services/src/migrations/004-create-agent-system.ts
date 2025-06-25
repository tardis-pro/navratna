import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

/**
 * Agent System Migration
 * 
 * Creates the agent management tables:
 * - agents: Core agent definitions with persona relationships
 * - agent_capability_metrics: Agent capability tracking and performance
 * - conversation_contexts: Agent conversation contexts and memory
 * 
 * These tables manage agent definitions, capabilities, and conversational contexts.
 * Dependencies: users, personas tables
 */
export class CreateAgentSystem1703004000000 implements MigrationInterface {
  name = 'CreateAgentSystem1703004000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create agents table - Core agent definitions with persona relationships
    await queryRunner.createTable(
      new Table({
        name: 'agents',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'role',
            type: 'enum',
            enum: ['assistant', 'specialist', 'coordinator', 'analyst', 'executor', 'monitor', 'custom'],
          },
          {
            name: 'persona_id',
            type: 'uuid',
          },
          {
            name: 'legacy_persona',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'intelligence_config',
            type: 'jsonb',
          },
          {
            name: 'security_context',
            type: 'jsonb',
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_by',
            type: 'uuid',
          },
          {
            name: 'last_active_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'capabilities',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'capability_scores',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'learning_history',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'performance_metrics',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'security_level',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'critical'],
            default: "'medium'",
          },
          {
            name: 'compliance_tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'audit_trail',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'configuration',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'preferences',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'version',
            type: 'varchar',
            length: '50',
            default: "'1.0.0'",
          },
          {
            name: 'deployment_environment',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'total_operations',
            type: 'integer',
            default: 0,
          },
          {
            name: 'successful_operations',
            type: 'integer',
            default: 0,
          },
          {
            name: 'average_response_time',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'last_performance_review',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'tool_permissions',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'tool_preferences',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'tool_budget',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'max_concurrent_tools',
            type: 'integer',
            default: 3,
          },
          {
            name: 'model_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'api_type',
            type: 'enum',
            enum: ['ollama', 'llmstudio', 'openai', 'anthropic', 'custom'],
            isNullable: true,
          },
          {
            name: 'temperature',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'max_tokens',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'system_prompt',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['persona_id'],
            referencedTableName: 'personas',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          },
          {
            columnNames: ['created_by'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true
    );

    // Create agent_capability_metrics table - Agent capability tracking and performance
    await queryRunner.createTable(
      new Table({
        name: 'agent_capability_metrics',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'agent_id',
            type: 'uuid',
          },
          {
            name: 'capability_name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'metric_type',
            type: 'enum',
            enum: ['performance', 'usage', 'accuracy', 'efficiency', 'reliability'],
          },
          {
            name: 'metric_value',
            type: 'decimal',
            precision: 10,
            scale: 4,
          },
          {
            name: 'metric_unit',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'baseline_value',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'target_value',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'trend_direction',
            type: 'enum',
            enum: ['improving', 'stable', 'declining', 'unknown'],
            default: "'unknown'",
          },
          {
            name: 'confidence_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'sample_size',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'measurement_period_start',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'measurement_period_end',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'recorded_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['agent_id'],
            referencedTableName: 'agents',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true
    );

    // Create conversation_contexts table - Agent conversation contexts and memory
    await queryRunner.createTable(
      new Table({
        name: 'conversation_contexts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'agent_id',
            type: 'uuid',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'session_id',
            type: 'uuid',
          },
          {
            name: 'context_type',
            type: 'enum',
            enum: ['conversation', 'task', 'operation', 'discussion', 'learning'],
            default: "'conversation'",
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'context_data',
            type: 'jsonb',
          },
          {
            name: 'message_history',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'memory_state',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'working_memory',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'long_term_memory',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'context_window_size',
            type: 'integer',
            default: 4096,
          },
          {
            name: 'max_history_length',
            type: 'integer',
            default: 100,
          },
          {
            name: 'compression_strategy',
            type: 'enum',
            enum: ['none', 'sliding_window', 'summarization', 'semantic_compression'],
            default: "'sliding_window'",
          },
          {
            name: 'priority_level',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'critical'],
            default: "'medium'",
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'is_persistent',
            type: 'boolean',
            default: false,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'last_accessed_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'access_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['agent_id'],
            referencedTableName: 'agents',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true
    );

    // Create indexes for performance
    await queryRunner.createIndex('agents', new Index('IDX_agents_role_is_active', ['role', 'is_active']));
    await queryRunner.createIndex('agents', new Index('IDX_agents_created_by', ['created_by']));
    await queryRunner.createIndex('agents', new Index('IDX_agents_last_active_at', ['last_active_at']));
    await queryRunner.createIndex('agents', new Index('IDX_agents_security_level', ['security_level']));
    await queryRunner.createIndex('agents', new Index('IDX_agents_persona_id', ['persona_id']));
    await queryRunner.createIndex('agents', new Index('IDX_agents_api_type', ['api_type']));
    await queryRunner.createIndex('agents', new Index('IDX_agents_deployment_environment', ['deployment_environment']));
    
    await queryRunner.createIndex('agent_capability_metrics', new Index('IDX_agent_capability_metrics_agent_id', ['agent_id']));
    await queryRunner.createIndex('agent_capability_metrics', new Index('IDX_agent_capability_metrics_capability_name', ['capability_name']));
    await queryRunner.createIndex('agent_capability_metrics', new Index('IDX_agent_capability_metrics_metric_type', ['metric_type']));
    await queryRunner.createIndex('agent_capability_metrics', new Index('IDX_agent_capability_metrics_recorded_at', ['recorded_at']));
    await queryRunner.createIndex('agent_capability_metrics', new Index('IDX_agent_capability_metrics_trend_direction', ['trend_direction']));
    await queryRunner.createIndex('agent_capability_metrics', new Index('IDX_agent_capability_metrics_measurement_period', ['measurement_period_start', 'measurement_period_end']));
    
    await queryRunner.createIndex('conversation_contexts', new Index('IDX_conversation_contexts_agent_id', ['agent_id']));
    await queryRunner.createIndex('conversation_contexts', new Index('IDX_conversation_contexts_user_id', ['user_id']));
    await queryRunner.createIndex('conversation_contexts', new Index('IDX_conversation_contexts_session_id', ['session_id']));
    await queryRunner.createIndex('conversation_contexts', new Index('IDX_conversation_contexts_context_type', ['context_type']));
    await queryRunner.createIndex('conversation_contexts', new Index('IDX_conversation_contexts_is_active', ['is_active']));
    await queryRunner.createIndex('conversation_contexts', new Index('IDX_conversation_contexts_expires_at', ['expires_at']));
    await queryRunner.createIndex('conversation_contexts', new Index('IDX_conversation_contexts_last_accessed_at', ['last_accessed_at']));
    await queryRunner.createIndex('conversation_contexts', new Index('IDX_conversation_contexts_priority_level', ['priority_level']));
    
    // Composite indexes for common queries
    await queryRunner.createIndex('agent_capability_metrics', new Index('IDX_agent_capability_metrics_agent_capability_time', ['agent_id', 'capability_name', 'recorded_at']));
    await queryRunner.createIndex('conversation_contexts', new Index('IDX_conversation_contexts_agent_user_session', ['agent_id', 'user_id', 'session_id']));
    await queryRunner.createIndex('conversation_contexts', new Index('IDX_conversation_contexts_agent_type_active', ['agent_id', 'context_type', 'is_active']));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order to respect foreign key constraints
    await queryRunner.dropTable('conversation_contexts');
    await queryRunner.dropTable('agent_capability_metrics');
    await queryRunner.dropTable('agents');
  }
} 