#!/bin/bash

# Database Migration Script for UAIP Backend
# Usage: ./migrate.sh [migration_number] [database_name]

set -e

# Default values
MIGRATION_NUM=${1:-"006"}
DB_NAME=${2:-"uaip_db"}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Running Migration $MIGRATION_NUM on database: $DB_NAME"

# Check if migration file exists
MIGRATION_SCRIPT="$SCRIPT_DIR/run-migration-$MIGRATION_NUM.sql"
if [ ! -f "$MIGRATION_SCRIPT" ]; then
    echo "❌ Migration script not found: $MIGRATION_SCRIPT"
    exit 1
fi

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql command not found. Please install PostgreSQL client."
    exit 1
fi

# Run the migration
echo "📝 Executing migration script..."
if psql -d "$DB_NAME" -f "$MIGRATION_SCRIPT"; then
    echo "✅ Migration $MIGRATION_NUM completed successfully!"
else
    echo "❌ Migration $MIGRATION_NUM failed!"
    exit 1
fi

echo "🎉 Database migration completed!" 