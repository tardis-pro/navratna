import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateMCPIntegrationTables1703000003000 implements MigrationInterface {
  name = 'CreateMCPIntegrationTables1703000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create mcp_servers table
    await queryRunner.createTable(
      new Table({
        name: 'mcp_servers',
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
            name: 'type',
            type: 'enum',
            enum: [
              'filesystem', 'database', 'api', 'web-search', 'code-execution',
              'knowledge-graph', 'monitoring', 'custom'
            ],
          },
          {
            name: 'command',
            type: 'text',
          },
          {
            name: 'args',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'env',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'working_directory',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'enabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'auto_start',
            type: 'boolean',
            default: false,
          },
          {
            name: 'retry_attempts',
            type: 'integer',
            default: 3,
          },
          {
            name: 'health_check_interval',
            type: 'integer',
            default: 30000,
          },
          {
            name: 'timeout',
            type: 'integer',
            default: 30000,
          },
          {
            name: 'tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'author',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'version',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'requires_approval',
            type: 'boolean',
            default: false,
          },
          {
            name: 'security_level',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['stopped', 'starting', 'running', 'error', 'stopping'],
            default: "'stopped'",
          },
          {
            name: 'pid',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'start_time',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'last_health_check',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'capabilities',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'capabilities_last_updated',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'tool_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'resource_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'prompt_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'stats',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'total_calls',
            type: 'integer',
            default: 0,
          },
          {
            name: 'successful_calls',
            type: 'integer',
            default: 0,
          },
          {
            name: 'failed_calls',
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
            name: 'last_call_time',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'uptime_seconds',
            type: 'integer',
            default: 0,
          },
          {
            name: 'memory_usage_mb',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'cpu_usage_percent',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'restart_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'last_restart_time',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'crash_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'last_crash_time',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'deployment_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'environment_variables',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'resource_limits',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'network_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'log_level',
            type: 'enum',
            enum: ['debug', 'info', 'warn', 'error'],
            default: "'info'",
          },
          {
            name: 'log_retention_days',
            type: 'integer',
            default: 7,
          },
          {
            name: 'debug_mode',
            type: 'boolean',
            default: false,
          },
          {
            name: 'trace_enabled',
            type: 'boolean',
            default: false,
          },
          {
            name: 'maintenance_mode',
            type: 'boolean',
            default: false,
          },
          {
            name: 'maintenance_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'scheduled_maintenance',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'deprecation_date',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'end_of_life_date',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'external_references',
            type: 'jsonb',
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

    // Create mcp_tool_calls table
    await queryRunner.createTable(
      new Table({
        name: 'mcp_tool_calls',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'server_id',
            type: 'uuid',
          },
          {
            name: 'tool_name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'parameters',
            type: 'jsonb',
          },
          {
            name: 'timestamp',
            type: 'timestamp',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'running', 'completed', 'failed'],
            default: "'pending'",
          },
          {
            name: 'result',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'duration',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
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
            name: 'conversation_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'operation_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'session_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'start_time',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'end_time',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'queue_time_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'execution_time_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'network_time_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'memory_usage_mb',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'cpu_usage_percent',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'network_bytes_sent',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'network_bytes_received',
            type: 'bigint',
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
            name: 'timeout_seconds',
            type: 'integer',
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
            name: 'security_level',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'critical'],
            default: "'medium'",
          },
          {
            name: 'approval_required',
            type: 'boolean',
            default: false,
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
            name: 'error_code',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'error_category',
            type: 'enum',
            enum: ['network', 'timeout', 'validation', 'execution', 'permission', 'resource'],
            isNullable: true,
          },
          {
            name: 'stack_trace',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'debug_info',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'cost_estimate',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'actual_cost',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'billing_category',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'cancelled_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'cancelled_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'cancellation_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'cleanup_completed',
            type: 'boolean',
            default: false,
          },
          {
            name: 'cleanup_at',
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
            name: 'call_context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'external_references',
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
            columnNames: ['server_id'],
            referencedTableName: 'mcp_servers',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true
    );

    // Create indexes for mcp_servers
    await queryRunner.createIndex(
      'mcp_servers',
      new TableIndex({
        name: 'IDX_mcp_servers_enabled_auto_start',
        columnNames: ['enabled', 'auto_start']
      })
    );
    await queryRunner.createIndex(
      'mcp_servers',
      new TableIndex({
        name: 'IDX_mcp_servers_type',
        columnNames: ['type']
      })
    );
    await queryRunner.createIndex(
      'mcp_servers',
      new TableIndex({
        name: 'IDX_mcp_servers_status',
        columnNames: ['status']
      })
    );
    await queryRunner.createIndex(
      'mcp_servers',
      new TableIndex({
        name: 'IDX_mcp_servers_security_level',
        columnNames: ['security_level']
      })
    );

    // Create indexes for mcp_tool_calls
    await queryRunner.createIndex(
      'mcp_tool_calls',
      new TableIndex({
        name: 'IDX_mcp_tool_calls_server_timestamp',
        columnNames: ['server_id', 'timestamp']
      })
    );
    await queryRunner.createIndex(
      'mcp_tool_calls',
      new TableIndex({
        name: 'IDX_mcp_tool_calls_status',
        columnNames: ['status']
      })
    );
    await queryRunner.createIndex(
      'mcp_tool_calls',
      new TableIndex({
        name: 'IDX_mcp_tool_calls_tool_name',
        columnNames: ['tool_name']
      })
    );
    await queryRunner.createIndex(
      'mcp_tool_calls',
      new TableIndex({
        name: 'IDX_mcp_tool_calls_timestamp_duration',
        columnNames: ['timestamp', 'duration']
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.dropIndex('mcp_tool_calls', 'IDX_mcp_tool_calls_timestamp_duration');
    await queryRunner.dropIndex('mcp_tool_calls', 'IDX_mcp_tool_calls_tool_name');
    await queryRunner.dropIndex('mcp_tool_calls', 'IDX_mcp_tool_calls_status');
    await queryRunner.dropIndex('mcp_tool_calls', 'IDX_mcp_tool_calls_server_timestamp');
    
    await queryRunner.dropIndex('mcp_servers', 'IDX_mcp_servers_security_level');
    await queryRunner.dropIndex('mcp_servers', 'IDX_mcp_servers_status');
    await queryRunner.dropIndex('mcp_servers', 'IDX_mcp_servers_type');
    await queryRunner.dropIndex('mcp_servers', 'IDX_mcp_servers_enabled_auto_start');

    // Drop tables
    await queryRunner.dropTable('mcp_tool_calls');
    await queryRunner.dropTable('mcp_servers');
  }
} 