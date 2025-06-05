import { MigrationInterface, QueryRunner, Table, TableIndex, ForeignKey } from 'typeorm';

export class CompleteEntityMigration1703000000001 implements MigrationInterface {
  name = 'CompleteEntityMigration1703000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create agent_capability_metrics table
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
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'agent_id',
            type: 'uuid',
          },
          {
            name: 'capability',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'metric_type',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'score',
            type: 'decimal',
            precision: 5,
            scale: 2,
          },
          {
            name: 'baseline_score',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'improvement_rate',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'recorded_at',
            type: 'timestamp',
          },
          {
            name: 'measurement_period',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'sample_size',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'confidence',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'details',
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
        ],
      }),
      true
    );

    // Create tool_usage_records table
    await queryRunner.createTable(
      new Table({
        name: 'tool_usage_records',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
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
          {
            name: 'agent_id',
            type: 'uuid',
          },
          {
            name: 'tool_id',
            type: 'uuid',
          },
          {
            name: 'used_at',
            type: 'timestamp',
          },
          {
            name: 'execution_time_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'success',
            type: 'boolean',
            default: true,
          },
          {
            name: 'error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'parameters',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'result',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'cost',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'quality_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'user_satisfaction',
            type: 'decimal',
            precision: 3,
            scale: 2,
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
        ],
      }),
      true
    );

    // Create conversation_contexts table
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
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'agent_id',
            type: 'uuid',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'session_id',
            type: 'uuid',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'paused', 'completed', 'terminated'],
            default: "'active'",
          },
          {
            name: 'messages',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'conversation_summary',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'key_topics',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'sentiment_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'engagement_level',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'message_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'last_activity_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'timestamp',
          },
          {
            name: 'ended_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'total_duration_ms',
            type: 'integer',
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
        ],
      }),
      true
    );

    // Create operation_states table
    await queryRunner.createTable(
      new Table({
        name: 'operation_states',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
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
          {
            name: 'operation_id',
            type: 'uuid',
          },
          {
            name: 'from_status',
            type: 'enum',
            enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'paused'],
            isNullable: true,
          },
          {
            name: 'to_status',
            type: 'enum',
            enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'paused'],
          },
          {
            name: 'transitioned_at',
            type: 'timestamp',
          },
          {
            name: 'transitioned_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'duration_in_previous_state_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'is_automatic',
            type: 'boolean',
            default: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
        ],
      }),
      true
    );

    // Create operation_checkpoints table
    await queryRunner.createTable(
      new Table({
        name: 'operation_checkpoints',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
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
          {
            name: 'operation_id',
            type: 'uuid',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'checkpoint_type',
            type: 'enum',
            enum: ['manual', 'automatic', 'step', 'milestone'],
            default: "'automatic'",
          },
          {
            name: 'step_number',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'state',
            type: 'jsonb',
          },
          {
            name: 'context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'can_rollback_to',
            type: 'boolean',
            default: true,
          },
          {
            name: 'rollback_instructions',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'data_size_bytes',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'compression_used',
            type: 'boolean',
            default: false,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
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
        ],
      }),
      true
    );

    // Create step_results table
    await queryRunner.createTable(
      new Table({
        name: 'step_results',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
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
          {
            name: 'operation_id',
            type: 'uuid',
          },
          {
            name: 'step_number',
            type: 'integer',
          },
          {
            name: 'step_name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'step_type',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'running', 'completed', 'failed', 'skipped', 'cancelled'],
            default: "'pending'",
          },
          {
            name: 'started_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'completed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'execution_time_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'input',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'output',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'error_code',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'retry_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'max_retries',
            type: 'integer',
            default: 3,
          },
          {
            name: 'quality_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'confidence_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'metrics',
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
        ],
      }),
      true
    );

    // Create approval_workflows table
    await queryRunner.createTable(
      new Table({
        name: 'approval_workflows',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
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
          {
            name: 'operation_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'tool_execution_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'approval_type',
            type: 'enum',
            enum: ['operation', 'tool_execution', 'resource_access', 'security_override'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'approved', 'rejected', 'expired', 'cancelled'],
            default: "'pending'",
          },
          {
            name: 'requested_by',
            type: 'uuid',
          },
          {
            name: 'requested_at',
            type: 'timestamp',
          },
          {
            name: 'approver_role',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'approved_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'approved_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'comments',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'priority_level',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'urgent'],
            default: "'medium'",
          },
          {
            name: 'auto_approve_conditions',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'escalation_rules',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'notification_sent',
            type: 'boolean',
            default: false,
          },
          {
            name: 'reminder_count',
            type: 'integer',
            default: 0,
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
        ],
      }),
      true
    );

    // Create artifact_deployments table
    await queryRunner.createTable(
      new Table({
        name: 'artifact_deployments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
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
          {
            name: 'artifact_id',
            type: 'uuid',
          },
          {
            name: 'environment',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'deploying', 'deployed', 'failed', 'rolled_back'],
            default: "'pending'",
          },
          {
            name: 'deployed_by',
            type: 'uuid',
          },
          {
            name: 'deployed_at',
            type: 'timestamp',
          },
          {
            name: 'deployment_url',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'deployment_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'build_logs',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'deployment_logs',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'rollback_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'rolled_back_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'rolled_back_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'health_check_url',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'health_status',
            type: 'enum',
            enum: ['unknown', 'healthy', 'unhealthy', 'degraded'],
            default: "'unknown'",
          },
          {
            name: 'last_health_check',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'performance_metrics',
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
        ],
      }),
      true
    );

    // Create discussion_participants table
    await queryRunner.createTable(
      new Table({
        name: 'discussion_participants',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
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
          {
            name: 'persona_id',
            type: 'uuid',
          },
          {
            name: 'discussion_id',
            type: 'uuid',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'role',
            type: 'enum',
            enum: ['participant', 'moderator', 'observer', 'facilitator'],
            default: "'participant'",
          },
          {
            name: 'joined_at',
            type: 'timestamp',
          },
          {
            name: 'left_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'message_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'contribution_score',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'engagement_level',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'last_message_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'total_speaking_time_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'interruption_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'questions_asked',
            type: 'integer',
            default: 0,
          },
          {
            name: 'questions_answered',
            type: 'integer',
            default: 0,
          },
          {
            name: 'sentiment_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'collaboration_rating',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'topics',
            type: 'jsonb',
            default: "'[]'",
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
        ],
      }),
      true
    );

    // Create persona_analytics table
    await queryRunner.createTable(
      new Table({
        name: 'persona_analytics',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
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
          {
            name: 'persona_id',
            type: 'uuid',
          },
          {
            name: 'metric_type',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'recorded_at',
            type: 'timestamp',
          },
          {
            name: 'period',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'value',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'baseline_value',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'change_percentage',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'trend_direction',
            type: 'enum',
            enum: ['up', 'down', 'stable'],
            isNullable: true,
          },
          {
            name: 'total_interactions',
            type: 'integer',
            default: 0,
          },
          {
            name: 'successful_interactions',
            type: 'integer',
            default: 0,
          },
          {
            name: 'average_response_time_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'user_satisfaction_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'consistency_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'coherence_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'relevance_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'creativity_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'peak_usage_hour',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'most_common_topics',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'conversation_length_avg',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'repeat_user_percentage',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'error_rate',
            type: 'decimal',
            precision: 5,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'timeout_rate',
            type: 'decimal',
            precision: 5,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'escalation_rate',
            type: 'decimal',
            precision: 5,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'resolution_rate',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'details',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'comparison_data',
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
        ],
      }),
      true
    );

    // Create indexes
    await this.createIndexes(queryRunner);

    // Create foreign keys
    await this.createForeignKeys(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    await this.dropForeignKeys(queryRunner);

    // Drop tables in reverse order
    await queryRunner.dropTable('persona_analytics');
    await queryRunner.dropTable('discussion_participants');
    await queryRunner.dropTable('artifact_deployments');
    await queryRunner.dropTable('approval_workflows');
    await queryRunner.dropTable('step_results');
    await queryRunner.dropTable('operation_checkpoints');
    await queryRunner.dropTable('operation_states');
    await queryRunner.dropTable('conversation_contexts');
    await queryRunner.dropTable('tool_usage_records');
    await queryRunner.dropTable('agent_capability_metrics');
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    // Agent Capability Metrics indexes
    await queryRunner.createIndex('agent_capability_metrics', new TableIndex({
      name: 'IDX_agent_capability_metrics_agent_capability',
      columnNames: ['agent_id', 'capability']
    }));
    await queryRunner.createIndex('agent_capability_metrics', new TableIndex({
      name: 'IDX_agent_capability_metrics_metric_recorded',
      columnNames: ['metric_type', 'recorded_at']
    }));
    await queryRunner.createIndex('agent_capability_metrics', new TableIndex({
      name: 'IDX_agent_capability_metrics_capability_score',
      columnNames: ['capability', 'score']
    }));

    // Tool Usage Records indexes
    await queryRunner.createIndex('tool_usage_records', new TableIndex({
      name: 'IDX_tool_usage_records_agent_tool',
      columnNames: ['agent_id', 'tool_id']
    }));
    await queryRunner.createIndex('tool_usage_records', new TableIndex({
      name: 'IDX_tool_usage_records_used_agent',
      columnNames: ['used_at', 'agent_id']
    }));
    await queryRunner.createIndex('tool_usage_records', new TableIndex({
      name: 'IDX_tool_usage_records_tool_success',
      columnNames: ['tool_id', 'success']
    }));

    // Conversation Contexts indexes
    await queryRunner.createIndex('conversation_contexts', new TableIndex({
      name: 'IDX_conversation_contexts_agent_session',
      columnNames: ['agent_id', 'session_id']
    }));
    await queryRunner.createIndex('conversation_contexts', new TableIndex({
      name: 'IDX_conversation_contexts_user_created',
      columnNames: ['user_id', 'created_at']
    }));
    await queryRunner.createIndex('conversation_contexts', new TableIndex({
      name: 'IDX_conversation_contexts_status_activity',
      columnNames: ['status', 'last_activity_at']
    }));

    // Operation States indexes
    await queryRunner.createIndex('operation_states', new TableIndex({
      name: 'IDX_operation_states_operation_transitioned',
      columnNames: ['operation_id', 'transitioned_at']
    }));
    await queryRunner.createIndex('operation_states', new TableIndex({
      name: 'IDX_operation_states_from_to_status',
      columnNames: ['from_status', 'to_status']
    }));
    await queryRunner.createIndex('operation_states', new TableIndex({
      name: 'IDX_operation_states_transitioned_at',
      columnNames: ['transitioned_at']
    }));

    // Operation Checkpoints indexes
    await queryRunner.createIndex('operation_checkpoints', new TableIndex({
      name: 'IDX_operation_checkpoints_operation_created',
      columnNames: ['operation_id', 'created_at']
    }));
    await queryRunner.createIndex('operation_checkpoints', new TableIndex({
      name: 'IDX_operation_checkpoints_type_active',
      columnNames: ['checkpoint_type', 'is_active']
    }));
    await queryRunner.createIndex('operation_checkpoints', new TableIndex({
      name: 'IDX_operation_checkpoints_step_number',
      columnNames: ['step_number']
    }));

    // Step Results indexes
    await queryRunner.createIndex('step_results', new TableIndex({
      name: 'IDX_step_results_operation_step',
      columnNames: ['operation_id', 'step_number']
    }));
    await queryRunner.createIndex('step_results', new TableIndex({
      name: 'IDX_step_results_status_completed',
      columnNames: ['status', 'completed_at']
    }));
    await queryRunner.createIndex('step_results', new TableIndex({
      name: 'IDX_step_results_step_type',
      columnNames: ['step_type']
    }));

    // Approval Workflows indexes
    await queryRunner.createIndex('approval_workflows', new TableIndex({
      name: 'IDX_approval_workflows_operation_status',
      columnNames: ['operation_id', 'status']
    }));
    await queryRunner.createIndex('approval_workflows', new TableIndex({
      name: 'IDX_approval_workflows_requested_by_at',
      columnNames: ['requested_by', 'requested_at']
    }));
    await queryRunner.createIndex('approval_workflows', new TableIndex({
      name: 'IDX_approval_workflows_approver_status',
      columnNames: ['approver_role', 'status']
    }));

    // Artifact Deployments indexes
    await queryRunner.createIndex('artifact_deployments', new TableIndex({
      name: 'IDX_artifact_deployments_artifact_deployed',
      columnNames: ['artifact_id', 'deployed_at']
    }));
    await queryRunner.createIndex('artifact_deployments', new TableIndex({
      name: 'IDX_artifact_deployments_environment_status',
      columnNames: ['environment', 'status']
    }));
    await queryRunner.createIndex('artifact_deployments', new TableIndex({
      name: 'IDX_artifact_deployments_deployed_by',
      columnNames: ['deployed_by']
    }));

    // Discussion Participants indexes
    await queryRunner.createIndex('discussion_participants', new TableIndex({
      name: 'IDX_discussion_participants_persona_discussion',
      columnNames: ['persona_id', 'discussion_id']
    }));
    await queryRunner.createIndex('discussion_participants', new TableIndex({
      name: 'IDX_discussion_participants_joined_left',
      columnNames: ['joined_at', 'left_at']
    }));
    await queryRunner.createIndex('discussion_participants', new TableIndex({
      name: 'IDX_discussion_participants_role_active',
      columnNames: ['role', 'is_active']
    }));

    // Persona Analytics indexes
    await queryRunner.createIndex('persona_analytics', new TableIndex({
      name: 'IDX_persona_analytics_persona_recorded',
      columnNames: ['persona_id', 'recorded_at']
    }));
    await queryRunner.createIndex('persona_analytics', new TableIndex({
      name: 'IDX_persona_analytics_metric_recorded',
      columnNames: ['metric_type', 'recorded_at']
    }));
    await queryRunner.createIndex('persona_analytics', new TableIndex({
      name: 'IDX_persona_analytics_period_persona',
      columnNames: ['period', 'persona_id']
    }));
  }

  private async createForeignKeys(queryRunner: QueryRunner): Promise<void> {
    // Note: TypeORM will automatically create foreign keys when creating tables
    // This method is here for completeness and future modifications
  }

  private async dropForeignKeys(queryRunner: QueryRunner): Promise<void> {
    // Note: TypeORM will automatically drop foreign keys when dropping tables
    // This method is here for completeness and future modifications
  }
} 