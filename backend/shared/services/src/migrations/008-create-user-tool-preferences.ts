import { MigrationInterface, QueryRunner, Table, ForeignKey, Index } from 'typeorm';

export class CreateUserToolPreferences1738941234567 implements MigrationInterface {
  name = 'CreateUserToolPreferences1738941234567';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user_tool_preferences table
    await queryRunner.createTable(
      new Table({
        name: 'user_tool_preferences',
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
            isNullable: false,
          },
          {
            name: 'tool_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'parameter_defaults',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'custom_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'is_favorite',
            type: 'boolean',
            default: false,
          },
          {
            name: 'is_enabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'auto_approve',
            type: 'boolean',
            default: false,
          },
          {
            name: 'usage_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'rate_limits',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'budget_limit',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'budget_used',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'notify_on_completion',
            type: 'boolean',
            default: true,
          },
          {
            name: 'notify_on_error',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true
    );

    // Add foreign key constraint to users table
    await queryRunner.createForeignKey(
      'user_tool_preferences',
      new ForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      })
    );

    // Add foreign key constraint to tool_definitions table
    await queryRunner.createForeignKey(
      'user_tool_preferences',
      new ForeignKey({
        columnNames: ['tool_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'tool_definitions',
        onDelete: 'CASCADE',
      })
    );

    // Add unique constraint on user_id + tool_id combination
    await queryRunner.createIndex(
      'user_tool_preferences',
      new Index('idx_user_tool_preferences_user_tool_unique', ['user_id', 'tool_id'], {
        isUnique: true,
      })
    );

    // Add index on user_id for performance
    await queryRunner.createIndex(
      'user_tool_preferences',
      new Index('idx_user_tool_preferences_user_id', ['user_id'])
    );

    // Add index on tool_id for performance
    await queryRunner.createIndex(
      'user_tool_preferences',
      new Index('idx_user_tool_preferences_tool_id', ['tool_id'])
    );

    // Add index on is_favorite for quick favorite queries
    await queryRunner.createIndex(
      'user_tool_preferences',
      new Index('idx_user_tool_preferences_favorite', ['user_id', 'is_favorite'])
    );

    // Add index on is_enabled for quick enabled tool queries
    await queryRunner.createIndex(
      'user_tool_preferences',
      new Index('idx_user_tool_preferences_enabled', ['user_id', 'is_enabled'])
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the table (this will also drop all indexes and foreign keys)
    await queryRunner.dropTable('user_tool_preferences');
  }
}
