# Shared Services Test Suite

This directory contains comprehensive tests for the UAIP shared services module with 100% code coverage requirements.

## Test Structure

```
__tests__/
├── unit/                     # Unit tests for individual components
│   ├── database/            # Database service and repository tests
│   ├── agent-memory/        # Memory management service tests
│   ├── knowledge-graph/     # Knowledge graph and embedding tests
│   └── ...
├── integration/             # Integration tests for service interactions
├── e2e/                     # End-to-end test scenarios
├── helpers/                 # Test utilities and helper functions
├── mocks/                   # Mock objects and factories
├── fixtures/                # Test data and fixtures
├── setup.ts                 # Global test setup
├── globalSetup.ts          # Container initialization
└── globalTeardown.ts       # Container cleanup
```

## Test Categories

### Unit Tests

**Database Services**

- `DatabaseService.test.ts` - Core database operations, connection management, transactions
- `UserRepository.test.ts` - User CRUD operations, authentication data
- Additional repository tests for agents, operations, tools, etc.

**Agent Memory Management**

- `AgentMemoryService.test.ts` - Memory orchestration and analytics
- `WorkingMemoryManager.test.ts` - Active memory and emotional state
- `EpisodicMemoryManager.test.ts` - Experience storage and retrieval
- `SemanticMemoryManager.test.ts` - Concept learning and relationships

**Knowledge Graph Services**

- `KnowledgeGraphService.test.ts` - Knowledge ingestion, search, and retrieval
- `EmbeddingService.test.ts` - Vector embedding generation and similarity
- `ContentClassifier.test.ts` - Automatic content categorization
- `RelationshipDetector.test.ts` - Knowledge relationship extraction

### Integration Tests

**Service Orchestration**

- `AgentIntelligenceService.test.ts` - Multi-service agent workflows
- `WorkflowOrchestration.test.ts` - Complex operation coordination
- `EventBusIntegration.test.ts` - Inter-service communication

### End-to-End Tests

**Complete Workflows**

- Agent lifecycle management
- Knowledge ingestion and retrieval pipelines
- Multi-agent collaboration scenarios
- Error recovery and resilience testing

## Test Infrastructure

### Test Containers

The test suite uses Docker containers for realistic testing environments:

- **PostgreSQL** - Primary database testing
- **Redis** - Cache and session testing
- **RabbitMQ** - Event bus testing
- **Neo4j** - Graph database testing

Containers are automatically managed via `globalSetup.ts` and `globalTeardown.ts`.

### Mock Framework

**Entity Mocks**

```typescript
// Generate realistic test entities
const mockUser = EntityMockFactory.createMockUser({
  email: 'test@example.com',
  role: 'admin',
});

const mockAgents = EntityMockFactory.createBatchMockAgents(10);
```

**Service Mocks**

```typescript
// Mock external services
const mockLLMService = ServiceMockFactory.createMockLLMService();
const mockRedisService = ServiceMockFactory.createMockRedisService();
```

**Test Utilities**

```typescript
// Utility functions for testing
const agentId = TestUtils.generateUUID();
const mockRepo = TestUtils.createMockRepository();
await TestUtils.expectAsyncError(() => service.invalidOperation());
```

### Test Data

**Fixtures**

- `TEST_DATA` - Valid test data for all entity types
- `INVALID_TEST_DATA` - Edge cases and validation failures

**Categories**

- User data (valid, admin, inactive)
- Agent configurations (specialist, orchestrator, inactive)
- Operations (pending, running, completed)
- Knowledge items (documentation, FAQs, tutorials)

## Coverage Requirements

The test suite enforces **100% code coverage** across:

- **Statements**: All code statements executed
- **Branches**: All conditional branches tested
- **Functions**: All functions called
- **Lines**: All source lines covered

### Coverage Exclusions

Only essential files are excluded from coverage:

- Migration scripts
- Seed data files
- Type definition files
- Test files themselves

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:e2e

# Watch mode for development
npm run test:watch

# CI/CD mode
npm run test:ci
```

### Test Patterns

```bash
# Run specific test files
npm test -- --testPathPattern="DatabaseService"

# Run specific test cases
npm test -- --testNamePattern="should create user"

# Run tests for specific service
npm test -- --testPathPattern="agent-memory"
```

## Quality Assurance

### Test Quality Metrics

- **Comprehensive Edge Cases** - Invalid inputs, boundary conditions, error scenarios
- **Concurrent Operations** - Race conditions, deadlock prevention
- **Performance Testing** - Large datasets, memory pressure, timeout handling
- **Error Recovery** - Service failures, network issues, data corruption
- **Security Testing** - Input validation, injection prevention, access control

### Realistic Test Scenarios

- **Production-like Data** - Realistic entity relationships and data volumes
- **External Service Simulation** - LLM APIs, vector databases, message queues
- **Network Conditions** - Latency, timeouts, intermittent failures
- **Resource Constraints** - Memory limits, connection pools, rate limiting

### Automated Validation

- **Code Quality** - ESLint, TypeScript strict mode
- **Test Isolation** - Independent test execution, clean state
- **Deterministic Results** - Consistent test outcomes, no flaky tests
- **Documentation Coverage** - All public APIs documented and tested

## Continuous Integration

The test suite integrates with CI/CD pipelines:

- **Pre-commit Hooks** - Fast unit tests before code commits
- **Pull Request Validation** - Full test suite on PR creation
- **Deployment Gates** - Tests must pass before production deployment
- **Performance Regression** - Benchmark comparisons over time

### Test Execution Timeline

- **Unit Tests**: < 30 seconds
- **Integration Tests**: < 2 minutes
- **E2E Tests**: < 5 minutes
- **Full Suite**: < 10 minutes

## Best Practices

### Writing Tests

1. **Descriptive Names** - Clear test purpose and expected outcome
2. **Arrange-Act-Assert** - Structured test organization
3. **Single Responsibility** - One concept per test case
4. **Independent Tests** - No shared state between tests
5. **Realistic Data** - Production-like test scenarios

### Debugging Tests

1. **Verbose Output** - Detailed error messages and context
2. **Test Isolation** - Run individual tests in isolation
3. **Mock Verification** - Ensure mocks are called as expected
4. **State Inspection** - Examine service state during failures

### Performance Considerations

1. **Parallel Execution** - Tests run concurrently when possible
2. **Resource Cleanup** - Proper cleanup to prevent memory leaks
3. **Selective Testing** - Run only relevant tests during development
4. **Optimized Mocks** - Lightweight mocks for external dependencies

## Troubleshooting

### Common Issues

**Container Startup Failures**

```bash
# Check Docker availability
docker --version

# Manual container cleanup
docker container prune
docker volume prune
```

**Test Database Issues**

```bash
# Reset test database
npm run test:db:reset

# Check database connectivity
npm run test:db:health
```

**Memory Issues**

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm test

# Monitor memory usage
npm run test:memory-profile
```

### Debug Configuration

```typescript
// Enable debug logging in tests
process.env.LOG_LEVEL = 'debug';
process.env.TEST_DEBUG = 'true';

// Disable test timeouts for debugging
jest.setTimeout(0);
```

## Contributing

When adding new services or features:

1. **Write Tests First** - TDD approach for new functionality
2. **Maintain Coverage** - Ensure 100% coverage for new code
3. **Update Documentation** - Add test descriptions and examples
4. **Validate Performance** - Ensure tests complete within time limits
5. **Review Test Quality** - Peer review for test completeness and clarity

The test suite is a critical component of the UAIP platform's reliability and maintainability. Comprehensive testing ensures that the complex multi-service architecture remains stable and performant under all conditions.
