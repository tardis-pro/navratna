import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAgentLearningRecordsTable1703000000003 implements MigrationInterface {
  name = 'CreateAgentLearningRecordsTable1703000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create agent_learning_records table
    await queryRunner.createTable(
      new Table({
        name: 'agent_learning_records',
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
            name: 'operation_id',
            type: 'uuid',
          },
          {
            name: 'learning_data',
            type: 'jsonb',
          },
          {
            name: 'confidence_adjustments',
            type: 'jsonb',
          },
        ],
      }),
      true
    );

    // Create indexes
    await queryRunner.createIndex(
      'agent_learning_records',
      new TableIndex({
        name: 'IDX_agent_learning_records_agent_id',
        columnNames: ['agent_id'],
      })
    );

    await queryRunner.createIndex(
      'agent_learning_records',
      new TableIndex({
        name: 'IDX_agent_learning_records_operation_id',
        columnNames: ['operation_id'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('agent_learning_records');
  }
} 