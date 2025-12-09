# UAIP Database Migrations

This directory contains the pristine, well-organized initial migration files for the UAIP (Unified Agent Intelligence Platform) database. The migrations are logically grouped by domain and ordered to respect foreign key dependencies.

## Migration Structure

### Migration Order and Dependencies

The migrations must be run in the following order to respect foreign key constraints:

1. **001-create-core-foundation-tables.ts** - Core foundation tables (no dependencies)
2. **002-create-llm-provider-system.ts** - LLM provider management (depends on users)
3. **003-create-persona-system.ts** - Persona management (depends on users)
4. **004-create-agent-system.ts** - Agent management (depends on users, personas)
5. **005-create-discussion-system.ts** - Discussion management (depends on users, personas)
6. **006-create-tool-system.ts** - Tool system (depends on users, agents)

### Migration Groups

#### 1. Core Foundation (Migration 001)

**Tables Created:**

- `users` - Core user management and authentication
- `refresh_tokens` - User authentication tokens
- `password_reset_tokens` - Password reset functionality
- `security_policies` - System security policies
- `integration_events` - System integration events

**Purpose:** Establishes the foundational tables that have no dependencies and are referenced by other entities.

#### 2. LLM Provider System (Migration 002)

**Tables Created:**

- `llm_providers` - System-wide LLM provider configurations
- `user_llm_providers` - User-specific LLM provider settings

**Purpose:** Manages LLM provider configurations and user access to different language models.

**Dependencies:** users table

#### 3. Persona System (Migration 003)

**Tables Created:**

- `personas` - Core persona definitions and configurations
- `persona_analytics` - Analytics and performance tracking for personas

**Purpose:** Manages persona definitions, traits, behavioral patterns, and performance metrics.

**Dependencies:** users table

#### 4. Agent System (Migration 004)

**Tables Created:**

- `agents` - Core agent definitions with persona relationships
- `agent_capability_metrics` - Agent capability tracking and performance
- `conversation_contexts` - Agent conversation contexts and memory

**Purpose:** Manages agent definitions, capabilities, and conversational contexts. Implements the composition model where agents reference personas.

**Dependencies:** users, personas tables

#### 5. Discussion System (Migration 005)

**Tables Created:**

- `discussions` - Core discussion/conversation management
- `discussion_participants` - Participants in discussions (agents/personas)

**Purpose:** Manages multi-participant discussions and conversations between agents, personas, and users.

**Dependencies:** users, personas tables

#### 6. Tool System (Migration 006)

**Tables Created:**

- `tool_definitions` - Tool definitions and configurations
- `tool_executions` - Tool execution records and results
- `tool_usage_records` - Tool usage tracking and analytics

**Purpose:** Manages tool definitions, executions, and usage analytics for the agent tool system.

**Dependencies:** users, agents tables

## Key Design Principles

### 1. Logical Grouping

Each migration file contains related tables that belong to the same domain or functional area.

### 2. Dependency Respect

Migrations are ordered to ensure that referenced tables are created before tables that reference them.

### 3. Comprehensive Indexing

Each migration includes appropriate indexes for:

- Primary and foreign keys
- Frequently queried columns
- Composite indexes for common query patterns
- Unique constraints where needed

### 4. Enum Types

Proper enum types are used for:

- Status fields
- Category fields
- Type classifications
- Security levels

### 5. JSONB Usage

JSONB columns are used for:

- Configuration data
- Metadata
- Analytics data
- Flexible schema requirements

### 6. UUID Primary Keys

All tables use UUID primary keys for:

- Better distribution in distributed systems
- Security (non-guessable IDs)
- Consistency across the platform

## Running Migrations

### Prerequisites

- PostgreSQL database
- TypeORM configured
- Proper database permissions

### Command

```bash
npm run migration:run
```

### Verification

After running migrations, verify:

1. All tables are created
2. All indexes are in place
3. Foreign key constraints are properly established
4. Enum types are created correctly

## Migration Rollback

To rollback migrations (in reverse order):

```bash
npm run migration:revert
```

**Warning:** Rollback will drop all tables and data. Use with caution.

## Adding New Migrations

When adding new migrations:

1. Follow the naming convention: `XXX-descriptive-name.ts`
2. Respect dependency order
3. Include appropriate indexes
4. Add comprehensive documentation
5. Test both up and down migrations

## Database Schema Validation

The migration structure supports:

- Full schema recreation from scratch
- Incremental updates
- Proper constraint validation
- Performance optimization through indexing

## Notes

- Each migration is self-contained and can be reviewed independently
- Foreign key constraints ensure data integrity
- Indexes are optimized for expected query patterns
- JSONB fields provide flexibility while maintaining performance
- Enum types ensure data consistency and validation
