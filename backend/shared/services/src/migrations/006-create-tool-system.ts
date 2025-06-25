import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

/**
 * Tool System Migration
 * 
 * Creates the tool management tables:
 * - tool_definitions: Tool definitions and configurations
 * - tool_executions: Tool execution records and results
 * - tool_usage_records: Tool usage tracking and analytics
 * - mcp_servers: MCP server configurations
 * - mcp_tool_calls: MCP tool call records
 * 
 * These tables manage tool definitions, executions, and MCP integration.
 * Dependencies: users, agents tables
 */
export class CreateToolSystem1703006000000 implements MigrationInterface {
  name = 'CreateToolSystem1703006000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create tool_definitions table
    await queryRunner.createTable(
      new Table({
        name: 'tool_definitions',
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
            isUnique: true,
          },
          {
            name: 'description',
            type: 'text',
          },
          {
            name: 'category',
            type: 'enum',
            enum: ['system', 'utility', 'communication', 'data', 'analysis', 'automation', 'integration', 'custom'],
          },
          {
            name: 'parameters',
            type: 'jsonb',
          },
          {
            name: 'return_type',
            type: 'jsonb',
          },
          {
            name: 'examples',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'security_level',
            type: 'enum',
            enum: ['safe', 'moderate', 'restricted', 'dangerous'],
          },
          {
            name: 'cost_estimate',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'execution_time_estimate',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'requires_approval',
            type: 'boolean',
            default: false,
          },
          {
            name: 'dependencies',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'version',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'author',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'is_enabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'rate_limits',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'total_executions',
            type: 'integer',
            default: 0,
          },
          {
            name: 'successful_executions',
            type: 'integer',
            default: 0,
          },
          {
            name: 'average_execution_time',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'documentation_url',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'support_contact',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'changelog',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'deployment_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'environment_requirements',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'reliability_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'user_rating',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'maintenance_status',
            type: 'enum',
            enum: ['active', 'maintenance', 'deprecated', 'archived'],
            default: "'active'",
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
      }),
      true
    );

    // Create tool_executions table
    await queryRunner.createTable(
      new Table({
        name: 'tool_executions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'tool_id',
            type: 'uuid',
          },
          {
            name: 'agent_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'session_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'operation_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'execution_context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'input_parameters',
            type: 'jsonb',
          },
          {
            name: 'output_result',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'execution_status',
            type: 'enum',
            enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'timeout'],
            default: "'pending'",
          },
          {
            name: 'started_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
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
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'error_stack',
            type: 'text',
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
            name: 'priority',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'critical'],
            default: "'medium'",
          },
          {
            name: 'resource_usage',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'cost_incurred',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'approval_status',
            type: 'enum',
            enum: ['not_required', 'pending', 'approved', 'rejected'],
            default: "'not_required'",
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
            columnNames: ['tool_id'],
            referencedTableName: 'tool_definitions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['agent_id'],
            referencedTableName: 'agents',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['approved_by'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
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
            name: 'tool_id',
            type: 'uuid',
          },
          {
            name: 'agent_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'usage_type',
            type: 'enum',
            enum: ['execution', 'query', 'configuration', 'discovery'],
            default: "'execution'",
          },
          {
            name: 'usage_context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'success',
            type: 'boolean',
          },
          {
            name: 'execution_time_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'resource_consumption',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'cost',
            type: 'decimal',
            precision: 10,
            scale: 4,
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
            columnNames: ['tool_id'],
            referencedTableName: 'tool_definitions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['agent_id'],
            referencedTableName: 'agents',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
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

    // Create indexes
    await queryRunner.createIndex('tool_definitions', new Index('IDX_tool_definitions_category_is_enabled', ['category', 'is_enabled']));
    await queryRunner.createIndex('tool_definitions', new Index('IDX_tool_definitions_security_level', ['security_level']));
    await queryRunner.createIndex('tool_definitions', new Index('IDX_tool_definitions_author', ['author']));
    
    await queryRunner.createIndex('tool_executions', new Index('IDX_tool_executions_tool_id', ['tool_id']));
    await queryRunner.createIndex('tool_executions', new Index('IDX_tool_executions_agent_id', ['agent_id']));
    await queryRunner.createIndex('tool_executions', new Index('IDX_tool_executions_execution_status', ['execution_status']));
    await queryRunner.createIndex('tool_executions', new Index('IDX_tool_executions_started_at', ['started_at']));
    
    await queryRunner.createIndex('tool_usage_records', new Index('IDX_tool_usage_records_tool_id', ['tool_id']));
    await queryRunner.createIndex('tool_usage_records', new Index('IDX_tool_usage_records_agent_id', ['agent_id']));
    await queryRunner.createIndex('tool_usage_records', new Index('IDX_tool_usage_records_recorded_at', ['recorded_at']));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('tool_usage_records');
    await queryRunner.dropTable('tool_executions');
    await queryRunner.dropTable('tool_definitions');
  }
} 