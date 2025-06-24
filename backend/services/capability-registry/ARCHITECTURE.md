# Capability Registry Architecture

## Overview

The Capability Registry serves as the execution backbone for the UAIP platform through its Event Runner core, providing secure, monitored, and scalable execution of tools and capabilities. This document details the technical architecture, design decisions, and integration patterns.

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Capability Registry Service                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    Tool     │  │   Event     │  │  Discovery  │         │
│  │  Registry   │  │   Runner    │  │   Engine    │         │
│  │             │  │             │  │             │         │
│  │ • Storage   │  │ • Sandbox   │  │ • Search    │         │
│  │ • Validation│  │ • Monitor   │  │ • Graph     │         │
│  │ • Versioning│  │ • Stream    │  │ • Learn     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    Data Layer                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ PostgreSQL  │  │    Neo4j    │  │   Redis     │         │
│  │             │  │             │  │             │         │
│  │ • Tools     │  │ • Graph     │  │ • Cache     │         │
│  │ • Execution │  │ • Relations │  │ • Events    │         │
│  │ • Analytics │  │ • Learning  │  │ • Streams   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Event Runner Core

### Sandboxed Execution Engine

```typescript
interface SandboxConfig {
  resourceLimits: {
    maxMemory: number;        // Memory limit in MB
    maxCpu: number;           // CPU cores (1.0 = 1 core)
    maxDuration: number;      // Max execution time in ms
    maxNetworkCalls: number;  // Max number of network requests
  };
  
  securityLevel: SecurityLevel;
  isolation: 'container' | 'vm';
  networkAccess: boolean;
  persistentStorage: boolean;
}
```

#### Security Levels
- **SAFE**: No restrictions, automatic execution
- **MODERATE**: Basic validation, logged execution
- **RESTRICTED**: Manual approval required
- **DANGEROUS**: Admin approval + comprehensive audit

### Real-time Event Streaming

```typescript
interface ExecutionEvent {
  executionId: string;
  toolId: string;
  status: 'started' | 'progress' | 'completed' | 'failed';
  timestamp: Date;
  data?: any;
  error?: string;
  resources: ResourceUsage;
}

interface EventStreamConfig {
  bufferSize: number;
  maxClients: number;
  heartbeatInterval: number;
  retryPolicy: RetryConfig;
}
```

### Workflow Orchestration

```typescript
interface WorkflowDefinition {
  steps: {
    id: string;
    toolId: string;
    parameters: Record<string, any>;
    dependencies: string[];
    conditions?: Condition[];
    fallback?: FallbackStrategy;
  }[];
  parallelExecution?: boolean;
  timeout: number;
  retryPolicy: RetryConfig;
}
```

## Database Architecture

### PostgreSQL Schema

```sql
-- Tools table
CREATE TABLE tools (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  version VARCHAR(50),
  security_level SecurityLevel,
  config JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Executions table
CREATE TABLE executions (
  id UUID PRIMARY KEY,
  tool_id UUID REFERENCES tools(id),
  status ExecutionStatus,
  parameters JSONB,
  result JSONB,
  resources JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

### Neo4j Graph Model

```cypher
// Tool relationships
CREATE (t:Tool {id: $toolId})-[:REQUIRES]->(d:Tool {id: $dependencyId})
CREATE (t)-[:SIMILAR_TO {score: 0.85}]->(s:Tool {id: $similarId})
CREATE (t)-[:USED_WITH {frequency: 42}]->(c:Tool {id: $companionId})
```

### Redis Patterns

```typescript
// Event streaming
const streamKey = `execution:${executionId}`;
await redis.xadd(streamKey, '*', 'event', JSON.stringify(event));

// Rate limiting
const rateLimitKey = `ratelimit:${userId}:${toolId}`;
const current = await redis.incr(rateLimitKey);
await redis.expire(rateLimitKey, 60); // 1 minute window
```

## Integration Architecture

### Cross-Service Communication

```typescript
interface ServiceIntegration {
  // Discussion Orchestration integration
  discussionEvents: {
    'tool.execution.requested': ToolExecutionRequest;
    'tool.execution.completed': ToolExecutionResult;
    'tool.execution.failed': ToolExecutionError;
  };

  // Agent Intelligence integration
  agentEvents: {
    'tool.discovery.requested': ToolDiscoveryRequest;
    'tool.recommendation.updated': ToolRecommendation;
    'tool.learning.recorded': ToolLearningEvent;
  };
}
```

### WebSocket Integration

```typescript
interface WebSocketConfig {
  // Client connection management
  maxClients: number;
  heartbeatInterval: number;
  
  // Room management for multi-participant execution
  rooms: {
    execution: string[];   // Execution-specific rooms
    discussion: string[];  // Discussion-specific rooms
    broadcast: string[];   // Platform-wide announcements
  };
  
  // Event filtering
  eventFilters: {
    type: string[];        // Filter by event type
    security: SecurityLevel[]; // Filter by security level
    participant: string[];    // Filter by participant
  };
}
```

## Performance Considerations

### Response Time Targets

| Operation Type | Target Response Time |
|---------------|---------------------|
| Tool Registration | < 100ms |
| Tool Discovery | < 200ms |
| Execution Start | < 500ms |
| Event Streaming | < 50ms |

### Scalability Design

1. **Horizontal Scaling**
   - Stateless service design
   - Redis-based session management
   - Load balancer ready

2. **Resource Management**
   - Dynamic resource allocation
   - Execution queuing
   - Auto-scaling triggers

3. **Caching Strategy**
   - Tool metadata caching
   - Execution result caching
   - Graph query caching

## Monitoring & Observability

### Prometheus Metrics

```typescript
const metrics = {
  // Execution metrics
  executionDuration: Histogram,
  executionSuccess: Counter,
  executionFailure: Counter,
  
  // Resource metrics
  resourceUtilization: Gauge,
  sandboxCreation: Histogram,
  
  // Cache metrics
  cacheHitRate: Gauge,
  cacheMissRate: Counter
};
```

### Health Checks

```typescript
interface HealthCheck {
  // Component health
  database: {
    postgresql: Connection;
    neo4j: Connection;
    redis: Connection;
  };
  
  // Service health
  eventRunner: {
    sandbox: Status;
    streaming: Status;
    workflow: Status;
  };
  
  // Resource health
  resources: {
    memory: Usage;
    cpu: Usage;
    network: Usage;
  };
}
```

## Security Architecture

### Sandbox Isolation

1. **Container-based Isolation**
   - Resource limits
   - Network namespace isolation
   - File system isolation

2. **VM-based Isolation**
   - Full system isolation
   - Hardware-level resource control
   - Complete network isolation

### Access Control

```typescript
interface AccessControl {
  // Authentication
  auth: {
    jwt: JWTConfig;
    oauth: OAuthConfig;
    apiKey: APIKeyConfig;
  };
  
  // Authorization
  rbac: {
    roles: Role[];
    permissions: Permission[];
    policies: Policy[];
  };
  
  // Audit
  audit: {
    logging: AuditConfig;
    retention: RetentionPolicy;
    alerting: AlertConfig;
  };
}
```

## Deployment Architecture

### Container Configuration

```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
EXPOSE 3003
CMD ["node", "dist/index.js"]
```

### Environment Configuration

```bash
# Service
PORT=3003
NODE_ENV=production

# Databases
POSTGRESQL_URL=postgresql://user:pass@host:5432/db
NEO4J_URL=bolt://neo4j:pass@host:7687
REDIS_URL=redis://host:6379

# Security
JWT_SECRET=<secret>
OAUTH_CLIENT_ID=<client-id>
OAUTH_CLIENT_SECRET=<client-secret>

# Resources
MAX_MEMORY=4096
MAX_CPU=2
MAX_CONCURRENT_EXECUTIONS=100
```

This architecture document provides a comprehensive technical overview of the Capability Registry service, focusing on its Event Runner core and integration patterns with other UAIP services.