import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

/**
 * Persona System Migration
 * 
 * Creates the persona management tables:
 * - personas: Core persona definitions and configurations
 * - persona_analytics: Analytics and performance tracking for personas
 * 
 * These tables manage persona definitions, traits, and performance metrics.
 * Dependencies: users table
 */
export class CreatePersonaSystem1703003000000 implements MigrationInterface {
  name = 'CreatePersonaSystem1703003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create personas table - Core persona definitions and configurations
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
            length: '255',
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
            columnNames: ['last_updated_by'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['parent_persona_id'],
            referencedTableName: 'personas',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true
    );

    // Create persona_analytics table - Analytics and performance tracking for personas
    await queryRunner.createTable(
      new Table({
        name: 'persona_analytics',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'persona_id',
            type: 'uuid',
          },
          {
            name: 'metric_type',
            type: 'enum',
            enum: ['usage', 'performance', 'satisfaction', 'engagement', 'effectiveness'],
          },
          {
            name: 'metric_name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'metric_value',
            type: 'decimal',
            precision: 10,
            scale: 4,
          },
          {
            name: 'metric_unit',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'dimensions',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'session_id',
            type: 'uuid',
            isNullable: true,
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
            name: 'discussion_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'operation_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'time_period_start',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'time_period_end',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'aggregation_level',
            type: 'enum',
            enum: ['raw', 'hourly', 'daily', 'weekly', 'monthly'],
            default: "'raw'",
          },
          {
            name: 'data_quality',
            type: 'enum',
            enum: ['high', 'medium', 'low', 'estimated'],
            default: "'high'",
          },
          {
            name: 'confidence_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'sample_size',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'recorded_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
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
            columnNames: ['persona_id'],
            referencedTableName: 'personas',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true
    );

    // Create indexes for performance
    await queryRunner.createIndex('personas', new Index('IDX_personas_status_visibility', ['status', 'visibility']));
    await queryRunner.createIndex('personas', new Index('IDX_personas_created_by_organization', ['created_by', 'organization_id']));
    await queryRunner.createIndex('personas', new Index('IDX_personas_tags', ['tags']));
    await queryRunner.createIndex('personas', new Index('IDX_personas_dominant_expertise', ['dominant_expertise']));
    await queryRunner.createIndex('personas', new Index('IDX_personas_parent_persona_id', ['parent_persona_id']));
    await queryRunner.createIndex('personas', new Index('IDX_personas_last_used_at', ['last_used_at']));
    await queryRunner.createIndex('personas', new Index('IDX_personas_quality_score', ['quality_score']));
    
    await queryRunner.createIndex('persona_analytics', new Index('IDX_persona_analytics_persona_id', ['persona_id']));
    await queryRunner.createIndex('persona_analytics', new Index('IDX_persona_analytics_metric_type', ['metric_type']));
    await queryRunner.createIndex('persona_analytics', new Index('IDX_persona_analytics_metric_name', ['metric_name']));
    await queryRunner.createIndex('persona_analytics', new Index('IDX_persona_analytics_user_id', ['user_id']));
    await queryRunner.createIndex('persona_analytics', new Index('IDX_persona_analytics_recorded_at', ['recorded_at']));
    await queryRunner.createIndex('persona_analytics', new Index('IDX_persona_analytics_time_period', ['time_period_start', 'time_period_end']));
    await queryRunner.createIndex('persona_analytics', new Index('IDX_persona_analytics_aggregation_level', ['aggregation_level']));
    await queryRunner.createIndex('persona_analytics', new Index('IDX_persona_analytics_session_id', ['session_id']));
    await queryRunner.createIndex('persona_analytics', new Index('IDX_persona_analytics_discussion_id', ['discussion_id']));
    
    // Composite indexes for common queries
    await queryRunner.createIndex('persona_analytics', new Index('IDX_persona_analytics_persona_metric_time', ['persona_id', 'metric_type', 'recorded_at']));
    await queryRunner.createIndex('persona_analytics', new Index('IDX_persona_analytics_persona_user_time', ['persona_id', 'user_id', 'recorded_at']));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order to respect foreign key constraints
    await queryRunner.dropTable('persona_analytics');
    await queryRunner.dropTable('personas');
  }
} 