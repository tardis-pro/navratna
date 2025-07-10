import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

/**
 * Operations Table Migration
 * 
 * Creates the operations table with proper enum definitions that match the TypeScript enums.
 * This table tracks all operations performed by agents and users in the system.
 */
export class CreateOperationsTable1703010000000 implements MigrationInterface {
  name = 'CreateOperationsTable1703010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the operations_status_enum with lowercase values to match TypeScript
    await queryRunner.query(`
      CREATE TYPE "operations_status_enum" AS ENUM (
        'pending', 'queued', 'running', 'completed', 'failed', 
        'cancelled', 'suspended', 'paused', 'compensating'
      )
    `);

    // Create the operations_priority_enum
    await queryRunner.query(`
      CREATE TYPE "operations_priority_enum" AS ENUM (
        'low', 'medium', 'high', 'urgent'
      )
    `);

    // Create the operations table
    await queryRunner.createTable(
      new Table({
        name: 'operations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'type',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'status',
            type: 'enum',
            enumName: 'operations_status_enum',
            default: "'pending'",
          },
          {
            name: 'agent_id',
            type: 'varchar',
          },
          {
            name: 'user_id', 
            type: 'varchar',
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
            name: 'execution_plan',
            type: 'jsonb',
          },
          {
            name: 'context',
            type: 'jsonb',
            isNullable: true,
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
            name: 'estimated_duration',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'actual_duration',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'priority',
            type: 'enum',
            enumName: 'operations_priority_enum',
            default: "'medium'",
          },
          {
            name: 'progress',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'current_step',
            type: 'integer',
            default: 0,
          },
          {
            name: 'total_steps',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'step_details',
            type: 'jsonb',
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
            name: 'retry_delay',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'timeout_duration',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'resource_requirements',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'resource_allocation',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'performance_metrics',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'quality_metrics',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'dependencies',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'dependent_operations',
            type: 'jsonb',
            default: "'[]'",
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
            name: 'is_archived',
            type: 'boolean',
            default: false,
          },
          {
            name: 'archived_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'archived_by',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'archive_reason',
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
            columnNames: ['agent_id'],
            referencedTableName: 'agents',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true
    );

    // Create indexes for performance
    await queryRunner.createIndex('operations', new Index('IDX_operations_status_agent_id', ['status', 'agent_id']));
    await queryRunner.createIndex('operations', new Index('IDX_operations_type_created_at', ['type', 'created_at']));
    await queryRunner.createIndex('operations', new Index('IDX_operations_priority_status', ['priority', 'status']));
    await queryRunner.createIndex('operations', new Index('IDX_operations_user_id', ['user_id']));
    await queryRunner.createIndex('operations', new Index('IDX_operations_started_at_completed_at', ['started_at', 'completed_at']));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('operations');
    await queryRunner.query(`DROP TYPE IF EXISTS "operations_priority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "operations_status_enum"`);
  }
}