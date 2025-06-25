# Bigint to String ID Migration

This document describes the migration process to convert all bigint ID columns to string (varchar) columns in the UAIP backend database.

## Overview

The migration `010-migrate-bigint-to-string.ts` converts all bigint ID columns to varchar(36) columns to support string-based IDs throughout the system.

## What the Migration Does

1. **Drops Foreign Key Constraints**: Temporarily removes all foreign key constraints to allow column modifications
2. **Drops ID-related Indices**: Removes indices that reference ID columns
3. **Converts ID Columns**: 
   - Primary key `id` columns: bigint → varchar(36)
   - Foreign key columns (ending with `_id`, `_by`): bigint → varchar(36)
   - Special ID columns: `source_item_id`, `target_item_id`, `parent_persona_id`
   - Array columns: bigint[] → varchar(36)[]
4. **Recreates Indices**: Rebuilds all ID-related indices with the new column types
5. **Recreates Foreign Keys**: Restores all foreign key constraints with the new column types

## Tables Affected

The migration processes these tables:
- `users`
- `refresh_tokens`
- `password_reset_tokens`
- `operations`
- `audit_events`
- `operation_states`
- `operation_checkpoints`
- `step_results`
- `approval_workflows`
- `approval_decisions`
- `artifacts`
- `artifact_deployments`
- `artifact_reviews`
- `knowledge_items`
- `knowledge_relationships`
- `personas`
- `persona_analytics`
- `security_policies`
- `tool_definitions`
- `tool_executions`
- `tool_usage_records`
- `mcp_servers`
- `mcp_tool_calls`
- `agent_capability_metrics`
- `agent_learning_records`
- `execution_plans`
- `agents`
- `conversation_contexts`
- `discussion_participants`

## Running the Migration

### Prerequisites

1. **Backup your database** before running this migration
2. Ensure all services are stopped
3. Make sure you have sufficient database privileges

### Steps

1. **Build the migration**:
   ```bash
   cd shared/services
   npm run build
   ```

2. **Run the migration**:
   ```bash
   npx typeorm migration:run -d dist/typeorm.config.js
   ```

3. **Verify the migration**:
   ```bash
   npx typeorm migration:show -d dist/typeorm.config.js
   ```

## Post-Migration Considerations

### Entity Updates Required

After running the migration, ensure all entity classes are updated to use string IDs:

```typescript
// BaseEntity should use:
@PrimaryColumn({ type: 'varchar', length: 36 })
id: string;

// Foreign key columns should use:
@Column('varchar', { length: 36, nullable: true })
userId?: string;
```

### Repository Updates

Update repository methods to handle string IDs:

```typescript
// Before (bigint)
async findById(id: number): Promise<Entity | null>

// After (string)
async findById(id: string): Promise<Entity | null>
```

### Service Layer Updates

Update service methods to work with string IDs:

```typescript
// API endpoints should expect string IDs
async getUser(id: string): Promise<User>
```

## Data Conversion

The migration converts existing bigint values to their string representation:
- `1` → `"1"`
- `12345` → `"12345"`

This preserves the existing data while changing the column type.

## Rollback

⚠️ **This migration cannot be automatically rolled back** due to the data type conversion. 

If you need to rollback:
1. Restore from your database backup
2. Or manually create a reverse migration that converts varchar back to bigint

## Troubleshooting

### Common Issues

1. **Foreign Key Constraint Errors**: 
   - The migration handles dropping and recreating constraints
   - If you see constraint errors, check that all referenced tables exist

2. **Index Creation Errors**:
   - Some indices might already exist
   - The migration continues even if index creation fails

3. **Table Not Found Errors**:
   - The migration skips tables that don't exist
   - This is normal for optional tables

### Verification Queries

After migration, verify the changes:

```sql
-- Check column types
SELECT table_name, column_name, data_type, character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND column_name IN ('id', 'user_id', 'agent_id', 'operation_id')
ORDER BY table_name, column_name;

-- Check primary keys
SELECT tc.table_name, kcu.column_name, kcu.data_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- Check foreign keys
SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu 
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```

## Support

If you encounter issues with this migration, check:
1. Database logs for specific error messages
2. Ensure all prerequisite migrations have run
3. Verify database permissions
4. Check that all entity imports are correct in TypeORM config 