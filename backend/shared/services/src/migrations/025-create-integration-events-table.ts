import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateIntegrationEventsTable1704067200000 implements MigrationInterface {
  name = 'CreateIntegrationEventsTable1704067200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create integration_events table
    await queryRunner.createTable(
      new Table({
        name: 'integration_events',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'entity_type',
            type: 'enum',
            enum: ['MCPServer', 'MCPToolCall', 'Tool', 'Agent'],
            isNullable: false,
          },
          {
            name: 'entity_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'action',
            type: 'enum',
            enum: ['CREATE', 'UPDATE', 'DELETE'],
            isNullable: false,
          },
          {
            name: 'payload',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'timestamp',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'processed',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'retries',
            type: 'integer',
            default: 0,
            isNullable: false,
          },
          {
            name: 'last_error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'version',
            type: 'integer',
            default: 1,
            isNullable: false,
          },
          {
            name: 'processed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'next_retry_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'batch_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      'integration_events',
      new Index('IDX_integration_events_processed_entity_type', ['processed', 'entity_type'])
    );

    await queryRunner.createIndex(
      'integration_events',
      new Index('IDX_integration_events_timestamp', ['timestamp'])
    );

    await queryRunner.createIndex(
      'integration_events',
      new Index('IDX_integration_events_retries', ['retries'])
    );

    await queryRunner.createIndex(
      'integration_events',
      new Index('IDX_integration_events_next_retry_at', ['next_retry_at'])
    );

    await queryRunner.createIndex(
      'integration_events',
      new Index('IDX_integration_events_entity_id', ['entity_id'])
    );

    await queryRunner.createIndex(
      'integration_events',
      new Index('IDX_integration_events_batch_id', ['batch_id'])
    );

    // Create partial index for unprocessed events (performance optimization)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IDX_integration_events_unprocessed 
      ON integration_events (timestamp, entity_type) 
      WHERE processed = false;
    `);

    // Create partial index for retryable events
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IDX_integration_events_retryable 
      ON integration_events (next_retry_at, retries) 
      WHERE processed = false AND retries < 5 AND next_retry_at IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.dropIndex('integration_events', 'IDX_integration_events_retryable');
    await queryRunner.dropIndex('integration_events', 'IDX_integration_events_unprocessed');
    await queryRunner.dropIndex('integration_events', 'IDX_integration_events_batch_id');
    await queryRunner.dropIndex('integration_events', 'IDX_integration_events_entity_id');
    await queryRunner.dropIndex('integration_events', 'IDX_integration_events_next_retry_at');
    await queryRunner.dropIndex('integration_events', 'IDX_integration_events_retries');
    await queryRunner.dropIndex('integration_events', 'IDX_integration_events_timestamp');
    await queryRunner.dropIndex('integration_events', 'IDX_integration_events_processed_entity_type');

    // Drop table
    await queryRunner.dropTable('integration_events');
  }
} 