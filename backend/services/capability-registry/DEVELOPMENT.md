# Development Guide - Capability Registry Service

## Overview

This guide provides setup instructions, development guidelines, and testing procedures for the Capability Registry service.

## Prerequisites

- Node.js >= 18.x
- Docker & Docker Compose
- PostgreSQL 14+
- Neo4j 4.4+
- Redis 6+

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/uaip-platform.git
cd uaip-platform/backend/services/capability-registry
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Databases

Using Docker Compose:

```bash
# Start required databases
docker-compose up -d postgres neo4j redis

# Wait for services to be ready
docker-compose ps
```

Manual setup:

```bash
# PostgreSQL
createdb capability_registry

# Neo4j
# Access http://localhost:7474 and set password

# Redis
# Verify Redis is running on default port 6379
```

### 4. Environment Configuration

Create `.env` file:

```bash
# Service Configuration
PORT=3003
NODE_ENV=development
LOG_LEVEL=debug

# PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=capability_registry
PG_USER=postgres
PG_PASSWORD=postgres

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Redis
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=local-development-secret
ENABLE_APPROVAL_WORKFLOW=false

# Integration
AGENT_INTELLIGENCE_URL=http://localhost:3002
DISCUSSION_ORCHESTRATION_URL=http://localhost:3001

# Development
ENABLE_SWAGGER=true
ENABLE_DEBUG_LOGGING=true
```

### 5. Database Migrations

```bash
# Run migrations
npm run db:migrate

# (Optional) Seed test data
npm run db:seed
```

### 6. Start Development Server

```bash
# Start in development mode with hot reload
npm run dev

# Start with debugger attached
npm run dev:debug
```

## Development Guidelines

### Code Structure

```
src/
├── config/             # Configuration
├── controllers/        # Route handlers
├── routes/            # API routes
├── services/          # Business logic
│   ├── toolRegistry/  # Tool management
│   ├── executor/      # Execution engine
│   └── discovery/     # Tool discovery
├── models/            # Database models
└── types/             # TypeScript types
```

### Coding Standards

1. **TypeScript**
   - Strict mode enabled
   - Explicit return types
   - Interface over type where possible

```typescript
// ✅ Good
interface ToolConfig {
  name: string;
  version: string;
}

// ❌ Avoid
type ToolConfig = {
  name: string;
  version: string;
}
```

2. **Async/Await**
   - Always use async/await
   - Proper error handling

```typescript
// ✅ Good
async function executeTool(id: string): Promise<Result> {
  try {
    const tool = await toolRegistry.get(id);
    return await executor.run(tool);
  } catch (error) {
    logger.error('Tool execution failed:', error);
    throw new ExecutionError(error.message);
  }
}

// ❌ Avoid
function executeTool(id: string) {
  return toolRegistry.get(id)
    .then(tool => executor.run(tool))
    .catch(error => {
      console.error(error);
      throw error;
    });
}
```

3. **Error Handling**
   - Use custom error classes
   - Include error codes
   - Proper logging

```typescript
class ToolExecutionError extends Error {
  constructor(
    message: string,
    public code: string = 'EXECUTION_FAILED',
    public statusCode: number = 500
  ) {
    super(message);
  }
}
```

### Testing

1. **Unit Tests**

```bash
# Run unit tests
npm run test

# Run with coverage
npm run test:coverage

# Run specific tests
npm run test -- --grep "Tool Execution"
```

Example test:

```typescript
describe('ToolExecutor', () => {
  it('should execute tool with parameters', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute({
      toolId: 'test-tool',
      parameters: { input: 'test' }
    });
    
    expect(result.status).toBe('completed');
  });
});
```

2. **Integration Tests**

```bash
# Run integration tests
npm run test:integration

# Test specific component
npm run test:integration -- --grep "Neo4j"
```

3. **End-to-End Tests**

```bash
# Run E2E tests
npm run test:e2e

# With specific environment
NODE_ENV=staging npm run test:e2e
```

### Debugging

1. **VSCode Configuration**

`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Service",
      "program": "${workspaceFolder}/src/index.ts",
      "preLaunchTask": "npm: build",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

2. **Debug Logging**

```typescript
// Enable debug logging
logger.level = 'debug';

// Debug specific component
logger.debug('ToolExecutor', { 
  toolId,
  parameters,
  context: executionContext 
});
```

### Performance Testing

1. **Load Testing**

```bash
# Run k6 load tests
k6 run tests/load/tool-execution.js

# With specific scenario
k6 run -e SCENARIO=heavy-load tests/load/tool-execution.js
```

2. **Profiling**

```bash
# CPU profiling
node --prof dist/index.js

# Memory profiling
node --inspect dist/index.js
```

### Local Development Tools

1. **Database Management**
   - pgAdmin or DBeaver for PostgreSQL
   - Neo4j Browser for graph visualization
   - Redis Commander for Redis monitoring

2. **API Testing**
   - Swagger UI at http://localhost:3003/api-docs
   - Postman collection in `/docs/postman`

3. **Monitoring**
   - Prometheus metrics at /metrics
   - Grafana dashboards in /monitoring

## Common Development Tasks

### Adding a New Tool Type

1. Define tool schema:
```typescript
interface NewTool extends BaseTool {
  category: 'new-category';
  specificConfig: {
    property: string;
  };
}
```

2. Create database migration:
```bash
npm run db:migration:create add-new-tool-type
```

3. Implement tool executor:
```typescript
class NewToolExecutor implements ToolExecutor {
  async execute(params: NewToolParams): Promise<Result> {
    // Implementation
  }
}
```

### Implementing a New Feature

1. Create feature branch:
```bash
git checkout -b feature/new-feature
```

2. Implement changes following TDD:
```bash
# Create tests first
npm run test -- --watch

# Implement feature
code src/new-feature.ts

# Verify all tests pass
npm run test
```

3. Update documentation:
- Add API documentation if needed
- Update README.md with new features
- Add migration guide if breaking

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
```bash
# Check PostgreSQL
pg_isready -h localhost

# Check Neo4j
cypher-shell -u neo4j -p password

# Check Redis
redis-cli ping
```

2. **Performance Issues**
```bash
# Check connection pool
curl localhost:3003/metrics | grep pool_

# Monitor event loop
node --trace-events-enabled dist/index.js
```

3. **Memory Leaks**
```bash
# Enable heap dumps
node --heapsnapshot-signal=SIGUSR2 dist/index.js

# Analyze with Chrome DevTools
```

### Getting Help

1. Check the logs:
```bash
npm run logs:error
npm run logs:debug
```

2. Review documentation:
- Internal wiki
- API documentation
- Architecture diagrams

3. Contact team:
- Slack: #capability-registry
- Email: team@uaip.org
- GitHub: Open an issue

## Contributing

1. Fork the repository
2. Create feature branch
3. Implement changes
4. Add tests
5. Update documentation
6. Submit pull request

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for detailed guidelines.