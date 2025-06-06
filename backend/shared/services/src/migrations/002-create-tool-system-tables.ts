import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateToolSystemTables1703000000002 implements MigrationInterface {
  name = 'CreateToolSystemTables1703000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    

    // Create ToolCategory enum
    await queryRunner.query(`
      CREATE TYPE "tool_category_enum" AS ENUM ('general', 'development', 'analysis', 'communication', 'automation', 'security', 'data', 'ai')
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "tool_execution_status_enum"
    `);

    // Create ToolExecutionStatus enum
    await queryRunner.query(`
      CREATE TYPE "tool_execution_status_enum" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled', 'approval-required')
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "maintenance_status_enum"
    `);

    // Create MaintenanceStatus enum
    await queryRunner.query(`
      CREATE TYPE "maintenance_status_enum" AS ENUM ('active', 'maintenance', 'deprecated', 'archived')
    `);

    // Create tool_definitions table
    await queryRunner.createTable(
      new Table({
        name: 'tool_definitions',
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
            isUnique: true,
          },
          {
            name: 'description',
            type: 'text',
          },
          {
            name: 'category',
            type: 'enum',
            enum: ['general', 'development', 'analysis', 'communication', 'automation', 'security', 'data', 'ai'],
            enumName: 'tool_category_enum',
          },
          {
            name: 'parameters',
            type: 'jsonb',
          },
          {
            name: 'return_type',
            type: 'jsonb',
          },
          {
            name: 'examples',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'security_level',
            type: 'enum',
            enum: ['safe', 'moderate', 'restricted', 'dangerous'],
            enumName: 'security_level_enum',
          },
          {
            name: 'cost_estimate',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'execution_time_estimate',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'requires_approval',
            type: 'boolean',
            default: false,
          },
          {
            name: 'dependencies',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'version',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'author',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'tags',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'is_enabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'rate_limits',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'total_executions',
            type: 'integer',
            default: 0,
          },
          {
            name: 'successful_executions',
            type: 'integer',
            default: 0,
          },
          {
            name: 'average_execution_time',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'documentation_url',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'support_contact',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'changelog',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'deployment_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'environment_requirements',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'reliability_score',
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
            name: 'maintenance_status',
            type: 'enum',
            enum: ['active', 'maintenance', 'deprecated', 'archived'],
            enumName: 'maintenance_status_enum',
            default: "'active'",
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

    // Create tool_executions table
    await queryRunner.createTable(
      new Table({
        name: 'tool_executions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'tool_id',
            type: 'uuid',
          },
          {
            name: 'agent_id',
            type: 'uuid',
          },
          {
            name: 'parameters',
            type: 'jsonb',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'approval-required'],
            enumName: 'tool_execution_status_enum',
            default: "'pending'",
          },
          {
            name: 'start_time',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'end_time',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'result',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'error',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'approval_required',
            type: 'boolean',
            default: false,
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
            name: 'cost',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'execution_time_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'retry_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'max_retries',
            type: 'integer',
            default: 3,
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

    // Create tool_usage_records table
    await queryRunner.createTable(
      new Table({
        name: 'tool_usage_records',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'tool_id',
            type: 'uuid',
          },
          {
            name: 'agent_id',
            type: 'uuid',
          },
          {
            name: 'recorded_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'success',
            type: 'boolean',
          },
          {
            name: 'execution_time',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'cost',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'error_type',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'parameters',
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

    // Create indexes for tool_definitions
    await queryRunner.createIndex(
      'tool_definitions',
      new TableIndex({
        name: 'IDX_tool_definitions_category_enabled',
        columnNames: ['category', 'is_enabled']
      })
    );
    await queryRunner.createIndex(
      'tool_definitions',
      new TableIndex({
        name: 'IDX_tool_definitions_security_level',
        columnNames: ['security_level']
      })
    );
    await queryRunner.createIndex(
      'tool_definitions',
      new TableIndex({
        name: 'IDX_tool_definitions_author',
        columnNames: ['author']
      })
    );
    await queryRunner.createIndex(
      'tool_definitions',
      new TableIndex({
        name: 'IDX_tool_definitions_version',
        columnNames: ['version']
      })
    );

    // Create indexes for tool_executions
    await queryRunner.createIndex(
      'tool_executions',
      new TableIndex({
        name: 'IDX_tool_executions_tool_id',
        columnNames: ['tool_id']
      })
    );
    await queryRunner.createIndex(
      'tool_executions',
      new TableIndex({
        name: 'IDX_tool_executions_agent_id',
        columnNames: ['agent_id']
      })
    );
    await queryRunner.createIndex(
      'tool_executions',
      new TableIndex({
        name: 'IDX_tool_executions_status',
        columnNames: ['status']
      })
    );
    await queryRunner.createIndex(
      'tool_executions',
      new TableIndex({
        name: 'IDX_tool_executions_start_time',
        columnNames: ['start_time']
      })
    );

    // Create indexes for tool_usage_records
    await queryRunner.createIndex(
      'tool_usage_records',
      new TableIndex({
        name: 'IDX_tool_usage_records_tool_id',
        columnNames: ['tool_id']
      })
    );
    await queryRunner.createIndex(
      'tool_usage_records',
      new TableIndex({
        name: 'IDX_tool_usage_records_agent_id',
        columnNames: ['agent_id']
      })
    );
    await queryRunner.createIndex(
      'tool_usage_records',
      new TableIndex({
        name: 'IDX_tool_usage_records_recorded_at',
        columnNames: ['recorded_at']
      })
    );
    await queryRunner.createIndex(
      'tool_usage_records',
      new TableIndex({
        name: 'IDX_tool_usage_records_success',
        columnNames: ['success']
      })
    );

    // Create foreign key constraints
    await queryRunner.createForeignKey(
      'tool_executions',
      new TableForeignKey({
        name: 'FK_tool_executions_tool_id',
        columnNames: ['tool_id'],
        referencedTableName: 'tool_definitions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'tool_usage_records',
      new TableForeignKey({
        name: 'FK_tool_usage_records_tool_id',
        columnNames: ['tool_id'],
        referencedTableName: 'tool_definitions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    // Create updated_at trigger function if it doesn't exist
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers for updated_at columns
    await queryRunner.query(`
      CREATE TRIGGER update_tool_definitions_updated_at
        BEFORE UPDATE ON tool_definitions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await queryRunner.query(`
      CREATE TRIGGER update_tool_executions_updated_at
        BEFORE UPDATE ON tool_executions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await queryRunner.query(`
      CREATE TRIGGER update_tool_usage_records_updated_at
        BEFORE UPDATE ON tool_usage_records
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_tool_usage_records_updated_at ON tool_usage_records`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_tool_executions_updated_at ON tool_executions`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_tool_definitions_updated_at ON tool_definitions`);

    // Drop foreign keys
    const toolExecutionsTable = await queryRunner.getTable('tool_executions');
    const toolUsageRecordsTable = await queryRunner.getTable('tool_usage_records');
    
    if (toolExecutionsTable) {
      const toolExecutionsForeignKeys = toolExecutionsTable.foreignKeys.filter(
        fk => fk.columnNames.indexOf('tool_id') !== -1
      );
      await queryRunner.dropForeignKeys('tool_executions', toolExecutionsForeignKeys);
    }

    if (toolUsageRecordsTable) {
      const toolUsageRecordsForeignKeys = toolUsageRecordsTable.foreignKeys.filter(
        fk => fk.columnNames.indexOf('tool_id') !== -1
      );
      await queryRunner.dropForeignKeys('tool_usage_records', toolUsageRecordsForeignKeys);
    }

    // Drop tables
    await queryRunner.dropTable('tool_usage_records', true);
    await queryRunner.dropTable('tool_executions', true);
    await queryRunner.dropTable('tool_definitions', true);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "maintenance_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tool_execution_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tool_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "security_level_enum"`);
  }
} 