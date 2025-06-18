import { MigrationInterface, QueryRunner, Table, Index, ForeignKey } from 'typeorm';

export class CreateDiscussionTable1734516301000 implements MigrationInterface {
  name = 'CreateDiscussionTable1734516301000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create discussions table
    await queryRunner.createTable(
      new Table({
        name: 'discussions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'topic',
            type: 'varchar',
            length: '1000',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'document_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'operation_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'state',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'settings',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'turn_strategy',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['draft', 'active', 'paused', 'completed', 'cancelled', 'archived'],
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
            isNullable: false,
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
            name: 'started_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'ended_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'scheduled_for',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'estimated_duration',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'actual_duration',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'tags',
            type: 'text',
            isArray: true,
            default: 'ARRAY[]::text[]',
          },
          {
            name: 'objectives',
            type: 'text',
            isArray: true,
            default: 'ARRAY[]::text[]',
          },
          {
            name: 'outcomes',
            type: 'jsonb',
            default: "'[]'::jsonb",
          },
          {
            name: 'related_discussions',
            type: 'uuid',
            isArray: true,
            default: 'ARRAY[]::uuid[]',
          },
          {
            name: 'parent_discussion_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'child_discussions',
            type: 'uuid',
            isArray: true,
            default: 'ARRAY[]::uuid[]',
          },
          {
            name: 'analytics',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'metadata',
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

    // Create indexes
    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_created_by', ['created_by'])
    );

    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_status', ['status'])
    );

    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_visibility', ['visibility'])
    );

    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_created_at', ['created_at'])
    );

    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_organization_id', ['organization_id'])
    );

    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_team_id', ['team_id'])
    );

    // Create foreign key constraint for created_by
    await queryRunner.createForeignKey(
      'discussions',
      new ForeignKey({
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      })
    );

    // Update discussion_participants table to add foreign key to discussions
    await queryRunner.createForeignKey(
      'discussion_participants',
      new ForeignKey({
        columnNames: ['discussion_id'],
        referencedTableName: 'discussions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    const discussionParticipantsTable = await queryRunner.getTable('discussion_participants');
    if (discussionParticipantsTable) {
      const foreignKey = discussionParticipantsTable.foreignKeys.find(
        fk => fk.columnNames.indexOf('discussion_id') !== -1
      );
      if (foreignKey) {
        await queryRunner.dropForeignKey('discussion_participants', foreignKey);
      }
    }

    // Drop discussions table (this will also drop its foreign keys and indexes)
    await queryRunner.dropTable('discussions');
  }
} 