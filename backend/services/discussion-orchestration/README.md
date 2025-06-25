# Discussion Orchestration Service

## Overview

The Discussion Orchestration Service manages real-time discussion lifecycle, turn coordination, and participant management in the UAIP platform. It provides WebSocket-based real-time communication, strategic turn management, and seamless integration with Agent Intelligence for dynamic discussions.

## Features

- **Real-time Discussion Management** - WebSocket-based real-time discussion coordination
- **Turn Strategy System** - Multiple turn management strategies (Round Robin, Context-Aware, Moderated)
- **Participant Management** - Dynamic participant addition, removal, and role management
- **Agent Integration** - Seamless integration with Agent Intelligence service
- **Discussion Analytics** - Real-time metrics and discussion insights
- **Scalable Architecture** - Built for high-concurrency real-time discussions

## Quick Start

```bash
# Install dependencies
npm install

# Build service
npm run build

# Run in development mode
npm run dev

# Run in production
npm start

# Run tests
npm test
```

## API Endpoints

### Discussion Management
- `POST /api/v1/discussions` - Create new discussion
- `GET /api/v1/discussions/:id` - Get discussion details
- `PUT /api/v1/discussions/:id` - Update discussion settings
- `DELETE /api/v1/discussions/:id` - End discussion

### Participant Management
- `POST /api/v1/discussions/:id/participants` - Add participant
- `DELETE /api/v1/discussions/:id/participants/:participantId` - Remove participant
- `PUT /api/v1/discussions/:id/participants/:participantId/role` - Update participant role

### Turn Management
- `POST /api/v1/discussions/:id/turns` - Request turn or pass turn
- `GET /api/v1/discussions/:id/turns/current` - Get current turn information
- `PUT /api/v1/discussions/:id/strategy` - Change turn strategy

### WebSocket Events
- `discussion:join` - Join discussion room
- `discussion:leave` - Leave discussion room
- `discussion:message` - Send discussion message
- `discussion:turn-request` - Request speaking turn
- `discussion:turn-granted` - Turn granted notification
- `discussion:participant-joined` - New participant notification

For detailed API documentation, see [API_REFERENCE.md](./API_REFERENCE.md)

## Configuration

### Environment Variables

```bash
# Service Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/discussions
REDIS_URL=redis://localhost:6379

# WebSocket Configuration
WEBSOCKET_PORT=3001
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Integration Configuration
AGENT_INTELLIGENCE_URL=http://localhost:3002
CAPABILITY_REGISTRY_URL=http://localhost:3003

# Turn Management
DEFAULT_TURN_STRATEGY=round-robin
TURN_TIMEOUT_MS=30000
MAX_PARTICIPANTS=50

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Turn Strategies

#### Round Robin Strategy
```typescript
{
  "type": "round-robin",
  "config": {
    "turnDuration": 30000,
    "allowInterruptions": false,
    "skipInactive": true
  }
}
```

#### Context-Aware Strategy
```typescript
{
  "type": "context-aware",
  "config": {
    "relevanceThreshold": 0.7,
    "maxConsecutiveTurns": 3,
    "prioritizeExperts": true
  }
}
```

#### Moderated Strategy
```typescript
{
  "type": "moderated",
  "config": {
    "moderatorId": "agent-123",
    "requireApproval": true,
    "queueTurns": true
  }
}
```

## Integration

### With Agent Intelligence Service

The Discussion Orchestration service integrates with Agent Intelligence to:

- **Trigger Agent Participation**: Automatically invite agents to contribute based on discussion context
- **Context Analysis**: Provide discussion context for intelligent agent responses
- **Turn Decisions**: Use agent intelligence to determine optimal turn assignments

```typescript
// Example integration
const agentResponse = await agentIntelligenceService.generateDiscussionResponse({
  agentId: 'agent-123',
  discussionId: 'disc-456',
  context: {
    topic: 'System Architecture',
    recentMessages: [...],
    participants: [...]
  }
});
```

### With Capability Registry Service

Integration with Capability Registry enables:

- **Tool-Enhanced Discussions**: Participants can execute tools during discussions
- **Capability Discovery**: Suggest relevant tools based on discussion context
- **Execution Tracking**: Monitor tool usage within discussions

```typescript
// Example capability integration
const suggestedTools = await capabilityRegistry.getRecommendations({
  context: discussionContext,
  participants: discussionParticipants
});
```

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                Discussion Orchestration                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ Discussion  │ │    Turn     │ │ WebSocket   │           │
│  │ Manager     │ │ Strategies  │ │ Handler     │           │
│  │             │ │             │ │             │           │
│  │ - Lifecycle │ │ - Round     │ │ - Real-time │           │
│  │ - State     │ │   Robin     │ │ - Events    │           │
│  │ - Rules     │ │ - Context   │ │ - Rooms     │           │
│  │             │ │ - Moderated │ │             │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
├─────────────────────────────────────────────────────────────┤
│                    Integration Layer                         │
│  ┌─────────────────────┐ ┌─────────────────────────────────┐ │
│  │ Agent Intelligence  │ │    Capability Registry          │ │
│  │                     │ │                                 │ │
│  │ - Context sharing   │ │ - Tool suggestions              │ │
│  │ - Agent responses   │ │ - Execution tracking            │ │
│  │ - Participation     │ │ - Discussion enhancement        │ │
│  └─────────────────────┘ └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

```sql
-- Discussions
CREATE TABLE discussions (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    strategy_type VARCHAR(50) DEFAULT 'round-robin',
    strategy_config JSONB,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Participants
CREATE TABLE discussion_participants (
    id UUID PRIMARY KEY,
    discussion_id UUID REFERENCES discussions(id),
    participant_id VARCHAR(255) NOT NULL,
    participant_type VARCHAR(20) NOT NULL, -- 'user', 'agent'
    role VARCHAR(50) DEFAULT 'participant',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Messages
CREATE TABLE discussion_messages (
    id UUID PRIMARY KEY,
    discussion_id UUID REFERENCES discussions(id),
    participant_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Turn Management
CREATE TABLE discussion_turns (
    id UUID PRIMARY KEY,
    discussion_id UUID REFERENCES discussions(id),
    current_speaker VARCHAR(255),
    turn_start TIMESTAMP,
    turn_end TIMESTAMP,
    turn_duration INTEGER,
    strategy_metadata JSONB
);
```

## Development

### Project Structure

```
src/
├── index.ts                 # Service entry point
├── config/                  # Configuration management
├── routes/                  # API route handlers
├── services/                # Business logic services
│   ├── discussionOrchestrationService.ts
│   └── turnStrategyService.ts
├── strategies/              # Turn management strategies
│   ├── RoundRobinStrategy.ts
│   ├── ContextAwareStrategy.ts
│   └── ModeratedStrategy.ts
└── websocket/               # WebSocket handling
    ├── discussionSocket.ts
    └── discussionWebSocketHandler.ts
```

### Adding New Turn Strategies

1. Create strategy class implementing `TurnStrategy` interface:

```typescript
export class CustomStrategy implements TurnStrategy {
  async decideTurn(context: TurnContext): Promise<TurnDecision> {
    // Implementation
  }
  
  async validateTurn(turn: TurnRequest): Promise<boolean> {
    // Validation logic
  }
}
```

2. Register strategy in `TurnStrategyService`:

```typescript
this.strategies.set('custom', new CustomStrategy());
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## Performance Metrics

### Response Time Targets
- Discussion creation: < 100ms
- Turn management: < 50ms
- WebSocket message delivery: < 10ms
- Strategy execution: < 200ms

### Throughput Targets
- Concurrent discussions: 1000+
- Messages per second: 10,000+
- WebSocket connections: 50,000+

## Monitoring

### Health Checks

```bash
# Service health
GET /health

# Database connectivity
GET /health/database

# WebSocket server status
GET /health/websocket
```

### Metrics

The service exposes Prometheus metrics:

- `discussion_orchestration_requests_total`
- `discussion_orchestration_active_discussions`
- `discussion_orchestration_websocket_connections`
- `discussion_orchestration_turn_decisions_duration`
- `discussion_orchestration_message_processing_duration`

## Troubleshooting

### Common Issues

#### WebSocket Connection Issues
```bash
# Check WebSocket server status
curl http://localhost:3001/health/websocket

# Verify CORS configuration
# Check CORS_ORIGINS environment variable
```

#### Turn Strategy Not Working
```bash
# Verify strategy configuration
GET /api/v1/discussions/:id/strategy

# Check strategy logs
tail -f logs/discussion-orchestration.log | grep "strategy"
```

#### High Memory Usage
```bash
# Monitor active discussions
GET /api/v1/discussions?status=active

# Check WebSocket connection count
GET /health/websocket
```

For more troubleshooting information, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## Contributing

1. Follow the [Service Alignment Guide](../SERVICE_ALIGNMENT_GUIDE.md)
2. Use monorepo workspace imports (`@uaip/*`)
3. Add tests for new features
4. Update documentation for API changes
5. Follow TypeScript best practices

## License

MIT License - see [LICENSE](../../LICENSE) for details. 