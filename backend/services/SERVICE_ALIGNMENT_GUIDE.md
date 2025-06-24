# UAIP Backend Services Alignment Guide

## Overview

This document establishes consistent patterns, documentation standards, and architectural principles for the three core services in the UAIP backend monorepo:

- **Discussion Orchestration** - Real-time discussion management and turn coordination
- **Agent Intelligence** - Agent persona, memory, and context analysis  
- **Capability Registry** - Tool management, execution, and discovery

## 🏗️ Unified Architecture Principles

### 1. Monorepo Workspace Pattern

All services follow the monorepo workspace import pattern:

```typescript
// ✅ CORRECT - Workspace imports
import { Agent, Discussion } from '@uaip/types';
import { DatabaseService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';

// Local imports within service
import { DiscussionStrategy } from '@/strategies/DiscussionStrategy';
```

### 2. Service Boundaries & Responsibilities

| Service | Primary Responsibility | Secondary Capabilities |
|---------|----------------------|----------------------|
| **Discussion Orchestration** | Real-time discussion coordination, turn management, WebSocket handling | Strategy execution, participant management |
| **Agent Intelligence** | Agent persona management, context analysis, memory systems | Chat endpoints, learning adaptation |
| **Capability Registry** | Tool/capability management, execution, discovery | Security sandboxing, usage analytics |

### 3. Shared Dependencies

```typescript
// All services use these shared packages
dependencies: {
  "@uaip/types": "workspace:*",
  "@uaip/shared-services": "workspace:*", 
  "@uaip/config": "workspace:*",
  "@uaip/middleware": "workspace:*",
  "@uaip/utils": "workspace:*"
}
```

## 📋 Documentation Standards

### 1. Required Documentation Files

Each service must have:

```
service-name/
├── README.md                 # Service overview, setup, API reference
├── ARCHITECTURE.md           # Technical architecture and design decisions
├── API_REFERENCE.md          # Detailed API documentation
├── DEVELOPMENT.md            # Development setup and guidelines
└── CHANGELOG.md              # Version history and changes
```

### 2. README.md Template

```markdown
# [Service Name] Service

## Overview
Brief description of service purpose and capabilities.

## Features
- Core feature 1
- Core feature 2
- Integration capabilities

## Quick Start
```bash
# Install dependencies
npm install

# Build service
npm run build

# Run in development
npm run dev
```

## API Endpoints
Brief overview of main endpoints with links to API_REFERENCE.md

## Configuration
Environment variables and configuration options

## Integration
How other services integrate with this service
```

### 3. API Documentation Format

```markdown
## Endpoint Name
**Method**: `POST /api/v1/endpoint`
**Auth**: Required/Optional
**Description**: What this endpoint does

### Request
```json
{
  "parameter": "value"
}
```

### Response
```json
{
  "success": true,
  "data": {}
}
```

### Examples
```bash
curl -X POST http://localhost:PORT/api/v1/endpoint
```
```

## 🔗 Service Integration Patterns

### 1. Discussion Orchestration ↔ Agent Intelligence

```typescript
// Discussion Orchestration calls Agent Intelligence
interface AgentParticipation {
  agentId: string;
  discussionId: string;
  context: DiscussionContext;
}

// Agent Intelligence provides discussion responses
interface AgentResponse {
  content: string;
  confidence: number;
  reasoning: string[];
}
```

### 2. Agent Intelligence ↔ Capability Registry

```typescript
// Agent Intelligence discovers capabilities
interface CapabilityQuery {
  agentId: string;
  context: string;
  requiredCapabilities: string[];
}

// Capability Registry provides available tools
interface CapabilityResponse {
  tools: ToolDefinition[];
  recommendations: ToolRecommendation[];
}
```

### 3. Discussion Orchestration ↔ Capability Registry

```typescript
// Discussion triggers capability executions
interface DiscussionCapabilityExecution {
  discussionId: string;
  participantId: string;
  toolId: string;
  parameters: Record<string, any>;
}
```

## 🛠️ Development Standards

### 1. TypeScript Configuration

Each service uses project references:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"],
      "@uaip/types/*": ["../../../packages/shared-types/src/*"],
      "@uaip/shared-services/*": ["../../shared/services/src/*"]
    }
  },
  "references": [
    { "path": "../../../packages/shared-types" },
    { "path": "../../shared/services" }
  ]
}
```

### 2. Package.json Standards

```json
{
  "name": "@uaip/service-name",
  "version": "1.0.0",
  "description": "Service description",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "nodemon --exec tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "jest",
    "lint": "eslint src/**/*.ts"
  }
}
```

### 3. Error Handling

```typescript
// Consistent error response format
interface ServiceError {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: any;
  };
}

// Consistent success response format  
interface ServiceResponse<T> {
  success: true;
  data: T;
  metadata?: {
    timestamp: string;
    requestId: string;
    performance?: PerformanceMetrics;
  };
}
```

## 🔐 Security Standards

### 1. Authentication Middleware

All services use shared authentication:

```typescript
import { authMiddleware } from '@uaip/middleware';

// Apply to protected routes
router.use('/api/v1/protected', authMiddleware);
```

### 2. Security Levels

```typescript
enum SecurityLevel {
  SAFE = 'safe',           // No restrictions
  MODERATE = 'moderate',   // Basic validation
  RESTRICTED = 'restricted', // Approval required
  DANGEROUS = 'dangerous'   // Admin approval + audit
}
```

## 📊 Monitoring & Observability

### 1. Health Checks

Each service provides:

```typescript
// GET /health
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "dependencies": {
    "database": "healthy",
    "external_services": "healthy"
  }
}
```

### 2. Metrics

```typescript
// Prometheus metrics
const serviceMetrics = {
  requests_total: Counter,
  request_duration: Histogram,
  active_connections: Gauge,
  error_rate: Counter
};
```

## 🚀 Deployment Standards

### 1. Environment Configuration

```bash
# Common environment variables
NODE_ENV=development|production
PORT=3000
LOG_LEVEL=info|debug|error

# Database connections
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Service discovery
SERVICE_REGISTRY_URL=http://...
```

### 2. Docker Configuration

Each service has consistent Dockerfile:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE ${PORT}
CMD ["node", "dist/index.js"]
```

## 📈 Performance Standards

### 1. Response Time Targets

| Operation Type | Target Response Time |
|---------------|---------------------|
| Health checks | < 50ms |
| Simple queries | < 100ms |
| Complex operations | < 500ms |
| Tool executions | < 5000ms |

### 2. Throughput Targets

| Service | Requests/Second |
|---------|----------------|
| Discussion Orchestration | 1000+ |
| Agent Intelligence | 500+ |
| Capability Registry | 2000+ |

## 🔄 Integration Testing

### 1. Service-to-Service Tests

```typescript
describe('Service Integration', () => {
  test('Discussion → Agent Intelligence', async () => {
    // Test discussion triggering agent response
  });
  
  test('Agent Intelligence → Capability Registry', async () => {
    // Test agent discovering and using capabilities
  });
});
```

### 2. End-to-End Workflows

```typescript
describe('Complete Workflows', () => {
  test('Discussion with Agent and Tool Execution', async () => {
    // Test complete flow across all services
  });
});
```

## 📝 Change Management

### 1. API Versioning

- Use `/api/v1/` prefix for all endpoints
- Maintain backward compatibility
- Document breaking changes in CHANGELOG.md

### 2. Database Migrations

- Use consistent migration naming: `YYYY-MM-DD-description.sql`
- Include rollback procedures
- Test migrations in staging environment

## 🎯 Implementation Roadmap

### Phase 1: Documentation Alignment (Week 1)
- [ ] Create missing README.md files
- [ ] Standardize API documentation
- [ ] Update package.json configurations

### Phase 2: Code Alignment (Week 2)
- [ ] Implement consistent error handling
- [ ] Add health check endpoints
- [ ] Standardize logging format

### Phase 3: Integration Testing (Week 3)
- [ ] Service-to-service integration tests
- [ ] End-to-end workflow tests
- [ ] Performance benchmarking

### Phase 4: Monitoring & Deployment (Week 4)
- [ ] Add Prometheus metrics
- [ ] Configure health checks
- [ ] Standardize Docker configurations

This alignment guide ensures all three services follow consistent patterns while maintaining their specific responsibilities and capabilities. 