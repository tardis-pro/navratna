import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class MigrateBigintToString1734000000010 implements MigrationInterface {
  name = 'MigrateBigintToString1734000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('Starting migration: Converting bigint IDs to string IDs');

    // Step 1: Drop all foreign key constraints first
    await this.dropForeignKeys(queryRunner);

    // Step 2: Drop all indices that reference ID columns
    await this.dropIdIndices(queryRunner);

    // Step 3: Convert ID columns from bigint to string for all tables
    const tables = [
      'users',
      'refresh_tokens', 
      'password_reset_tokens',
      'operations',
      'audit_events',
      'operation_states',
      'operation_checkpoints',
      'step_results',
      'approval_workflows',
      'approval_decisions',
      'artifacts',
      'artifact_deployments',
      'artifact_reviews',
      'knowledge_items',
      'knowledge_relationships',
      'personas',
      'persona_analytics',
      'security_policies',
      'tool_definitions',
      'tool_executions',
      'tool_usage_records',
      'mcp_servers',
      'mcp_tool_calls',
      'agent_capability_metrics',
      'agent_learning_records',
      'execution_plans',
      'agents',
      'conversation_contexts',
      'discussion_participants'
    ];

    for (const tableName of tables) {
      await this.convertTableIds(queryRunner, tableName);
    }

    // Step 4: Recreate indices for ID columns
    await this.recreateIdIndices(queryRunner);

    // Step 5: Recreate foreign key constraints with new string columns
    await this.recreateForeignKeys(queryRunner);

    console.log('Migration completed: All bigint IDs converted to string IDs');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('This migration cannot be automatically reversed. Manual intervention required to restore bigint IDs.');
  }

  private async dropForeignKeys(queryRunner: QueryRunner): Promise<void> {
    console.log('Dropping foreign key constraints...');
    
    const tables = [
      'refresh_tokens', 'password_reset_tokens', 'operations', 'audit_events',
      'operation_states', 'operation_checkpoints', 'step_results', 'approval_workflows', 
      'approval_decisions', 'artifacts', 'artifact_deployments', 'artifact_reviews',
      'knowledge_relationships', 'personas', 'persona_analytics', 'security_policies',
      'tool_executions', 'tool_usage_records', 'mcp_tool_calls', 'agent_capability_metrics',
      'agent_learning_records', 'execution_plans', 'conversation_contexts', 'discussion_participants'
    ];

    for (const tableName of tables) {
      if (await this.tableExists(queryRunner, tableName)) {
        const table = await queryRunner.getTable(tableName);
        if (table) {
          for (const foreignKey of table.foreignKeys) {
            try {
              await queryRunner.dropForeignKey(tableName, foreignKey);
            } catch (error) {
              console.warn(`Failed to drop foreign key in ${tableName}:`, error);
            }
          }
        }
      }
    }
  }

  private async dropIdIndices(queryRunner: QueryRunner): Promise<void> {
    console.log('Dropping ID-related indices...');
    
    const indexesToDrop = [
      // Primary key indices will be handled automatically
      { table: 'users', index: 'IDX_users_id' },
      { table: 'operations', index: 'IDX_operations_agent_id' },
      { table: 'operations', index: 'IDX_operations_user_id' },
      { table: 'audit_events', index: 'IDX_audit_events_user_id' },
      { table: 'audit_events', index: 'IDX_audit_events_agent_id' },
      { table: 'operation_states', index: 'IDX_operation_states_operation_id' },
      { table: 'approval_workflows', index: 'IDX_approval_workflows_operation_id' },
      { table: 'approval_decisions', index: 'IDX_approval_decisions_workflow_id' },
      { table: 'artifacts', index: 'IDX_artifacts_conversation_id' },
      { table: 'artifacts', index: 'IDX_artifacts_generated_by' },
      { table: 'artifact_deployments', index: 'IDX_artifact_deployments_artifact_id' },
      { table: 'knowledge_relationships', index: 'IDX_knowledge_relationships_source_item_id' },
      { table: 'knowledge_relationships', index: 'IDX_knowledge_relationships_target_item_id' },
      { table: 'persona_analytics', index: 'IDX_persona_analytics_persona_id' },
      { table: 'tool_executions', index: 'IDX_tool_executions_tool_id' },
      { table: 'tool_executions', index: 'IDX_tool_executions_agent_id' },
      { table: 'mcp_tool_calls', index: 'IDX_mcp_tool_calls_server_id' }
    ];

    for (const { table, index } of indexesToDrop) {
      if (await this.tableExists(queryRunner, table)) {
        try {
          await queryRunner.dropIndex(table, index);
        } catch (error) {
          // Index might not exist, continue
          console.warn(`Failed to drop index ${index} on ${table}:`, error);
        }
      }
    }
  }

  private async convertTableIds(queryRunner: QueryRunner, tableName: string): Promise<void> {
    if (!(await this.tableExists(queryRunner, tableName))) {
      console.warn(`Table ${tableName} does not exist, skipping...`);
      return;
    }

    console.log(`Converting IDs in table: ${tableName}`);

    const table = await queryRunner.getTable(tableName);
    if (!table) return;

    // Find all columns that are bigint and likely ID columns
    const columnsToConvert = table.columns.filter(column => 
      column.type === 'bigint' && (
        column.name === 'id' || 
        column.name.endsWith('_id') || 
        column.name.includes('_by') ||
        column.name === 'source_item_id' ||
        column.name === 'target_item_id' ||
        column.name === 'parent_persona_id'
      )
    );

    for (const column of columnsToConvert) {
      try {
        console.log(`Converting column ${column.name} in ${tableName} from bigint to varchar`);
        
        // Step 1: Add a temporary column
        await queryRunner.addColumn(tableName, new TableColumn({
          name: `${column.name}_temp`,
          type: 'varchar',
          length: '36',
          isNullable: true
        }));

        // Step 2: Copy data from bigint to varchar
        await queryRunner.query(`
          UPDATE "${tableName}" 
          SET "${column.name}_temp" = CAST("${column.name}" AS VARCHAR)
          WHERE "${column.name}" IS NOT NULL
        `);

        // Step 3: Drop the old column (this will automatically drop primary key if it exists)
        await queryRunner.dropColumn(tableName, column.name);

        // Step 4: Rename the temp column to the original name
        await queryRunner.renameColumn(tableName, `${column.name}_temp`, column.name);

        // Step 5: Make it NOT NULL if it was originally NOT NULL
        if (!column.isNullable) {
          await queryRunner.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${column.name}" SET NOT NULL`);
        }

        // Step 6: If this was a primary key, re-add the primary key constraint
        if (column.isPrimary) {
          await queryRunner.query(`ALTER TABLE "${tableName}" ADD CONSTRAINT "${tableName}_pkey" PRIMARY KEY ("${column.name}")`);
        }

        console.log(`Successfully converted column ${column.name} in ${tableName} from bigint to varchar`);
      } catch (error) {
        console.error(`Failed to convert column ${column.name} in ${tableName}:`, error);
        // Continue with other columns
      }
    }

    // Handle special array columns like required_approvers, current_approvers
    const arrayColumns = table.columns.filter(column => 
      column.isArray && column.type === 'bigint' && 
      (column.name.includes('approvers') || column.name.includes('_ids'))
    );

    for (const column of arrayColumns) {
      try {
        console.log(`Converting array column ${column.name} in ${tableName} from bigint[] to varchar[]`);
        
        // Step 1: Add a temporary column
        await queryRunner.addColumn(tableName, new TableColumn({
          name: `${column.name}_temp`,
          type: 'varchar',
          isArray: true,
          length: '36',
          isNullable: column.isNullable,
          default: column.default
        }));

        // Step 2: Convert array of bigints to array of strings
        await queryRunner.query(`
          UPDATE "${tableName}" 
          SET "${column.name}_temp" = CASE 
            WHEN "${column.name}" IS NULL OR array_length("${column.name}", 1) IS NULL THEN "${column.name}"
            ELSE ARRAY(SELECT CAST(unnest("${column.name}") AS VARCHAR))
          END
        `);

        // Step 3: Drop the old column
        await queryRunner.dropColumn(tableName, column.name);

        // Step 4: Rename the temp column
        await queryRunner.renameColumn(tableName, `${column.name}_temp`, column.name);

        console.log(`Successfully converted array column ${column.name} in ${tableName} from bigint[] to varchar[]`);
      } catch (error) {
        console.error(`Failed to convert array column ${column.name} in ${tableName}:`, error);
        // Continue with other columns
      }
    }
  }

  private async recreateIdIndices(queryRunner: QueryRunner): Promise<void> {
    console.log('Recreating ID-related indices...');

    const indicesToCreate = [
      { table: 'users', columns: ['id'], unique: true },
      { table: 'operations', columns: ['agent_id'] },
      { table: 'operations', columns: ['user_id'] },
      { table: 'operations', columns: ['status', 'agent_id'] },
      { table: 'audit_events', columns: ['user_id', 'timestamp'] },
      { table: 'audit_events', columns: ['agent_id', 'timestamp'] },
      { table: 'operation_states', columns: ['operation_id', 'transitioned_at'] },
      { table: 'approval_workflows', columns: ['operation_id'] },
      { table: 'approval_decisions', columns: ['workflow_id'] },
      { table: 'approval_decisions', columns: ['approver_id'] },
      { table: 'artifacts', columns: ['conversation_id'] },
      { table: 'artifacts', columns: ['generated_by'] },
      { table: 'artifact_deployments', columns: ['artifact_id', 'deployed_at'] },
      { table: 'knowledge_relationships', columns: ['source_item_id'] },
      { table: 'knowledge_relationships', columns: ['target_item_id'] },
      { table: 'personas', columns: ['created_by'] },
      { table: 'personas', columns: ['parent_persona_id'] },
      { table: 'persona_analytics', columns: ['persona_id'] },
      { table: 'tool_executions', columns: ['tool_id', 'start_time'] },
      { table: 'tool_executions', columns: ['agent_id', 'status'] },
      { table: 'mcp_tool_calls', columns: ['server_id', 'timestamp'] }
    ];

    for (const { table, columns, unique } of indicesToCreate) {
      if (await this.tableExists(queryRunner, table)) {
        try {
          const indexName = `IDX_${table}_${columns.join('_')}`;
          await queryRunner.createIndex(table, new TableIndex({
            name: indexName,
            columnNames: columns,
            isUnique: unique || false
          }));
        } catch (error) {
          console.warn(`Failed to create index on ${table}(${columns.join(', ')}):`, error);
        }
      }
    }
  }

  private async recreateForeignKeys(queryRunner: QueryRunner): Promise<void> {
    console.log('Recreating foreign key constraints...');

    const foreignKeys = [
      { table: 'refresh_tokens', column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'password_reset_tokens', column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'operations', column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'operations', column: 'agent_id', referencedTable: 'agents', referencedColumn: 'id' },
      { table: 'audit_events', column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'operation_states', column: 'operation_id', referencedTable: 'operations', referencedColumn: 'id' },
      { table: 'operation_states', column: 'transitioned_by', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'operation_checkpoints', column: 'operation_id', referencedTable: 'operations', referencedColumn: 'id' },
      { table: 'step_results', column: 'operation_id', referencedTable: 'operations', referencedColumn: 'id' },
      { table: 'approval_workflows', column: 'operation_id', referencedTable: 'operations', referencedColumn: 'id' },
      { table: 'approval_decisions', column: 'workflow_id', referencedTable: 'approval_workflows', referencedColumn: 'id' },
      { table: 'approval_decisions', column: 'approver_id', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'artifacts', column: 'generated_by', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'artifact_deployments', column: 'artifact_id', referencedTable: 'artifacts', referencedColumn: 'id' },
      { table: 'artifact_deployments', column: 'deployed_by', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'artifact_deployments', column: 'rolled_back_by', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'knowledge_items', column: 'created_by', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'knowledge_relationships', column: 'source_item_id', referencedTable: 'knowledge_items', referencedColumn: 'id' },
      { table: 'knowledge_relationships', column: 'target_item_id', referencedTable: 'knowledge_items', referencedColumn: 'id' },
      { table: 'personas', column: 'created_by', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'personas', column: 'parent_persona_id', referencedTable: 'personas', referencedColumn: 'id' },
      { table: 'persona_analytics', column: 'persona_id', referencedTable: 'personas', referencedColumn: 'id' },
      { table: 'security_policies', column: 'created_by', referencedTable: 'users', referencedColumn: 'id' },
      { table: 'tool_executions', column: 'tool_id', referencedTable: 'tool_definitions', referencedColumn: 'id' },
      { table: 'tool_usage_records', column: 'tool_id', referencedTable: 'tool_definitions', referencedColumn: 'id' },
      { table: 'mcp_tool_calls', column: 'server_id', referencedTable: 'mcp_servers', referencedColumn: 'id' }
    ];

    for (const fk of foreignKeys) {
      if (await this.tableExists(queryRunner, fk.table) && await this.tableExists(queryRunner, fk.referencedTable)) {
        try {
          const foreignKey = new TableForeignKey({
            columnNames: [fk.column],
            referencedTableName: fk.referencedTable,
            referencedColumnNames: [fk.referencedColumn],
            onDelete: 'CASCADE',
            name: `FK_${fk.table}_${fk.column}_${fk.referencedTable}_${fk.referencedColumn}`
          });
          await queryRunner.createForeignKey(fk.table, foreignKey);
        } catch (error) {
          console.warn(`Failed to create foreign key ${fk.table}.${fk.column} -> ${fk.referencedTable}.${fk.referencedColumn}:`, error);
        }
      }
    }
  }

  private async tableExists(queryRunner: QueryRunner, tableName: string): Promise<boolean> {
    try {
      const table = await queryRunner.getTable(tableName);
      return table !== undefined;
    } catch {
      return false;
    }
  }

  private async columnExists(queryRunner: QueryRunner, tableName: string, columnName: string): Promise<boolean> {
    try {
      const table = await queryRunner.getTable(tableName);
      return table ? table.findColumnByName(columnName) !== undefined : false;
    } catch {
      return false;
    }
  }
} 