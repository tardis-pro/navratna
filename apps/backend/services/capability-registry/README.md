# Capability Registry Service

## Overview

The Capability Registry is the execution backbone of the UAIP platform, providing secure, monitored, and scalable execution of tools and capabilities through its Event Runner core. It seamlessly integrates with the Discussion Orchestration and Agent Intelligence services to enable real-time workflows, intelligent agent interactions, and collaborative discussions enhanced by dynamic tool execution.

## Features

- **🏃 Event Runner Engine**
  - Sandboxed execution with Firecracker micro-VMs
  - Resource monitoring and constraints
  - Real-time execution streaming
  - Multi-tool workflow orchestration

- **🔒 Security & Compliance**
  - Security level validation
  - Approval workflows
  - Audit logging
  - Resource limits

- **🔍 Tool Discovery**
  - Graph-based relationships (Neo4j)
  - Intelligent recommendations
  - Context-aware search
  - Usage pattern learning

- **📊 Real-time Monitoring**
  - WebSocket event streaming
  - Prometheus metrics
  - Health monitoring
  - Cost tracking

- **🤝 Community Integration**
  - GitHub-based tool sharing
  - Collaborative development
  - Review workflows
  - Attribution tracking

## Quick Start

### Prerequisites

- Node.js >= 18.x
- Docker & Docker Compose
- PostgreSQL 14+
- Neo4j 4.4+
- Redis 6+

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/uaip-platform.git
cd uaip-platform/backend/services/capability-registry

# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Start databases
docker-compose up -d postgres neo4j redis

# Run migrations
npm run db:migrate

# Start development server
npm run dev
```

The service will be available at `http://localhost:3003`.

## API Endpoints

### Tool Management

- `GET /api/v1/tools` - List all tools
- `POST /api/v1/tools` - Register new tool
- `GET /api/v1/tools/:id` - Get tool details
- `PUT /api/v1/tools/:id` - Update tool
- `DELETE /api/v1/tools/:id` - Delete tool

### Tool Execution

- `POST /api/v1/tools/:id/execute` - Execute tool
- `GET /api/v1/executions/:id` - Get execution status
- `POST /api/v1/executions/:id/cancel` - Cancel execution

### Discovery & Recommendations

- `GET /api/v1/tools/search` - Search tools
- `GET /api/v1/tools/recommendations` - Get recommendations
- `GET /api/v1/tools/:id/related` - Get related tools

### Analytics & Monitoring

- `GET /api/v1/analytics/usage` - Usage statistics
- `GET /api/v1/analytics/performance` - Performance metrics
- `GET /api/v1/health` - Service health status

For detailed API documentation, see [API_REFERENCE.md](./API_REFERENCE.md).

## Configuration

### Environment Variables

```bash
# Service
PORT=3003
NODE_ENV=development
LOG_LEVEL=info

# PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=capability_registry
PG_USER=postgres
PG_PASSWORD=postgres

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Redis
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-secret-key
ENABLE_APPROVAL_WORKFLOW=false
DEFAULT_SECURITY_LEVEL=safe

# Integration
AGENT_INTELLIGENCE_URL=http://localhost:3002
DISCUSSION_ORCHESTRATION_URL=http://localhost:3001
```

For detailed configuration options, see the [Configuration Guide](./docs/configuration.md).

## Integration

### With Discussion Orchestration

Enables tool execution in discussion context:

```typescript
// Execute tool in discussion
const execution = await capabilityRegistry.executeTool({
  toolId: 'code-analyzer',
  parameters: { code: discussionContext.code },
  discussionId: 'disc-123',
});
```

### With Agent Intelligence

Provides tool discovery and execution for agents:

```typescript
// Agent discovers tools
const tools = await capabilityRegistry.discoverTools({
  agentId: 'agent-123',
  context: 'code analysis',
  capabilities: ['programming'],
});
```

## Documentation

- [Architecture](./ARCHITECTURE.md) - Technical architecture and design
- [API Reference](./API_REFERENCE.md) - Detailed API documentation
- [Development Guide](./DEVELOPMENT.md) - Development setup and guidelines
- [Changelog](./CHANGELOG.md) - Version history and changes

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open pull request

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for detailed guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## Support

- 📚 [Documentation Wiki](https://wiki.uaip.org/capability-registry)
- 💬 [Community Chat](https://chat.uaip.org)
- 🐛 [Issue Tracker](https://github.com/your-org/uaip-platform/issues)
- 📧 [Email Support](mailto:support@uaip.org)
