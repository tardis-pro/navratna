# Council of Nycea - Unified Agent Intelligence Platform (UAIP)

**Version**: 2.1 - Enhanced Security Implementation
**Status**: Backend 100% Complete ✅ | Enhanced Security ✅ | Frontend Integration 60% Complete 🔄
**Last Updated**: July 2025

## 🎯 Overview

The **Unified Agent Intelligence Platform (UAIP)** is a production-ready backend infrastructure for multi-agent collaboration, intelligent discussion orchestration, and capability-driven automation. The system provides a comprehensive foundation for building AI-powered collaborative platforms.

### Key Capabilities
- **Multi-Agent Collaboration**: Sophisticated agent personas with contextual awareness
- **Real-time Discussion Management**: WebSocket-based collaborative discussions
- **Intelligent Tool Execution**: Sandboxed capability registry with security controls
- **Knowledge Graph Integration**: Neo4j-powered relationship mapping and recommendations
- **Enhanced Security System**: ✅ **NEW** - OAuth integration, agent-specific policies, MFA, risk assessment
- **Enterprise Security**: Complete RBAC, audit trails, and approval workflows

## 🏗️ System Architecture

### Backend Services (All Operational ✅)
- **Agent Intelligence Service** (Port 3001) - Context analysis, persona management
- **Orchestration Pipeline Service** (Port 3002) - Workflow coordination, operation management
- **Capability Registry Service** (Port 3003) - Tool management, sandboxed execution
- **Security Gateway Service** (Port 3004) - ✅ **Enhanced** - OAuth, agent security, MFA, risk assessment
- **Discussion Orchestration Service** (Port 3005) - Real-time collaborative discussions
- **API Gateway** (Port 8081) - Centralized routing, rate limiting, documentation

### Infrastructure (All Operational ✅)
- **PostgreSQL** (Port 5432) - Primary database with complete schema
- **Neo4j** (Port 7474/7687) - Graph database for relationships
- **Redis** (Port 6379) - Caching and session management
- **RabbitMQ** (Port 5672) - Event-driven communication

## 📚 Documentation

- **[Quick Start](docs/QUICK_START.md)** – Setup in minutes
- **[Development Setup](docs/DEVELOPMENT_SETUP.md)** – Local environment & tools
- **[Environment Config](docs/ENVIRONMENT_CONFIG.md)** – Env vars & deployment
- **[System Architecture](docs/ARCHITECTURE.md)** – Design & service overview
- **[Service Integration](docs/SERVICE_INTEGRATION.md)** – Inter-service patterns
- **[API Reference](docs/API_REFERENCE.md)** – Endpoints & usage
- **[Testing Guide](docs/TESTING_GUIDE.md)** – Strategies & examples
- **[Project Status](docs/PROJECT_STATUS.md)** – Roadmap & priorities
- **[Technical Debt](docs/TECH_DEBT.md)** – Known issues
- **[Persona System](docs/PERSONA_SYSTEM.md)** – Agent personas
- **[Capability Registry](docs/CAPABILITY_REGISTRY.md)** – Tool execution
- **[Knowledge Graph](docs/KNOWLEDGE_GRAPH.md)** – Neo4j integration
- **[Enhanced Security](docs/technical/SECURITY.md)** – ✅ **NEW** - OAuth, agent security, MFA

---

**Start with the [Quick Start](docs/QUICK_START.md)**, then see [System Architecture](docs/ARCHITECTURE.md) for design details.

### 🧠 Knowledge Graph & Service Relationships
- **[Knowledge Graph: Agents & Orchestration](docs/ARCHITECTURE.md#🧠-knowledge-graph-agents--orchestration)** – How agents, orchestration, and services are modeled and related

## 🎯 Current Status

### ✅ Completed (Production Ready)
- **Backend Infrastructure**: All 5 microservices operational
- **Security Implementation**: Complete RBAC, JWT, audit trails
- **Database Integration**: Hybrid PostgreSQL/Neo4j with optimized queries
- **API Development**: 50+ endpoints with comprehensive documentation
- **Performance Optimization**: Sub-500ms response times, 2000+ ops/min

### 🔄 In Progress
- **Frontend Integration**: React components and API integration (60% complete)
- **Advanced Features**: Magic layer UI enhancements and productivity features
- **Production Deployment**: Infrastructure automation and monitoring

### ⏳ Planned
- **Mobile Applications**: iOS and Android native apps
- **Advanced Analytics**: ML-powered insights and recommendations
- **Enterprise Features**: Advanced security, compliance, and integration

## 🚀 Quick Start

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd council-of-nycea
   npm install
   ```

2. **Start Infrastructure**
   ```bash
   docker-compose up -d
   ```

3. **Start Backend Services**
   ```bash
   npm run dev:backend
   ```

4. **Start Frontend**
   ```bash
   npm run dev:frontend
   ```

5. **Access the System**
   - Frontend: http://localhost:3000
   - API Gateway: http://localhost:8081
   - Documentation: http://localhost:8081/docs

## 🤝 Contributing

We welcome contributions! Please see our [Development Guide](DEVELOPMENT_GUIDE.md) for coding standards and contribution guidelines.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- **Documentation**: Check the relevant guide in the navigation above
- **Issues**: Open a GitHub issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions and community support

---

**Next Steps**: Start with the [Quick Start Guide](QUICK_START.md) to get the system running, then explore the [System Architecture](ARCHITECTURE.md) to understand the design.

## 🧠 Knowledge Graph: Agents & Orchestration

The UAIP platform uses a Neo4j-powered knowledge graph to model relationships between agents, orchestration services, tools, operations, and discussions. This enables advanced reasoning, recommendations, and workflow automation.

- **Key Entities**: Agent Intelligence, Orchestration Pipeline, Discussion Orchestration, UAIP Platform, LLM Intelligence
- **Relationships**: Service integration, workflow coordination, persona management, tool usage, and more
- **Example Patterns**: (Agent)-[:USES]->(Tool), (Agent)-[:PARTICIPATES_IN]->(Discussion), (Service)-[:INTEGRATES_WITH]->(Service)

See [Architecture](docs/ARCHITECTURE.md#🧠-knowledge-graph-agents--orchestration), [Service Integration](docs/SERVICE_INTEGRATION.md), and [API Reference](docs/API_REFERENCE.md) for details. 