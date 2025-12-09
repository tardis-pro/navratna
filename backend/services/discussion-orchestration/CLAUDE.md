# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Discussion Orchestration Service** - one of 7 microservices in the UAIP (Unified Agent Intelligence Platform) backend. It manages real-time discussion lifecycle, turn coordination, and participant management through WebSocket-based communication and strategic turn management.

## Service Architecture

### Core Responsibilities

- **Real-time Discussion Management** - WebSocket-based coordination via Socket.IO
- **Turn Strategy System** - Multiple strategies (Round Robin, Context-Aware, Moderated)
- **Participant Management** - Dynamic participant addition/removal with role management
- **Agent Integration** - Event-driven communication with Agent Intelligence service
- **Discussion Analytics** - Real-time metrics and insights

### Key Components

```
src/
├── index.ts                     # Service entry point (extends BaseService)
├── config/                      # Configuration management
├── services/                    # Business logic services
│   ├── discussionOrchestrationService.ts  # Core orchestration logic
│   ├── turnStrategyService.ts             # Turn management strategies
│   ├── conversationFlowService.ts         # Flow control
│   ├── eventDrivenDiscussionService.ts    # Event handling
│   └── conversationEnhancementService.ts  # Enhancement features
├── strategies/                  # Turn management implementations
│   ├── RoundRobinStrategy.ts   # Sequential turn management
│   ├── ContextAwareStrategy.ts # AI-driven turn decisions
│   └── ModeratedStrategy.ts    # Moderator-controlled turns
└── websocket/                  # Real-time communication
    ├── discussionSocket.ts             # Main Socket.IO handlers
    ├── discussionWebSocketHandler.ts   # Discussion-specific logic
    ├── userChatHandler.ts             # User chat management
    ├── conversationIntelligenceHandler.ts # AI conversation features
    ├── taskNotificationHandler.ts     # Task notifications
    └── websocket-security-utils.ts    # Security utilities
```

## Common Development Commands

### Service Development

```bash
# Development mode (hot reload)
npm run dev

# Build service
npm run build

# Start production
npm start

# Watch build
npm run build:watch
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# CI mode
npm run test:ci
```

### Code Quality

```bash
# Lint TypeScript
npm run lint

# Fix linting issues
npm run lint:fix

# Clean build artifacts
npm run clean
```

## Key Technologies

- **Base Framework**: Extends `BaseService` from `@uaip/shared-services`
- **Real-time**: Socket.IO for WebSocket communication (port 3005)
- **Event-Driven**: RabbitMQ event bus for service communication
- **Database**: PostgreSQL via TypeORM (shared database service)
- **Authentication**: Token validation through Security Gateway service
- **Caching**: Redis for session management and rate limiting

## Architecture Patterns

### Event-Driven Communication

```typescript
// Subscribe to agent messages
await this.eventBusService.subscribe('discussion.agent.message', async (event) => {
  // Process agent participation in discussions
});

// Publish orchestration events
await this.eventBusService.publish('orchestration.control', event);
```

### WebSocket Authentication

```typescript
// Socket.IO middleware for token validation
this.io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  const authResponse = await this.validateSocketIOToken(token);
  socket.data.user = authResponse;
  next();
});
```

### Turn Strategy Pattern

```typescript
// Strategy interface implementation
export class CustomStrategy implements TurnStrategy {
  async decideTurn(context: TurnContext): Promise<TurnDecision> {
    // Strategy-specific logic
  }
}

// Register in TurnStrategyService
this.strategies.set('custom', new CustomStrategy());
```

## Integration Points

### With Agent Intelligence Service

- Receives agent messages via `discussion.agent.message` events
- Coordinates agent participation in discussions
- Provides discussion context for AI responses

### With Security Gateway

- Validates WebSocket authentication tokens
- Enforces user authorization for discussions
- Maintains compliance audit trails

### With Shared Services

- Uses `DiscussionService` for data persistence
- Leverages `PersonaService` for agent management
- Integrates with enterprise event bus and caching

## Configuration

### Environment Variables

```bash
PORT=3005
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/discussions
REDIS_URL=redis://localhost:6379
WEBSOCKET_PORT=3005
CORS_ORIGINS=http://localhost:3000
DEFAULT_TURN_STRATEGY=round-robin
TURN_TIMEOUT_MS=30000
MAX_PARTICIPANTS=50
```

### Turn Strategy Configuration

```typescript
// Round Robin
{
  "type": "round-robin",
  "config": {
    "turnDuration": 30000,
    "allowInterruptions": false,
    "skipInactive": true
  }
}

// Context-Aware
{
  "type": "context-aware",
  "config": {
    "relevanceThreshold": 0.7,
    "maxConsecutiveTurns": 3,
    "prioritizeExperts": true
  }
}
```

## WebSocket Events

### Discussion Events

- `discussion:join` - Join discussion room
- `discussion:leave` - Leave discussion room
- `discussion:message` - Send discussion message
- `discussion:turn-request` - Request speaking turn
- `discussion:turn-granted` - Turn granted notification
- `discussion:participant-joined` - New participant notification

### Socket.IO Namespaces

- Main namespace: `/` (default)
- Conversation Intelligence: `/conversation-intelligence`
- Task Notifications: `/task-notifications`

## Memory Management & Race Condition Prevention

The service implements comprehensive cleanup mechanisms:

```typescript
// Periodic cleanup of stale data
private startCleanupMechanisms(): void {
  this.cleanupInterval = setInterval(() => {
    this.performPeriodicCleanup();
  }, 30000); // Every 30 seconds
}

// Operation locks prevent race conditions
private async acquireLock(operationId: string): Promise<boolean> {
  if (this.operationLocks.get(operationId)) return false;
  this.operationLocks.set(operationId, true);
  return true;
}
```

## Debugging & Monitoring

### Debug Endpoints

```bash
# Race condition detection
GET /api/v1/debug/race-conditions

# Memory usage monitoring
GET /api/v1/debug/memory-usage

# Force cleanup trigger
POST /api/v1/debug/force-cleanup

# Pending requests status
GET /api/v1/debug/pending-requests
```

### Health Checks

```bash
# Service health
GET /health

# Detailed status
GET /api/v1/info
```

## Import Patterns

This service follows monorepo workspace imports:

```typescript
// ✅ Correct workspace imports
import { BaseService, DiscussionService } from '@uaip/shared-services';
import { Discussion, DiscussionMessage } from '@uaip/types';
import { logger } from '@uaip/utils';
import { authMiddleware } from '@uaip/middleware';

// ✅ Local imports within service
import { config } from './config/index.js';
import { DiscussionOrchestrationService } from './services/discussionOrchestrationService.js';
```

## Performance Targets

- Discussion creation: < 100ms
- Turn management: < 50ms
- WebSocket message delivery: < 10ms
- Strategy execution: < 200ms
- Concurrent discussions: 1000+
- Messages per second: 10,000+
- WebSocket connections: 50,000+

## Testing Strategy

- **Unit Tests**: Business logic in `/src/__tests__/unit/`
- **Integration Tests**: Service integration in `/src/__tests__/integration/`
- **Coverage Target**: 70% (branches, functions, lines, statements)
- **Test Timeout**: 15 seconds
- **Setup**: Shared test setup in `/src/__tests__/setup.ts`

## Key Files to Understand

1. **`src/index.ts`** - Service initialization, WebSocket setup, authentication
2. **`src/services/discussionOrchestrationService.ts`** - Core business logic
3. **`src/websocket/discussionSocket.ts`** - Main Socket.IO event handlers
4. **`src/strategies/`** - Turn management strategy implementations
5. **`src/websocket/conversationIntelligenceHandler.ts`** - AI conversation features

## Development Notes

- Service runs on port 3005 by default
- Uses Socket.IO instead of raw WebSocket for better reliability
- Implements comprehensive race condition prevention
- All authentication goes through Security Gateway service
- Event-driven architecture with minimal REST API surface
- Memory cleanup mechanisms prevent resource leaks
- Comprehensive audit logging for compliance requirements
