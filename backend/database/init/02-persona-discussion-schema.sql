-- UAIP Persona and Discussion Schema Initialization
-- This script creates the PostgreSQL schema for personas and discussions

-- Include all persona and discussion migrations
\i /docker-entrypoint-initdb.d/migrations/001_create_personas_table.sql
\i /docker-entrypoint-initdb.d/migrations/002_create_discussions_table.sql
\i /docker-entrypoint-initdb.d/migrations/003_create_discussion_participants_table.sql
\i /docker-entrypoint-initdb.d/migrations/004_create_discussion_messages_table.sql
\i /docker-entrypoint-initdb.d/migrations/005_add_indexes_and_constraints.sql

-- Log successful schema creation
DO $$
BEGIN
    RAISE NOTICE 'Persona and Discussion schema created successfully';
END $$; 