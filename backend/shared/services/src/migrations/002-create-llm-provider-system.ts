import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

/**
 * LLM Provider System Migration
 *
 * Creates the LLM provider management tables:
 * - llm_providers: System-wide LLM provider configurations
 * - user_llm_providers: User-specific LLM provider settings
 *
 * These tables manage LLM provider configurations and user access.
 * Dependencies: users table
 */
export class CreateLlmProviderSystem1703002000000 implements MigrationInterface {
  name = 'CreateLlmProviderSystem1703002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create llm_providers table - System-wide LLM provider configurations
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
          },
          {
            name: 'display_name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'provider_type',
            type: 'enum',
            enum: [
              'ollama',
              'llmstudio',
              'openai',
              'anthropic',
              'azure',
              'google',
              'huggingface',
              'custom',
            ],
          },
          {
            name: 'base_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'api_version',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'supported_models',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'default_model',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'capabilities',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'rate_limits',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'pricing_info',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'configuration_schema',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'default_parameters',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'authentication_type',
            type: 'enum',
            enum: ['none', 'api_key', 'bearer_token', 'oauth', 'basic_auth', 'custom'],
            default: "'api_key'",
          },
          {
            name: 'authentication_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'health_check_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'is_enabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'is_system_default',
            type: 'boolean',
            default: false,
          },
          {
            name: 'requires_api_key',
            type: 'boolean',
            default: true,
          },
          {
            name: 'supports_streaming',
            type: 'boolean',
            default: false,
          },
          {
            name: 'supports_function_calling',
            type: 'boolean',
            default: false,
          },
          {
            name: 'supports_vision',
            type: 'boolean',
            default: false,
          },
          {
            name: 'max_context_length',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'max_output_tokens',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'priority',
            type: 'integer',
            default: 0,
          },
          {
            name: 'tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'inactive', 'maintenance', 'deprecated'],
            default: "'active'",
          },
          {
            name: 'last_health_check',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'health_status',
            type: 'enum',
            enum: ['healthy', 'unhealthy', 'unknown'],
            default: "'unknown'",
          },
          {
            name: 'error_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'total_requests',
            type: 'bigint',
            default: 0,
          },
          {
            name: 'successful_requests',
            type: 'bigint',
            default: 0,
          },
          {
            name: 'average_response_time',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'created_by',
            type: 'uuid',
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
          {
            columnNames: ['updated_by'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true
    );

    // Create user_llm_providers table - User-specific LLM provider settings
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
          },
          {
            name: 'provider_id',
            type: 'uuid',
          },
          {
            name: 'provider_name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'display_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'api_key',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'api_endpoint',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'model_preferences',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'default_parameters',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'rate_limit_overrides',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'usage_limits',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'cost_tracking',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'is_enabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'is_default',
            type: 'boolean',
            default: false,
          },
          {
            name: 'is_shared',
            type: 'boolean',
            default: false,
          },
          {
            name: 'shared_with_users',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'shared_with_teams',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'permissions',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'configuration',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'validation_status',
            type: 'enum',
            enum: ['pending', 'valid', 'invalid', 'expired'],
            default: "'pending'",
          },
          {
            name: 'last_validated_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'validation_error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'usage_stats',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'total_requests',
            type: 'bigint',
            default: 0,
          },
          {
            name: 'successful_requests',
            type: 'bigint',
            default: 0,
          },
          {
            name: 'failed_requests',
            type: 'bigint',
            default: 0,
          },
          {
            name: 'total_tokens_used',
            type: 'bigint',
            default: 0,
          },
          {
            name: 'total_cost',
            type: 'decimal',
            precision: 10,
            scale: 4,
            default: 0,
          },
          {
            name: 'last_used_at',
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
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['provider_id'],
            referencedTableName: 'llm_providers',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      'llm_providers',
      new Index('IDX_llm_providers_provider_type', ['provider_type'])
    );
    await queryRunner.createIndex(
      'llm_providers',
      new Index('IDX_llm_providers_is_enabled', ['is_enabled'])
    );
    await queryRunner.createIndex(
      'llm_providers',
      new Index('IDX_llm_providers_status', ['status'])
    );
    await queryRunner.createIndex(
      'llm_providers',
      new Index('IDX_llm_providers_is_system_default', ['is_system_default'])
    );
    await queryRunner.createIndex(
      'llm_providers',
      new Index('IDX_llm_providers_created_by', ['created_by'])
    );
    await queryRunner.createIndex(
      'llm_providers',
      new Index('IDX_llm_providers_health_status', ['health_status'])
    );

    await queryRunner.createIndex(
      'user_llm_providers',
      new Index('IDX_user_llm_providers_user_id', ['user_id'])
    );
    await queryRunner.createIndex(
      'user_llm_providers',
      new Index('IDX_user_llm_providers_provider_id', ['provider_id'])
    );
    await queryRunner.createIndex(
      'user_llm_providers',
      new Index('IDX_user_llm_providers_is_enabled', ['is_enabled'])
    );
    await queryRunner.createIndex(
      'user_llm_providers',
      new Index('IDX_user_llm_providers_is_default', ['is_default'])
    );
    await queryRunner.createIndex(
      'user_llm_providers',
      new Index('IDX_user_llm_providers_validation_status', ['validation_status'])
    );
    await queryRunner.createIndex(
      'user_llm_providers',
      new Index('IDX_user_llm_providers_user_provider', ['user_id', 'provider_id'])
    );
    await queryRunner.createIndex(
      'user_llm_providers',
      new Index('IDX_user_llm_providers_last_used_at', ['last_used_at'])
    );

    // Create unique constraint for system default provider (only one can be default)
    await queryRunner.createIndex(
      'llm_providers',
      new Index('IDX_llm_providers_unique_system_default', ['is_system_default'], {
        where: 'is_system_default = true',
      })
    );

    // Create unique constraint for user default provider per user
    await queryRunner.createIndex(
      'user_llm_providers',
      new Index('IDX_user_llm_providers_unique_user_default', ['user_id', 'is_default'], {
        where: 'is_default = true',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order to respect foreign key constraints
    await queryRunner.dropTable('user_llm_providers');
    await queryRunner.dropTable('llm_providers');
  }
}
