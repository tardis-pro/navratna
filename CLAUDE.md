# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Council of Nycea is a **Unified Agent Intelligence Platform (UAIP)** - a production-ready backend infrastructure for multi-agent collaboration, intelligent discussion orchestration, and capability-driven automation. The system uses a microservices architecture with a hybrid database strategy and event-driven communication.

## Development Notes

- You use puppeteer on 5173 always
- Its running in docker compose is hotreloading
- You are in pnpm workspace, always think global, extend configs, no private local thing unless explicitly required or deemed necessary

## Common Development Commands

### Start Development Environment
```bash
# Full system (takes ~2 minutes to start)
npm run dev

# Infrastructure only (databases, message queue)
./dev-start.sh --services infrastructure --daemon

# Backend services only
npm run dev:backend

# Frontend only  
npm run dev:frontend

# Minimal development (core services only)
cd backend && npm run dev:minimal
```

### Build Commands
```bash
# Build everything (shared packages, backend, frontend)
npm run build

# Build shared packages first (required before backend)
npm run build:shared

# Build backend services
npm run build:backend

# Build frontend
npm run build:frontend
```

### Testing
```bash
# Run all tests across packages
npm test

# Test specific packages
cd backend/shared/middleware && npm test  # Middleware tests (132 tests)
cd backend/shared/services && npm test   # Services tests

# Test artifact generation system
npm run test:artifacts

# Test specific artifact types
npm run test:artifacts:prd
npm run test:artifacts:code
```

**Test Coverage Status:**
- ✅ **Middleware Package**: Complete test suite with 8 test suites and 132 passing tests
  - Authentication & authorization middleware
  - Error handling and transformation
  - Request validation with Zod schemas  
  - Rate limiting functionality
  - Request/response logging
  - Prometheus metrics collection
  - Agent validation and transformation logic

### Linting
```bash
# Lint all packages
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

## Architecture Overview

### Monorepo Structure
This is a **TypeScript monorepo** managed with pnpm workspaces:

```
council-of-nycea/
├── apps/frontend/              # React frontend (port 3000)
├── packages/                   # Shared packages
│   ├── shared-types/          # @uaip/types
│   └── shared-utils/          # @uaip/utils  
├── backend/
│   ├── services/              # 7 microservices (ports 3001-3005)
│   │   ├── agent-intelligence/
│   │   ├── capability-registry/
│   │   ├── artifact-service/
│   │   ├── security-gateway/
│   │   ├── llm-service/
│   │   ├── orchestration-pipeline/
│   │   └── discussion-orchestration/
│   └── shared/                # Backend shared libraries
│       ├── services/          # @uaip/shared-services
│       ├── middleware/        # @uaip/middleware
│       ├── llm-service/       # @uaip/llm-service
│       └── config/            # @uaip/config
```

### Core Services
- **Agent Intelligence** (3001) - Modular AI agent management with 6 specialized microservices, context analysis, persona handling
- **Orchestration Pipeline** (3002) - Workflow coordination, operation management, tool execution orchestration
- **Capability Registry** (3003) - Tool management, sandboxed execution, enterprise tool adapters (Jira, Confluence, Slack)
- **Security Gateway** (3004) - Authentication, authorization, OAuth providers, MFA, agent security dashboard
- **Discussion Orchestration** (3005) - Event-driven real-time collaborative discussions via WebSocket
- **LLM Service** (llm-service) - Multi-provider LLM integration (OpenAI, Anthropic, Ollama) with MCP protocol support
- **Artifact Service** (artifact-service) - Code generation, documentation, PRD creation

### Database Architecture
- **PostgreSQL** (port 5432) - Primary database with TypeORM entities
- **Neo4j** (port 7474/7687) - Graph database for agent relationships and recommendations  
- **Redis** (port 6379) - Caching, sessions, pub/sub
- **RabbitMQ** (port 5672) - Event-driven messaging between services

## Import Patterns (Critical)

**This is a monorepo** - always use workspace imports, never relative paths across packages.

### ✅ Correct monorepo imports:
```typescript
// Cross-package imports
import { Operation } from '@uaip/types/operation';
import { logger } from '@uaip/utils/logger';
import { DatabaseService } from '@uaip/shared-services/databaseService';

// Local imports within a service
import { config } from '@/config/config';
import { AgentService } from '@/services/agentService';
```

### ❌ Never use relative paths across packages:
```typescript
// DON'T DO THIS
import { Operation } from '../../../shared/types/src/operation';
import { logger } from '../../../shared/utils/src/logger';
```

## Build Dependencies 

**Build order matters** - shared packages must be built before services that depend on them:

1. `npm run build:shared` - Build packages/shared-types, packages/shared-utils, backend/shared/*
2. `npm run build:backend` - Build backend services  
3. `npm run build:frontend` - Build React frontend

## Key Technologies

- **Runtime**: Node.js 18+ with ES Modules
- **Language**: TypeScript (ES2022 target)
- **Backend**: Express.js with comprehensive middleware stack
- **Frontend**: React with Vite, TypeScript, Tailwind CSS, shadcn/ui components
- **Database**: TypeORM with PostgreSQL, Neo4j for graph data
- **Real-time**: WebSocket for agent discussions and live updates
- **Validation**: Zod schemas for runtime validation
- **Testing**: Jest with TypeScript support, comprehensive mocking system
- **Package Manager**: pnpm with workspace support

## Development Workflow

1. **Start infrastructure**: `./dev-start.sh --services infrastructure --daemon` (wait ~30 seconds)
2. **Start backend**: `npm run dev:backend` (ports 3001-3005) 
3. **Start frontend**: `npm run dev:frontend` (port 3000)
4. **Access system**: Frontend at http://localhost:3000, API docs at http://localhost:8081/docs

For focused development, use minimal services: `cd backend && npm run dev:minimal`

## Testing Access

- Default admin credentials: `admin/admin`
- API Gateway: http://localhost:8081
- Health checks: http://localhost:8081/health
- Frontend: http://localhost:3000

## Key Patterns

- **Security**: All requests go through Security Gateway for auth/authz with MFA and OAuth integration
- **Events**: RabbitMQ for async communication between services with event-driven discussion flows
- **Real-time**: Enterprise WebSocket connections for agent discussions and live security monitoring
- **Caching**: Redis for API responses, sessions, and real-time data with performance optimization
- **Audit**: Comprehensive audit trails for all operations with security dashboard visualization
- **Sandboxing**: Secure tool execution in Capability Registry with enterprise tool adapters
- **Multi-agent**: Sophisticated agent personas with modular microservice architecture (6 specialized services)
- **MCP Integration**: Model Context Protocol support for enhanced AI reasoning and tool capabilities
- **Tool Execution**: Unified tool execution service across all microservices for consistent patterns
- **Enhanced Agents**: Tool attachment system with real-time execution during conversations
- **Knowledge Separation**: User knowledge (Security Gateway) vs Agent knowledge (Agent Intelligence) architecture
- **Chat Capabilities**: Configurable agent chat features (knowledge access, tool execution, memory enhancement)
- **CORS Centralization**: All CORS handling at nginx gateway level for simplified security management

## Troubleshooting

- **Port conflicts**: Check ports 3000-3005, 5432, 6379, 7474, 8081
- **Database connection**: Ensure infrastructure started and ready (~30-60 seconds)
- **Memory issues**: System requires minimum 8GB RAM (16GB recommended)
- **Build failures**: Always build shared packages first with `npm run build:shared`
- **Import errors**: Check monorepo import patterns, verify path mappings in tsconfig.json
- **Test failures**: Middleware tests expect proper mock setup; check Jest configuration and workspace imports

## Recent Development Progress

### ✅ Security Components Implementation (Completed)
- **Frontend Security Dashboard**: Complete security management interface
  - **Location**: `apps/frontend/src/components/security/`
  - **Components**: AgentSecurityDashboard, MFASetup, OAuthConnectionsManager
  - **Features**: Real-time security monitoring, MFA configuration, OAuth connection management
  - **Integration**: Full integration with SecurityGateway service endpoints
- **OAuth Provider Service Updates**: Enhanced OAuth integration capabilities
  - **Location**: `backend/services/security-gateway/src/services/oauthProviderService.ts`
  - **Features**: Multi-provider support, token management, connection validation
  - **Providers**: GitHub, Gmail, Zoho, Microsoft, Custom OAuth providers

### ✅ Enterprise Tool Integration (Completed)
- **Enterprise Tool Adapters**: Production-ready integrations for enterprise platforms
  - **Location**: `backend/services/capability-registry/src/adapters/`
  - **Adapters**: Confluence, Jira, Slack enterprise connectors
  - **Features**: Secure API access, data synchronization, workflow automation
- **Enterprise Tool Registry**: Centralized tool management system
  - **Location**: `backend/services/capability-registry/src/services/enterprise-tool-registry.ts`
  - **Features**: Tool discovery, capability registration, usage analytics
  - **Security**: Sandboxed execution with enterprise-grade access controls

### ✅ MCP (Model Context Protocol) Integration (Completed)
- **MCP Server Configuration**: Multi-server MCP integration for enhanced AI capabilities
  - **Location**: `.mcp.json` configuration file
  - **Servers**: thinker, calculator, puppeteer, neo4j integration servers
  - **Features**: Enhanced reasoning, calculations, web automation, graph queries
  - **Benefits**: Extended AI agent capabilities with specialized tool access

### ✅ Tool Execution Service (Completed)
- **Shared Tool Execution Service**: Simplified cross-service tool execution
  - **Location**: `backend/shared/services/src/tool-execution.service.ts`
  - **Features**: Unified tool execution interface, error handling, result formatting
  - **Integration**: Used across agent-intelligence, orchestration-pipeline, and capability-registry
  - **Benefits**: Consistent tool execution patterns, reduced code duplication

### ✅ Event-Driven Discussion Enhancement (Completed)
- **Event-Driven Discussion Service**: Enhanced real-time collaboration capabilities
  - **Location**: `backend/services/discussion-orchestration/src/services/eventDrivenDiscussionService.ts`
  - **Features**: Event-based discussion flow, real-time updates, participant management
- **Enterprise WebSocket Handler**: Production-grade WebSocket management
  - **Location**: `backend/services/discussion-orchestration/src/websocket/enterpriseWebSocketHandler.ts`
  - **Features**: Enterprise security, connection pooling, message routing

### ✅ Middleware Testing Infrastructure (Completed)
- **Complete test suite** for `backend/shared/middleware` package
- **8 test suites** covering all middleware components:
  - `authMiddleware.test.ts` - JWT authentication, role-based access control
  - `errorHandler.test.ts` - Error handling, ApiError processing, Zod validation errors
  - `rateLimiter.test.ts` - Rate limiting with Redis backend
  - `validateRequest.test.ts` - Request validation with Zod schemas
  - `requestLogger.test.ts` - Request/response logging, context preservation
  - `metrics.test.ts` - Prometheus metrics collection and endpoints
  - `agentValidationMiddleware.test.ts` - Agent validation, persona transformation
  - `agentTransformationService.test.ts` - Persona-to-agent format transformation
- **132 passing tests** with comprehensive mocking system
- **Jest configuration** optimized for TypeScript ES modules and workspace imports
- **Mock infrastructure** for `@uaip/utils`, `@uaip/config`, `@uaip/types` packages

### ✅ Persona Management System Enhancement (Completed)
- **Persona Loading Issue Resolution**: Fixed PersonaService categorization logic for proper role-to-category mapping
  - Enhanced `categorizePersonaRole()` function with comprehensive role mappings
  - Added debug logging for categorization troubleshooting
  - Fixed API endpoint usage from `/search` to `/display` for proper categorization
- **AgentManagerPortal Persona Creation**: Implemented full persona creation functionality
  - **Location**: `apps/frontend/src/components/futuristic/portals/AgentManagerPortal.tsx`
  - **Features**: Complete form with name, role, description, background, expertise, tags, system prompt
  - **UI Integration**: "Create Persona" button with purple gradient styling, modal-style form
  - **API Integration**: Full integration with `uaipAPI.personas.create()` endpoint
  - **Navigation**: Proper view mode handling with `create-persona` mode
  - **Validation**: Form validation and error handling with user feedback
- **Backend API Support**: Verified persona creation endpoints are functional
  - **Route**: `POST /api/v1/personas` with authentication middleware
  - **Service**: PersonaService create method with proper validation
  - **Frontend API**: `uaipAPI.personas.create()` method properly integrated

### ✅ Agent Intelligence Service Refactoring (Completed)
- **Monolithic Service Removal**: Successfully removed `enhanced-agent-intelligence.service.ts` (3,044 lines)
- **Modular Architecture Implementation**: Refactored into 6 specialized microservices:
  - **AgentCoreService** (`backend/services/agent-intelligence/src/services/agent-core.service.ts`): CRUD operations for agents
  - **AgentContextService** (`backend/services/agent-intelligence/src/services/agent-context.service.ts`): Context analysis and user intent processing
  - **AgentPlanningService** (`backend/services/agent-intelligence/src/services/agent-planning.service.ts`): Execution plan generation and security validation
  - **AgentLearningService** (`backend/services/agent-intelligence/src/services/agent-learning.service.ts`): Learning from operations and feedback
  - **AgentDiscussionService** (`backend/services/agent-intelligence/src/services/agent-discussion.service.ts`): Discussion participation and chat responses
  - **AgentEventOrchestrator** (`backend/services/agent-intelligence/src/services/agent-event-orchestrator.service.ts`): Event-driven coordination
- **AgentController Refactoring**: Updated `backend/services/agent-intelligence/src/controllers/agentController.ts`
  - Migrated from monolithic service to modular service architecture
  - Fixed all method signatures and service configurations
  - All compilation errors resolved
- **Create Agent Flow Enhancement**: Fixed UI issue in AgentManagerPortal
  - **Location**: `apps/frontend/src/components/futuristic/portals/AgentManagerPortal.tsx:1074-1125`
  - **Problem**: Missing save button after persona selection
  - **Solution**: Added persona confirmation section with "Create Agent" button
  - **UX**: Users can now review selected persona before final agent creation
- **Benefits Achieved**: 
  - **Maintainability**: Each service < 500 lines with single responsibility
  - **Scalability**: Services can scale independently  
  - **Testability**: Focused unit testing per service
  - **Reliability**: Better failure isolation
  - **Code Quality**: Eliminated massive monolithic service

### ✅ Enhanced Agent Functionality & Tool Integration (Completed)
- **Tool Attachment to Agents**: Full tool attachment system during agent creation and updates
  - **Backend Implementation**: `backend/services/agent-intelligence/src/controllers/agentController.ts`
  - **Schema Enhancement**: Updated `@uaip/types` AgentCreateRequestSchema with `attachedTools` field
  - **Features**: Tool selection with permissions, category-based organization, validation and security
  - **API Integration**: Tools automatically attached during agent creation with proper event publishing
- **Enhanced Chat Functionality**: All agent functions available during conversations
  - **Real-time Tool Execution**: Agents can execute tools mid-conversation with permission validation
  - **Knowledge Access**: Agents access user knowledge base during chat interactions
  - **Memory Enhancement**: Conversation history and learning integration in real-time
  - **Context Analysis**: Agents analyze user intent and generate execution plans during chat
- **Chat Configuration System**: Fine-grained control over agent chat capabilities
  - **Configuration Options**: Knowledge access, tool execution, memory enhancement toggles
  - **Performance Settings**: Max concurrent chats, conversation timeouts, resource management
  - **Security**: Permission-based tool execution with comprehensive validation
- **Knowledge Routes Architecture**: Proper separation of user vs agent knowledge operations
  - **User Knowledge**: Security Gateway handles user document upload/search (`/api/v1/knowledge`)
  - **Agent Knowledge**: Agent Intelligence handles agent-specific knowledge operations during conversations
  - **CORS Centralization**: All CORS handling moved to nginx gateway, removed from individual services
- **UI Components Enhancement**: Complete frontend support for enhanced agent functionality
  - **AgentManagerPortal Updates**: Tool attachment section with interactive tool selection grid
  - **Chat Configuration UI**: Toggles for capabilities, performance settings, visual feedback
  - **ChatPortal Enhancements**: Real-time tool execution indicators, capability displays, enhanced metadata
  - **Tool Execution Visualization**: Success/failure indicators, execution timelines, result summaries
- **Code Quality & Integration**:
  - **Type Safety**: Full TypeScript integration with Zod validation schemas
  - **Error Handling**: Comprehensive error handling for tool execution and chat operations
  - **Event-Driven**: Tool attachment and chat operations publish events for system coordination
  - **Backwards Compatibility**: All existing functionality preserved while adding enhancements

**Benefits Achieved**:
- **Enhanced User Experience**: Seamless tool integration during conversations with visual feedback
- **Flexible Configuration**: Granular control over agent capabilities and performance settings
- **Real-time Capabilities**: Agents can access knowledge, execute tools, and learn during conversations
- **Security & Permissions**: Comprehensive permission system for tool execution and resource access
- **Scalable Architecture**: Tool attachment and chat enhancements scale with existing microservice infrastructure

## Enhanced Agent Usage Examples

### Creating Agents with Tool Attachment

```typescript
// Create agent with tools and enhanced chat capabilities
POST /api/v1/agents
{
  "name": "Research Assistant",
  "description": "AI agent for research and analysis",
  "capabilities": ["research", "analysis", "documentation"],
  "personaId": "persona-123",
  "attachedTools": [
    {
      "toolId": "web-search",
      "toolName": "Web Search",
      "category": "search",
      "permissions": ["execute", "read"]
    },
    {
      "toolId": "document-analyzer", 
      "toolName": "Document Analyzer",
      "category": "analysis",
      "permissions": ["execute", "read", "write"]
    }
  ],
  "chatConfig": {
    "enableKnowledgeAccess": true,
    "enableToolExecution": true,
    "enableMemoryEnhancement": true,
    "maxConcurrentChats": 3,
    "conversationTimeout": 3600000
  }
}
```

### Enhanced Chat with Tool Execution

```typescript
// Chat with full agent capabilities
POST /api/v1/agents/:agentId/chat
{
  "message": "Research the latest trends in AI and create a summary document",
  "conversationHistory": [
    {
      "content": "Hello, I need help with research",
      "sender": "user",
      "timestamp": "2024-01-01T10:00:00Z"
    }
  ],
  "context": {
    "domain": "technology", 
    "urgency": "high",
    "outputFormat": "document"
  }
}

// Response includes tool execution results
{
  "success": true,
  "data": {
    "response": "I've researched the latest AI trends and created a comprehensive summary document...",
    "agentName": "Research Assistant",
    "confidence": 0.92,
    "toolsExecuted": [
      {
        "toolId": "web-search",
        "toolName": "Web Search",
        "success": true,
        "result": "Found 15 relevant articles",
        "timestamp": "2024-01-01T10:01:00Z"
      },
      {
        "toolId": "document-analyzer",
        "toolName": "Document Analyzer", 
        "success": true,
        "result": "Generated 3-page summary document",
        "timestamp": "2024-01-01T10:02:00Z"
      }
    ],
    "memoryEnhanced": true,
    "knowledgeUsed": 2.5
  }
}
```

### Knowledge Routes Usage

```typescript
// User Knowledge Management (Security Gateway)
POST /api/v1/knowledge
{
  "title": "Project Documentation",
  "content": "Full project specifications...",
  "tags": ["project", "documentation", "requirements"]
}

// Agent Knowledge Access (during chat - automatic)
// Agents automatically access user knowledge when relevant
// No direct API calls needed - handled internally during conversations
```

### UI Integration Examples

**Agent Creation with Tools:**
- Interactive tool selection grid with categories
- Real-time tool attachment/detachment
- Chat capability configuration toggles
- Visual feedback for attached tools

**Enhanced Chat Interface:**
- Real-time tool execution indicators
- Success/failure visual feedback  
- Agent capability badges
- Tool execution timeline display

**Agent Capabilities Display:**
- Knowledge access indicator
- Tool execution status
- Memory enhancement status
- Enhanced agent badge

## Important File Changes

### Backend Schema & Type Changes
- **`packages/shared-types/src/agent.ts`**: Enhanced `AgentCreateRequestSchema` with tool attachment and chat configuration support
- **`backend/services/agent-intelligence/src/controllers/agentController.ts`**: Added tool attachment, chat configuration, and enhanced chat capabilities
- **`backend/services/agent-intelligence/src/services/agent-core.service.ts`**: Core agent operations with tool integration support

### Frontend UI Enhancements  
- **`apps/frontend/src/components/futuristic/portals/AgentManagerPortal.tsx`**: Tool attachment UI and chat configuration interface
- **`apps/frontend/src/components/futuristic/portals/ChatPortal.tsx`**: Enhanced chat with tool execution visualization and capability displays

### Configuration & Routing
- **`api-gateway/nginx.conf`**: CORS centralization and knowledge routes properly configured
- **All backend services**: Removed individual CORS middleware in favor of nginx centralization

### Knowledge Architecture
- **Security Gateway**: User knowledge management routes (`/api/v1/knowledge`)
- **Agent Intelligence**: Agent-specific knowledge operations during conversations (internal)```