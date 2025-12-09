import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

/**
 * Core Foundation Tables Migration
 *
 * Creates the foundational tables that have no dependencies:
 * - users: Core user management
 * - refresh_tokens: User authentication tokens
 * - password_reset_tokens: Password reset functionality
 * - security_policies: System security policies
 * - integration_events: System integration events
 *
 * These tables form the foundation and are referenced by other entities.
 */
export class CreateCoreFoundationTables1703001000000 implements MigrationInterface {
  name = 'CreateCoreFoundationTables1703001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table - Core user management
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'first_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'last_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'department',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'role',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'password_hash',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'security_clearance',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'critical'],
            default: "'medium'",
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'failed_login_attempts',
            type: 'integer',
            default: 0,
          },
          {
            name: 'locked_until',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'password_changed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'last_login_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'permissions',
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
      }),
      true
    );

    // Create refresh_tokens table - User authentication tokens
    await queryRunner.createTable(
      new Table({
        name: 'refresh_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'token',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
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
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true
    );

    // Create password_reset_tokens table - Password reset functionality
    await queryRunner.createTable(
      new Table({
        name: 'password_reset_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'token',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
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
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true
    );

    // Create security_policies table - System security policies
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
            length: '255',
            isUnique: true,
          },
          {
            name: 'description',
            type: 'text',
          },
          {
            name: 'policy_data',
            type: 'jsonb',
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'version',
            type: 'varchar',
            length: '50',
            default: "'1.0.0'",
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
        foreignKeys: [
          {
            columnNames: ['created_by'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true
    );

    // Create integration_events table - System integration events
    await queryRunner.createTable(
      new Table({
        name: 'integration_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'event_type',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'source_system',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'target_system',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'event_data',
            type: 'jsonb',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'processing', 'completed', 'failed', 'retrying'],
            default: "'pending'",
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
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'processed_at',
            type: 'timestamp',
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

    // Create indexes for performance
    await queryRunner.createIndex('users', new Index('IDX_users_email', ['email']));
    await queryRunner.createIndex('users', new Index('IDX_users_is_active', ['is_active']));
    await queryRunner.createIndex('users', new Index('IDX_users_role', ['role']));

    await queryRunner.createIndex(
      'refresh_tokens',
      new Index('IDX_refresh_tokens_user_id', ['user_id'])
    );
    await queryRunner.createIndex(
      'refresh_tokens',
      new Index('IDX_refresh_tokens_expires_at', ['expires_at'])
    );

    await queryRunner.createIndex(
      'password_reset_tokens',
      new Index('IDX_password_reset_tokens_user_id', ['user_id'])
    );
    await queryRunner.createIndex(
      'password_reset_tokens',
      new Index('IDX_password_reset_tokens_expires_at', ['expires_at'])
    );

    await queryRunner.createIndex(
      'security_policies',
      new Index('IDX_security_policies_is_active', ['is_active'])
    );
    await queryRunner.createIndex(
      'security_policies',
      new Index('IDX_security_policies_created_by', ['created_by'])
    );

    await queryRunner.createIndex(
      'integration_events',
      new Index('IDX_integration_events_status', ['status'])
    );
    await queryRunner.createIndex(
      'integration_events',
      new Index('IDX_integration_events_event_type', ['event_type'])
    );
    await queryRunner.createIndex(
      'integration_events',
      new Index('IDX_integration_events_source_system', ['source_system'])
    );
    await queryRunner.createIndex(
      'integration_events',
      new Index('IDX_integration_events_created_at', ['created_at'])
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order to respect foreign key constraints
    await queryRunner.dropTable('integration_events');
    await queryRunner.dropTable('security_policies');
    await queryRunner.dropTable('password_reset_tokens');
    await queryRunner.dropTable('refresh_tokens');
    await queryRunner.dropTable('users');
  }
}
