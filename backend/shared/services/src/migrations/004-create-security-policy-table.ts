import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateSecurityPolicyTable1703000000004 implements MigrationInterface {
  name = 'CreateSecurityPolicyTable1703000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create security_policies table
    await queryRunner.createTable(
      new Table({
        name: 'security_policies',
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
            length: '100',
          },
          {
            name: 'description',
            type: 'text',
          },
          {
            name: 'priority',
            type: 'integer',
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'conditions',
            type: 'jsonb',
          },
          {
            name: 'actions',
            type: 'jsonb',
          },
          {
            name: 'created_by',
            type: 'uuid',
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

    // Create indexes for better performance
    await queryRunner.createIndex(
      'security_policies',
      new TableIndex({
        name: 'IDX_security_policies_is_active',
        columnNames: ['is_active']
      })
    );

    await queryRunner.createIndex(
      'security_policies',
      new TableIndex({
        name: 'IDX_security_policies_priority',
        columnNames: ['priority']
      })
    );

    await queryRunner.createIndex(
      'security_policies',
      new TableIndex({
        name: 'IDX_security_policies_created_by',
        columnNames: ['created_by']
      })
    );

    await queryRunner.createIndex(
      'security_policies',
      new TableIndex({
        name: 'IDX_security_policies_name',
        columnNames: ['name']
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('security_policies', 'IDX_security_policies_name');
    await queryRunner.dropIndex('security_policies', 'IDX_security_policies_created_by');
    await queryRunner.dropIndex('security_policies', 'IDX_security_policies_priority');
    await queryRunner.dropIndex('security_policies', 'IDX_security_policies_is_active');

    // Drop table
    await queryRunner.dropTable('security_policies');
  }
} 