# End-to-End (E2E) Testing Guide

This document describes the backend E2E/integration testing setup, commands, and best practices for the Navratna project.

## Overview

The project uses a Dockerized test infrastructure for running integration tests against backend services. The test environment includes:

- **PostgreSQL** (port 5433) - Primary test database
- **Redis** (port 6380) - Caching and session storage
- **RabbitMQ** (port 5673) - Message queue for event-driven tests

## Quick Start

### 1. Start Test Infrastructure

```bash
# Using the integration test script (recommended)
./scripts/run-integration-tests.sh setup

# Or manually with docker-compose
docker-compose -f docker-compose.test.yml up -d postgres redis rabbitmq

# Wait for services to be ready
docker-compose -f docker-compose.test.yml exec -T postgres pg_isready -U postgres
docker-compose -f docker-compose.test.yml exec -T redis redis-cli ping
```

### 2. Run Integration Tests

```bash
# Run all integration tests
pnpm test:integration

# Run specific test categories
pnpm test:integration:oauth      # OAuth flow tests
pnpm test:integration:security   # Security validation tests
pnpm test:integration:coverage   # Tests with coverage report

# Run tests in a specific service
cd backend/services/security-gateway && pnpm run test:integration
cd backend/services/discussion-orchestration && pnpm run test
```

### 3. Cleanup

```bash
# Using the script (recommended)
./scripts/run-integration-tests.sh cleanup

# Or manually
docker-compose -f docker-compose.test.yml down -v
```

## Test Infrastructure Configuration

### Docker Compose (docker-compose.test.yml)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:17.5
    environment:
      POSTGRES_DB: council_integration_test
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5433:5432'
    volumes:
      - postgres_test_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6380:6379'
    volumes:
      - redis_test_data:/data

  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    ports:
      - '5673:5672'
      - '15673:15672'
    volumes:
      - rabbitmq_test_data:/var/lib/rabbitmq

volumes:
  postgres_test_data:
  redis_test_data:
  rabbitmq_test_data:
```

### Environment Variables

Tests require these environment variables to be set:

```bash
export NODE_ENV=test
export TEST_DB_HOST=localhost
export TEST_DB_PORT=5433
export TEST_DB_USERNAME=postgres
export TEST_DB_PASSWORD=postgres
export TEST_DB_NAME=council_integration_test
export REDIS_HOST=localhost
export REDIS_PORT=6380
export RABBITMQ_URL=amqp://guest:guest@localhost:5673
```

## Integration Test Scripts

### Available Commands

| Command                                       | Description                                   |
| --------------------------------------------- | --------------------------------------------- |
| `./scripts/run-integration-tests.sh setup`    | Install dependencies and start infrastructure |
| `./scripts/run-integration-tests.sh test`     | Run all integration tests                     |
| `./scripts/run-integration-tests.sh oauth`    | Run OAuth-specific tests                      |
| `./scripts/run-integration-tests.sh security` | Run security validation tests                 |
| `./scripts/run-integration-tests.sh coverage` | Run tests with coverage report                |
| `./scripts/run-integration-tests.sh verbose`  | Run tests with verbose output                 |
| `./scripts/run-integration-tests.sh cleanup`  | Stop and remove test containers               |

### Options

| Option           | Description                                |
| ---------------- | ------------------------------------------ |
| `--skip-setup`   | Skip environment setup                     |
| `--keep-running` | Keep services running after tests complete |

## Test Results Summary

### Working Services

| Service                  | Status     | Tests Passed | Notes                                                                    |
| ------------------------ | ---------- | ------------ | ------------------------------------------------------------------------ |
| discussion-orchestration | ✅ Working | 57/57        | Full integration tests passing                                           |
| orchestration-pipeline   | ✅ Working | 25/25        | Unit tests passing                                                       |
| security-gateway         | ⚠️ Issues  | 7/11         | 7 security demo tests pass, 4 integration tests have pre-existing issues |
| agent-intelligence       | ❌ Issues  | 0/2          | Import path issues (.js extensions)                                      |

### discussion-orchestration Service

**Status**: ✅ Working

```
Test Suites: 2 passed, 1 failed, 3 total
Tests:       57 passed, 57 total
```

**Passed Test Categories**:

- End-to-End Discussion Creation Flow
- Real-Time Collaboration Integration
- Turn Management Integration
- Error Handling and Resilience
- Performance and Scalability
- Service Integration Points
- Resource Cleanup
- Data Consistency

**Failed Tests**:

- `discussionWebSocketHandler.test.ts` - Type errors (parameters implicitly `any`)

### orchestration-pipeline Service

**Status**: ✅ Working

```
Test Suites: 1 passed, 1 total
Tests:       25 passed, 25 total
```

**Passed Test Categories**:

- OrchestrationEngine initialization and lifecycle
- Operation execution (simple, failures, pause, resume, cancel)
- Checkpoint creation and management
- Resource management and error scenarios
- Parallel execution and compensation workflows
- Timeout and retry handling

### security-gateway Service

**Status**: ⚠️ Needs fixes (pre-existing issues)

**Passed Tests**: 7 security demo tests pass

**Failed Test Suites** (4 total):

- `enhancedSecurityIntegration.test.ts` - .js files using ESM imports
- `enhancedSecurityGatewayService.test.ts` - .js files using ESM imports
- `oauthProviderService.test.ts` - Type mismatches
- `securityGateway.test.ts` - .js files using ESM imports

**Issues Identified**:

1. .js service files using ESM import statements that Jest can't parse:
   - `enhancedSecurityGatewayService.js`
   - `securityGatewayService.js`
   - `oauthProviderService.js`
   - `enhancedAuthService.js`

2. Entity property type mismatches (AuditEvent, OAuthState, etc.)

**Required Fixes**:

- Convert .js service files to .ts
- Or configure Jest to handle ESM in .js files
- Update entity type definitions to match test expectations

### agent-intelligence Service

**Status**: ❌ Issues (pre-existing)

**Issues**:

- Test imports use `.js` extensions: `agentController.js`
- Module resolution fails for these paths

**Required Fixes**:

- Update test imports to use `.ts` extension or remove extension
- Ensure controller file exists at expected path

## Writing New Integration Tests

### Location

Integration tests should be placed in:

```
backend/services/<service-name>/src/__tests__/integration/
```

### Naming Convention

- Test files: `*.integration.test.ts`
- Setup files: `src/__tests__/setup.ts`

### Test Framework Configuration

Each service uses either **Jest** or **Vitest** depending on the service:

#### Jest Configuration (jest.config.js)

```javascript
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@uaip/types$': '<rootDir>/../../../packages/shared-types/src',
    '^@uaip/utils$': '<rootDir>/../../../packages/shared-utils/src',
    '^@uaip/shared-services$': '<rootDir>/../../shared/services/src',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  testTimeout: 10000,
};
```

#### Vitest Configuration (vitest.config.ts)

```typescript
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
```

### Example Integration Test

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { DiscussionOrchestrationService } from '../../services/discussionOrchestrationService.js';

describe('Discussion Lifecycle Integration', () => {
  let service: DiscussionOrchestrationService;

  beforeAll(async () => {
    service = new DiscussionOrchestrationService();
    await service.initialize();
  });

  afterAll(async () => {
    await service.cleanup();
  });

  it('should create, start, and manage a complete discussion lifecycle', async () => {
    const discussion = await service.createDiscussion({
      title: 'Test Discussion',
      participants: [],
      turnStrategy: 'round-robin',
    });

    await service.startDiscussion(discussion.id);

    const result = await service.getDiscussion(discussion.id);
    expect(result.status).toBe('active');
  });
});
```

## Best Practices

### 1. Test Isolation

- Each test should be independent
- Use `beforeAll` / `afterAll` for setup/teardown
- Clean up test data after each test run

### 2. Mock External Dependencies

```typescript
// Example: Mocking database service
vi.mock('@uaip/shared-services', () => ({
  DatabaseService: vi.fn().mockImplementation(() => createMockDatabaseService()),
  EventBusService: vi.fn().mockImplementation(() => createMockEventBusService()),
}));
```

### 3. Use Environment Variables

Never hardcode connection strings in tests. Use the environment variables defined in the test setup.

### 4. Handle Async Operations

```typescript
it('should handle async operations', async () => {
  const result = await service.createDiscussion(config);
  expect(result).toBeDefined();
});
```

## Troubleshooting

### Services Not Starting

```bash
# Check if ports are in use
lsof -i :5433 -i :6380 -i :5673

# Remove any existing containers
docker-compose -f docker-compose.test.yml down -v
```

### Database Connection Failed

```bash
# Verify PostgreSQL is running
docker-compose -f docker-compose.test.yml exec postgres pg_isready -U postgres

# Check logs
docker-compose -f docker-compose.test.yml logs postgres
```

### Type Errors in Tests

If you encounter TypeScript errors:

1. Ensure all dependencies are installed: `pnpm install`
2. Check that `tsconfig.json` includes test files
3. Verify Jest/Vitest transform is configured correctly

## CI/CD Integration

For CI pipelines, use:

```bash
# Setup and run tests
./scripts/run-integration-tests.sh test --skip-setup

# For coverage
./scripts/run-integration-tests.sh coverage
```

## Related Documentation

- [Testing Guide](TESTING.md) - General testing strategies
- [Jest Documentation](https://jestjs.io/)
- [Vitest Documentation](https://vitest.dev/)
- [Docker Compose](https://docs.docker.com/compose/)
