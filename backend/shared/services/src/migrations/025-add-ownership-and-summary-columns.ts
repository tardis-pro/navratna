import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddOwnershipAndSummaryColumns1703000000025 implements MigrationInterface {
  name = 'AddOwnershipAndSummaryColumns1703000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns to knowledge_items table
    await queryRunner.addColumns('knowledge_items', [
      new TableColumn({
        name: 'user_id',
        type: 'varchar',
        length: '36',
        isNullable: true,
        comment: 'User-specific knowledge layer'
      }),
      new TableColumn({
        name: 'agent_id',
        type: 'varchar',
        length: '36',
        isNullable: true,
        comment: 'Agent-specific knowledge layer'
      }),
      new TableColumn({
        name: 'summary',
        type: 'text',
        isNullable: true,
        comment: 'Optional summary for large content'
      })
    ]);

    // Add columns to knowledge_relationships table
    await queryRunner.addColumns('knowledge_relationships', [
      new TableColumn({
        name: 'user_id',
        type: 'varchar',
        length: '36',
        isNullable: true,
        comment: 'User-specific relationship layer'
      }),
      new TableColumn({
        name: 'agent_id',
        type: 'varchar',
        length: '36',
        isNullable: true,
        comment: 'Agent-specific relationship layer'
      }),
      new TableColumn({
        name: 'summary',
        type: 'text',
        isNullable: true,
        comment: 'Optional summary for complex relationships'
      })
    ]);

    // Create compound indexes for knowledge_items
    await queryRunner.createIndex(
      'knowledge_items',
      new TableIndex({
        name: 'IDX_knowledge_items_user_id_type',
        columnNames: ['user_id', 'type']
      })
    );

    await queryRunner.createIndex(
      'knowledge_items',
      new TableIndex({
        name: 'IDX_knowledge_items_agent_id_type',
        columnNames: ['agent_id', 'type']
      })
    );

    // Create compound indexes for knowledge_relationships
    await queryRunner.createIndex(
      'knowledge_relationships',
      new TableIndex({
        name: 'IDX_knowledge_relationships_user_id_type',
        columnNames: ['user_id', 'relationship_type']
      })
    );

    await queryRunner.createIndex(
      'knowledge_relationships',
      new TableIndex({
        name: 'IDX_knowledge_relationships_agent_id_type',
        columnNames: ['agent_id', 'relationship_type']
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.dropIndex('knowledge_relationships', 'IDX_knowledge_relationships_agent_id_type');
    await queryRunner.dropIndex('knowledge_relationships', 'IDX_knowledge_relationships_user_id_type');
    await queryRunner.dropIndex('knowledge_items', 'IDX_knowledge_items_agent_id_type');
    await queryRunner.dropIndex('knowledge_items', 'IDX_knowledge_items_user_id_type');

    // Drop columns from knowledge_relationships
    await queryRunner.dropColumns('knowledge_relationships', ['user_id', 'agent_id', 'summary']);

    // Drop columns from knowledge_items
    await queryRunner.dropColumns('knowledge_items', ['user_id', 'agent_id', 'summary']);
  }
} 