# Capability Registry Service

Enhanced tools system with hybrid PostgreSQL + Neo4j architecture for the UAIP backend monorepo.

## 🚀 Features

### Core Capabilities
- **Tool Registration & Management** - Register, update, and manage tool definitions
- **Tool Execution with Tracking** - Execute tools with comprehensive logging and monitoring
- **Graph-based Relationships** - Model tool relationships using Neo4j for smart recommendations
- **Usage Analytics** - Track tool usage patterns and generate insights
- **Approval Workflows** - Security controls for sensitive tool executions
- **Smart Recommendations** - AI-powered tool suggestions based on usage patterns

### Enhanced Features
- **Hybrid Database Architecture** - PostgreSQL for structured data + Neo4j for relationships
- **Real-time Usage Tracking** - Monitor tool performance and usage patterns
- **Security Levels** - Granular security controls (safe, moderate, restricted, dangerous)
- **Cost Tracking** - Monitor and limit tool execution costs
- **Retry Mechanisms** - Automatic retry for recoverable failures
- **Rate Limiting** - Protect against abuse with configurable rate limits

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │     Neo4j       │
│                 │    │                 │
│ • Tool Defs     │    │ • Relationships │
│ • Executions    │    │ • Usage Patterns│
│ • Usage Logs    │    │ • Recommendations│
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
         ┌─────────────────┐
         │ Tool Registry   │
         │                 │
         │ • Registration  │
         │ • Discovery     │
         │ • Execution     │
         │ • Analytics     │
         └─────────────────┘
                     │
         ┌─────────────────┐
         │   REST API      │
         │                 │
         │ • CRUD Ops      │
         │ • Execution     │
         │ • Analytics     │
         │ • Relationships │
         └─────────────────┘
```

## 📦 Installation

```bash
# Install dependencies
npm install

# Build the service
npm run build

# Run database migrations
npm run db:migrate

# Seed with sample tools (optional)
npm run db:seed
```

## 🔧 Configuration

Environment variables:

```bash
# Service Configuration
PORT=3003

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

# Tool Configuration
TOOL_EXECUTION_TIMEOUT=30000
MAX_CONCURRENT_EXECUTIONS=10
DEFAULT_COST_LIMIT=100.0

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
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

## 📈 Performance

### Optimization Features
- Connection pooling for both databases
- Query optimization and indexing
- Caching for frequently accessed tools
- Async execution with timeout handling
- Rate limiting and throttling

### Scalability
- Horizontal scaling support
- Database connection management
- Stateless service design
- Event-driven architecture ready

## 🤝 Contributing

1. Follow the monorepo patterns
2. Use shared services for database operations
3. Implement proper error handling
4. Add comprehensive tests
5. Update documentation

## 📝 License

Part of the UAIP backend monorepo. See main repository for license information. 