import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AddAgentPersonaRelationship1703000000011 implements MigrationInterface {
  name = 'AddAgentPersonaRelationship1703000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add persona_id column to agents table
    await queryRunner.addColumn('agents', new TableColumn({
      name: 'persona_id',
      type: 'uuid',
      isNullable: true // Start as nullable for existing agents
    }));

    // Rename existing persona column to legacy_persona for backwards compatibility
    await queryRunner.renameColumn('agents', 'persona', 'legacy_persona');

    // Add index for persona_id for better query performance
    await queryRunner.createIndex('agents', new TableIndex({
      name: 'IDX_agents_persona_id',
      columnNames: ['persona_id']
    }));

    // Add foreign key constraint to personas table
    await queryRunner.createForeignKey('agents', new TableForeignKey({
      name: 'FK_agents_persona_id',
      columnNames: ['persona_id'],
      referencedTableName: 'personas',
      referencedColumnNames: ['id'],
      onDelete: 'SET NULL', // Don't delete agent if persona is deleted
      onUpdate: 'CASCADE'
    }));

    // TODO: Data migration script will be needed to:
    // 1. Create personas from existing legacy_persona data
    // 2. Update persona_id references
    // 3. Make persona_id NOT NULL after data migration
    
    console.log('✅ Added persona_id column and foreign key relationship to agents table');
    console.log('⚠️  Manual data migration required to populate persona_id from legacy_persona data');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove foreign key constraint
    await queryRunner.dropForeignKey('agents', 'FK_agents_persona_id');

    // Remove index
    await queryRunner.dropIndex('agents', 'IDX_agents_persona_id');

    // Rename legacy_persona back to persona
    await queryRunner.renameColumn('agents', 'legacy_persona', 'persona');

    // Remove persona_id column
    await queryRunner.dropColumn('agents', 'persona_id');

    console.log('✅ Reverted agent-persona relationship changes');
  }
} 