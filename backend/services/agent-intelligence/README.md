# Agent Intelligence Service

## Overview

The Agent Intelligence Service provides advanced AI-powered agent capabilities including persona management, context analysis, memory systems, and intelligent conversation handling. It serves as the cognitive engine for agents in the UAIP platform, enabling natural interactions, learning, and adaptation.

## Features

- **Agent Persona Management** - Dynamic personality, expertise, and communication style management
- **Memory Systems** - Working, episodic, and semantic memory for contextual conversations
- **Context Analysis** - Intelligent analysis of conversation context and user intent
- **Chat Endpoints** - Natural conversation capabilities with memory and persona integration
- **Knowledge Integration** - Seamless integration with knowledge graphs and learning systems
- **Discussion Participation** - Automated participation in orchestrated discussions
- **Learning & Adaptation** - Continuous learning from interactions and feedback

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
```

## API Endpoints

### Agent Management

- `GET /api/v1/agents` - List all agents
- `POST /api/v1/agents` - Create new agent
- `GET /api/v1/agents/:id` - Get agent details
- `PUT /api/v1/agents/:id` - Update agent configuration
- `DELETE /api/v1/agents/:id` - Delete agent

### Chat Interface

- `POST /api/v1/agents/:id/chat` - Chat with agent (see [Chat Endpoint Guide](./CHAT_ENDPOINT_GUIDE.md))
- `GET /api/v1/agents/:id/conversations` - Get conversation history
- `POST /api/v1/agents/:id/conversations/:conversationId/context` - Add conversation context

### Memory Management

- `GET /api/v1/agents/:id/memory` - Get agent memory state
- `POST /api/v1/agents/:id/memory/episodes` - Add episodic memory
- `PUT /api/v1/agents/:id/memory/working` - Update working memory
- `DELETE /api/v1/agents/:id/memory/clear` - Clear specific memory types

### Discussion Integration

- `POST /api/v1/agents/:id/discussions/:discussionId/participate` - Join discussion
- `GET /api/v1/agents/:id/discussions/active` - Get active discussions
- `POST /api/v1/agents/:id/discussions/:discussionId/response` - Generate discussion response

### Analytics & Insights

- `GET /api/v1/agents/:id/analytics` - Get agent performance metrics
- `GET /api/v1/agents/:id/learning-progress` - Get learning progress
- `POST /api/v1/agents/:id/feedback` - Provide learning feedback

For detailed API documentation, see [API_REFERENCE.md](./API_REFERENCE.md)

## Configuration

### Environment Variables

```bash
# Service Configuration
PORT=3002
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/agent_intelligence
REDIS_URL=redis://localhost:6379

# LLM Configuration
LLM_PROVIDER=openai
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=2048

# Memory Configuration
MEMORY_RETENTION_DAYS=30
WORKING_MEMORY_SIZE=10
EPISODIC_MEMORY_SIZE=100

# Integration Configuration
DISCUSSION_ORCHESTRATION_URL=http://localhost:3001
CAPABILITY_REGISTRY_URL=http://localhost:3003
KNOWLEDGE_GRAPH_URL=http://localhost:7474

# Performance Configuration
RESPONSE_TIMEOUT_MS=30000
MAX_CONCURRENT_CHATS=100
CACHE_TTL_SECONDS=300
```

### Agent Configuration

#### Basic Agent Configuration

```typescript
{
  "id": "agent-123",
  "name": "Alex Thompson",
  "persona": {
    "role": "Senior Software Architect",
    "personality": {
      "analytical": 0.8,
      "collaborative": 0.9,
      "detail_oriented": 0.7,
      "enthusiasm": 0.8
    },
    "expertise": [
      "System Architecture",
      "Microservices",
      "Performance Optimization",
      "Team Leadership"
    ],
    "communicationStyle": {
      "tone": "professional",
      "formality": "moderate",
      "verbosity": "detailed"
    }
  },
  "capabilities": {
    "languages": ["TypeScript", "Python", "Go"],
    "frameworks": ["Node.js", "React", "Docker"],
    "specializations": ["Backend Systems", "API Design"]
  }
}
```

#### Advanced Agent Configuration

```typescript
{
  "memoryConfig": {
    "workingMemorySize": 15,
    "episodicRetentionDays": 60,
    "semanticLearningRate": 0.1
  },
  "behaviorConfig": {
    "proactiveEngagement": true,
    "learningFromFeedback": true,
    "adaptToUserStyle": true
  },
  "integrationConfig": {
    "discussionParticipation": "automatic",
    "toolUsagePermissions": ["safe", "moderate"],
    "knowledgeGraphAccess": true
  }
}
```

## Integration

### With Discussion Orchestration Service

The Agent Intelligence service integrates with Discussion Orchestration to:

- **Automatic Participation**: Agents automatically join relevant discussions
- **Context-Aware Responses**: Generate responses based on discussion context
- **Turn Management**: Coordinate with turn strategies for optimal participation

```typescript
// Example discussion participation
const discussionResponse = await agentIntelligenceService.generateDiscussionResponse({
  agentId: 'agent-123',
  discussionId: 'disc-456',
  context: {
    topic: 'System Architecture',
    recentMessages: [...],
    participants: [...],
    turnStrategy: 'context-aware'
  }
});
```

### With Capability Registry Service

Integration with Capability Registry enables:

- **Tool Discovery**: Agents discover and use relevant tools
- **Capability Enhancement**: Tools enhance agent capabilities
- **Execution Coordination**: Coordinate tool usage with agent responses

```typescript
// Example tool integration
const relevantTools = await capabilityRegistry.getRecommendations({
  agentId: 'agent-123',
  context: conversationContext,
  capabilities: agentCapabilities,
});

const toolResult = await capabilityRegistry.executeTool({
  toolId: 'code-analyzer',
  parameters: { code: userProvidedCode },
  agentId: 'agent-123',
});
```

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                  Agent Intelligence                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Agent     │ │   Memory    │ │   Context   │           │
│  │  Manager    │ │   Systems   │ │  Analysis   │           │
│  │             │ │             │ │             │           │
│  │ - Personas  │ │ - Working   │ │ - Intent    │           │
│  │ - Behavior  │ │ - Episodic  │ │ - Sentiment │           │
│  │ - Learning  │ │ - Semantic  │ │ - Relevance │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
├─────────────────────────────────────────────────────────────┤
│                    LLM Integration                           │
│  ┌─────────────────────┐ ┌─────────────────────────────────┐ │
│  │   Chat Engine       │ │    Response Generation          │ │
│  │                     │ │                                 │ │
│  │ - Conversation      │ │ - Context-aware responses       │ │
│  │ - Memory recall     │ │ - Persona-driven generation     │ │
│  │ - Context building  │ │ - Multi-modal support           │ │
│  └─────────────────────┘ └─────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                   Integration Layer                          │
│  ┌─────────────────────┐ ┌─────────────────────────────────┐ │
│  │ Discussion Orchestr │ │    Capability Registry          │ │
│  │                     │ │                                 │ │
│  │ - Auto-participation │ │ - Tool discovery               │ │
│  │ - Turn coordination │ │ - Capability enhancement        │ │
│  │ - Context sharing   │ │ - Execution coordination        │ │
│  └─────────────────────┘ └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Memory Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Memory Systems                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  Working    │ │  Episodic   │ │  Semantic   │           │
│  │  Memory     │ │   Memory    │ │   Memory    │           │
│  │             │ │             │ │             │           │
│  │ - Current   │ │ - Past      │ │ - Learned   │           │
│  │   context   │ │   events    │ │   concepts  │           │
│  │ - Active    │ │ - Experiences │ │ - Knowledge │           │
│  │   tasks     │ │ - Outcomes  │ │   graphs    │           │
│  │ - Recent    │ │ - Patterns  │ │ - Skills    │           │
│  │   messages  │ │             │ │             │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
├─────────────────────────────────────────────────────────────┤
│                  Memory Management                          │
│  • Automatic retention and forgetting                       │
│  • Context-based recall                                     │
│  • Cross-memory pattern recognition                         │
│  • Learning from interactions                               │
└─────────────────────────────────────────────────────────────┘
```

## Development

### Project Structure

```
src/
├── index.ts                 # Service entry point
├── controllers/             # API controllers
│   ├── agentController.ts
│   ├── discussionController.ts
│   └── personaController.ts
├── services/                # Business logic services
│   └── enhanced-agent-intelligence.service.ts
├── routes/                  # API route definitions
│   ├── agentRoutes.ts
│   ├── discussionRoutes.ts
│   └── healthRoutes.ts
└── types/                   # Service-specific types
```

### Adding New Agent Capabilities

1. Define capability interface:

```typescript
interface AgentCapability {
  name: string;
  description: string;
  execute(context: CapabilityContext): Promise<CapabilityResult>;
}
```

2. Implement capability:

```typescript
export class CodeAnalysisCapability implements AgentCapability {
  name = 'code-analysis';
  description = 'Analyze code quality and provide suggestions';

  async execute(context: CapabilityContext): Promise<CapabilityResult> {
    // Implementation
  }
}
```

3. Register capability:

```typescript
agentService.registerCapability(new CodeAnalysisCapability());
```

### Memory System Extensions

```typescript
// Custom memory provider
export class CustomMemoryProvider implements MemoryProvider {
  async store(memory: MemoryItem): Promise<void> {
    // Custom storage logic
  }

  async retrieve(query: MemoryQuery): Promise<MemoryItem[]> {
    // Custom retrieval logic
  }
}
```

## Chat Endpoint Usage

The service provides a sophisticated chat interface with full persona and memory integration. For detailed usage examples and API specifications, see the [Chat Endpoint Guide](./CHAT_ENDPOINT_GUIDE.md).

### Quick Chat Example

```bash
curl -X POST http://localhost:3002/api/v1/agents/agent-123/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "Help me design a scalable microservices architecture",
    "context": {
      "projectType": "e-commerce platform",
      "expectedLoad": "10k concurrent users",
      "constraints": ["budget-conscious", "rapid-development"]
    }
  }'
```

## Performance Metrics

### Response Time Targets

- Simple chat responses: < 500ms
- Complex analysis: < 2000ms
- Memory operations: < 100ms
- Discussion participation: < 1000ms

### Throughput Targets

- Concurrent chat sessions: 500+
- Messages per second: 1000+
- Memory operations per second: 5000+

## Monitoring

### Health Checks

```bash
# Service health
GET /health

# LLM provider status
GET /health/llm

# Memory system status
GET /health/memory

# Database connectivity
GET /health/database
```

### Metrics

The service exposes Prometheus metrics:

- `agent_intelligence_chat_requests_total`
- `agent_intelligence_response_generation_duration`
- `agent_intelligence_memory_operations_total`
- `agent_intelligence_active_agents`
- `agent_intelligence_llm_token_usage`

## Troubleshooting

### Common Issues

#### Slow Response Times

```bash
# Check LLM provider status
GET /health/llm

# Monitor token usage
GET /api/v1/agents/:id/analytics

# Check memory system performance
GET /health/memory
```

#### Memory Issues

```bash
# Check memory usage
GET /api/v1/agents/:id/memory

# Clear old memories
DELETE /api/v1/agents/:id/memory/clear?type=episodic&older_than=30d

# Optimize memory configuration
PUT /api/v1/agents/:id/config
```

#### Integration Problems

```bash
# Test discussion integration
POST /api/v1/agents/:id/discussions/test/participate

# Test capability integration
GET /api/v1/agents/:id/capabilities/available
```

## Security

### Authentication

All endpoints require authentication via JWT tokens:

```typescript
// Request headers
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Data Privacy

- Conversation data is encrypted at rest
- Memory data follows retention policies
- PII is automatically detected and protected
- Audit logs track all data access

## Contributing

1. Follow the [Service Alignment Guide](../SERVICE_ALIGNMENT_GUIDE.md)
2. Use monorepo workspace imports (`@uaip/*`)
3. Add tests for new features
4. Update documentation for API changes
5. Follow TypeScript best practices
6. See [REORGANIZATION_SUMMARY.md](./REORGANIZATION_SUMMARY.md) for recent changes

## License

MIT License - see [LICENSE](../../LICENSE) for details.
