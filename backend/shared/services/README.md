# UAIP Shared Services

This package contains all shared services and TypeORM configuration for the UAIP backend monorepo.

## TypeORM Configuration

All TypeORM configuration is centralized in this package:

- **Configuration**: `src/database/typeorm.config.ts`
- **CLI Config**: `typeorm.config.ts` (for TypeORM CLI operations)
- **Service**: `src/typeormService.ts` (TypeORM service wrapper)

## Usage

### In Services

```typescript
import { typeormService, AppDataSource } from '@uaip/shared-services';

// Initialize TypeORM
await typeormService.initialize();

// Use repositories
const agentRepo = typeormService.agentRepository;
const agents = await agentRepo.find();

// Use DataSource directly
const dataSource = typeormService.getDataSource();
```

### CLI Commands

From the root of the monorepo:

```bash
# Generate migration
pnpm migration:generate -- src/migrations/MyMigration

# Run migrations
pnpm migration:run

# Revert migration
pnpm migration:revert

# Show migration status
pnpm migration:show

# Sync schema (development only)
pnpm schema:sync
```

Or from within the shared/services directory:

```bash
cd shared/services

# Generate migration
pnpm migration:generate -- src/migrations/MyMigration

# Run migrations
pnpm migration:run
```

## Entities

All TypeORM entities are located in `src/entities/` and are automatically loaded by the configuration.

## Migrations

Migrations are stored in `src/migrations/` and are managed by TypeORM CLI.

## Database Connection

The configuration automatically:

- Loads entities from the entities directory
- Configures PostgreSQL connection using shared config
- Sets up Redis caching
- Configures connection pooling
- Handles logging based on environment

## Environment Variables

Database configuration is handled by the shared config package (`@uaip/config`).

Required environment variables:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `REDIS_HOST`
- `REDIS_PORT`
