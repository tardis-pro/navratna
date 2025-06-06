import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreatePersonasTable1703000000008 implements MigrationInterface {
  name = 'CreatePersonasTable1703000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create personas table
    await queryRunner.createTable(
      new Table({
        name: 'personas',
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
          },
          {
            name: 'role',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
          },
          {
            name: 'background',
            type: 'text',
          },
          {
            name: 'system_prompt',
            type: 'text',
          },
          {
            name: 'traits',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'expertise',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'tone',
            type: 'enum',
            enum: ['concise', 'verbose', 'analytical', 'casual', 'empathetic', 'humorous', 'cautious', 'optimistic'],
            isNullable: true,
          },
          {
            name: 'style',
            type: 'enum',
            enum: ['structured', 'freeform', 'inquisitive', 'decisive', 'collaborative', 'authoritative'],
            isNullable: true,
          },
          {
            name: 'energy_level',
            type: 'enum',
            enum: ['low', 'moderate', 'high', 'dynamic'],
            isNullable: true,
          },
          {
            name: 'chattiness',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'empathy_level',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'parent_personas',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'hybrid_traits',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'dominant_expertise',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'personality_blend',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'conversational_style',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['draft', 'active', 'inactive', 'archived'],
            default: "'draft'",
          },
          {
            name: 'visibility',
            type: 'enum',
            enum: ['private', 'team', 'organization', 'public'],
            default: "'private'",
          },
          {
            name: 'created_by',
            type: 'uuid',
          },
          {
            name: 'organization_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'team_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'version',
            type: 'integer',
            default: 1,
          },
          {
            name: 'parent_persona_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'validation',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'usage_stats',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'configuration',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'capabilities',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'restrictions',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'quality_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'consistency_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'user_satisfaction',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'total_interactions',
            type: 'integer',
            default: 0,
          },
          {
            name: 'successful_interactions',
            type: 'integer',
            default: 0,
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'last_updated_by',
            type: 'uuid',
            isNullable: true,
          },
        ],
      }),
      true
    );

    // Create indexes as defined in the entity
    await queryRunner.createIndex('personas', new TableIndex({
      name: 'IDX_personas_status_visibility',
      columnNames: ['status', 'visibility'],
    }));

    await queryRunner.createIndex('personas', new TableIndex({
      name: 'IDX_personas_created_by_organization',
      columnNames: ['created_by', 'organization_id'],
    }));

    await queryRunner.createIndex('personas', new TableIndex({
      name: 'IDX_personas_tags',
      columnNames: ['tags'],
      where: 'tags IS NOT NULL',
    }));

    await queryRunner.createIndex('personas', new TableIndex({
      name: 'IDX_personas_dominant_expertise',
      columnNames: ['dominant_expertise'],
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.dropIndex('personas', 'IDX_personas_status_visibility');
    await queryRunner.dropIndex('personas', 'IDX_personas_created_by_organization');
    await queryRunner.dropIndex('personas', 'IDX_personas_tags');
    await queryRunner.dropIndex('personas', 'IDX_personas_dominant_expertise');

    // Drop the table
    await queryRunner.dropTable('personas');
  }
} 