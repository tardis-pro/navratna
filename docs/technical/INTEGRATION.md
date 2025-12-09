# Integration Guide

## Service Integration Architecture

The UAIP uses a multi-layered integration approach combining REST APIs, WebSockets, and message queues to enable seamless communication between services.

## Communication Patterns

### Synchronous Communication (REST)

#### Request-Response Pattern

```typescript
interface ServiceRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  headers: Record<string, string>;
  body?: any;
  timeout?: number;
}

interface ServiceResponse {
  status: number;
  data: any;
  metadata: {
    timestamp: string;
    requestId: string;
  };
}
```

#### Service Discovery

```typescript
interface ServiceRegistry {
  services: {
    [key: string]: {
      name: string;
      url: string;
      health: string;
      version: string;
    };
  };
}
```

### Asynchronous Communication (Message Queue)

#### Message Structure

```typescript
interface ServiceMessage {
  id: string;
  type: string;
  payload: any;
  metadata: {
    timestamp: string;
    source: string;
    correlationId: string;
  };
}
```

#### Queue Configuration

```yaml
# RabbitMQ exchange configuration
exchanges:
  - name: service.events
    type: topic
    queues:
      - name: agent.operations
        routing_key: agent.#
      - name: discussion.events
        routing_key: discussion.#
```

### Real-time Communication (WebSocket)

#### Event Structure

```typescript
interface WebSocketEvent {
  type: string;
  payload: any;
  timestamp: string;
  targetClients?: string[];
}
```

#### Connection Management

```typescript
interface WebSocketConnection {
  id: string;
  userId: string;
  subscriptions: string[];
  metadata: {
    clientInfo: string;
    connectionTime: string;
  };
}
```

## Service Integration Examples

### Agent Intelligence Integration

```typescript
// Agent service integration
class AgentServiceIntegration {
  // Synchronous operation
  async analyzeContext(context: Context): Promise<Analysis> {
    const response = await httpClient.post('/api/v1/agents/analyze', {
      context,
      timestamp: new Date().toISOString(),
    });
    return response.data;
  }

  // Asynchronous operation
  async startOperation(operation: Operation): Promise<string> {
    const operationId = generateId();
    await messageQueue.publish('agent.operations', {
      type: 'OPERATION_START',
      payload: { operation, operationId },
    });
    return operationId;
  }

  // WebSocket subscription
  subscribeToUpdates(operationId: string, callback: Function): void {
    wsClient.subscribe(`agent.operation.${operationId}`, callback);
  }
}
```

### Discussion Service Integration

```typescript
// Discussion service integration
class DiscussionServiceIntegration {
  // Real-time message handling
  async sendMessage(discussionId: string, message: Message): Promise<void> {
    await wsClient.send('discussion.message', {
      discussionId,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  // Event subscription
  subscribeToDiscussion(discussionId: string): void {
    messageQueue.subscribe(`discussion.${discussionId}`, this.handleEvent);
  }
}
```

## Integration Patterns

### Circuit Breaker Pattern

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  fallbackResponse?: any;
}

class CircuitBreaker {
  async executeRequest(request: ServiceRequest): Promise<ServiceResponse> {
    if (this.isOpen()) {
      return this.fallback();
    }
    try {
      const response = await this.makeRequest(request);
      this.recordSuccess();
      return response;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
}
```

### Retry Pattern

```typescript
interface RetryConfig {
  maxAttempts: number;
  backoff: {
    initial: number;
    multiplier: number;
    maxDelay: number;
  };
}

class RetryHandler {
  async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (attempt < this.config.maxAttempts) {
      try {
        return await operation();
      } catch (error) {
        attempt++;
        await this.delay(this.calculateDelay(attempt));
      }
    }
    throw new Error('Max retry attempts reached');
  }
}
```

## Error Handling

### Error Propagation

```typescript
interface ServiceError {
  code: string;
  message: string;
  source: string;
  timestamp: string;
  details?: any;
}

class ErrorHandler {
  handleServiceError(error: ServiceError): void {
    logger.error('Service error:', {
      ...error,
      stack: error.stack,
    });
    metrics.incrementCounter('service_errors', {
      code: error.code,
      source: error.source,
    });
  }
}
```

### Fallback Mechanisms

```typescript
interface FallbackConfig {
  enabled: boolean;
  strategy: 'cache' | 'default' | 'alternate';
  timeout: number;
}

class FallbackHandler {
  async executeFallback<T>(operation: string, context: any): Promise<T> {
    switch (this.config.strategy) {
      case 'cache':
        return await this.getCachedResponse(operation, context);
      case 'default':
        return this.getDefaultResponse(operation);
      case 'alternate':
        return await this.callAlternateService(operation, context);
    }
  }
}
```

## Monitoring & Tracing

### Request Tracing

```typescript
interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  tags: Record<string, string>;
}

class RequestTracer {
  async traceRequest<T>(
    operation: string,
    context: TraceContext,
    request: () => Promise<T>
  ): Promise<T> {
    const span = this.startSpan(operation, context);
    try {
      const result = await request();
      this.finishSpan(span, { status: 'success' });
      return result;
    } catch (error) {
      this.finishSpan(span, { status: 'error', error });
      throw error;
    }
  }
}
```

### Performance Metrics

```typescript
interface ServiceMetrics {
  requestCount: number;
  errorCount: number;
  responseTime: {
    avg: number;
    p95: number;
    p99: number;
  };
  lastError?: {
    timestamp: string;
    message: string;
  };
}
```

## Integration Testing

### Service Mocks

```typescript
class ServiceMock {
  async simulateResponse(request: ServiceRequest, config: MockConfig): Promise<ServiceResponse> {
    await this.delay(config.latency);
    if (Math.random() < config.errorRate) {
      throw new Error('Simulated error');
    }
    return this.generateResponse(request, config);
  }
}
```

### Integration Tests

```typescript
describe('Service Integration', () => {
  it('should handle successful requests', async () => {
    const service = new ServiceIntegration();
    const result = await service.executeOperation({
      type: 'TEST',
      payload: { data: 'test' },
    });
    expect(result.status).toBe('success');
  });
});
```

## Best Practices

### 1. Service Independence

- Loose coupling between services
- Independent deployment capability
- Isolated data storage
- Service-specific authentication

### 2. Resilience

- Circuit breaker implementation
- Retry mechanisms
- Fallback strategies
- Error handling

### 3. Monitoring

- Request tracing
- Performance metrics
- Error tracking
- Health checks

### 4. Documentation

- API specifications
- Integration patterns
- Error codes
- Configuration guide
