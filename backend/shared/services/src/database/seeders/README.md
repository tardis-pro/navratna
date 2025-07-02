# Database Seeders

This directory contains the simplified database seeding infrastructure for the Council of Nycea UAIP system.

## Structure

```
seeders/
├── README.md                 # This file
├── index.ts                  # Main entry point and exports
├── BaseSeed.ts              # Base class for all seeders
├── DatabaseSeeder.ts        # Main orchestrator class
├── UserSeed.ts              # User entity seeder
├── SecurityPolicySeed.ts    # Security policy seeder
├── PersonaSeed.ts           # Persona entity seeder
├── AgentSeed.ts             # Agent entity seeder
├── ToolDefinitionSeed.ts    # Tool definition seeder
└── data/                    # Data files for complex entities
    └── viralAgents.ts       # Viral agent data
```

## Key Features

### 1. Graceful Updates ("If Exists Update" Pattern)
Each seeder implements an upsert pattern:
- **Insert** if the entity doesn't exist
- **Update** if the entity already exists
- Uses unique fields to determine existence (email for users, name for most others)

### 2. Base Seeder Class
All seeders extend `BaseSeed<T>` which provides:
- Common upsert logic
- Helper methods for finding entities
- Consistent error handling and logging
- Random data generation utilities

### 3. Dependency Management
The `DatabaseSeeder` class orchestrates seeding in proper dependency order:
1. Users (no dependencies)
2. Security Policies (depends on Users)
3. Personas (depends on Users)
4. Agents (depends on Users and Personas)
5. Tool Definitions (depends on Users)
6. ... (additional seeders as needed)

### 4. Modular Data Organization
- Core seeder logic in individual files
- Complex data sets in separate data files
- Easy to add new seeders without modifying existing ones

## Prerequisites

### Database Migration
Before using the new seeders, you must run the migration to add unique constraints:

```bash
cd backend/shared/services
pnpm migration:run
```

This adds unique constraints to:
- `agents.name`
- `personas.name`
- `security_policies.name`

### Verification
Test the seeder functionality:

```bash
cd backend/shared/services
npx tsx src/database/seeders/test-unique-constraints.ts
```

## Usage

### Basic Usage
```typescript
import { seedDatabase } from './seeders/index.js';

// Seed all entities
await seedDatabase();
```

### Advanced Usage
```typescript
import { DatabaseSeeder, UserSeed, AgentSeed } from './seeders/index.js';
import { initializeDatabase } from './typeorm.config.js';

const dataSource = await initializeDatabase();
const seeder = new DatabaseSeeder(dataSource);

// Seed everything
await seeder.seedAll();

// Or seed specific entities
const userSeed = new UserSeed(dataSource);
const users = await userSeed.seed();

// Get seeded data
const seededUsers = seeder.getSeededEntities('Users');
```

### Creating New Seeders

1. **Create a new seeder class:**
```typescript
import { DataSource, DeepPartial } from 'typeorm';
import { BaseSeed } from './BaseSeed.js';
import { YourEntity } from '../../entities/yourEntity.entity.js';

export class YourEntitySeed extends BaseSeed<YourEntity> {
  constructor(dataSource: DataSource, dependencies?: any[]) {
    super(dataSource, dataSource.getRepository(YourEntity), 'YourEntities');
  }

  getUniqueField(): keyof YourEntity {
    return 'name'; // or 'id', 'email', etc.
  }

  async getSeedData(): Promise<DeepPartial<YourEntity>[]> {
    return [
      {
        name: 'Example Entity',
        // ... other properties
      }
    ];
  }
}
```

2. **Add to DatabaseSeeder:**
```typescript
// In DatabaseSeeder.ts
import { YourEntitySeed } from './YourEntitySeed.js';

// Add to seedAll() method
const yourEntities = await this.seedYourEntities(dependencies);

// Add the seeding method
private async seedYourEntities(dependencies: any[]): Promise<YourEntity[]> {
  const seed = new YourEntitySeed(this.dataSource, dependencies);
  const entities = await seed.seed();
  this.seededEntities.set('YourEntities', entities);
  return entities;
}
```

3. **Export from index.ts:**
```typescript
export { YourEntitySeed } from './YourEntitySeed.js';
```

## Migration from Old Seeder

The old monolithic `seedDatabase.ts` file has been deprecated and now re-exports the new functionality for backward compatibility. All existing imports will continue to work:

```typescript
// This still works
import { seedDatabase, DatabaseSeeder } from '../database/seedDatabase.js';
```

## Benefits

1. **Maintainability**: Each entity has its own seeder file
2. **Reusability**: Individual seeders can be used independently
3. **Graceful Updates**: No more data loss on re-seeding
4. **Extensibility**: Easy to add new seeders
5. **Testing**: Individual seeders can be tested in isolation
6. **Performance**: Only seed what you need
7. **Debugging**: Easier to debug specific entity seeding issues

## Security Considerations

- All seeders respect entity relationships and foreign key constraints
- Passwords are properly hashed using bcrypt
- Security policies are seeded with appropriate access controls
- Audit trails are maintained for all seeding operations

## Future Enhancements

- [ ] Add more entity seeders (Operations, Discussions, etc.)
- [ ] Implement seeding profiles (minimal, full, test, production)
- [ ] Add data validation before seeding
- [ ] Implement rollback functionality
- [ ] Add performance metrics and timing
- [ ] Support for environment-specific seed data
