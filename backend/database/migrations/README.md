# Database Migrations

This directory contains database migration scripts for the UAIP backend.

## Migration 006: Add Authentication Columns and Tables

### Overview
This migration adds missing authentication-related columns and tables that the application code expects but were missing from the initial database schema.

### Changes Made

#### Added Columns to `users` table:
- `password_hash` (VARCHAR(255)) - Bcrypt hashed password
- `password_changed_at` (TIMESTAMP) - When password was last changed
- `failed_login_attempts` (INTEGER) - Number of consecutive failed login attempts
- `locked_until` (TIMESTAMP) - Account locked until this timestamp
- `first_name` (VARCHAR(100)) - User first name
- `last_name` (VARCHAR(100)) - User last name  
- `department` (VARCHAR(100)) - User department or organizational unit

#### Added Tables:
- `refresh_tokens` - JWT refresh tokens for user sessions
- `password_reset_tokens` - Tokens for password reset functionality

#### Added Indexes:
- Performance indexes for all new columns
- Indexes for token lookups and expiration queries

#### Added Constraints:
- Check constraint to ensure `failed_login_attempts >= 0`

## Migration 007: Add Timestamp Columns to Audit Events

### Overview
This migration adds missing `created_at` and `updated_at` columns to the `audit_events` table that the application code expects.

### Changes Made

#### Added Columns to `audit_events` table:
- `created_at` (TIMESTAMP) - When the audit event record was created
- `updated_at` (TIMESTAMP) - When the audit event record was last updated

#### Added Indexes:
- Performance indexes for the new timestamp columns

#### Added Triggers:
- `update_audit_events_updated_at` trigger to automatically update the `updated_at` column

### Running the Migrations

#### For Existing Databases:
```bash
# Navigate to the database scripts directory
cd database/scripts

# Run migration 006 (authentication columns)
psql -d your_database_name -f run-migration-006.sql

# Run migration 007 (audit events timestamps)
psql -d your_database_name -f run-migration-007.sql

# Or use the helper script
./migrate.sh 006 your_database_name
./migrate.sh 007 your_database_name
```

#### For Docker Compose:
```bash
# Copy and run migration 006
docker cp database/migrations/006_add_authentication_columns_and_tables.sql uaip-postgres:/tmp/migration-006.sql
docker exec uaip-postgres psql -U uaip_user -d uaip -f /tmp/migration-006.sql

# Copy and run migration 007
docker cp database/migrations/007_add_audit_events_timestamps.sql uaip-postgres:/tmp/migration-007.sql
docker exec uaip-postgres psql -U uaip_user -d uaip -f /tmp/migration-007.sql
```

#### For New Installations:
The changes are already included in `database/init/01-init-database.sql`, so new installations will have all the required columns and tables.

### Verification

After running the migrations, verify that:

1. All new columns exist in the `users` table
2. `refresh_tokens` and `password_reset_tokens` tables are created
3. `audit_events` table has `created_at` and `updated_at` columns
4. All indexes are in place
5. Application authentication and audit features work correctly

### Rollback

If you need to rollback these migrations:

#### Migration 007 Rollback:
```sql
-- Remove added columns from audit_events table
ALTER TABLE audit_events 
DROP COLUMN IF EXISTS created_at,
DROP COLUMN IF EXISTS updated_at;

-- Remove trigger
DROP TRIGGER IF EXISTS update_audit_events_updated_at ON audit_events;
```

#### Migration 006 Rollback:
```sql
-- Remove added tables
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS refresh_tokens;

-- Remove added columns from users table
ALTER TABLE users 
DROP COLUMN IF EXISTS password_hash,
DROP COLUMN IF EXISTS password_changed_at,
DROP COLUMN IF EXISTS failed_login_attempts,
DROP COLUMN IF EXISTS locked_until,
DROP COLUMN IF EXISTS first_name,
DROP COLUMN IF EXISTS last_name,
DROP COLUMN IF EXISTS department;
```

### Dependencies

These migrations require:
- PostgreSQL with UUID extension enabled
- Existing `users` and `audit_events` tables from the initial schema

### Notes

- All changes use `IF NOT EXISTS` clauses to be safe for re-running
- The migrations are wrapped in transactions for atomicity
- Existing data is preserved during the migrations
- New columns are nullable to accommodate existing records 