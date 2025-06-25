# Capability Registry Service

## Overview

The Capability Registry Service manages tool and capability discovery, registration, execution, and monitoring in the UAIP platform. It provides a secure, scalable foundation for AI agents to discover and execute tools while maintaining comprehensive tracking, security controls, and intelligent recommendations.

## Features

- **Tool Registration & Management** - Comprehensive tool lifecycle management with versioning
- **Sandboxed Execution Engine** - Secure, isolated tool execution with resource constraints
- **Graph-based Discovery** - Neo4j-powered tool relationships and intelligent recommendations  
- **Real-time Event Streaming** - Live execution updates and monitoring
- **Security & Compliance** - Granular security levels with approval workflows
- **Usage Analytics** - Advanced metrics, cost tracking, and performance insights
- **Community Integration** - GitHub-based tool sharing and collaboration
- **Workflow Orchestration** - Multi-tool workflow execution and coordination

## Quick Start

```bash
# Install dependencies
npm install

# Build service
npm run build

# Run database migrations
npm run db:migrate

# Run in development mode
npm run dev

# Run in production
npm start

# Run tests
npm test
```

## API Endpoints

### Tool Management
- `GET /api/v1/tools` - List all tools with filtering and search
- `POST /api/v1/tools` - Register new tool
- `GET /api/v1/tools/:id` - Get tool details
- `PUT /api/v1/tools/:id` - Update tool configuration
- `DELETE /api/v1/tools/:id` - Delete tool

### Tool Execution
- `POST /api/v1/tools/:id/execute` - Execute tool with parameters
- `GET /api/v1/executions/:id` - Get execution status and results
- `GET /api/v1/executions` - List executions with filtering
- `POST /api/v1/executions/:id/cancel` - Cancel running execution
- `POST /api/v1/executions/:id/approve` - Approve pending execution

### Discovery & Recommendations
- `GET /api/v1/tools/search` - Search tools by name, description, or tags
- `GET /api/v1/tools/recommendations` - Get personalized tool recommendations
- `GET /api/v1/tools/:id/related` - Get related tools and relationships
- `GET /api/v1/tools/categories` - List tool categories and statistics

### Analytics & Monitoring
- `GET /api/v1/analytics/usage` - Tool usage statistics
- `GET /api/v1/analytics/performance` - Performance metrics
- `GET /api/v1/analytics/costs` - Cost analysis and tracking
- `GET /api/v1/health` - Service health and status

For detailed API documentation, see [API_REFERENCE.md](./API_REFERENCE.md)

## Integration

### With Agent Intelligence Service

The Capability Registry integrates with Agent Intelligence to:

- **Tool Discovery**: Agents discover relevant tools based on context and capabilities
- **Execution Coordination**: Coordinate tool usage with agent responses and memory
- **Learning Integration**: Track tool effectiveness for agent learning

```typescript
// Example agent tool discovery
const recommendedTools = await capabilityRegistry.getRecommendations({
  agentId: 'agent-123',
  context: 'code analysis',
  capabilities: ['programming', 'debugging'],
  securityLevel: 'moderate'
});
```

### With Discussion Orchestration Service

Integration with Discussion Orchestration enables:

- **Discussion-Enhanced Tools**: Execute tools in the context of discussions
- **Collaborative Execution**: Multiple participants can coordinate tool usage
- **Real-time Results**: Stream tool results to discussion participants

```typescript
// Example discussion tool execution
const execution = await capabilityRegistry.executeTool({
  toolId: 'code-reviewer',
  parameters: { repository: discussionContext.repository },
  discussionId: 'disc-456',
  requestedBy: 'participant-789'
});
```

## 🏗️ Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                  Capability Registry                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │    Tool     │ │  Execution  │ │ Discovery   │           │
│  │  Registry   │ │   Engine    │ │   Engine    │           │
│  │             │ │             │ │             │           │
│  │ - Storage   │ │ - Sandbox   │ │ - Search    │           │
│  │ - Validation│ │ - Monitor   │ │ - Recommend │           │
│  │ - Versioning│ │ - Security  │ │ - Relations │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
├─────────────────────────────────────────────────────────────┤
│                    Hybrid Database                          │
│  ┌─────────────────────┐ ┌─────────────────────────────────┐ │
│  │    PostgreSQL       │ │           Neo4j                 │ │
│  │                     │ │                                 │ │
│  │ - Tool definitions  │ │ - Tool relationships            │ │
│  │ - Execution logs    │ │ - Usage patterns                │ │
│  │ - Usage metrics     │ │ - Recommendations               │ │
│  │ - Performance data  │ │ - Community connections         │ │
│  └─────────────────────┘ └─────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                   Integration Layer                          │
│  ┌─────────────────────┐ ┌─────────────────────────────────┐ │
│  │ Agent Intelligence  │ │  Discussion Orchestration       │ │
│  │                     │ │                                 │ │
│  │ - Tool discovery    │ │ - Collaborative execution       │ │
│  │ - Execution coord   │ │ - Real-time results             │ │
│  │ - Learning tracking │ │ - Context-aware tools           │ │
│  └─────────────────────┘ └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Sandboxed Execution Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Execution Sandbox                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  Security   │ │  Resource   │ │ Monitoring  │           │
│  │  Manager    │ │  Manager    │ │   System    │           │
│  │             │ │             │ │             │           │
│  │ - Isolation │ │ - CPU Limit │ │ - Real-time │           │
│  │ - Validation│ │ - Memory    │ │ - Logging   │           │
│  │ - Approval  │ │ - Network   │ │ - Metrics   │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
├─────────────────────────────────────────────────────────────┤
│                    Event Streaming                          │
│  • Real-time execution updates                              │
│  • WebSocket connections for live monitoring                │
│  • Event-driven result processing                           │
│  • Integration with frontend dashboards                     │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

```bash
# Service Configuration
PORT=3003
NODE_ENV=development

# PostgreSQL Configuration
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=capability_registry
PG_USER=postgres
PG_PASSWORD=password
PG_SSL=false

# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j

# Security Configuration
JWT_SECRET=your-secret-key
ENABLE_APPROVAL_WORKFLOW=false
DEFAULT_SECURITY_LEVEL=safe

# Execution Configuration
TOOL_EXECUTION_TIMEOUT=30000
MAX_CONCURRENT_EXECUTIONS=10
DEFAULT_COST_LIMIT=100.0
SANDBOX_MEMORY_LIMIT=512MB
SANDBOX_CPU_LIMIT=1.0

# Integration Configuration
AGENT_INTELLIGENCE_URL=http://localhost:3002
DISCUSSION_ORCHESTRATION_URL=http://localhost:3001
GITHUB_OAUTH_CLIENT_ID=your-github-client-id
GITHUB_OAUTH_CLIENT_SECRET=your-github-client-secret

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# Event Streaming
ENABLE_WEBSOCKET=true
WEBSOCKET_PORT=3003
EVENT_STREAM_BUFFER_SIZE=1000
```

### Security Levels

```typescript
enum SecurityLevel {
  SAFE = 'safe',           // No restrictions, automatic execution
  MODERATE = 'moderate',   // Basic validation, logged execution
  RESTRICTED = 'restricted', // Manual approval required
  DANGEROUS = 'dangerous'   // Admin approval + comprehensive audit
}
```

### Tool Configuration Example

```typescript
{
  "id": "code-analyzer",
  "name": "Code Quality Analyzer",
  "description": "Analyzes code quality and provides improvement suggestions",
  "version": "1.2.0",
  "category": "development",
  "securityLevel": "moderate",
  "parameters": {
    "type": "object",
    "properties": {
      "code": { "type": "string", "description": "Code to analyze" },
      "language": { "type": "string", "enum": ["javascript", "typescript", "python"] },
      "rules": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["code", "language"]
  },
  "executionConfig": {
    "timeout": 15000,
    "memoryLimit": "256MB",
    "cpuLimit": 0.5,
    "networkAccess": false
  },
  "costEstimate": 0.05
}
```

## 🚀 Usage

### Starting the Service

```bash
# Development mode
npm run dev

# Production mode
npm start
```

### API Endpoints

#### Tool Management

```bash
# Get all tools
GET /api/v1/tools

# Get specific tool
GET /api/v1/tools/:id

# Register new tool
POST /api/v1/tools

# Update tool
PUT /api/v1/tools/:id

# Delete tool
DELETE /api/v1/tools/:id

# Search tools
GET /api/v1/tools?search=calculator

# Filter by category
GET /api/v1/tools?category=mathematics

# Filter by tags
GET /api/v1/tools?tags=utility,math
```

#### Tool Execution

```bash
# Execute tool
POST /api/v1/tools/:id/execute
{
  "agentId": "agent-123",
  "parameters": {
    "operation": "add",
    "operands": [5, 3]
  },
  "timeout": 30000,
  "priority": "normal"
}

# Get execution status
GET /api/v1/executions/:id

# Get all executions
GET /api/v1/executions?agentId=agent-123

# Approve execution (if required)
POST /api/v1/executions/:id/approve
{
  "approvedBy": "admin-user"
}

# Cancel execution
POST /api/v1/executions/:id/cancel
```

#### Graph Features

```bash
# Get related tools
GET /api/v1/tools/:id/related?types=ENHANCES,SIMILAR_TO&minStrength=0.5

# Add tool relationship
POST /api/v1/tools/:id/relationships
{
  "toToolId": "target-tool-id",
  "type": "ENHANCES",
  "strength": 0.8,
  "reason": "Tool A enhances Tool B functionality"
}

# Get recommendations
GET /api/v1/tools/recommendations?agentId=agent-123&context=data-analysis&limit=5

# Find similar tools
GET /api/v1/tools/:id/similar?minSimilarity=0.6&limit=5

# Get tool dependencies
GET /api/v1/tools/:id/dependencies
```

#### Analytics

```bash
# Usage analytics
GET /api/v1/analytics/usage?toolId=math-calculator&days=30

# Popular tools
GET /api/v1/analytics/popular?category=utilities&limit=10

# Agent preferences
GET /api/v1/analytics/agent/:agentId/preferences
```

### Tool Registration Example

```javascript
const toolDefinition = {
  id: 'my-custom-tool',
  name: 'My Custom Tool',
  description: 'A custom tool for specific operations',
  version: '1.0.0',
  category: 'custom',
  parameters: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input parameter'
      }
    },
    required: ['input']
  },
  returnType: {
    type: 'object',
    properties: {
      result: { type: 'string' }
    }
  },
  securityLevel: 'safe',
  requiresApproval: false,
  isEnabled: true,
  executionTimeEstimate: 1000,
  costEstimate: 0.01,
  author: 'Your Name',
  tags: ['custom', 'utility'],
  dependencies: [],
  examples: [
    {
      description: 'Basic usage',
      parameters: { input: 'test' },
      expectedResult: { result: 'processed: test' }
    }
  ]
};

// Register the tool
const response = await fetch('/api/v1/tools', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify(toolDefinition)
});
```

### Tool Execution Example

```javascript
// Execute a tool
const execution = await fetch('/api/v1/tools/math-calculator/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify({
    agentId: 'my-agent-id',
    parameters: {
      operation: 'add',
      operands: [10, 5]
    },
    timeout: 5000,
    priority: 'normal'
  })
});

const result = await execution.json();
console.log('Execution result:', result.data.execution);
```

## 🛠️ Development

### Project Structure

```
services/capability-registry/
├── src/
│   ├── config/           # Configuration management
│   ├── controllers/      # REST API controllers
│   ├── routes/          # Express routes
│   ├── services/        # Business logic services
│   ├── scripts/         # Utility scripts (seeding, etc.)
│   └── index.ts         # Main application entry point
├── database/
│   ├── migrations/      # PostgreSQL migrations
│   └── init/           # Neo4j initialization scripts
├── package.json
├── tsconfig.json
└── README.md
```

### Key Services

- **ToolRegistry** - Core tool management and graph operations
- **ToolExecutor** - Tool execution with tracking and retry logic
- **BaseToolExecutor** - Actual tool implementations
- **ToolController** - REST API endpoints
- **ToolDatabase** - PostgreSQL operations (shared service)
- **ToolGraphDatabase** - Neo4j operations (shared service)

### Adding New Tools

1. **Implement the tool logic** in `BaseToolExecutor`
2. **Register the tool** via API or seeding script
3. **Add relationships** to connect with existing tools
4. **Test execution** and monitor usage patterns

### Database Schema

#### PostgreSQL Tables
- `tools` - Tool definitions and metadata
- `tool_executions` - Execution records and results
- `tool_usage` - Usage statistics and patterns
- `tool_approvals` - Approval workflow records

#### Neo4j Graph Schema
- `Tool` nodes with properties
- Relationship types: `DEPENDS_ON`, `SIMILAR_TO`, `REPLACES`, `ENHANCES`, `REQUIRES`
- `Agent` nodes for usage tracking
- `Context` nodes for contextual recommendations

## 🔒 Security

### Security Levels
- **Safe** - No restrictions, auto-approved
- **Moderate** - Basic validation, may require approval
- **Restricted** - Requires approval, limited access
- **Dangerous** - Strict approval process, audit logging

### Authentication
- JWT-based authentication for protected endpoints
- Rate limiting to prevent abuse
- Request validation using Zod schemas

### Approval Workflow
Tools marked with `requiresApproval: true` will:
1. Create execution record with `approval-required` status
2. Wait for admin approval via `/executions/:id/approve`
3. Execute after approval is granted

## 📊 Monitoring

### Health Checks
```bash
# Service health
GET /api/v1/health

# Database connectivity
GET /api/v1/health
```

### Metrics
- Tool execution success/failure rates
- Average execution times
- Cost tracking and limits
- Usage patterns and trends
- Popular tools and categories

### Logging
- Structured logging with request IDs
- Execution tracking and audit trails
- Error categorization and recovery
- Performance monitoring

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## 🚀 Deployment

### Docker Support
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3003
CMD ["node", "dist/index.js"]
```

### Environment Setup
1. Set up PostgreSQL database
2. Set up Neo4j instance
3. Run migrations: `npm run db:migrate`
4. Seed tools: `npm run db:seed`
5. Start service: `npm start`

## Performance Metrics

### Response Time Targets
- Tool discovery: < 50ms
- Tool execution: < 5000ms (varies by tool)
- Recommendations: < 200ms
- Analytics queries: < 500ms

### Throughput Targets
- Tool executions per second: 2000+
- Concurrent executions: 1000+
- Discovery requests per second: 5000+

## Monitoring

### Health Checks

```bash
# Service health
GET /health

# Database connectivity
GET /health/database

# Neo4j connectivity
GET /health/neo4j

# Execution engine status
GET /health/execution-engine
```

### Metrics

The service exposes Prometheus metrics:

- `capability_registry_tool_executions_total`
- `capability_registry_execution_duration`
- `capability_registry_active_executions`
- `capability_registry_discovery_requests_total`
- `capability_registry_recommendation_accuracy`
- `capability_registry_sandbox_resource_usage`

## Troubleshooting

### Common Issues

#### Tool Execution Failures
```bash
# Check execution logs
GET /api/v1/executions/:id

# Review execution environment
GET /api/v1/tools/:id/execution-config

# Test tool in safe mode
POST /api/v1/tools/:id/test
```

#### Performance Issues
```bash
# Monitor active executions
GET /api/v1/analytics/performance

# Check resource usage
GET /health/execution-engine

# Review database performance
GET /health/database
```

#### Discovery Problems
```bash
# Test search functionality
GET /api/v1/tools/search?q=test

# Check Neo4j connectivity
GET /health/neo4j

# Rebuild recommendation cache
POST /api/v1/admin/rebuild-cache
```

## Event Runner Integration

This service implements the Sandboxed Event Runner vision outlined in [eventrunner.md](../eventrunner.md):

### Sandboxed Execution
- **Resource Constraints**: Memory, CPU, and network limits per security level
- **Security Isolation**: Containerized execution with permission controls
- **Real-time Monitoring**: Live execution tracking and resource usage

### Event Streaming
- **WebSocket Support**: Real-time execution updates
- **Event-Driven Architecture**: Asynchronous result processing
- **Frontend Integration**: Dashboard-ready event streams

### Workflow Orchestration
- **Multi-Tool Workflows**: Sequential and parallel tool execution
- **Conditional Logic**: Branch execution based on results
- **Error Recovery**: Automatic retry and compensation strategies

### Community Features
- **GitHub Integration**: OAuth-based tool sharing
- **Collaborative Development**: Community-driven tool creation
- **Automated Testing**: Security and functionality validation

## Contributing

1. Follow the [Service Alignment Guide](../SERVICE_ALIGNMENT_GUIDE.md)
2. Use monorepo workspace imports (`@uaip/*`)
3. Implement proper sandbox security
4. Add comprehensive tests for new tools
5. Update documentation for API changes
6. Follow the Event Runner patterns for new features

## License

MIT License - see [LICENSE](../../LICENSE) for details.
5. Update documentation

## 📝 License

Part of the UAIP backend monorepo. See main repository for license information. 