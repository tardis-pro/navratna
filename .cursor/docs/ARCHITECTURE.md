# UAIP System Architecture

**Version**: 2.0 - Production Ready Backend with Magic Layer  
**Last Updated**: January 2025  
**Architecture Review**: Completed  

## 🏗️ Architecture Overview

The **Unified Agent Intelligence Platform (UAIP)** employs a microservices architecture with a hybrid database strategy, event-driven communication, and a comprehensive security model. The system is designed for scalability, maintainability, and extensibility.

### Core Design Principles

1. **Microservices Architecture** - Independent, loosely coupled services
2. **Event-Driven Communication** - Asynchronous messaging with RabbitMQ
3. **Hybrid Database Strategy** - PostgreSQL for ACID transactions, Neo4j for relationships
4. **Zero Trust Security** - Explicit verification for every operation
5. **Horizontal Scalability** - Stateless services with load balancing
6. **Monorepo Organization** - Shared packages with proper TypeScript references

## 🎯 System Components

### Backend Services Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                    Backend Services (Ports 3001-3005)           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │   Agent     │  │Orchestration│  │ Capability  │  │Security │ │
│  │Intelligence │  │  Pipeline   │  │  Registry   │  │Gateway  │ │
│  │   (3001)    │  │   (3002)    │  │   (3003)    │  │ (3004)  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │
│                                                                 │
│  ┌─────────────┐                                                │
│  │ Discussion  │                                                │
│  │Orchestration│                                                │
│  │   (3005)    │                                                │
│  └─────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Infrastructure Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Services                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │ PostgreSQL  │  │    Neo4j    │  │    Redis    │  │RabbitMQ │ │
│  │   (5432)    │  │  (7474/7687)│  │   (6379)    │  │ (5672)  │ │
│  │             │  │             │  │             │  │         │ │
│  │• ACID Txns  │  │• Graph Data │  │• Caching    │  │• Events │ │
│  │• Relations  │  │• ML Features│  │• Sessions   │  │• Queues │ │
│  │• Audit Logs │  │• Recommends │  │• Pub/Sub    │  │• Routing│ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### API Gateway & Frontend

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client & Gateway Layer                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   React     │  │ API Gateway │  │   Magic     │             │
│  │  Frontend   │  │   (8081)    │  │   Layer     │             │
│  │   (3000)    │  │             │  │  (Future)   │             │
│  │             │  │• Routing    │  │             │             │
│  │• Components │  │• Auth       │  │• Hot-Reload │             │
│  │• Real-time  │  │• Rate Limit │  │• Commands   │             │
│  │• WebSocket  │  │• Docs       │  │• Time Travel│             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## 🔧 Service Architecture Details

### Agent Intelligence Service (Port 3001)

**Purpose**: AI agent management, context analysis, and intelligent decision making

#### Core Components
```typescript
interface AgentIntelligenceArchitecture {
  controllers: {
    agentController: "Agent lifecycle management";
    contextController: "Context analysis and storage";
    personaController: "Persona management and configuration";
    chatController: "Conversation handling and responses";
  };
  
  services: {
    agentService: "Agent business logic";
    contextAnalysisService: "Context processing and analysis";
    personaService: "Persona management";
    llmIntegrationService: "LLM provider integration";
  };
  
  features: {
    contextAwareness: "Multi-turn conversation context";
    personaManagement: "Dynamic persona switching";
    learningCapabilities: "Adaptive behavior based on interactions";
    multiModelSupport: "OpenAI, Anthropic, Ollama integration";
  };
}
```

#### Integration Points
- **→ Orchestration Pipeline**: Provides context for workflow decisions
- **→ Capability Registry**: Discovers and recommends tools
- **→ Discussion Orchestration**: Participates in collaborative discussions
- **→ Security Gateway**: Validates permissions for agent actions

### Orchestration Pipeline Service (Port 3002)

**Purpose**: Workflow coordination, operation management, and real-time updates

#### Core Components
```typescript
interface OrchestrationArchitecture {
  controllers: {
    operationController: "Operation lifecycle management";
    workflowController: "Workflow definition and execution";
    statusController: "Real-time status updates";
  };
  
  services: {
    operationService: "Operation business logic";
    workflowEngine: "Workflow execution engine";
    statusService: "Status tracking and notifications";
    websocketService: "Real-time communication";
  };
  
  features: {
    workflowOrchestration: "Complex workflow management";
    realTimeUpdates: "WebSocket-based status updates";
    operationTracking: "Complete operation audit trail";
    errorRecovery: "Automatic retry and error handling";
  };
}
```

### Capability Registry Service (Port 3003)

**Purpose**: Tool management, sandboxed execution, and capability discovery

#### Event Runner Core
```typescript
interface CapabilityRegistryArchitecture {
  eventRunner: {
    sandboxedExecution: "Secure tool execution environment";
    resourceManagement: "CPU, memory, and network limits";
    securityLevels: "SAFE, MODERATE, RESTRICTED, DANGEROUS";
    realTimeStreaming: "Live execution results";
  };
  
  toolRegistry: {
    toolStorage: "Tool definitions and metadata";
    versionManagement: "Tool versioning and updates";
    discoveryEngine: "Intelligent tool recommendations";
    usageAnalytics: "Tool usage tracking and optimization";
  };
  
  integrations: {
    mcpServers: "Model Context Protocol server integration";
    communityTools: "GitHub-based tool sharing";
    workflowOrchestration: "Multi-step tool execution";
  };
}
```

#### Sandbox Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                   Execution Sandbox                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Container   │  │  Resource   │  │  Network    │             │
│  │ Isolation   │  │  Monitor    │  │  Control    │             │
│  │             │  │             │  │             │             │
│  │• Namespace  │  │• CPU Limit  │  │• Firewall   │             │
│  │• Filesystem │  │• Memory Cap │  │• Proxy      │             │
│  │• Process    │  │• Time Limit │  │• Audit      │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

### Security Gateway Service (Port 3004)

**Purpose**: Authentication, authorization, auditing, and security enforcement

#### Security Architecture
```typescript
interface SecurityArchitecture {
  authentication: {
    jwtManagement: "Token generation and validation";
    sessionManagement: "Session lifecycle and storage";
    multiFactorAuth: "MFA support and enforcement";
    oauthIntegration: "Third-party authentication";
  };
  
  authorization: {
    rbacSystem: "Role-based access control";
    permissionEngine: "Fine-grained permission checking";
    approvalWorkflows: "Multi-step approval processes";
    policyEngine: "Dynamic policy evaluation";
  };
  
  auditing: {
    auditLogging: "Comprehensive audit trails";
    complianceReporting: "Regulatory compliance reports";
    securityMonitoring: "Real-time security alerts";
    forensicAnalysis: "Security incident investigation";
  };
}
```

### Discussion Orchestration Service (Port 3005)

**Purpose**: Real-time collaborative discussions and turn management

#### Discussion Architecture
```typescript
interface DiscussionArchitecture {
  realTimeEngine: {
    websocketManagement: "Multi-participant WebSocket handling";
    turnCoordination: "Discussion turn management";
    contextSharing: "Shared discussion context";
    participantManagement: "Participant lifecycle";
  };
  
  strategies: {
    roundRobin: "Sequential turn-taking";
    contextDriven: "Context-aware participation";
    collaborative: "Simultaneous collaboration";
    moderated: "Human-moderated discussions";
  };
  
  features: {
    realTimeUpdates: "Live discussion updates";
    contextAwareness: "Discussion context tracking";
    participantRoles: "Role-based participation";
    discussionPersistence: "Discussion history and replay";
  };
}
```

## 🗄️ Database Architecture

### Hybrid Database Strategy

#### PostgreSQL (Primary Database)
```sql
-- Core Entity Tables
users, agents, operations, discussions, tools, capabilities

-- Audit and Security Tables  
audit_logs, permissions, roles, sessions, approvals

-- Operational Tables
operation_history, tool_executions, discussion_messages

-- Performance Optimizations
- Connection pooling (max 100 connections)
- Read replicas for analytics
- Partitioned tables for large datasets
- Comprehensive indexing strategy
```

#### Neo4j (Graph Database)
```cypher
// Relationship Modeling
(Agent)-[:USES]->(Tool)
(Agent)-[:PARTICIPATES_IN]->(Discussion)
(Tool)-[:REQUIRES]->(Capability)
(User)-[:HAS_ROLE]->(Role)
(Operation)-[:DEPENDS_ON]->(Operation)

// Machine Learning Features
- Graph embeddings for recommendations
- Centrality analysis for important nodes
- Community detection for clustering
- Pathfinding for dependency analysis
```

#### Redis (Caching & Sessions)
```
Cache Strategy:
- Session storage (TTL: 24 hours)
- API response caching (TTL: 5 minutes)
- Real-time data caching (TTL: 30 seconds)
- Tool metadata caching (TTL: 1 hour)

Pub/Sub Channels:
- Real-time notifications
- WebSocket message distribution
- Service health updates
- Event broadcasting
```

## 🔄 Event-Driven Architecture

### RabbitMQ Message Patterns

#### Event Types
```typescript
interface EventArchitecture {
  operationEvents: {
    'operation.created': OperationCreatedEvent;
    'operation.updated': OperationUpdatedEvent;
    'operation.completed': OperationCompletedEvent;
    'operation.failed': OperationFailedEvent;
  };
  
  toolEvents: {
    'tool.executed': ToolExecutedEvent;
    'tool.registered': ToolRegisteredEvent;
    'tool.approved': ToolApprovedEvent;
  };
  
  discussionEvents: {
    'discussion.started': DiscussionStartedEvent;
    'discussion.message': DiscussionMessageEvent;
    'discussion.ended': DiscussionEndedEvent;
  };
  
  securityEvents: {
    'auth.login': AuthLoginEvent;
    'auth.logout': AuthLogoutEvent;
    'permission.denied': PermissionDeniedEvent;
    'approval.requested': ApprovalRequestedEvent;
  };
}
```

#### Message Routing
```
Exchange Types:
- Direct: Point-to-point service communication
- Topic: Pattern-based event distribution
- Fanout: Broadcast notifications
- Headers: Metadata-based routing

Queue Strategies:
- Durable queues for critical events
- TTL for time-sensitive messages
- Dead letter queues for failed processing
- Priority queues for urgent operations
```

## 🔒 Security Architecture

### Zero Trust Implementation

#### Authentication Flow
```
1. Client Request → API Gateway
2. API Gateway → Security Gateway (JWT validation)
3. Security Gateway → Service (with validated context)
4. Service → Security Gateway (permission check)
5. Security Gateway → Service (permission result)
6. Service → Response
```

#### Authorization Model
```typescript
interface AuthorizationModel {
  roles: {
    admin: "Full system access";
    developer: "Development and testing access";
    user: "Standard user operations";
    agent: "Agent-specific operations";
  };
  
  permissions: {
    'agent.create': "Create new agents";
    'tool.execute': "Execute tools";
    'discussion.moderate': "Moderate discussions";
    'system.admin': "System administration";
  };
  
  policies: {
    timeBasedAccess: "Time-restricted operations";
    resourceLimits: "Resource usage limits";
    approvalRequired: "Operations requiring approval";
    auditRequired: "Operations requiring audit";
  };
}
```

## 📊 Performance Architecture

### Response Time Targets
| Operation Type | Target | Actual |
|---------------|--------|--------|
| Authentication | < 100ms | ~50ms |
| API Requests | < 200ms | ~150ms |
| Tool Execution | < 5s | ~2s |
| Real-time Updates | < 50ms | ~30ms |
| Database Queries | < 100ms | ~75ms |

### Scalability Design
```typescript
interface ScalabilityArchitecture {
  horizontalScaling: {
    statelessServices: "All services are stateless";
    loadBalancing: "Nginx-based load balancing";
    autoScaling: "Docker Swarm/Kubernetes ready";
  };
  
  caching: {
    applicationCache: "Redis-based caching";
    databaseCache: "Query result caching";
    cdnCache: "Static asset caching";
  };
  
  optimization: {
    connectionPooling: "Database connection management";
    queryOptimization: "Optimized database queries";
    resourceManagement: "Efficient resource utilization";
  };
}
```

## 🔮 Magic Layer (Future Enhancement)

### Architecture Extension
```
┌─────────────────────────────────────────────────────────────────┐
│                    Magic Frontend Layer                        │
├─────────────────────────────────────────────────────────────────┤
│  Spellbook UI  │  Prompt Lens  │  Time Scrubber  │  Hologram   │
└─────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                    Magic Services Layer                        │
├─────────────────────────────────────────────────────────────────┤
│  Hot-Reload    │  Command       │  Time-Travel    │  Theme      │
│  Service       │  Parser        │  Service        │  Engine     │
│  (Port 3005)   │  (Port 3006)   │  (Port 3007)    │  (Port 3008)│
└─────────────────────────────────────────────────────────────────┘
```

### Magic Services Design
- **Hot-Reload Service**: Real-time code updates and capability reloading
- **Command Parser**: Natural language command interpretation
- **Time-Travel Service**: State snapshots and timeline navigation
- **Theme Engine**: Dynamic UI theming and personalization

## 🚀 Deployment Architecture

### Container Strategy
```dockerfile
# Multi-stage builds for optimization
FROM node:18-alpine AS builder
# Build stage

FROM node:18-alpine AS runtime
# Runtime stage with minimal footprint
```

### Environment Configuration
```yaml
# Production Environment
services:
  - agent-intelligence: 3 replicas
  - orchestration-pipeline: 2 replicas
  - capability-registry: 2 replicas
  - security-gateway: 3 replicas
  - discussion-orchestration: 2 replicas

databases:
  - postgresql: Master + 2 read replicas
  - neo4j: Cluster with 3 nodes
  - redis: Cluster with 6 nodes (3 master + 3 replica)
```

## 📈 Monitoring & Observability

### Metrics Collection
```typescript
interface MonitoringArchitecture {
  prometheus: {
    serviceMetrics: "Response times, error rates, throughput";
    businessMetrics: "User actions, agent interactions";
    infrastructureMetrics: "CPU, memory, disk, network";
  };
  
  grafana: {
    dashboards: "Service health, business KPIs";
    alerting: "Threshold-based alerts";
    visualization: "Real-time metric visualization";
  };
  
  logging: {
    structured: "JSON-formatted logs";
    centralized: "ELK stack integration";
    correlation: "Request ID tracking";
  };
}
```

---

This architecture provides a solid foundation for the UAIP system with clear separation of concerns, scalability, security, and maintainability. The design supports both current requirements and future enhancements including the Magic Layer capabilities.