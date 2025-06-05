import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateKnowledgeItemsTable1703000000006 implements MigrationInterface {
  name = 'CreateKnowledgeItemsTable1703000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create knowledge_items table
    await queryRunner.createTable(
      new Table({
        name: 'knowledge_items',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()'
          },
          {
            name: 'content',
            type: 'text',
            isNullable: false
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['factual', 'procedural', 'conceptual', 'metacognitive'],
            default: "'factual'",
            isNullable: false
          },
          {
            name: 'source_type',
            type: 'enum',
            enum: ['document', 'conversation', 'observation', 'inference', 'external_api', 'user_input', 'system_generated'],
            isNullable: false
          },
          {
            name: 'source_identifier',
            type: 'varchar',
            length: '255',
            isNullable: false
          },
          {
            name: 'source_url',
            type: 'text',
            isNullable: true
          },
          {
            name: 'tags',
            type: 'text',
            isArray: true,
            default: "'{}'",
            isNullable: false
          },
          {
            name: 'confidence',
            type: 'decimal',
            precision: 3,
            scale: 2,
            default: 0.8,
            isNullable: false
          },
          {
            name: 'metadata',
            type: 'jsonb',
            default: "'{}'",
            isNullable: false
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false
          },
          {
            name: 'created_by',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'organization_id',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'access_level',
            type: 'varchar',
            length: '50',
            default: "'public'",
            isNullable: false
          }
        ]
      }),
      true
    );

    // Create indexes for knowledge_items table
    await queryRunner.createIndex(
      'knowledge_items',
      new TableIndex({
        name: 'IDX_knowledge_items_source_type_identifier',
        columnNames: ['source_type', 'source_identifier']
      })
    );

    await queryRunner.createIndex(
      'knowledge_items',
      new TableIndex({
        name: 'IDX_KNOWLEDGE_ITEM_TAGS',
        columnNames: ['tags']
      })
    );

    await queryRunner.createIndex(
      'knowledge_items',
      new TableIndex({
        name: 'IDX_knowledge_items_type',
        columnNames: ['type']
      })
    );

    await queryRunner.createIndex(
      'knowledge_items',
      new TableIndex({
        name: 'IDX_knowledge_items_confidence',
        columnNames: ['confidence']
      })
    );

    await queryRunner.createIndex(
      'knowledge_items',
      new TableIndex({
        name: 'IDX_knowledge_items_created_at',
        columnNames: ['created_at']
      })
    );

    await queryRunner.createIndex(
      'knowledge_items',
      new TableIndex({
        name: 'IDX_knowledge_items_created_by',
        columnNames: ['created_by']
      })
    );

    await queryRunner.createIndex(
      'knowledge_items',
      new TableIndex({
        name: 'IDX_knowledge_items_organization_id',
        columnNames: ['organization_id']
      })
    );

    await queryRunner.createIndex(
      'knowledge_items',
      new TableIndex({
        name: 'IDX_knowledge_items_access_level',
        columnNames: ['access_level']
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.dropIndex('knowledge_items', 'IDX_knowledge_items_access_level');
    await queryRunner.dropIndex('knowledge_items', 'IDX_knowledge_items_organization_id');
    await queryRunner.dropIndex('knowledge_items', 'IDX_knowledge_items_created_by');
    await queryRunner.dropIndex('knowledge_items', 'IDX_knowledge_items_created_at');
    await queryRunner.dropIndex('knowledge_items', 'IDX_knowledge_items_confidence');
    await queryRunner.dropIndex('knowledge_items', 'IDX_knowledge_items_type');
    await queryRunner.dropIndex('knowledge_items', 'IDX_KNOWLEDGE_ITEM_TAGS');
    await queryRunner.dropIndex('knowledge_items', 'IDX_knowledge_items_source_type_identifier');

    // Drop the table
    await queryRunner.dropTable('knowledge_items');
  }
} 