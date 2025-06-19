import { MigrationInterface, QueryRunner, Table, Index, ForeignKey } from 'typeorm';

export class CreateUserLLMProvidersTable1703000000022 implements MigrationInterface {
  name = 'CreateUserLLMProvidersTable1703000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the user_llm_providers table
    await queryRunner.createTable(
      new Table({
        name: 'user_llm_providers',
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
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['openai', 'anthropic', 'google', 'ollama', 'llmstudio', 'custom'],
            isNullable: false,
          },
          {
            name: 'base_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'api_key_encrypted',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'default_model',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'models_list',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'configuration',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'inactive', 'error', 'testing'],
            default: "'testing'",
            isNullable: false,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'priority',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'total_tokens_used',
            type: 'bigint',
            default: 0,
            isNullable: false,
          },
          {
            name: 'total_requests',
            type: 'bigint',
            default: 0,
            isNullable: false,
          },
          {
            name: 'total_errors',
            type: 'bigint',
            default: 0,
            isNullable: false,
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'last_health_check_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'health_check_result',
            type: 'json',
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

    // Create indexes
    await queryRunner.createIndex(
      'user_llm_providers',
      new Index('IDX_user_llm_providers_user_type', ['user_id', 'type'], { isUnique: true })
    );

    await queryRunner.createIndex(
      'user_llm_providers',
      new Index('IDX_user_llm_providers_user_active', ['user_id', 'is_active'])
    );

    await queryRunner.createIndex(
      'user_llm_providers',
      new Index('IDX_user_llm_providers_status_priority', ['status', 'priority'])
    );

    await queryRunner.createIndex(
      'user_llm_providers',
      new Index('IDX_user_llm_providers_last_used', ['last_used_at'])
    );

    // Create foreign key constraint to users table
    await queryRunner.createForeignKey(
      'user_llm_providers',
      new ForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key first
    const table = await queryRunner.getTable('user_llm_providers');
    const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('user_id') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey('user_llm_providers', foreignKey);
    }

    // Drop indexes
    await queryRunner.dropIndex('user_llm_providers', 'IDX_user_llm_providers_last_used');
    await queryRunner.dropIndex('user_llm_providers', 'IDX_user_llm_providers_status_priority');
    await queryRunner.dropIndex('user_llm_providers', 'IDX_user_llm_providers_user_active');
    await queryRunner.dropIndex('user_llm_providers', 'IDX_user_llm_providers_user_type');

    // Drop the table
    await queryRunner.dropTable('user_llm_providers');
  }
} 