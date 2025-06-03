# Council of Nycea

A sophisticated multi-agent discussion platform that enables AI agents with distinct personas to engage in structured conversations, debates, and collaborative problem-solving. The platform has evolved into a comprehensive **Unified Agent Intelligence Platform (UAIP)** with full-stack capabilities including backend services, API integration, and advanced agent tooling.

## 🎯 Vision

Council of Nycea transforms AI agents from simple chatbots into autonomous actors capable of:
- Engaging in nuanced, multi-perspective discussions with dynamic persona interactions
- Using external tools and APIs to gather information and perform real-world tasks
- Collaborating on complex problems with human-like reasoning patterns
- Generating actionable insights, artifacts, and deliverables
- Operating within a secure, scalable backend infrastructure

## 🏗️ Current Architecture

### Frontend (React + TypeScript)
- **Agent System**: Multi-persona agents with distinct roles, expertise, and conversation patterns
- **Discussion Manager**: Orchestrates turn-based conversations with intelligent flow control
- **Context Management**: Maintains conversation history and document context
- **UI Framework**: Real-time discussion visualization with agent status indicators
- **Artifact Generation**: Automated document creation (PRDs, technical specs, reports)

### Backend (UAIP - Unified Agent Intelligence Platform)
- **Monorepo Architecture**: Scalable microservices with shared packages and TypeScript project references
- **Agent Intelligence Service** (Port 3001): Core agent coordination and persona intelligence
- **Orchestration Pipeline Service** (Port 3002): Multi-agent discussion orchestration and operation management
- **API Gateway**: Unified routing, authentication, and rate limiting
- **Security Gateway**: Permission management, risk assessment, and audit logging
- **Capability Registry**: Tool discovery, validation, and context-aware recommendations

### Infrastructure & DevOps
- **Docker Compose**: Complete containerized development environment
- **Database Integration**: Hybrid PostgreSQL/Neo4j for relational and graph data
- **Monitoring**: Comprehensive logging, metrics, and performance tracking
- **CI/CD Pipeline**: Automated testing, building, and deployment

## 🚀 Recent Major Developments

### ✅ Completed Features

#### Backend Integration (Epic 1) - COMPLETED
- ✅ RESTful API endpoints for agent management and discussion lifecycle
- ✅ Scalable monorepo architecture with shared TypeScript packages
- ✅ Docker Compose setup with infrastructure services
- ✅ Authentication, authorization, and comprehensive logging
- ✅ Database integration with PostgreSQL and Neo4j support

#### Agent Tool Use Framework (Epic 6) - COMPLETED
- ✅ Comprehensive tool ecosystem for external API integration
- ✅ Security framework with role-based permissions and sandboxing
- ✅ Cost management with budget tracking and usage monitoring
- ✅ Tool categories: Knowledge & research, development & DevOps, communication, data analytics

#### Artifact Generation and DevOps (Epic 4) - COMPLETED
- ✅ Automated document generation (PRDs, technical specs, reports)
- ✅ CI/CD pipeline integration for deployment automation
- ✅ Version control and artifact management
- ✅ DevOps integration with monitoring and logging

#### Enhanced Conversation System - COMPLETED
- ✅ Dynamic persona interactions with enhanced conversation intelligence
- ✅ Streamlined backend architecture with shared middleware
- ✅ Real-time discussion orchestration with WebSocket support
- ✅ Advanced sentiment analysis and logical fallacy detection

### 🚧 In Progress

#### UAIP Core Components (80% Complete)
- **Event Bus**: Event publishing, subscription, and history tracking
- **Capability Registry**: Tool discovery with advanced search and recommendations
- **Security Gateway**: Risk assessment, approval workflows, and audit trails
- **Execution Orchestrator**: Operation pipeline with resource management

#### Frontend-Backend Integration
- API integration for persona and discussion management
- Real-time synchronization between frontend and backend services
- Enhanced error handling and user feedback systems

## 🛠️ Technology Stack

### Frontend
- **Framework**: React + TypeScript + Tailwind CSS
- **State Management**: React Context API with custom hooks
- **UI Components**: shadcn-ui component library
- **Build Tool**: Vite for fast development and building
- **Real-time**: WebSocket integration for live discussions

### Backend (UAIP)
- **Runtime**: Node.js with TypeScript
- **Architecture**: Monorepo with shared packages and project references
- **API**: RESTful endpoints with OpenAPI documentation
- **Database**: PostgreSQL (relational) + Neo4j (graph data)
- **Message Queue**: Event-driven architecture with Redis
- **Containerization**: Docker Compose for development and deployment

### DevOps & Infrastructure
- **Monitoring**: Comprehensive logging and metrics collection
- **Security**: JWT authentication, role-based access control, audit logging
- **Testing**: Unit tests, integration tests, and performance benchmarks
- **Deployment**: Lovable platform integration with custom domain support

## 🚀 Getting Started

### Prerequisites
- Node.js & npm ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- Docker & Docker Compose (for backend services)
- pnpm (recommended for monorepo management)

### Quick Start

#### Frontend Only
```bash
# Clone the repository
git clone <YOUR_GIT_URL>

# Navigate to project directory
cd council-of-nycea

# Install dependencies
npm install

# Start development server
npm run dev
```

#### Full Stack Development
```bash
# Start backend services
cd backend
docker-compose up -d

# Install backend dependencies
pnpm install

# Build shared packages
pnpm run build:shared

# Start backend services
pnpm run dev

# In another terminal, start frontend
cd ..
npm run dev
```

### Development Workflow

**Using Lovable Platform**
- Visit the [Lovable Project](https://lovable.dev/projects/62b3d962-89cd-4d62-9524-c25e5f3e18f8)
- Changes made via Lovable are automatically committed

**Local Development**
- Use the monorepo structure for backend development
- Follow TypeScript project references for proper imports
- Use Docker Compose for local infrastructure services

## 📋 Current Features

### Advanced Agent Management
- ✅ Create agents with custom personas and expertise
- ✅ Dynamic persona interactions and enhanced conversation intelligence
- ✅ Real-time agent status monitoring and performance tracking
- ✅ Persona-aware context analysis and capability discovery

### Sophisticated Discussion Controls
- ✅ Start/pause/resume discussions with state persistence
- ✅ Multiple turn strategies (round-robin, expertise-based, AI-driven)
- ✅ Real-time WebSocket communication
- ✅ Discussion orchestration through backend pipeline

### Document & Artifact Integration
- ✅ Upload and reference documents in discussions
- ✅ Automated artifact generation (PRDs, technical specs, reports)
- ✅ Context-aware conversation flow with document analysis
- ✅ Version control and artifact management

### Enterprise-Grade Backend
- ✅ Scalable microservices architecture
- ✅ Comprehensive API with authentication and rate limiting
- ✅ Database integration with PostgreSQL and Neo4j
- ✅ Security framework with audit logging and risk assessment
- ✅ Monitoring and performance optimization

### Advanced Conversation Features
- ✅ **Enhanced Sentiment Analysis**: Real-time emotional intelligence with improved accuracy
- ✅ **Logical Analysis**: Automatic fallacy detection and reasoning validation
- ✅ **Dynamic Conversation Patterns**: Interruption, build-on, clarification, concern, expertise-driven responses
- ✅ **Thread Management**: Nested conversations and reply chains with persistence

## 🔮 Upcoming Features

### Next Sprint (In Progress)
- **Frontend-Backend Integration**: Complete API integration for all features
- **Real-time Synchronization**: WebSocket-based live updates
- **Enhanced Security**: Advanced authentication and authorization
- **Performance Optimization**: Caching, batching, and resource optimization

### Future Roadmap

#### Knowledge Graph Integration (Epic 2)
- Semantic search capabilities across documents and conversations
- Vector embeddings for intelligent content retrieval
- Integration with external knowledge sources

#### Testing and Documentation (Epic 5)
- Comprehensive testing framework for agent behaviors
- Automated documentation generation
- Performance monitoring and optimization

#### Advanced AI Features
- **Multi-modal Capabilities**: Image, audio, and video processing
- **Long-term Memory**: Persistent agent knowledge and relationship building
- **Learning and Adaptation**: Agents that improve through experience
- **Collaborative Intelligence**: Swarm intelligence for complex problem solving

## 📖 Documentation

- **Backend Documentation**: Comprehensive guides in `/backend/docs/`
- **Epic Documentation**: Detailed planning documents in `/epics/` directory
- **API Documentation**: OpenAPI specifications for all endpoints
- **Type Definitions**: Comprehensive TypeScript interfaces
- **Component Documentation**: Inline documentation for all React components
- **DevOps Guides**: Setup and deployment instructions

## 🤝 Contributing

This project follows a monorepo structure with strict TypeScript project references. Key areas for contribution:

1. **Backend Services**: Extend UAIP microservices and shared packages
2. **Agent Personas**: Create new agent types with unique capabilities
3. **Tool Development**: Build new tools for agent use within the security framework
4. **UI/UX Improvements**: Enhance the discussion interface and user experience
5. **Performance Optimization**: Improve conversation flow and response times
6. **Integration Development**: Connect with external APIs and services

### Development Guidelines
- Follow monorepo import patterns (use `@shared/*` for shared packages)
- Maintain TypeScript project references in tsconfig.json
- Build shared packages before dependent services
- Include comprehensive tests for new features
- Update documentation alongside code changes

## 📄 License

This project is part of the Lovable platform ecosystem. See platform documentation for licensing details.

## 🔗 Links

- **Lovable Project**: https://lovable.dev/projects/62b3d962-89cd-4d62-9524-c25e5f3e18f8
- **Custom Domain Setup**: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
- **Backend Documentation**: `/backend/docs/` for detailed technical documentation
- **API Documentation**: Available at `/backend/api-gateway/docs` when running locally

---

*Council of Nycea - Where AI agents collaborate, debate, and create the future through the power of the Unified Agent Intelligence Platform.*
