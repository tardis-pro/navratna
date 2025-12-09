import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

/**
 * Discussion System Migration
 *
 * Creates the discussion management tables:
 * - discussions: Core discussion/conversation management
 * - discussion_participants: Participants in discussions (agents/personas)
 *
 * These tables manage multi-participant discussions and conversations.
 * Dependencies: users, personas tables
 */
export class CreateDiscussionSystem1703005000000 implements MigrationInterface {
  name = 'CreateDiscussionSystem1703005000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create discussions table - Core discussion/conversation management
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
          },
          {
            name: 'topic',
            type: 'varchar',
            length: '1000',
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
          },
          {
            name: 'turn_strategy',
            type: 'jsonb',
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
            array: true,
            default: "'{}'",
          },
          {
            name: 'objectives',
            type: 'text',
            array: true,
            default: "'{}'",
          },
          {
            name: 'outcomes',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'related_discussions',
            type: 'uuid',
            array: true,
            default: "'{}'",
          },
          {
            name: 'parent_discussion_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'child_discussions',
            type: 'uuid',
            array: true,
            default: "'{}'",
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
        foreignKeys: [
          {
            columnNames: ['created_by'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['parent_discussion_id'],
            referencedTableName: 'discussions',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true
    );

    // Create discussion_participants table - Participants in discussions (agents/personas)
    await queryRunner.createTable(
      new Table({
        name: 'discussion_participants',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'discussion_id',
            type: 'uuid',
          },
          {
            name: 'participant_type',
            type: 'enum',
            enum: ['agent', 'persona', 'user', 'system'],
          },
          {
            name: 'participant_id',
            type: 'uuid',
          },
          {
            name: 'persona_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'agent_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'display_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'role_in_discussion',
            type: 'enum',
            enum: ['moderator', 'participant', 'observer', 'facilitator', 'expert', 'critic'],
            default: "'participant'",
          },
          {
            name: 'permissions',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'turn_order',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'turn_weight',
            type: 'decimal',
            precision: 3,
            scale: 2,
            default: 1.0,
          },
          {
            name: 'participation_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'behavioral_constraints',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'context_awareness',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'is_muted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'can_initiate_turns',
            type: 'boolean',
            default: true,
          },
          {
            name: 'can_moderate',
            type: 'boolean',
            default: false,
          },
          {
            name: 'max_consecutive_turns',
            type: 'integer',
            default: 3,
          },
          {
            name: 'cooldown_period',
            type: 'integer',
            default: 0,
          },
          {
            name: 'response_timeout',
            type: 'integer',
            default: 30,
          },
          {
            name: 'joined_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'left_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'last_active_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'total_messages',
            type: 'integer',
            default: 0,
          },
          {
            name: 'total_words',
            type: 'integer',
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
            name: 'engagement_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'contribution_quality',
            type: 'decimal',
            precision: 3,
            scale: 2,
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
            columnNames: ['discussion_id'],
            referencedTableName: 'discussions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['persona_id'],
            referencedTableName: 'personas',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
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
    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_status_visibility', ['status', 'visibility'])
    );
    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_created_by', ['created_by'])
    );
    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_organization_id', ['organization_id'])
    );
    await queryRunner.createIndex('discussions', new Index('IDX_discussions_team_id', ['team_id']));
    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_started_at', ['started_at'])
    );
    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_ended_at', ['ended_at'])
    );
    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_scheduled_for', ['scheduled_for'])
    );
    await queryRunner.createIndex(
      'discussions',
      new Index('IDX_discussions_parent_discussion_id', ['parent_discussion_id'])
    );
    await queryRunner.createIndex('discussions', new Index('IDX_discussions_tags', ['tags']));

    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_discussion_id', ['discussion_id'])
    );
    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_participant_type', ['participant_type'])
    );
    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_participant_id', ['participant_id'])
    );
    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_persona_id', ['persona_id'])
    );
    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_agent_id', ['agent_id'])
    );
    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_user_id', ['user_id'])
    );
    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_role_in_discussion', ['role_in_discussion'])
    );
    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_is_active', ['is_active'])
    );
    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_turn_order', ['turn_order'])
    );
    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_joined_at', ['joined_at'])
    );
    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_last_active_at', ['last_active_at'])
    );

    // Composite indexes for common queries
    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_discussion_type_active', [
        'discussion_id',
        'participant_type',
        'is_active',
      ])
    );
    await queryRunner.createIndex(
      'discussion_participants',
      new Index('IDX_discussion_participants_discussion_role_order', [
        'discussion_id',
        'role_in_discussion',
        'turn_order',
      ])
    );

    // Unique constraints
    await queryRunner.createIndex(
      'discussion_participants',
      new Index(
        'IDX_discussion_participants_unique_discussion_participant',
        ['discussion_id', 'participant_type', 'participant_id'],
        { isUnique: true }
      )
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order to respect foreign key constraints
    await queryRunner.dropTable('discussion_participants');
    await queryRunner.dropTable('discussions');
  }
}
