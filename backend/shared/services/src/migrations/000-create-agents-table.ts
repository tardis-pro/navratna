import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAgentsTable1703000000000 implements MigrationInterface {
  name = 'CreateAgentsTable1703000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create agents table
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
            name: 'name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'role',
            type: 'enum',
            enum: ['assistant', 'specialist', 'coordinator', 'analyst', 'executor'],
            default: "'assistant'",
          },
          {
            name: 'persona',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'intelligence_config',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'security_context',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_by',
            type: 'uuid',
            isNullable: true,
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
            isNullable: true,
          },
          {
            name: 'api_type',
            type: 'enum',
            enum: ['ollama', 'llmstudio'],
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
        ],
      }),
      true
    );

    // Create indexes
    await queryRunner.createIndex(
      'agents',
      new TableIndex({
        name: 'IDX_agents_role_is_active',
        columnNames: ['role', 'is_active'],
      })
    );

    await queryRunner.createIndex(
      'agents',
      new TableIndex({
        name: 'IDX_agents_created_by',
        columnNames: ['created_by'],
      })
    );

    await queryRunner.createIndex(
      'agents',
      new TableIndex({
        name: 'IDX_agents_last_active_at',
        columnNames: ['last_active_at'],
      })
    );

    await queryRunner.createIndex(
      'agents',
      new TableIndex({
        name: 'IDX_agents_security_level',
        columnNames: ['security_level'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('agents');
  }
} 