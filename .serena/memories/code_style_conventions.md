# Code Style and Conventions

## TypeScript Configuration
- **Target**: ES2022 with ESNext modules
- **Strict Mode**: Currently disabled (`strict: false`)
- **Path Mapping**: Extensive use of `@uaip/*` aliases for cross-package imports
- **Decorators**: Experimental decorators enabled for TypeORM entities
- **Module Resolution**: Node-style with ES module interop

## ESLint Rules
- **Unused Variables**: Error with `_` prefix exception
- **Explicit Any**: Warning level (not error)
- **Console Statements**: Allowed (not restricted)
- **Const Preference**: Enforced (`prefer-const: error`)
- **Var Usage**: Prohibited (`no-var: error`)
- **Function Return Types**: Not required
- **Non-null Assertions**: Warning level

## Import Patterns (Critical)
**Always use workspace imports, never relative paths across packages:**

✅ **Correct:**
```typescript
import { Operation } from '@uaip/types/operation';
import { logger } from '@uaip/utils/logger';
import { DatabaseService } from '@uaip/shared-services/databaseService';
```

❌ **Incorrect:**
```typescript
import { Operation } from '../../../shared/types/src/operation';
import { logger } from '../../../shared/utils/src/logger';
```

## Service Structure Patterns
- **Express Services**: Consistent setup with helmet, compression, rate limiting
- **Controllers**: Class-based with dependency injection
- **Routes**: Function-based factory pattern (`createXRoutes`)
- **Middleware**: Shared middleware stack via `@uaip/middleware`
- **Error Handling**: Centralized error transformation
- **Validation**: Zod schemas for request/response validation

## Database Patterns
- **TypeORM**: Entities with decorators, repository pattern
- **Services**: Domain-specific services (UserService, ToolService, etc.)
- **Lazy Loading**: Careful dependency injection to avoid race conditions
- **Transactions**: Proper transaction management for complex operations

## Frontend Patterns
- **Components**: Functional components with TypeScript
- **Hooks**: Custom hooks for state management
- **API Calls**: Centralized in `/src/api/` with React Query
- **Styling**: Tailwind CSS with component-scoped styles
- **Forms**: React Hook Form with Zod validation