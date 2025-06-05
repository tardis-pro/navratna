import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class UpdateApprovalWorkflowStructure1733420000000 implements MigrationInterface {
  name = 'UpdateApprovalWorkflowStructure1733420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create approval_decisions table first
    await queryRunner.createTable(
      new Table({
        name: 'approval_decisions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'workflow_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'approver_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'decision',
            type: 'enum',
            enum: ['approve', 'reject'],
            isNullable: false,
          },
          {
            name: 'conditions',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'feedback',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'decided_at',
            type: 'timestamp',
            isNullable: false,
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
            columnNames: ['workflow_id'],
            referencedTableName: 'approval_workflows',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        indices: [
          {
            name: 'IDX_approval_decisions_workflow_decided',
            columnNames: ['workflow_id', 'decided_at']
          },
          {
            name: 'IDX_approval_decisions_approver',
            columnNames: ['approver_id']
          }
        ]
      }),
      true
    );

    // Check if approval_workflows table exists and has the old structure
    const table = await queryRunner.getTable('approval_workflows');
    if (table) {
      // Drop old columns that don't match the new structure
      const columnsToRemove = [
        'tool_execution_id',
        'approval_type', 
        'requested_by',
        'requested_at',
        'approver_role',
        'approved_by',
        'approved_at',
        'reason',
        'comments',
        'priority_level',
        'auto_approve_conditions',
        'escalation_rules',
        'notification_sent',
        'reminder_count',
        'context',
        'tags'
      ];

      for (const columnName of columnsToRemove) {
        const column = table.findColumnByName(columnName);
        if (column) {
          await queryRunner.dropColumn('approval_workflows', columnName);
        }
      }

      // Add new columns if they don't exist
      const requiredApproversColumn = table.findColumnByName('required_approvers');
      if (!requiredApproversColumn) {
        await queryRunner.addColumn('approval_workflows', new TableColumn({
          name: 'required_approvers',
          type: 'jsonb',
          isNullable: false,
          default: "'[]'",
        }));
      }

      const currentApproversColumn = table.findColumnByName('current_approvers');
      if (!currentApproversColumn) {
        await queryRunner.addColumn('approval_workflows', new TableColumn({
          name: 'current_approvers',
          type: 'jsonb',
          isNullable: false,
          default: "'[]'",
        }));
      }

      const lastReminderColumn = table.findColumnByName('last_reminder_at');
      if (!lastReminderColumn) {
        await queryRunner.addColumn('approval_workflows', new TableColumn({
          name: 'last_reminder_at',
          type: 'timestamp',
          isNullable: true,
        }));
      }

      // Ensure operation_id is not nullable
      const operationIdColumn = table.findColumnByName('operation_id');
      if (operationIdColumn && operationIdColumn.isNullable) {
        await queryRunner.changeColumn('approval_workflows', 'operation_id', new TableColumn({
          name: 'operation_id',
          type: 'uuid',
          isNullable: false,
        }));
      }
    }

    // Create index for approval_workflows using raw SQL
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_approval_workflows_status_expires" 
      ON "approval_workflows" ("status", "expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop approval_decisions table
    await queryRunner.dropTable('approval_decisions', true);

    // Drop the index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_approval_workflows_status_expires"`);

    // Note: Reverting approval_workflows structure changes would be complex
    // and could result in data loss. This migration is designed to be forward-only.
    console.log('Warning: Reverting approval_workflows structure changes not implemented to prevent data loss');
  }
} 