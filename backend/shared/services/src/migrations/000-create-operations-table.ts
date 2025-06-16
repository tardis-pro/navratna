import { MigrationInterface, QueryRunner, Table, TableIndex, ForeignKey } from 'typeorm';

export class CreateOperationsTable1703000000001 implements MigrationInterface {
  name = 'CreateOperationsTable1703000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create operations table
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
            name: 'type',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'paused'],
            default: "'pending'",
          },
          {
            name: 'priority',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'urgent'],
            default: "'medium'",
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
            name: 'plan',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'current_step',
            type: 'integer',
            default: 0,
          },
          {
            name: 'progress',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'results',
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
            name: 'cancelled_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true
    );

    // Create indexes
    await queryRunner.createIndex(
      'operations',
      new TableIndex({
        name: 'IDX_operations_status',
        columnNames: ['status'],
      })
    );

    await queryRunner.createIndex(
      'operations',
      new TableIndex({
        name: 'IDX_operations_agent_id',
        columnNames: ['agent_id'],
      })
    );

    await queryRunner.createIndex(
      'operations',
      new TableIndex({
        name: 'IDX_operations_user_id',
        columnNames: ['user_id'],
      })
    );

    await queryRunner.createIndex(
      'operations',
      new TableIndex({
        name: 'IDX_operations_type',
        columnNames: ['type'],
      })
    );

    await queryRunner.createIndex(
      'operations',
      new TableIndex({
        name: 'IDX_operations_priority',
        columnNames: ['priority'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('operations');
  }
} 