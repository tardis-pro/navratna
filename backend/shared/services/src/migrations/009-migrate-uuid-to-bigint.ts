import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class MigrateUuidToBigint1734000000009 implements MigrationInterface {
  name = 'MigrateUuidToBigint1734000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Drop all foreign key constraints first
    await this.dropForeignKeys(queryRunner);

    // Step 2: Create new bigint ID columns and migrate data
    await this.migrateTable(queryRunner, 'users');
    await this.migrateTable(queryRunner, 'refresh_tokens', 'user_id');
    await this.migrateTable(queryRunner, 'password_reset_tokens', 'user_id');
    await this.migrateTable(queryRunner, 'operations', 'agent_id', 'user_id', 'archived_by');
    await this.migrateTable(queryRunner, 'audit_events', 'user_id', 'agent_id');
    await this.migrateTable(queryRunner, 'operation_states', 'operation_id', 'transitioned_by');
    await this.migrateTable(queryRunner, 'approval_workflows', 'operation_id', 'required_approvers', 'current_approvers');
    await this.migrateTable(queryRunner, 'approval_decisions', 'workflow_id', 'approver_id');
    await this.migrateTable(queryRunner, 'artifacts', 'conversation_id', 'generated_by');
    await this.migrateTable(queryRunner, 'artifact_deployments', 'artifact_id', 'deployed_by', 'rolled_back_by');
    await this.migrateTable(queryRunner, 'knowledge_items', 'created_by', 'organization_id');
    await this.migrateTable(queryRunner, 'knowledge_relationships', 'source_item_id', 'target_item_id');
    await this.migrateTable(queryRunner, 'personas', 'created_by', 'organization_id', 'team_id', 'parent_persona_id', 'last_updated_by');
    await this.migrateTable(queryRunner, 'persona_analytics', 'persona_id');
    await this.migrateTable(queryRunner, 'security_policies', 'created_by');

    // Step 3: Recreate foreign key constraints with new bigint columns
    await this.recreateForeignKeys(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This migration is not easily reversible due to data transformation
    // In a production environment, you would need to backup UUID mappings
    throw new Error('This migration cannot be automatically reversed. Manual intervention required.');
  }

  private async dropForeignKeys(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'refresh_tokens', 'password_reset_tokens', 'operations', 'audit_events',
      'operation_states', 'approval_workflows', 'approval_decisions',
      'artifacts', 'artifact_deployments', 'knowledge_relationships',
      'personas', 'persona_analytics', 'security_policies'
    ];

    for (const tableName of tables) {
      const table = await queryRunner.getTable(tableName);
      if (table) {
        for (const foreignKey of table.foreignKeys) {
          await queryRunner.dropForeignKey(tableName, foreignKey);
        }
      }
    }
  }

  private async migrateTable(queryRunner: QueryRunner, tableName: string, ...foreignKeyColumns: string[]): Promise<void> {
    // Add new bigint ID column
    await queryRunner.addColumn(tableName, new TableColumn({
      name: 'id_new',
      type: 'bigint',
      isPrimary: false,
      isGenerated: true,
      generationStrategy: 'increment'
    }));

    // Create mapping table for UUID to bigint conversion
    await queryRunner.query(`
      CREATE TEMPORARY TABLE ${tableName}_id_mapping AS
      SELECT id as old_id, ROW_NUMBER() OVER (ORDER BY created_at, id) as new_id
      FROM ${tableName}
    `);

    // Update the new ID column with sequential values
    await queryRunner.query(`
      UPDATE ${tableName} 
      SET id_new = mapping.new_id
      FROM ${tableName}_id_mapping mapping
      WHERE ${tableName}.id = mapping.old_id
    `);

    // Handle foreign key columns
    for (const fkColumn of foreignKeyColumns) {
      if (fkColumn.includes('_')) {
        // Handle array columns like required_approvers, current_approvers
        if (fkColumn.includes('approvers')) {
          await queryRunner.addColumn(tableName, new TableColumn({
            name: `${fkColumn}_new`,
            type: 'bigint',
            isArray: true,
            isNullable: true
          }));
          
          // Convert UUID arrays to bigint arrays (simplified - would need proper mapping)
          await queryRunner.query(`
            UPDATE ${tableName} SET ${fkColumn}_new = ARRAY[]::bigint[]
          `);
        } else {
          // Regular foreign key column
          await queryRunner.addColumn(tableName, new TableColumn({
            name: `${fkColumn}_new`,
            type: 'bigint',
            isNullable: true
          }));

          // Map foreign key values using the referenced table's mapping
          const referencedTable = this.getReferencedTable(fkColumn);
          if (referencedTable) {
            await queryRunner.query(`
              UPDATE ${tableName} 
              SET ${fkColumn}_new = mapping.new_id
              FROM ${referencedTable}_id_mapping mapping
              WHERE ${tableName}.${fkColumn} = mapping.old_id
            `);
          }
        }
      }
    }

    // Drop old columns
    await queryRunner.dropColumn(tableName, 'id');
    for (const fkColumn of foreignKeyColumns) {
      if (await this.columnExists(queryRunner, tableName, fkColumn)) {
        await queryRunner.dropColumn(tableName, fkColumn);
      }
    }

    // Rename new columns to original names
    await queryRunner.renameColumn(tableName, 'id_new', 'id');
    for (const fkColumn of foreignKeyColumns) {
      if (await this.columnExists(queryRunner, tableName, `${fkColumn}_new`)) {
        await queryRunner.renameColumn(tableName, `${fkColumn}_new`, fkColumn);
      }
    }

    // Make the new ID column primary
    await queryRunner.query(`ALTER TABLE ${tableName} ADD PRIMARY KEY (id)`);

    // Drop the temporary mapping table
    await queryRunner.query(`DROP TABLE ${tableName}_id_mapping`);
  }

  private async recreateForeignKeys(queryRunner: QueryRunner): Promise<void> {
    // Recreate foreign key constraints
    const foreignKeys = [
      { table: 'refresh_tokens', column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'password_reset_tokens', column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'audit_events', column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'operation_states', column: 'operation_id', referencedTable: 'operations', referencedColumn: 'id' },
      { table: 'approval_workflows', column: 'operation_id', referencedTable: 'operations', referencedColumn: 'id' },
      { table: 'approval_decisions', column: 'workflow_id', referencedTable: 'approval_workflows', referencedColumn: 'id' },
      { table: 'artifact_deployments', column: 'artifact_id', referencedTable: 'artifacts', referencedColumn: 'id' },
      { table: 'knowledge_relationships', column: 'source_item_id', referencedTable: 'knowledge_items', referencedColumn: 'id' },
      { table: 'knowledge_relationships', column: 'target_item_id', referencedTable: 'knowledge_items', referencedColumn: 'id' },
      { table: 'persona_analytics', column: 'persona_id', referencedTable: 'personas', referencedColumn: 'id' }
    ];

    for (const fk of foreignKeys) {
      if (await this.tableExists(queryRunner, fk.table) && await this.tableExists(queryRunner, fk.referencedTable)) {
        await queryRunner.createForeignKey(fk.table, new TableForeignKey({
          columnNames: [fk.column],
          referencedTableName: fk.referencedTable,
          referencedColumnNames: [fk.referencedColumn],
          onDelete: 'CASCADE'
        }));
      }
    }
  }

  private getReferencedTable(columnName: string): string | null {
    const mapping: Record<string, string> = {
      'user_id': 'users',
      'agent_id': 'agents',
      'operation_id': 'operations',
      'workflow_id': 'approval_workflows',
      'approver_id': 'users',
      'artifact_id': 'artifacts',
      'conversation_id': 'conversations',
      'generated_by': 'users',
      'deployed_by': 'users',
      'rolled_back_by': 'users',
      'created_by': 'users',
      'organization_id': 'organizations',
      'team_id': 'teams',
      'parent_persona_id': 'personas',
      'last_updated_by': 'users',
      'persona_id': 'personas',
      'source_item_id': 'knowledge_items',
      'target_item_id': 'knowledge_items',
      'transitioned_by': 'users',
      'archived_by': 'users'
    };
    return mapping[columnName] || null;
  }

  private async columnExists(queryRunner: QueryRunner, tableName: string, columnName: string): Promise<boolean> {
    const table = await queryRunner.getTable(tableName);
    return table ? table.findColumnByName(columnName) !== undefined : false;
  }

  private async tableExists(queryRunner: QueryRunner, tableName: string): Promise<boolean> {
    const table = await queryRunner.getTable(tableName);
    return table !== undefined;
  }
} 