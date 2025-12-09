# Council of Nycea - Unified Agent Intelligence Platform (UAIP)

**Version**: 2.0 - Production Ready Backend  
**Status**: Backend 100% Complete ✅ | Frontend Integration 60% Complete 🔄  
**Last Updated**: January 2025

## 🎯 Overview

The **Unified Agent Intelligence Platform (UAIP)** is a production-ready backend infrastructure for multi-agent collaboration, intelligent discussion orchestration, and capability-driven automation. The system provides a comprehensive foundation for building AI-powered collaborative platforms.

### Key Capabilities

- **Multi-Agent Collaboration**: Sophisticated agent personas with contextual awareness
- **Real-time Discussion Management**: WebSocket-based collaborative discussions
- **Intelligent Tool Execution**: Sandboxed capability registry with security controls
- **Knowledge Graph Integration**: Neo4j-powered relationship mapping and recommendations
- **Enterprise Security**: Complete RBAC, audit trails, and approval workflows

## 🏗️ System Architecture

### Backend Services (All Operational ✅)

- **Agent Intelligence Service** (Port 3001) - Context analysis, persona management
- **Orchestration Pipeline Service** (Port 3002) - Workflow coordination, operation management
- **Capability Registry Service** (Port 3003) - Tool management, sandboxed execution
- **Security Gateway Service** (Port 3004) - Authentication, authorization, auditing
- **Discussion Orchestration Service** (Port 3005) - Real-time collaborative discussions
- **API Gateway** (Port 8081) - Centralized routing, rate limiting, documentation

### Infrastructure (All Operational ✅)

- **PostgreSQL** (Port 5432) - Primary database with complete schema
- **Neo4j** (Port 7474/7687) - Graph database for relationships
- **Redis** (Port 6379) - Caching and session management
- **RabbitMQ** (Port 5672) - Event-driven communication

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20.x
- Docker & Docker Compose
- Git

### Basic Setup

```bash
# Clone repository
git clone <repository-url>
cd council-of-nycea

# Install dependencies
npm install
cd backend && pnpm install

# Start infrastructure services
docker-compose up -d

# Start backend services
npm run dev:backend

# Start frontend
npm run dev:frontend
```

### Access Points

- Frontend: http://localhost:3000
- API Gateway: http://localhost:8081
- API Documentation: http://localhost:8081/docs
- Monitoring Dashboard: http://localhost:3000 (admin/admin)

## 📚 Documentation Structure

### Core Documentation

- [Development Setup](DEVELOPMENT.md) - Complete development environment setup
- [Architecture](ARCHITECTURE.md) - System design and technical specifications
- [API Reference](API_REFERENCE.md) - API documentation and usage
- [Deployment](DEPLOYMENT.md) - Deployment and operations guide

### Technical Guides

- [Security](../technical/SECURITY.md) - Security implementation details
- [Integration](../technical/INTEGRATION.md) - Service integration patterns
- [Database](../technical/DATABASE.md) - Data models and schema
- [Testing](../technical/TESTING.md) - Testing strategies and tools
- [Performance](../technical/PERFORMANCE.md) - Optimization and monitoring

### Feature Documentation

- [Agents](../features/AGENTS.md) - Agent system and personas
- [Capabilities](../features/CAPABILITIES.md) - Tool registry and execution
- [Discussions](../features/DISCUSSIONS.md) - Real-time collaboration
- [Artifacts](../features/ARTIFACTS.md) - Generation systems
- [UI Components](../features/UI_COMPONENTS.md) - Frontend architecture

### Project Management

- [Changelog](../project/CHANGELOG.md) - Version history
- [Contributing](../project/CONTRIBUTING.md) - Contribution guidelines
- [Roadmap](../project/ROADMAP.md) - Future plans
- [Migration Guide](../project/MIGRATION_GUIDE.md) - Migration paths
- [Troubleshooting](../project/TROUBLESHOOTING.md) - Common issues

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](../project/CONTRIBUTING.md) for guidelines and standards.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
