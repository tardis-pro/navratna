import { MigrationInterface, QueryRunner, Table, TableIndex, ForeignKey } from 'typeorm';

export class CreateUserSystemTables1703000000005 implements MigrationInterface {
  name = 'CreateUserSystemTables1703000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()'
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false
          },
          {
            name: 'first_name',
            type: 'varchar',
            length: '255',
            isNullable: true
          },
          {
            name: 'last_name',
            type: 'varchar',
            length: '255',
            isNullable: true
          },
          {
            name: 'department',
            type: 'varchar',
            length: '100',
            isNullable: true
          },
          {
            name: 'role',
            type: 'varchar',
            length: '50',
            isNullable: false
          },
          {
            name: 'password_hash',
            type: 'varchar',
            length: '255',
            isNullable: false
          },
          {
            name: 'security_clearance',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'critical'],
            default: "'medium'",
            isNullable: false
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
            isNullable: false
          },
          {
            name: 'failed_login_attempts',
            type: 'integer',
            default: 0,
            isNullable: false
          },
          {
            name: 'locked_until',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'password_changed_at',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'last_login_at',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false
          }
        ]
      }),
      true
    );

    // Create indexes for users table
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_users_email',
        columnNames: ['email'],
        isUnique: true
      })
    );
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_users_is_active',
        columnNames: ['is_active']
      })
    );
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_users_role',
        columnNames: ['role']
      })
    );

    // Create refresh_tokens table
    await queryRunner.createTable(
      new Table({
        name: 'refresh_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()'
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'token',
            type: 'varchar',
            length: '500',
            isUnique: true,
            isNullable: false
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: false
          },
          {
            name: 'revoked_at',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false
          }
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

    // Create indexes for refresh_tokens table
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({
        name: 'IDX_refresh_tokens_token',
        columnNames: ['token'],
        isUnique: true
      })
    );
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({
        name: 'IDX_refresh_tokens_user_id',
        columnNames: ['user_id']
      })
    );
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({
        name: 'IDX_refresh_tokens_expires_at',
        columnNames: ['expires_at']
      })
    );
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({
        name: 'IDX_refresh_tokens_revoked_at',
        columnNames: ['revoked_at']
      })
    );

    // Create password_reset_tokens table
    await queryRunner.createTable(
      new Table({
        name: 'password_reset_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()'
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'token',
            type: 'varchar',
            length: '500',
            isUnique: true,
            isNullable: false
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: false
          },
          {
            name: 'used_at',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false
          }
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

    // Create indexes for password_reset_tokens table
    await queryRunner.createIndex(
      'password_reset_tokens',
      new TableIndex({
        name: 'IDX_password_reset_tokens_token',
        columnNames: ['token'],
        isUnique: true
      })
    );
    await queryRunner.createIndex(
      'password_reset_tokens',
      new TableIndex({
        name: 'IDX_password_reset_tokens_user_id',
        columnNames: ['user_id']
      })
    );
    await queryRunner.createIndex(
      'password_reset_tokens',
      new TableIndex({
        name: 'IDX_password_reset_tokens_expires_at',
        columnNames: ['expires_at']
      })
    );
    await queryRunner.createIndex(
      'password_reset_tokens',
      new TableIndex({
        name: 'IDX_password_reset_tokens_used_at',
        columnNames: ['used_at']
      })
    );

    console.log('✅ User system tables created successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order (foreign keys will be dropped automatically)
    await queryRunner.dropTable('password_reset_tokens');
    await queryRunner.dropTable('refresh_tokens');
    await queryRunner.dropTable('users');

    console.log('✅ User system tables dropped successfully');
  }
} 