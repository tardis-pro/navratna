import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMissingToolExecutionColumns1703000000007 implements MigrationInterface {
  name = 'AddMissingToolExecutionColumns1703000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add missing columns to tool_executions table
    await queryRunner.addColumns('tool_executions', [
      new TableColumn({
        name: 'operation_id',
        type: 'uuid',
        isNullable: true,
      }),
      new TableColumn({
        name: 'conversation_id',
        type: 'uuid',
        isNullable: true,
      }),
      new TableColumn({
        name: 'user_id',
        type: 'uuid',
        isNullable: true,
      }),
      new TableColumn({
        name: 'session_id',
        type: 'uuid',
        isNullable: true,
      }),
      new TableColumn({
        name: 'quality_score',
        type: 'decimal',
        precision: 3,
        scale: 2,
        isNullable: true,
      }),
      new TableColumn({
        name: 'user_satisfaction',
        type: 'decimal',
        precision: 3,
        scale: 2,
        isNullable: true,
      }),
      new TableColumn({
        name: 'performance_score',
        type: 'decimal',
        precision: 3,
        scale: 2,
        isNullable: true,
      }),
      new TableColumn({
        name: 'memory_usage_mb',
        type: 'decimal',
        precision: 10,
        scale: 2,
        isNullable: true,
      }),
      new TableColumn({
        name: 'cpu_usage_percent',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: true,
      }),
      new TableColumn({
        name: 'network_bytes_sent',
        type: 'integer',
        isNullable: true,
      }),
      new TableColumn({
        name: 'network_bytes_received',
        type: 'integer',
        isNullable: true,
      }),
      new TableColumn({
        name: 'security_level',
        type: 'enum',
        enum: ['low', 'medium', 'high', 'critical'],
        default: "'medium'",
      }),
      new TableColumn({
        name: 'compliance_tags',
        type: 'jsonb',
        default: "'[]'",
      }),
      new TableColumn({
        name: 'audit_trail',
        type: 'jsonb',
        default: "'[]'",
      }),
      new TableColumn({
        name: 'cancelled_at',
        type: 'timestamp',
        isNullable: true,
      }),
      new TableColumn({
        name: 'cancelled_by',
        type: 'uuid',
        isNullable: true,
      }),
      new TableColumn({
        name: 'cancellation_reason',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'cleanup_completed',
        type: 'boolean',
        default: false,
      }),
      new TableColumn({
        name: 'cleanup_at',
        type: 'timestamp',
        isNullable: true,
      }),
      new TableColumn({
        name: 'tags',
        type: 'jsonb',
        default: "'[]'",
      }),
      new TableColumn({
        name: 'external_references',
        type: 'jsonb',
        isNullable: true,
      }),
      new TableColumn({
        name: 'execution_context',
        type: 'jsonb',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the added columns
    const columnsToRemove = [
      'operation_id',
      'conversation_id',
      'user_id',
      'session_id',
      'quality_score',
      'user_satisfaction',
      'performance_score',
      'memory_usage_mb',
      'cpu_usage_percent',
      'network_bytes_sent',
      'network_bytes_received',
      'security_level',
      'compliance_tags',
      'audit_trail',
      'cancelled_at',
      'cancelled_by',
      'cancellation_reason',
      'cleanup_completed',
      'cleanup_at',
      'tags',
      'external_references',
      'execution_context',
    ];

    for (const columnName of columnsToRemove) {
      await queryRunner.dropColumn('tool_executions', columnName);
    }
  }
} 