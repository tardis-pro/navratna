import { MigrationInterface, QueryRunner, Table, Index, ForeignKey } from 'typeorm';

export class CreateLLMModelsTable1737109800000 implements MigrationInterface {
    name = 'CreateLLMModelsTable1737109800000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create llm_models table
        await queryRunner.createTable(
            new Table({
                name: 'llm_models',
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
                        name: 'providerId',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'apiType',
                        type: 'varchar',
                        length: '100',
                        isNullable: true,
                    },
                    {
                        name: 'apiEndpoint',
                        type: 'varchar',
                        length: '500',
                        isNullable: true,
                    },
                    {
                        name: 'contextLength',
                        type: 'int',
                        isNullable: true,
                    },
                    {
                        name: 'inputTokenCost',
                        type: 'decimal',
                        precision: 10,
                        scale: 6,
                        isNullable: true,
                    },
                    {
                        name: 'outputTokenCost',
                        type: 'decimal',
                        precision: 10,
                        scale: 6,
                        isNullable: true,
                    },
                    {
                        name: 'capabilities',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'parameters',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'isAvailable',
                        type: 'boolean',
                        default: true,
                    },
                    {
                        name: 'isActive',
                        type: 'boolean',
                        default: true,
                    },
                    {
                        name: 'priority',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'totalTokensUsed',
                        type: 'bigint',
                        default: 0,
                    },
                    {
                        name: 'totalRequests',
                        type: 'bigint',
                        default: 0,
                    },
                    {
                        name: 'totalErrors',
                        type: 'bigint',
                        default: 0,
                    },
                    {
                        name: 'lastUsedAt',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'lastCheckedAt',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'healthStatus',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'createdBy',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'updatedBy',
                        type: 'uuid',
                        isNullable: true,
                    },
                ],
            }),
            true
        );

        // Create indexes
        await queryRunner.createIndex(
            'llm_models',
            new Index({
                name: 'IDX_llm_models_name_providerId',
                columnNames: ['name', 'providerId'],
                isUnique: true,
            })
        );

        await queryRunner.createIndex(
            'llm_models',
            new Index({
                name: 'IDX_llm_models_providerId_isAvailable',
                columnNames: ['providerId', 'isAvailable'],
            })
        );

        await queryRunner.createIndex(
            'llm_models',
            new Index({
                name: 'IDX_llm_models_isAvailable_isActive',
                columnNames: ['isAvailable', 'isActive'],
            })
        );

        // Create foreign key constraint
        await queryRunner.createForeignKey(
            'llm_models',
            new ForeignKey({
                columnNames: ['providerId'],
                referencedTableName: 'llm_providers',
                referencedColumnNames: ['id'],
                onDelete: 'CASCADE',
                name: 'FK_llm_models_providerId',
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraint
        await queryRunner.dropForeignKey('llm_models', 'FK_llm_models_providerId');

        // Drop indexes
        await queryRunner.dropIndex('llm_models', 'IDX_llm_models_name_providerId');
        await queryRunner.dropIndex('llm_models', 'IDX_llm_models_providerId_isAvailable');
        await queryRunner.dropIndex('llm_models', 'IDX_llm_models_isAvailable_isActive');

        // Drop table
        await queryRunner.dropTable('llm_models');
    }
}