# Development Setup Guide

**Complete development environment setup for the UAIP platform**

## 🎯 Prerequisites

### Required Software

- **Node.js** v18.0.0 or higher
- **Docker** v24.0.0 or higher
- **Docker Compose** v2.0.0 or higher
- **Git** v2.30.0 or higher
- **PNPM** v8.0.0 or higher (recommended package manager)

### System Requirements

- **RAM**: 16GB minimum (32GB recommended for full development)
- **Storage**: 50GB free space minimum
- **OS**: Linux, macOS, or Windows with WSL2

### Development Tools (Recommended)

- **VS Code** with TypeScript, Docker, and Git extensions
- **Postman** or **Insomnia** for API testing
- **DBeaver** or **pgAdmin** for database management
- **Neo4j Desktop** for graph database exploration

## 🚀 Quick Setup

### 1. Repository Setup

```bash
# Clone the repository
git clone <repository-url>
cd council-of-nycea

# Install dependencies
npm install

# Set up environment
cp sample.env .env
```

### 2. Environment Configuration

Edit `.env` file with your configuration:

```bash
# Core Configuration
NODE_ENV=development
DEBUG=true

# API Keys (Optional for basic functionality)
OPENAI_API_KEY=your-openai-key-here
ANTHROPIC_API_KEY=your-anthropic-key-here
OLLAMA_URL=http://localhost:11434

# Database Configuration (Auto-configured with Docker)
POSTGRESQL_URL=postgresql://postgres:postgres@localhost:5432/uaip_dev
NEO4J_URL=bolt://neo4j:password@localhost:7687
REDIS_URL=redis://localhost:6379

# Security Configuration
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRES_IN=24h

# Service Configuration
AGENT_INTELLIGENCE_URL=http://localhost:3001
ORCHESTRATION_PIPELINE_URL=http://localhost:3002
CAPABILITY_REGISTRY_URL=http://localhost:3003
SECURITY_GATEWAY_URL=http://localhost:3004
DISCUSSION_ORCHESTRATION_URL=http://localhost:3005

# Development Features
ENABLE_HOT_RELOAD=true
ENABLE_DEBUG_LOGGING=true
CHOKIDAR_USEPOLLING=true
WATCHPACK_POLLING=true
```

### 3. Start Development Environment

```bash
# Start all services with hot reloading
./dev-start.sh

# OR start in background
./dev-start.sh --daemon

# OR start specific service groups
./dev-start.sh --services "infrastructure backend" --daemon
```

## 🏗️ Monorepo Structure

### Package Organization

```
council-of-nycea/
├── packages/
│   ├── shared-types/         # @uaip/types - Shared TypeScript types
│   ├── shared-utils/         # @uaip/utils - Utility functions
│   └── shared-services/      # @uaip/shared-services - Database services
├── backend/
│   ├── shared/
│   │   ├── services/         # @uaip/shared-services
│   │   ├── middleware/       # @uaip/middleware
│   │   └── config/           # @uaip/config
│   └── services/
│       ├── agent-intelligence/
│       ├── orchestration-pipeline/
│       ├── capability-registry/
│       ├── security-gateway/
│       └── discussion-orchestration/
└── apps/
    └── frontend/             # React frontend application
```

### Import Patterns

#### ✅ Correct Monorepo Imports

```typescript
// From any service importing shared packages
import { Operation } from '@uaip/types/operation';
import { logger } from '@uaip/utils/logger';
import { DatabaseService } from '@uaip/shared-services/databaseService';

// Local imports within a service
import { config } from '@/config/config';
import { AgentService } from '@/services/agentService';
```

#### ❌ Incorrect Relative Imports

```typescript
// NEVER do this in a monorepo
import { Operation } from '../../../shared/types/src/operation';
import { logger } from '../../../shared/utils/src/logger';
```

## 🔧 TypeScript Configuration

### Service-Level tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"],
      "@uaip/types/*": ["../../../packages/shared-types/src/*"],
      "@uaip/utils/*": ["../../../packages/shared-utils/src/*"],
      "@uaip/shared-services/*": ["../../shared/services/src/*"],
      "@uaip/middleware/*": ["../../shared/middleware/src/*"],
      "@uaip/config/*": ["../../shared/config/src/*"]
    }
  },
  "references": [
    { "path": "../../../packages/shared-types" },
    { "path": "../../../packages/shared-utils" },
    { "path": "../../shared/services" },
    { "path": "../../shared/middleware" },
    { "path": "../../shared/config" }
  ]
}
```

### Build Order

```bash
# Build shared packages first
npm run build:shared

# Then build services
npm run build:services

# Or build everything
npm run build
```

## 🐳 Docker Development

### Service Groups

| Group            | Services                           | Purpose        |
| ---------------- | ---------------------------------- | -------------- |
| `infrastructure` | PostgreSQL, Neo4j, Redis, RabbitMQ | Data layer     |
| `backend`        | 5 microservices                    | Business logic |
| `frontend`       | React app                          | User interface |
| `monitoring`     | Prometheus, Grafana                | Observability  |

### Docker Commands

```bash
# Start specific service groups
./dev-start.sh --services infrastructure --daemon
./dev-start.sh --services backend --daemon
./dev-start.sh --services frontend

# View service status
./dev-start.sh status

# View logs
./dev-start.sh logs
./dev-start.sh logs agent-intelligence --follow

# Rebuild services
./dev-start.sh rebuild-backend
./dev-start.sh restart --rebuild
```

### Hot Reloading

All services support hot reloading:

- **Backend Services**: File watching with nodemon + tsx
- **Frontend**: Vite HMR with polling enabled
- **Shared Packages**: Automatic rebuild on changes

## 🗄️ Database Setup

### PostgreSQL Development

```bash
# Access PostgreSQL
docker-compose exec postgres psql -U postgres -d uaip_dev

# Run migrations
npm run db:migrate

# Seed development data
npm run db:seed

# Reset database
npm run db:reset
```

### Neo4j Development

```bash
# Access Neo4j browser
open http://localhost:7474

# Connect with credentials
Username: neo4j
Password: password

# Run sample queries
MATCH (n) RETURN n LIMIT 25;
```

### Redis Development

```bash
# Access Redis CLI
docker-compose exec redis redis-cli

# Monitor Redis
docker-compose exec redis redis-cli monitor
```

## 🧪 Testing Setup

### Test Environment

```bash
# Install test dependencies
npm install --dev

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

### Test Configuration

```json
// jest.config.js
{
  "testEnvironment": "node",
  "setupFilesAfterEnv": ["<rootDir>/tests/setup.ts"],
  "testMatch": ["**/__tests__/**/*.test.ts"],
  "collectCoverageFrom": ["src/**/*.ts", "!src/**/*.d.ts", "!src/**/*.test.ts"],
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

### Writing Tests

```typescript
// Example unit test
describe('AgentService', () => {
  let agentService: AgentService;

  beforeEach(() => {
    agentService = new AgentService();
  });

  it('should create an agent', async () => {
    const agent = await agentService.create({
      name: 'Test Agent',
      persona: 'helpful',
    });

    expect(agent.id).toBeDefined();
    expect(agent.name).toBe('Test Agent');
  });
});
```

## 🔍 Debugging

### VS Code Debug Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Agent Intelligence",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/backend/services/agent-intelligence/src/index.ts",
      "runtimeArgs": ["-r", "tsx/cjs"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal"
    }
  ]
}
```

### Debug Commands

```bash
# Debug with Node.js inspector
node --inspect-brk dist/index.js

# Debug with VS Code
F5 (with debug configuration)

# Debug tests
npm run test:debug
```

### Logging

```typescript
// Use structured logging
import { logger } from '@uaip/utils/logger';

logger.info('Service started', { port: 3001, service: 'agent-intelligence' });
logger.error('Database connection failed', { error: error.message });
logger.debug('Processing request', { requestId, userId });
```

## 🚀 Development Workflow

### Daily Development

```bash
# Start infrastructure
./dev-start.sh --services infrastructure --daemon

# Start the service you're working on
./dev-start.sh --services agent-intelligence

# In another terminal, run tests
npm run test:watch

# Make changes and see hot reloading in action
```

### Feature Development

```bash
# Create feature branch
git checkout -b feature/new-feature

# Start development environment
./dev-start.sh --daemon

# Develop with hot reloading
# Run tests continuously
npm run test:watch

# Commit changes
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/new-feature
```

### Service Development

```bash
# Generate new service
npm run generate:service my-new-service

# Add to docker-compose.yml
# Update dev-start.sh service groups
# Add to API gateway routing
```

## 🔧 Coding Standards

### TypeScript Standards

```typescript
// Use explicit types
interface UserRequest {
  name: string;
  email: string;
}

// Use async/await
async function createUser(request: UserRequest): Promise<User> {
  try {
    const user = await userService.create(request);
    return user;
  } catch (error) {
    logger.error('Failed to create user', { error: error.message });
    throw new UserCreationError('Failed to create user');
  }
}

// Use proper error handling
class UserCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserCreationError';
  }
}
```

### API Standards

```typescript
// Use consistent response format
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

// Use proper HTTP status codes
app.post('/api/users', async (req, res) => {
  try {
    const user = await userService.create(req.body);
    res.status(201).json({
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});
```

## 🐛 Troubleshooting

### Common Issues

#### Port Conflicts

```bash
# Check what's using ports
netstat -tulpn | grep :3001

# Kill processes using ports
sudo kill -9 $(lsof -ti:3001)
```

#### TypeScript Build Issues

```bash
# Clean build artifacts
npm run clean

# Rebuild shared packages
npm run build:shared

# Check TypeScript configuration
npx tsc --showConfig
```

#### Docker Issues

```bash
# Clean Docker environment
docker system prune -f
docker volume prune -f

# Rebuild containers
./dev-start.sh stop
./dev-start.sh --rebuild
```

#### Database Connection Issues

```bash
# Check database health
docker-compose exec postgres pg_isready
docker-compose exec neo4j cypher-shell -u neo4j -p password "RETURN 1"
docker-compose exec redis redis-cli ping
```

### Performance Issues

```bash
# Monitor resource usage
docker stats

# Check Node.js memory usage
node --trace-warnings --max-old-space-size=4096 dist/index.js

# Profile application
node --prof dist/index.js
```

## 📞 Getting Help

### Documentation

- **[Architecture](ARCHITECTURE.md)** - System design and technical details
- **[API Reference](API_REFERENCE.md)** - Complete API documentation
- **[Testing Guide](TESTING_GUIDE.md)** - Testing strategies and examples

### Community

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - Questions and community support
- **Development Chat** - Real-time development discussions

### Debugging Resources

- **Service Logs**: `./dev-start.sh logs [service-name] --follow`
- **Health Checks**: http://localhost:8081/health
- **API Documentation**: http://localhost:8081/docs
- **Database Tools**: pgAdmin (PostgreSQL), Neo4j Browser, Redis CLI

---

**Success Indicators**:

- All services start without errors
- Hot reloading works when you edit files
- Tests pass with `npm test`
- API endpoints respond at http://localhost:8081/health
