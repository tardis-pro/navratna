import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddAuditArchivingColumns1703000000002 implements MigrationInterface {
  name = 'AddAuditArchivingColumns1703000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create audit_events table (missing from original migration)
    await queryRunner.createTable(
      new Table({
        name: 'audit_events',
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
            name: 'event_type',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'agent_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'resource_type',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'resource_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'details',
            type: 'jsonb',
          },
          {
            name: 'ip_address',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'user_agent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'risk_level',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'timestamp',
            type: 'timestamp',
          },
          {
            name: 'is_archived',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'archived_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true
    );

    // Add indexes for audit_events table
    await queryRunner.createIndex('audit_events', new TableIndex({
      name: 'IDX_audit_events_event_type_timestamp',
      columnNames: ['event_type', 'timestamp']
    }));
    await queryRunner.createIndex('audit_events', new TableIndex({
      name: 'IDX_audit_events_user_id_timestamp',
      columnNames: ['user_id', 'timestamp']
    }));
    await queryRunner.createIndex('audit_events', new TableIndex({
      name: 'IDX_audit_events_agent_id_timestamp',
      columnNames: ['agent_id', 'timestamp']
    }));
    await queryRunner.createIndex('audit_events', new TableIndex({
      name: 'IDX_audit_events_resource_type_resource_id',
      columnNames: ['resource_type', 'resource_id']
    }));
    await queryRunner.createIndex('audit_events', new TableIndex({
      name: 'IDX_audit_events_risk_level_timestamp',
      columnNames: ['risk_level', 'timestamp']
    }));
    await queryRunner.createIndex('audit_events', new TableIndex({
      name: 'IDX_audit_events_timestamp',
      columnNames: ['timestamp']
    }));
    await queryRunner.createIndex('audit_events', new TableIndex({
      name: 'IDX_audit_events_is_archived_timestamp',
      columnNames: ['is_archived', 'timestamp']
    }));
    await queryRunner.createIndex('audit_events', new TableIndex({
      name: 'IDX_audit_events_archived_at',
      columnNames: ['archived_at']
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the entire audit_events table
    await queryRunner.dropTable('audit_events');
  }
} 