# Service Integration Guide

**Complete guide to inter-service communication and integration patterns in the UAIP platform**

## 🎯 Overview

The UAIP platform consists of 5 microservices that communicate through well-defined patterns. This guide covers all integration approaches, communication protocols, and best practices for service interaction.

## 🏗️ Service Architecture

### Service Boundaries & Responsibilities

| Service | Primary Responsibility | Secondary Capabilities |
|---------|----------------------|----------------------|
| **Agent Intelligence** | Agent persona management, context analysis, memory systems | Chat endpoints, learning adaptation |
| **Orchestration Pipeline** | Real-time operation coordination, workflow management | Strategy execution, participant management |
| **Capability Registry** | Tool/capability management, execution, discovery | Security sandboxing, usage analytics |
| **Security Gateway** | Authentication, authorization, auditing | Approval workflows, compliance reporting |
| **Discussion Orchestration** | Real-time discussion coordination, turn management | WebSocket handling, participant management |

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    API Gateway (Port 8081)                     │
├─────────────────────────────────────────────────────────────────┤
│  • Request Routing      • Authentication      • Rate Limiting   │
│  • Load Balancing       • API Documentation   • Health Checks   │
└─────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                    Service Mesh                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │   Agent     │  │Orchestration│  │ Capability  │  │Security │ │
│  │Intelligence │◄─┤  Pipeline   │◄─┤  Registry   │◄─┤Gateway  │ │
│  │   (3001)    │  │   (3002)    │  │   (3003)    │  │ (3004)  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │
│         │                                                       │
│  ┌─────────────┐                                                │
│  │ Discussion  │                                                │
│  │Orchestration│                                                │
│  │   (3005)    │                                                │
│  └─────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                    Event Bus (RabbitMQ)                        │
├─────────────────────────────────────────────────────────────────┤
│  • Asynchronous Events    • Message Queuing    • Event Replay   │
│  • Service Discovery      • Dead Letter Queue  • Routing        │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 Communication Patterns

### 1. Synchronous Communication (HTTP/REST)

#### Service-to-Service HTTP Calls
```typescript
// Agent Intelligence → Capability Registry
interface ToolDiscoveryRequest {
  agentId: string;
  context: string;
  requiredCapabilities: string[];
  securityLevel: SecurityLevel;
}

interface ToolDiscoveryResponse {
  tools: ToolDefinition[];
  recommendations: ToolRecommendation[];
  usage_analytics: ToolUsageStats;
}

// Implementation
class AgentService {
  async discoverTools(request: ToolDiscoveryRequest): Promise<ToolDiscoveryResponse> {
    const response = await this.httpClient.post(
      `${config.capabilityRegistryUrl}/api/tools/discover`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${this.getServiceToken()}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    
    return response.data;
  }
}
```

#### Cross-Service Authentication
```typescript
// Service Token Generation
class ServiceAuthenticator {
  generateServiceToken(serviceId: string): string {
    return jwt.sign(
      {
        serviceId,
        type: 'service',
        permissions: this.getServicePermissions(serviceId)
      },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
  }
  
  validateServiceToken(token: string): ServiceContext {
    const decoded = jwt.verify(token, config.jwtSecret);
    return {
      serviceId: decoded.serviceId,
      permissions: decoded.permissions,
      type: 'service'
    };
  }
}
```

### 2. Asynchronous Communication (Event-Driven)

#### Event Types and Routing
```typescript
interface EventArchitecture {
  // Operation Events
  operationEvents: {
    'operation.created': OperationCreatedEvent;
    'operation.updated': OperationUpdatedEvent;
    'operation.completed': OperationCompletedEvent;
    'operation.failed': OperationFailedEvent;
  };
  
  // Tool Events
  toolEvents: {
    'tool.executed': ToolExecutedEvent;
    'tool.registered': ToolRegisteredEvent;
    'tool.approved': ToolApprovedEvent;
    'tool.failed': ToolFailedEvent;
  };
  
  // Discussion Events
  discussionEvents: {
    'discussion.started': DiscussionStartedEvent;
    'discussion.message': DiscussionMessageEvent;
    'discussion.participant.joined': ParticipantJoinedEvent;
    'discussion.ended': DiscussionEndedEvent;
  };
  
  // Security Events
  securityEvents: {
    'auth.login': AuthLoginEvent;
    'auth.logout': AuthLogoutEvent;
    'permission.denied': PermissionDeniedEvent;
    'approval.requested': ApprovalRequestedEvent;
    'approval.granted': ApprovalGrantedEvent;
  };
}
```

#### Event Publishing
```typescript
class EventPublisher {
  async publishEvent<T>(eventType: string, data: T, options?: PublishOptions): Promise<void> {
    const event: BaseEvent<T> = {
      id: generateEventId(),
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
      source: this.serviceId,
      version: '1.0'
    };
    
    await this.rabbitMQ.publish(
      this.getExchangeName(eventType),
      this.getRoutingKey(eventType),
      event,
      {
        persistent: true,
        mandatory: true,
        ...options
      }
    );
  }
}
```

#### Event Consumption
```typescript
class EventConsumer {
  async subscribeToEvents(eventTypes: string[], handler: EventHandler): Promise<void> {
    for (const eventType of eventTypes) {
      await this.rabbitMQ.subscribe(
        this.getQueueName(eventType),
        async (message) => {
          try {
            const event = JSON.parse(message.content.toString());
            await handler(event);
            message.ack();
          } catch (error) {
            console.error('Event processing failed:', error);
            message.nack(false, true); // Requeue for retry
          }
        }
      );
    }
  }
}
```

### 3. Real-Time Communication (WebSocket)

#### WebSocket Integration Pattern
```typescript
class WebSocketManager {
  private connections = new Map<string, WebSocket>();
  
  async broadcastToRoom(roomId: string, event: WebSocketEvent): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    const message = JSON.stringify(event);
    
    for (const connectionId of room.connections) {
      const connection = this.connections.get(connectionId);
      if (connection?.readyState === WebSocket.OPEN) {
        connection.send(message);
      }
    }
  }
  
  async notifyServiceEvent(serviceId: string, event: ServiceEvent): Promise<void> {
    // Notify connected clients about service events
    await this.broadcastToRoom(`service:${serviceId}`, {
      type: 'service.event',
      data: event,
      timestamp: new Date().toISOString()
    });
  }
}
```

## 🔗 Specific Integration Patterns

### Agent Intelligence ↔ Orchestration Pipeline

#### Context Sharing
```typescript
interface AgentParticipation {
  agentId: string;
  operationId: string;
  context: OperationContext;
  requiredCapabilities: string[];
}

interface AgentResponse {
  content: string;
  confidence: number;
  reasoning: string[];
  suggestedActions: Action[];
  nextSteps: string[];
}

// Orchestration Pipeline requests agent participation
class OrchestrationService {
  async requestAgentParticipation(request: AgentParticipation): Promise<AgentResponse> {
    return await this.agentIntelligenceClient.participate(request);
  }
}

// Agent Intelligence provides contextual responses
class AgentIntelligenceService {
  async participate(request: AgentParticipation): Promise<AgentResponse> {
    const agent = await this.getAgent(request.agentId);
    const context = await this.analyzeContext(request.context);
    
    return await this.generateResponse(agent, context, request);
  }
}
```

### Agent Intelligence ↔ Capability Registry

#### Tool Discovery and Execution
```typescript
interface CapabilityQuery {
  agentId: string;
  context: string;
  requiredCapabilities: string[];
  securityConstraints: SecurityConstraints;
}

interface CapabilityResponse {
  tools: ToolDefinition[];
  recommendations: ToolRecommendation[];
  executionPlan: ExecutionPlan;
}

// Agent Intelligence discovers capabilities
class AgentIntelligenceService {
  async discoverCapabilities(query: CapabilityQuery): Promise<CapabilityResponse> {
    const response = await this.capabilityRegistryClient.discover(query);
    
    // Enhance with agent-specific context
    return {
      ...response,
      recommendations: await this.enhanceRecommendations(
        response.recommendations,
        query.agentId
      )
    };
  }
  
  async executeToolWithAgent(toolId: string, parameters: any, agentContext: AgentContext): Promise<ToolExecutionResult> {
    // Add agent context to tool execution
    const enrichedParameters = {
      ...parameters,
      agentContext: {
        agentId: agentContext.agentId,
        persona: agentContext.persona,
        conversationId: agentContext.conversationId
      }
    };
    
    return await this.capabilityRegistryClient.execute(toolId, enrichedParameters);
  }
}
```

### Orchestration Pipeline ↔ Discussion Orchestration

#### Collaborative Operation Management
```typescript
interface CollaborativeOperation {
  operationId: string;
  discussionId: string;
  participants: Participant[];
  strategy: CollaborationStrategy;
}

interface DiscussionCoordinationRequest {
  operationId: string;
  context: OperationContext;
  requiredParticipants: ParticipantRequirement[];
  coordinationStrategy: string;
}

// Orchestration Pipeline initiates collaborative operations
class OrchestrationService {
  async initiateCollaborativeOperation(request: DiscussionCoordinationRequest): Promise<string> {
    const discussionId = await this.discussionOrchestrationClient.createDiscussion({
      title: `Collaborative Operation: ${request.operationId}`,
      context: request.context,
      participants: request.requiredParticipants,
      strategy: request.coordinationStrategy
    });
    
    // Link operation to discussion
    await this.linkOperationToDiscussion(request.operationId, discussionId);
    
    return discussionId;
  }
}

// Discussion Orchestration coordinates participants
class DiscussionOrchestrationService {
  async coordinateOperation(operationId: string): Promise<void> {
    const operation = await this.getLinkedOperation(operationId);
    const discussion = await this.getDiscussion(operation.discussionId);
    
    // Coordinate participant turns based on operation requirements
    await this.manageTurns(discussion, operation.requirements);
  }
}
```

### Security Gateway Integration

#### Cross-Service Security Enforcement
```typescript
interface SecurityContext {
  userId: string;
  serviceId: string;
  permissions: string[];
  securityLevel: SecurityLevel;
  auditContext: AuditContext;
}

class SecurityMiddleware {
  async enforcePermissions(
    request: ServiceRequest,
    requiredPermissions: string[]
  ): Promise<SecurityContext> {
    const token = this.extractToken(request);
    const context = await this.securityGatewayClient.validateToken(token);
    
    const hasPermissions = await this.securityGatewayClient.checkPermissions(
      context.userId,
      requiredPermissions,
      request.resource
    );
    
    if (!hasPermissions.granted) {
      throw new PermissionDeniedError(hasPermissions.reason);
    }
    
    // Log security event
    await this.securityGatewayClient.logSecurityEvent({
      userId: context.userId,
      action: request.action,
      resource: request.resource,
      granted: true,
      timestamp: new Date().toISOString()
    });
    
    return context;
  }
}
```

## 📡 Event-Driven Integration Examples

### Operation Lifecycle Events
```typescript
// Orchestration Pipeline publishes operation events
class OrchestrationService {
  async createOperation(operationData: OperationData): Promise<Operation> {
    const operation = await this.operationRepository.create(operationData);
    
    // Publish operation created event
    await this.eventPublisher.publishEvent('operation.created', {
      operationId: operation.id,
      type: operation.type,
      userId: operation.userId,
      parameters: operation.parameters,
      timestamp: operation.createdAt
    });
    
    return operation;
  }
}

// Agent Intelligence reacts to operation events
class AgentIntelligenceService {
  @EventHandler('operation.created')
  async handleOperationCreated(event: OperationCreatedEvent): Promise<void> {
    // Check if any agents should participate
    const relevantAgents = await this.findRelevantAgents(event.data);
    
    for (const agent of relevantAgents) {
      await this.orchestrationClient.requestAgentParticipation({
        operationId: event.data.operationId,
        agentId: agent.id,
        context: event.data.parameters
      });
    }
  }
}
```

### Tool Execution Events
```typescript
// Capability Registry publishes tool events
class CapabilityRegistryService {
  async executeToolAsync(toolId: string, parameters: any): Promise<string> {
    const executionId = generateExecutionId();
    
    // Start execution
    this.executionEngine.execute(executionId, toolId, parameters)
      .then(async (result) => {
        await this.eventPublisher.publishEvent('tool.executed', {
          executionId,
          toolId,
          result,
          status: 'completed',
          timestamp: new Date().toISOString()
        });
      })
      .catch(async (error) => {
        await this.eventPublisher.publishEvent('tool.failed', {
          executionId,
          toolId,
          error: error.message,
          status: 'failed',
          timestamp: new Date().toISOString()
        });
      });
    
    return executionId;
  }
}

// Orchestration Pipeline tracks tool execution
class OrchestrationService {
  @EventHandler('tool.executed')
  async handleToolExecuted(event: ToolExecutedEvent): Promise<void> {
    const operation = await this.findOperationByExecutionId(event.data.executionId);
    if (operation) {
      await this.updateOperationProgress(operation.id, event.data.result);
    }
  }
}
```

## 🔧 Configuration and Discovery

### Service Discovery
```typescript
class ServiceDiscovery {
  private services = new Map<string, ServiceEndpoint>();
  
  async registerService(serviceId: string, endpoint: ServiceEndpoint): Promise<void> {
    this.services.set(serviceId, endpoint);
    
    // Publish service registration event
    await this.eventPublisher.publishEvent('service.registered', {
      serviceId,
      endpoint,
      timestamp: new Date().toISOString()
    });
  }
  
  async getServiceEndpoint(serviceId: string): Promise<ServiceEndpoint> {
    const endpoint = this.services.get(serviceId);
    if (!endpoint) {
      throw new ServiceNotFoundError(`Service ${serviceId} not found`);
    }
    
    // Health check
    const isHealthy = await this.checkServiceHealth(endpoint);
    if (!isHealthy) {
      throw new ServiceUnavailableError(`Service ${serviceId} is unhealthy`);
    }
    
    return endpoint;
  }
}
```

### Circuit Breaker Pattern
```typescript
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime?: Date;
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
      } else {
        throw new CircuitBreakerOpenError('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}
```

## 📊 Monitoring and Observability

### Service Integration Metrics
```typescript
class IntegrationMetrics {
  private requestDuration = new Histogram({
    name: 'service_request_duration_seconds',
    help: 'Duration of service requests',
    labelNames: ['source_service', 'target_service', 'method', 'status']
  });
  
  private requestCount = new Counter({
    name: 'service_requests_total',
    help: 'Total number of service requests',
    labelNames: ['source_service', 'target_service', 'method', 'status']
  });
  
  recordRequest(
    sourceService: string,
    targetService: string,
    method: string,
    duration: number,
    status: string
  ): void {
    this.requestDuration
      .labels(sourceService, targetService, method, status)
      .observe(duration);
    
    this.requestCount
      .labels(sourceService, targetService, method, status)
      .inc();
  }
}
```

### Distributed Tracing
```typescript
class DistributedTracing {
  createSpan(operationName: string, parentContext?: SpanContext): Span {
    const span = this.tracer.startSpan(operationName, {
      childOf: parentContext
    });
    
    span.setTag('service.name', this.serviceName);
    span.setTag('service.version', this.serviceVersion);
    
    return span;
  }
  
  async traceServiceCall<T>(
    targetService: string,
    operation: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    const span = this.createSpan(`${targetService}.${operation}`);
    
    try {
      span.setTag('target.service', targetService);
      const result = await fn(span);
      span.setTag('success', true);
      return result;
    } catch (error) {
      span.setTag('success', false);
      span.setTag('error', true);
      span.log({ error: error.message });
      throw error;
    } finally {
      span.finish();
    }
  }
}
```

## 🧪 Integration Testing

### Service Integration Tests
```typescript
describe('Service Integration', () => {
  test('Agent Intelligence → Capability Registry Integration', async () => {
    // Setup
    const agentId = await createTestAgent();
    const toolId = await createTestTool();
    
    // Test tool discovery
    const discoveryResponse = await agentIntelligenceClient.discoverTools({
      agentId,
      context: 'test context',
      requiredCapabilities: ['test-capability']
    });
    
    expect(discoveryResponse.tools).toContainEqual(
      expect.objectContaining({ id: toolId })
    );
    
    // Test tool execution
    const executionResponse = await agentIntelligenceClient.executeTool(
      toolId,
      { input: 'test input' },
      { agentId }
    );
    
    expect(executionResponse.status).toBe('completed');
  });
  
  test('End-to-End Operation Flow', async () => {
    // Create operation
    const operation = await orchestrationClient.createOperation({
      type: 'agent.chat',
      parameters: { message: 'Hello' }
    });
    
    // Wait for completion
    const result = await waitForOperationCompletion(operation.id);
    
    // Verify all services participated
    expect(result.participatingServices).toContain('agent-intelligence');
    expect(result.participatingServices).toContain('capability-registry');
    expect(result.status).toBe('completed');
  });
});
```

## 📋 Best Practices

### Service Communication Guidelines

1. **Use Appropriate Communication Patterns**
   - Synchronous for immediate responses
   - Asynchronous for background processing
   - WebSocket for real-time updates

2. **Implement Proper Error Handling**
   - Circuit breakers for external calls
   - Retry logic with exponential backoff
   - Graceful degradation

3. **Ensure Security**
   - Service-to-service authentication
   - Request validation and sanitization
   - Audit logging for all interactions

4. **Monitor and Observe**
   - Distributed tracing
   - Service metrics
   - Health checks and alerting

### Integration Checklist

- [ ] Service endpoints properly configured
- [ ] Authentication tokens valid
- [ ] Event subscriptions active
- [ ] Circuit breakers configured
- [ ] Monitoring and alerting set up
- [ ] Integration tests passing
- [ ] Documentation updated

---

This service integration guide provides comprehensive patterns and examples for all inter-service communication in the UAIP platform. Each integration is designed for reliability, security, and observability. 