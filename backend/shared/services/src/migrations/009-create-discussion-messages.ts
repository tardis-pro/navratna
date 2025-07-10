import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

/**
 * Discussion Messages Migration
 * 
 * Creates the discussion_messages table to store individual messages within discussions.
 * This table completes the discussion system by providing message persistence.
 * 
 * Dependencies: discussions, discussion_participants tables
 */
export class CreateDiscussionMessages1703009000000 implements MigrationInterface {
  name = 'CreateDiscussionMessages1703009000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create discussion_messages table - Individual messages within discussions
    await queryRunner.createTable(
      new Table({
        name: 'discussion_messages',
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
            name: 'participant_id',
            type: 'uuid',
          },
          {
            name: 'content',
            type: 'text',
          },
          {
            name: 'message_type',
            type: 'enum',
            enum: ['text', 'system', 'action', 'event', 'file', 'image', 'voice', 'video'],
            default: "'text'",
          },
          {
            name: 'thread_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'reply_to_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'turn_number',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'sequence_number',
            type: 'integer',
            default: 1,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'deleted'],
            default: "'sent'",
          },
          {
            name: 'priority',
            type: 'enum',
            enum: ['low', 'normal', 'high', 'urgent'],
            default: "'normal'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'agent_metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'attachments',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'reactions',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'mentions',
            type: 'uuid',
            array: true,
            default: "'{}'",
          },
          {
            name: 'tags',
            type: 'text',
            array: true,
            default: "'{}'",
          },
          {
            name: 'confidence_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'sentiment_score',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'processing_time_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'token_count',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'word_count',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'character_count',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'is_edited',
            type: 'boolean',
            default: false,
          },
          {
            name: 'edit_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'original_content',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'edit_history',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'is_pinned',
            type: 'boolean',
            default: false,
          },
          {
            name: 'is_flagged',
            type: 'boolean',
            default: false,
          },
          {
            name: 'flag_reason',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'moderation_status',
            type: 'enum',
            enum: ['pending', 'approved', 'rejected', 'flagged'],
            default: "'approved'",
          },
          {
            name: 'delivered_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'read_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'edited_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'deleted_at',
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
            columnNames: ['discussion_id'],
            referencedTableName: 'discussions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['participant_id'],
            referencedTableName: 'discussion_participants',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['reply_to_id'],
            referencedTableName: 'discussion_messages',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true
    );

    // Create indexes for performance
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_discussion_id', ['discussion_id']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_participant_id', ['participant_id']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_message_type', ['message_type']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_thread_id', ['thread_id']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_reply_to_id', ['reply_to_id']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_turn_number', ['turn_number']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_sequence_number', ['sequence_number']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_status', ['status']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_priority', ['priority']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_created_at', ['created_at']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_updated_at', ['updated_at']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_delivered_at', ['delivered_at']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_read_at', ['read_at']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_is_edited', ['is_edited']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_is_pinned', ['is_pinned']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_is_flagged', ['is_flagged']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_moderation_status', ['moderation_status']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_deleted_at', ['deleted_at']));

    // Composite indexes for common queries
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_discussion_created', ['discussion_id', 'created_at']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_discussion_turn_seq', ['discussion_id', 'turn_number', 'sequence_number']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_participant_created', ['participant_id', 'created_at']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_thread_created', ['thread_id', 'created_at']));
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_status_type_created', ['status', 'message_type', 'created_at']));

    // Text search index for content
    await queryRunner.query(`
      CREATE INDEX IDX_discussion_messages_content_search 
      ON discussion_messages 
      USING gin(to_tsvector('english', content))
    `);

    // Partial indexes for active messages (not deleted)
    await queryRunner.createIndex('discussion_messages', new Index('IDX_discussion_messages_active_discussion_created', ['discussion_id', 'created_at'], {
      where: 'deleted_at IS NULL'
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('discussion_messages');
  }
}