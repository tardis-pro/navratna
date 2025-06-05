import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateArtifactSystemTables1703000002000 implements MigrationInterface {
  name = 'CreateArtifactSystemTables1703000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create artifacts table
    await queryRunner.createTable(
      new Table({
        name: 'artifacts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'type',
            type: 'enum',
            enum: [
              'code', 'test', 'documentation', 'prd', 'config',
              'deployment', 'script', 'template', 'report', 'analysis'
            ],
          },
          {
            name: 'content',
            type: 'text',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'language',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'framework',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'target_file',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'estimated_effort',
            type: 'enum',
            enum: ['low', 'medium', 'high'],
            isNullable: true,
          },
          {
            name: 'tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'conversation_id',
            type: 'uuid',
          },
          {
            name: 'generated_by',
            type: 'uuid',
          },
          {
            name: 'generated_at',
            type: 'timestamp',
          },
          {
            name: 'generator',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'confidence',
            type: 'decimal',
            precision: 3,
            scale: 2,
          },
          {
            name: 'source_messages',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'validation_result',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'validation_status',
            type: 'enum',
            enum: ['pending', 'valid', 'invalid', 'warning'],
            default: "'pending'",
          },
          {
            name: 'validation_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'version',
            type: 'varchar',
            length: '50',
            default: "'1.0.0'",
          },
          {
            name: 'parent_artifact_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'iteration_count',
            type: 'integer',
            default: 1,
          },
          {
            name: 'is_latest_version',
            type: 'boolean',
            default: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['draft', 'review', 'approved', 'deployed', 'archived'],
            default: "'draft'",
          },
          {
            name: 'approved_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'approved_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'deployed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'archived_at',
            type: 'timestamp',
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
            name: 'user_rating',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'usage_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'download_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'content_size_bytes',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'line_count',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'complexity_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'security_level',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'critical'],
            default: "'medium'",
          },
          {
            name: 'compliance_tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'security_scan_result',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'license',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'dependencies',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'system_requirements',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'deployment_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'generation_context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'external_references',
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
        foreignKeys: [
          {
            columnNames: ['parent_artifact_id'],
            referencedTableName: 'artifacts',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true
    );

    // Create artifact_reviews table
    await queryRunner.createTable(
      new Table({
        name: 'artifact_reviews',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'artifact_id',
            type: 'uuid',
          },
          {
            name: 'reviewer_id',
            type: 'uuid',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'approved', 'rejected', 'needs-changes'],
            default: "'pending'",
          },
          {
            name: 'score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'comments',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'suggestions',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'reviewed_at',
            type: 'timestamp',
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
            name: 'security_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'performance_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'maintainability_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'documentation_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'code_quality_feedback',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'security_feedback',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'performance_feedback',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'documentation_feedback',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'review_duration_minutes',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'review_type',
            type: 'enum',
            enum: ['automated', 'manual', 'peer', 'expert'],
            default: "'manual'",
          },
          {
            name: 'review_priority',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'urgent'],
            default: "'medium'",
          },
          {
            name: 'requires_follow_up',
            type: 'boolean',
            default: false,
          },
          {
            name: 'follow_up_date',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'approval_level',
            type: 'enum',
            enum: ['junior', 'senior', 'lead', 'architect'],
            isNullable: true,
          },
          {
            name: 'escalated_to',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'escalated_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'escalation_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'checklist_items',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'compliance_checks',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'security_scan_passed',
            type: 'boolean',
            isNullable: true,
          },
          {
            name: 'automated_tests_passed',
            type: 'boolean',
            isNullable: true,
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
            name: 'review_context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'external_references',
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
        foreignKeys: [
          {
            columnNames: ['artifact_id'],
            referencedTableName: 'artifacts',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true
    );

    // Create indexes for artifacts
    await queryRunner.createIndex(
      'artifacts',
      new TableIndex({
        name: 'IDX_artifacts_type_created_at',
        columnNames: ['type', 'created_at']
      })
    );
    await queryRunner.createIndex(
      'artifacts',
      new TableIndex({
        name: 'IDX_artifacts_conversation_id',
        columnNames: ['conversation_id']
      })
    );
    await queryRunner.createIndex(
      'artifacts',
      new TableIndex({
        name: 'IDX_artifacts_generated_by',
        columnNames: ['generated_by']
      })
    );
    await queryRunner.createIndex(
      'artifacts',
      new TableIndex({
        name: 'IDX_artifacts_language_framework',
        columnNames: ['language', 'framework']
      })
    );

    // Create indexes for artifact_reviews
    await queryRunner.createIndex(
      'artifact_reviews',
      new TableIndex({
        name: 'IDX_artifact_reviews_artifact_status',
        columnNames: ['artifact_id', 'status']
      })
    );
    await queryRunner.createIndex(
      'artifact_reviews',
      new TableIndex({
        name: 'IDX_artifact_reviews_reviewer_id',
        columnNames: ['reviewer_id']
      })
    );
    await queryRunner.createIndex(
      'artifact_reviews',
      new TableIndex({
        name: 'IDX_artifact_reviews_status_created_at',
        columnNames: ['status', 'created_at']
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.dropIndex('artifact_reviews', 'IDX_artifact_reviews_status_created_at');
    await queryRunner.dropIndex('artifact_reviews', 'IDX_artifact_reviews_reviewer_id');
    await queryRunner.dropIndex('artifact_reviews', 'IDX_artifact_reviews_artifact_status');
    
    await queryRunner.dropIndex('artifacts', 'IDX_artifacts_language_framework');
    await queryRunner.dropIndex('artifacts', 'IDX_artifacts_generated_by');
    await queryRunner.dropIndex('artifacts', 'IDX_artifacts_conversation_id');
    await queryRunner.dropIndex('artifacts', 'IDX_artifacts_type_created_at');

    // Drop tables
    await queryRunner.dropTable('artifact_reviews');
    await queryRunner.dropTable('artifacts');
  }
} 