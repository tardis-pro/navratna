import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateLLMProvidersTable1703000000021 implements MigrationInterface {
  name = 'CreateLLMProvidersTable1703000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the llm_providers table
    await queryRunner.createTable(
      new Table({
        name: 'llm_providers',
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
            enum: ['ollama', 'openai', 'llmstudio', 'anthropic', 'custom'],
            default: "'custom'",
            isNullable: false,
          },
          {
            name: 'base_url',
            type: 'varchar',
            length: '500',
            isNullable: false,
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
            default: "'active'",
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
            name: 'created_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'updated_by',
            type: 'uuid',
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
      'llm_providers',
      new Index('IDX_llm_providers_name', ['name'], { isUnique: true })
    );

    await queryRunner.createIndex(
      'llm_providers',
      new Index('IDX_llm_providers_type_active', ['type', 'is_active'])
    );

    await queryRunner.createIndex(
      'llm_providers',
      new Index('IDX_llm_providers_status_priority', ['status', 'priority'])
    );

    await queryRunner.createIndex(
      'llm_providers',
      new Index('IDX_llm_providers_last_used', ['last_used_at'])
    );

    // Insert default providers if they don't exist
    await this.insertDefaultProviders(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.dropIndex('llm_providers', 'IDX_llm_providers_last_used');
    await queryRunner.dropIndex('llm_providers', 'IDX_llm_providers_status_priority');
    await queryRunner.dropIndex('llm_providers', 'IDX_llm_providers_type_active');
    await queryRunner.dropIndex('llm_providers', 'IDX_llm_providers_name');

    // Drop the table
    await queryRunner.dropTable('llm_providers');
  }

  private async insertDefaultProviders(queryRunner: QueryRunner): Promise<void> {
    // Insert default Ollama provider
    await queryRunner.query(`
      INSERT INTO llm_providers (
        name, description, type, base_url, default_model, priority, status, is_active
      ) VALUES (
        'Default Ollama',
        'Default local Ollama instance',
        'ollama',
        'http://localhost:11434',
        'llama2',
        100,
        'inactive',
        false
      ) ON CONFLICT (name) DO NOTHING;
    `);

    // Insert default LLM Studio provider
    await queryRunner.query(`
      INSERT INTO llm_providers (
        name, description, type, base_url, default_model, priority, status, is_active
      ) VALUES (
        'Default LLM Studio',
        'Default LLM Studio instance',
        'llmstudio',
        'http://localhost:1234',
        'gpt-3.5-turbo',
        200,
        'inactive',
        false
      ) ON CONFLICT (name) DO NOTHING;
    `);

    // Insert OpenAI provider template (inactive by default)
    await queryRunner.query(`
      INSERT INTO llm_providers (
        name, description, type, base_url, default_model, priority, status, is_active
      ) VALUES (
        'OpenAI',
        'OpenAI API provider',
        'openai',
        'https://api.openai.com',
        'gpt-3.5-turbo',
        300,
        'inactive',
        false
      ) ON CONFLICT (name) DO NOTHING;
    `);

    console.log('✅ Default LLM providers inserted (inactive by default)');
    console.log('💡 Configure API keys and activate providers through the admin interface');
  }
} 