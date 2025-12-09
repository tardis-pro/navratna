# Testing Guide

## Testing Strategy

The UAIP implements a comprehensive testing strategy across multiple levels to ensure reliability and quality.

## Test Categories

### Unit Tests

```typescript
// Example unit test for Agent class
describe('Agent', () => {
  it('should analyze context correctly', async () => {
    const agent = new Agent({
      id: 'test-agent',
      capabilities: ['analyze'],
    });

    const result = await agent.analyzeContext({
      text: 'test message',
      metadata: {},
    });

    expect(result).toMatchObject({
      intent: expect.any(String),
      confidence: expect.any(Number),
    });
  });
});
```

### Integration Tests

```typescript
// Example integration test for discussion service
describe('DiscussionService', () => {
  beforeAll(async () => {
    await setupTestDatabase();
    await startTestServices();
  });

  it('should create and manage discussions', async () => {
    const service = new DiscussionService();

    // Create discussion
    const discussion = await service.createDiscussion({
      title: 'Test Discussion',
      participants: ['agent1', 'agent2'],
    });

    // Add message
    await service.addMessage(discussion.id, {
      content: 'Test message',
      sender: 'agent1',
    });

    // Verify state
    const updated = await service.getDiscussion(discussion.id);
    expect(updated.messages).toHaveLength(1);
  });
});
```

### End-to-End Tests

```typescript
// Example E2E test using Playwright
describe('User Journey', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });

  it('should complete discussion workflow', async () => {
    // Login
    await page.goto('/login');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password');
    await page.click('#login-button');

    // Create discussion
    await page.click('#new-discussion');
    await page.fill('#title', 'E2E Test Discussion');
    await page.click('#create-button');

    // Verify discussion created
    const discussion = await page.waitForSelector('.discussion-card');
    expect(discussion).toBeTruthy();
  });
});
```

### Performance Tests

```typescript
// Example k6 performance test script
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // Ramp up
    { duration: '1m', target: 20 }, // Stay at peak
    { duration: '30s', target: 0 }, // Ramp down
  ],
};

export default function () {
  const res = http.post('http://localhost:3000/api/v1/discussions', {
    title: 'Performance Test',
    content: 'Test message',
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(1);
}
```

## Test Infrastructure

### Test Database Setup

```typescript
class TestDatabaseSetup {
  async setup(): Promise<void> {
    // Create test database
    await this.createTestDatabase();

    // Run migrations
    await this.runMigrations();

    // Seed test data
    await this.seedTestData();
  }

  async teardown(): Promise<void> {
    await this.cleanupTestData();
  }
}
```

### Mock Services

```typescript
class MockAgentService implements AgentService {
  async analyzeContext(context: Context): Promise<Analysis> {
    return {
      intent: 'mock-intent',
      confidence: 0.95,
      entities: [],
    };
  }

  async executeOperation(operation: Operation): Promise<Result> {
    return {
      status: 'success',
      data: { mockResult: true },
    };
  }
}
```

### Test Data Factories

```typescript
class TestDataFactory {
  createUser(overrides = {}): User {
    return {
      id: faker.datatype.uuid(),
      email: faker.internet.email(),
      name: faker.name.fullName(),
      role: 'user',
      ...overrides,
    };
  }

  createDiscussion(overrides = {}): Discussion {
    return {
      id: faker.datatype.uuid(),
      title: faker.lorem.sentence(),
      status: 'active',
      participants: [],
      messages: [],
      ...overrides,
    };
  }
}
```

## Testing Tools

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.test.ts'],
};
```

### Test Helpers

```typescript
class TestHelper {
  static async createAuthenticatedAgent(): Promise<TestAgent> {
    const user = await TestDataFactory.createUser();
    const token = generateTestToken(user);
    return request(app).set('Authorization', `Bearer ${token}`);
  }

  static async simulateWebSocketConnection(): Promise<WebSocket> {
    const ws = new WebSocket('ws://localhost:3000');
    return new Promise((resolve) => {
      ws.on('open', () => resolve(ws));
    });
  }
}
```

## Test Types

### Unit Test Best Practices

1. Test one thing per test
2. Use descriptive test names
3. Arrange-Act-Assert pattern
4. Mock external dependencies
5. Test edge cases

```typescript
describe('OperationExecutor', () => {
  it('should handle successful operations', async () => {
    // Arrange
    const executor = new OperationExecutor();
    const operation = TestDataFactory.createOperation();

    // Act
    const result = await executor.execute(operation);

    // Assert
    expect(result.status).toBe('success');
  });

  it('should handle failed operations', async () => {
    // Arrange
    const executor = new OperationExecutor();
    const operation = TestDataFactory.createOperation({
      shouldFail: true,
    });

    // Act & Assert
    await expect(executor.execute(operation)).rejects.toThrow('Operation failed');
  });
});
```

### Integration Test Patterns

1. Test service interactions
2. Verify database operations
3. Test event handling
4. Check message queue integration
5. Validate WebSocket behavior

```typescript
describe('Discussion Integration', () => {
  it('should handle real-time updates', async () => {
    // Setup WebSocket connection
    const ws = await TestHelper.simulateWebSocketConnection();

    // Create discussion
    const discussion = await discussionService.create({
      title: 'Integration Test',
    });

    // Send message
    await discussionService.sendMessage(discussion.id, {
      content: 'Test message',
    });

    // Verify WebSocket received update
    const update = await new Promise((resolve) => {
      ws.on('message', resolve);
    });

    expect(JSON.parse(update)).toMatchObject({
      type: 'NEW_MESSAGE',
      discussionId: discussion.id,
    });
  });
});
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Test Pipeline

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run linting
        run: npm run lint

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

### Test Reports

```typescript
interface TestReport {
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  coverage: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  duration: number;
  failures: TestFailure[];
}
```

## Monitoring and Metrics

### Test Metrics

```typescript
interface TestMetrics {
  executionTime: {
    avg: number;
    max: number;
    min: number;
  };
  coverage: {
    current: number;
    trend: number;
  };
  reliability: {
    passRate: number;
    flakyTests: string[];
  };
}
```

### Performance Benchmarks

```typescript
interface PerformanceBenchmark {
  endpoint: string;
  method: string;
  metrics: {
    responseTime: {
      avg: number;
      p95: number;
      p99: number;
    };
    throughput: number;
    errorRate: number;
  };
}
```
