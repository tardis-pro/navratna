import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateExecutionPlansTable1703000000002 implements MigrationInterface {
  name = 'CreateExecutionPlansTable1703000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create execution_plans table
    await queryRunner.createTable(
      new Table({
        name: 'execution_plans',
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
            name: 'agent_id',
            type: 'uuid',
          },
          {
            name: 'steps',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'dependencies',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'estimated_duration',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'priority',
            type: 'varchar',
            length: '50',
            default: "'medium'",
          },
          {
            name: 'constraints',
            type: 'jsonb',
            isNullable: true,
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
    await queryRunner.createIndex(
      'execution_plans',
      new TableIndex({
        name: 'IDX_execution_plans_agent_id',
        columnNames: ['agent_id'],
      })
    );

    await queryRunner.createIndex(
      'execution_plans',
      new TableIndex({
        name: 'IDX_execution_plans_type',
        columnNames: ['type'],
      })
    );

    await queryRunner.createIndex(
      'execution_plans',
      new TableIndex({
        name: 'IDX_execution_plans_priority',
        columnNames: ['priority'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('execution_plans');
  }
} 