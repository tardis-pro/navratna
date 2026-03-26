# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Council of Nycea is a **Unified Agent Intelligence Platform (UAIP)** - a production-ready backend infrastructure for multi-agent collaboration, intelligent discussion orchestration, and capability-driven automation. The system uses a microservices architecture with a hybrid database strategy and event-driven communication.

## Development Notes

- You use puppeteer on 5173 always
- Its running in docker compose is hotreloading
- You are in an **NX monorepo** with pnpm workspaces — always think global, extend configs, no private local thing unless explicitly required or deemed necessary. NX handles task orchestration and dep-graph build ordering.
- IMPORTANT: ALWAYS SEARCH FOR RELEVANT CODE FOR THE THING YOU ARE DOING, DONT DUPLICATE, USE SHARED INTERFACES. ALWAYS

## Common Development Commands

### Start Development Environment

> All `pnpm dev*` scripts delegate to NX. You can use either form.

```bash
# Full system — NX runs all services in parallel with dep resolution
pnpm dev                                     # = pnpm dev:frontend + pnpm dev:backend via NX

# Infrastructure only (databases)
./dev-start.sh --services infrastructure --daemon

# Backend services only
pnpm dev:backend                             # → nx run-many -t dev --projects=tag:backend-service

# Frontend only
pnpm dev:frontend                            # → nx run @council/frontend:dev

# Single service (NX direct — fastest for focused work)
nx run @uaip/navratna-core:dev               # port 3001
nx run @uaip/navratna-gateway:dev            # port 3002
pnpm --filter @uaip/<service-name> dev       # pnpm alias form
```

### Build Commands

> NX resolves dependency order automatically — no manual sequencing needed.

```bash
# Build everything (NX walks the full dep graph)
pnpm build                   # → nx run-many -t build

# Build shared packages (types → utils → contracts → infra → middleware → …)
pnpm build:shared

# Build backend services (NX ensures shared packages build first)
pnpm build:backend

# Build frontend
pnpm build:frontend
```

### Testing

```bash
# Run all tests across packages
pnpm test

# Test specific packages
cd backend/shared/middleware && pnpm test  # Middleware tests (132 tests)
cd backend/shared/services && pnpm test   # Services tests

# Test artifact generation system
pnpm run test:artifacts

# Test specific artifact types
pnpm run test:artifacts:prd
pnpm run test:artifacts:code
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
# Lint all packages (runs across all workspaces)
pnpm lint

# Auto-fix linting issues
pnpm lint:fix

# Watch mode for linting
pnpm lint:watch
```

## Architecture Overview

### Monorepo Structure

This is a **TypeScript monorepo** managed with **NX + pnpm workspaces** (`nx.json` + `pnpm-workspace.yaml`):

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
- **Neo4j** (port 7474/7687) - Graph database for agent relationships and knowledge graph
- **Qdrant** (port 6333) - Vector database for semantic search and embeddings
- **Redis** (port 6379) - Caching, sessions, pub/sub
- **RabbitMQ** (port 5672) - Event-driven messaging between services

### Knowledge Graph Architecture

The platform implements a **triple-store knowledge architecture** where every knowledge item exists with the same UUID across three specialized systems:

- **PostgreSQL**: Structured data, metadata, relationships, access control
- **Neo4j**: Graph relationships, contextual connections, recommendation algorithms
- **Qdrant**: Vector embeddings, semantic search, similarity matching

**Universal Sync Process:**

```typescript
// Automatic bidirectional synchronization
KnowledgeBootstrapService.runPostSeedSync() → {
  1. Discovers existing data across all systems
  2. Creates unified UUID mapping
  3. Syncs missing items to other systems
  4. Maintains relationship consistency
  5. Generates vector embeddings
}
```

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

NX handles the entire build graph automatically via `dependsOn: ["^build"]` in `nx.json`. Run `pnpm build` (or `nx run-many -t build`) and NX will sequence shared packages → backend services → frontend in the correct order.

To visualise the dep graph: `nx graph`

## Key Technologies

- **Runtime**: Node.js 18+ with ES Modules
- **Language**: TypeScript (ES2022 target)
- **Backend**: Express.js with comprehensive middleware stack
- **Frontend**: React with Vite, TypeScript, Tailwind CSS, shadcn/ui components
- **Database**: TypeORM with PostgreSQL, Neo4j for graph data
- **Real-time**: WebSocket for agent discussions and live updates
- **Validation**: Zod schemas for runtime validation
- **Testing**: Jest with TypeScript support, comprehensive mocking system
- **Package Manager**: pnpm with workspace support, orchestrated by NX

## Development Workflow

1. You are in an EC2 work instance, changes are hot-reloaded automatically
2. Always use Puppeteer on port 5173 for UI testing (Vite dev server)
3. **Access points**:
   - Frontend (dev): http://localhost:5173
   - API Gateway: http://localhost:8081
   - API Documentation: http://localhost:8081/docs
   - Health checks: http://localhost:8081/health

For focused development, start only the services you need: `nx run @uaip/navratna-core:dev` and `nx run @uaip/navratna-gateway:dev`

### Additional Useful Commands

```bash
# SDK Generation
pnpm generate:sdk              # Generate TypeScript SDK from OpenAPI
pnpm generate:sdk:watch        # Watch mode for SDK generation

# Code Formatting
pnpm format                    # Format all files
pnpm format:check              # Check formatting without changes
pnpm format:watch              # Watch mode for formatting

# Integration Testing
pnpm test:integration          # Run all integration tests
pnpm test:integration:oauth    # Test OAuth flows
pnpm test:integration:security # Test security features
pnpm test:integration:coverage # Generate coverage report
```

## Testing Access

- Default admin credentials: `admin/admin`
- Frontend (development): http://localhost:5173
- API Gateway: http://localhost:8081
- API Documentation: http://localhost:8081/docs
- Health checks: http://localhost:8081/health

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
- **Chat History Management**: Comprehensive chat history browser with time-grouped sessions and export capabilities
- **Modal-Based Editing**: Streamlined agent editing without navigation disruption using modal overlays
- **Event-Driven Chat Communication**: Custom events for clear intent separation between new and resume chat actions
- **Window Uniqueness**: Only one chat window per agent with proper focus management and duplicate prevention
- **Universal Knowledge Graph Sync**: Bidirectional synchronization across PostgreSQL, Neo4j, and Qdrant with UUID consistency

## Frontend Architecture

### Technology Stack

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite (development server on port 5173)
- **UI Components**: shadcn/ui component library
- **Styling**: Tailwind CSS
- **API Client**: Centralized in `/apps/frontend/src/utils/api.ts` (2,295 lines - see technical debt plan for refactoring)

### Key Frontend Patterns

- **API Integration**: All API calls go through centralized client with proper error handling
- **Component Structure**: Modular components with clear separation of concerns
- **State Management**: Context-based state for user sessions and authentication
- **Real-time Updates**: WebSocket integration for live discussions and notifications
- **Modal System**: Z-index layering system (modal: 9999, content: 10000, dropdowns: 10003)

### Important Frontend Files

- `/apps/frontend/src/utils/api.ts` - Central API client (needs refactoring into domain-specific modules)
- `/apps/frontend/src/components/DesktopUnified.tsx` - Main desktop interface
- `/apps/frontend/src/components/ChatKnowledgeUploader.tsx` - Multi-platform chat upload
- `/apps/frontend/src/api/knowledge.api.ts` - Knowledge management endpoints

## Recent Session Achievements

### ✅ Universal Knowledge Graph Synchronization System (2025-01-06)

Successfully implemented a comprehensive **bidirectional knowledge synchronization system** that ensures every knowledge item has a consistent UUID across PostgreSQL, Neo4j, and Qdrant:

**🌟 Key Features:**

- **Universal Discovery**: Automatically discovers existing knowledge items across all three systems
- **Bidirectional Sync**: Handles data starting in PostgreSQL → Neo4j + Qdrant, Neo4j → PostgreSQL + Qdrant, or Qdrant → PostgreSQL + Neo4j
- **UUID Consistency**: Every knowledge item maintains the same UUID across all systems
- **Post-Seed Integration**: Runs after database seeding to sync any existing data
- **Forward-Only Design**: No rollbacks - system continues forward and self-improves over time
- **Resilient Architecture**: Continues even if individual systems fail, graceful degradation

**📁 Implementation Files:**

- `/backend/shared/services/src/knowledge-graph/knowledge-sync.service.ts` - Core synchronization logic
- `/backend/shared/services/src/knowledge-graph/bootstrap.service.ts` - Startup and post-seed coordination
- Enhanced `QdrantService` with UUID-based point operations
- Extended `KnowledgeRepository` with bidirectional discovery methods

**🔄 Sync Process:**

1. **Discovery Phase**: Scans PostgreSQL, Neo4j, and Qdrant for existing knowledge items
2. **Universal Mapping**: Creates unified view of which items exist where
3. **Smart Sync**: Only syncs to missing systems (efficient, no duplicates)
4. **Relationship Sync**: Maintains knowledge relationships in Neo4j graph
5. **Vector Embedding**: Generates and stores embeddings in Qdrant with UUID metadata

**🚀 Usage:**

```typescript
// Post-seed synchronization
const bootstrapService = new KnowledgeBootstrapService(dependencies);
await bootstrapService.runPostSeedSync();

// Verify sync status
const status = await bootstrapService.verifyItemSync(itemId);
// Returns: { postgres: true, neo4j: true, qdrant: true, allSynced: true }

// Get sync statistics
const stats = await bootstrapService.getSyncStatistics();
// Returns counts of items synced from each source
```

### ✅ Tool System Architecture Alignment (2025-01-04)

Successfully resolved all build errors and aligned the tool system with the vision of **universal augments for both humans and agents**:

**Key Improvements:**

- **Unified Security Model**: Removed separate `ToolSecurityLevel` enum, aligned all tools to use universal `SecurityLevel` (LOW, MEDIUM, HIGH, CRITICAL)
- **Type System Consolidation**: Fixed `UnifiedToolDefinition` to properly extend base `ToolDefinition` without conflicts
- **Project Management Enhancement**: Added `PAUSED` status to `ProjectStatus`, extended project settings with `allowedTools` array
- **Service Access Improvements**: Added public getter methods to `DatabaseService`, implemented singleton pattern for `EventBusService`
- **Technical Debt Removal**: Eliminated type mismatches, fixed validation schemas, streamlined repository access patterns

**Build Status:** ✅ **All packages now build successfully**

- Shared packages: ✅ Clean builds
- Backend services: ✅ Full compilation success
- Frontend: ✅ Production build ready

### ✅ Unified Knowledge Architecture Implementation (2025-01-07)

Successfully implemented a **unified knowledge system architecture** with clear separation of concerns and complete frontend integration:

**🌟 Key Achievements:**

- **Service Separation**: Clean split between Security Gateway (personal knowledge CRUD) and Agent Intelligence (AI processing)
- **API Route Consolidation**: Eliminated duplicate routes, established clear endpoint responsibilities
- **Production Controller**: Created chatIngestionController.ts with real service integration and comprehensive error handling
- **Frontend Integration**: Fully integrated ChatKnowledgeUploader into DesktopUnified with multiple access methods
- **Modal Management**: Comprehensive z-index layering system for dropdown visibility in complex modal structures
- **Syntax Corrections**: Fixed JSX fragment structure and modal nesting issues

**📁 Implementation Files:**

- `/backend/services/agent-intelligence/src/controllers/chatIngestionController.ts` - Production-ready chat ingestion with job tracking
- `/backend/services/agent-intelligence/src/routes/knowledgeRoutes.ts` - AI-focused knowledge processing routes
- `/backend/services/security-gateway/src/routes/knowledgeRoutes.ts` - Personal knowledge CRUD operations
- `/apps/frontend/src/components/DesktopUnified.tsx` - Enhanced with chat ingestion integration
- `/apps/frontend/src/components/ChatKnowledgeUploader.tsx` - Multi-platform chat upload component
- `/apps/frontend/src/api/knowledge.api.ts` - Extended with chat ingestion endpoints

**🔄 Architecture Pattern:**

```typescript
// Security Gateway: Personal Knowledge Management
GET/POST/PUT/DELETE /api/v1/knowledge/* → User knowledge CRUD
GET /api/v1/knowledge/search → Personal knowledge search
GET /api/v1/knowledge/stats → User knowledge statistics

// Agent Intelligence: AI-Powered Processing
POST /api/v1/knowledge/chat-import → Multi-platform chat ingestion
GET /api/v1/knowledge/chat-jobs/:jobId → Job status tracking
POST /api/v1/knowledge/generate-qa → AI Q&A generation
POST /api/v1/knowledge/extract-workflows → Workflow extraction
GET /api/v1/knowledge/expertise/:participant → Expertise analysis
```

**🚀 Frontend Integration Features:**

- **Multiple Access Methods**: Actions Menu dropdown, keyboard shortcuts (Ctrl+Shift+K), floating action button
- **Z-Index Management**: Comprehensive layering (modal 9999, content 10000, containers 10001-10002, dropdowns 10003)
- **Platform Support**: Claude, ChatGPT, WhatsApp, and generic conversation formats
- **Progress Tracking**: Real-time job status monitoring with detailed progress indicators
- **Processing Options**: Configurable workflow extraction, Q&A generation, expertise analysis, learning detection

### 🎯 Next Steps: Knowledge Graph Evolution

**Immediate Priorities:**

1. **Production Testing**: End-to-end testing of complete chat ingestion pipeline
2. **Performance Optimization**: Load testing and batch processing optimization
3. **Real-time Sync**: Implement real-time knowledge item sync during runtime operations
4. **Conflict Resolution**: Add intelligent merge strategies for conflicting knowledge items
5. **Vector Search Enhancement**: Improve Qdrant similarity search with metadata filtering

**Architecture Goals:**

- **Self-Healing System**: Automatic detection and repair of sync inconsistencies
- **Intelligent Deduplication**: Smart merge of similar knowledge items across systems
- **Graph Analytics**: Neo4j-powered knowledge relationship insights and recommendations
- **Semantic Search**: Advanced vector search with contextual filtering and ranking

## Troubleshooting

- **Port conflicts**: Check ports 3000-3005, 5432, 6379, 6333, 7474, 8081
- **Database connection**: Ensure infrastructure started and ready (~30-60 seconds)
- **Memory issues**: System requires minimum 8GB RAM (16GB recommended)
- **Build failures**: Run `pnpm build:shared` then `pnpm build:backend`. NX caches outputs — if you hit stale cache issues, `nx reset` clears it.
- **Import errors**: Check monorepo import patterns, verify path mappings in tsconfig.json
- **Test failures**: Middleware tests expect proper mock setup; check Jest configuration and workspace imports

### Knowledge Graph Troubleshooting

- **Sync issues**: Check `KnowledgeBootstrapService.getSyncStatistics()` for sync status across systems
- **Qdrant connection**: Verify Qdrant is running on port 6333, check collection initialization
- **Neo4j connection**: Test with `RETURN 1` query, verify port 7687 and authentication
- **Embedding failures**: Check TEI/embedding service availability and dimensions match (default: 768)
- **UUID mismatches**: Run `bootstrapService.verifyItemSync(itemId)` to check consistency
- **Performance issues**: Monitor batch sizes in sync operations, adjust `batchSize` config
  Council of Nycea: Technical Debt Cleanup Plan

  Executive Summary

  Based on comprehensive analysis, the codebase has
  moderate technical debt with excellent
  foundational architecture. Redis and Neo4j are
  fully integrated. The main issues center around
  duplicate patterns, large files, and insufficient
  testing coverage.

  ***

  🔴 Phase 1: Critical Foundation (Weeks 1-2)

  1.1 Service Pattern Consolidation

  Priority: CRITICALImpact: 40% reduction in
  duplicate codeEffort: 1 week

  Tasks:
  - Create BaseService class in
    /backend/shared/services/src/BaseService.ts
  - Consolidate duplicate Express setup patterns
    across 7 services
  - Extract common middleware chains (helmet,
    compression, rate limiting)
  - Standardize graceful shutdown logic

  Files to Refactor:
  - /backend/services/\*/src/index.ts (7 services)
  - /backend/shared/services/src/ (new BaseService)

    1.2 DatabaseService Decomposition ✅ COMPLETED

  Priority: CRITICALImpact: Improved
  maintainability, reduced couplingEffort: 1 week

  Completed Tasks:
  ✅ Break down 2,175-line DatabaseService into
  domain services:
  ✅ UserService (user operations + LLM providers)
  ✅ ToolService (tool operations + executions)
  ✅ AgentService (agent operations)
  ✅ ProjectService (project operations)
  ✅ SecurityService (security policies)
  ✅ AuditService (audit trails)
  ✅ ArtifactService (artifact management)
  ✅ SessionService (session management)
  ✅ MFAService (multi-factor auth)
  ✅ OAuthService (OAuth providers)
  ✅ Implement proper dependency injection
  ✅ Fix lazy loading race conditions
  ✅ Domain-specific repository organization

  Files Refactored:
  ✅ /backend/shared/services/src/databaseService.ts
  (delegated to domain services)
  ✅ Created 10+ domain service files with proper
  abstractions
  ✅ Fixed LLM provider repository organization

  1.3 JWT Validation Consolidation

  Priority: CRITICAL (Security)Impact: Single
  source of truth for authenticationEffort: 3 days

  Tasks:
  - Consolidate JWT validation logic from 4+
    locations
  - Create unified JWTValidator class
  - Standardize token validation patterns
  - Remove duplicate authentication middleware

  Files to Refactor:
  - /backend/shared/middleware/src/authMiddleware.ts
  - /backend/services/security-gateway/src/index.ts
  - /backend/services/security-gateway/src/services
    /enhancedAuthService.ts

  ***

  🟠 Phase 2: Large File Refactoring (Weeks 3-4)

  2.1 Frontend API Utility Breakdown

  Priority: HIGHImpact: Improved
  maintainabilityEffort: 4 days

  Tasks:
  - Split 2,295-line
    /apps/frontend/src/utils/api.ts into:
    - authApi.ts (authentication endpoints)
    - agentApi.ts (agent management)
    - toolApi.ts (tool operations)
    - projectApi.ts (project management)
    - discussionApi.ts (discussion endpoints)

      2.2 Backend Controller Refactoring

  Priority: HIGHImpact: Better code
  organizationEffort: 3 days

  Tasks:
  - Refactor /backend/services/agent-intelligence/s
    rc/controllers/agentController.ts (1,332 lines)
  - Refactor /backend/services/orchestration-pipeli
    ne/src/orchestrationEngine.ts (1,328 lines)
  - Split into focused, single-responsibility
    modules

    2.3 Legacy Pattern Modernization

  Priority: HIGHImpact: Consistency and
  maintainabilityEffort: 3 days

  Tasks:
  - Replace Promise chains with async/await (25+
    files)
  - Enable TypeScript strict mode gradually
    star

  ***

  🟡 Phase 3: Testing & Quality (Weeks 5-6)

  3.1 Integration Test Implementation

  Priority: HIGHImpact: Improved reliabilityEffort:
  1 week

  Tasks:
  - Add integration tests for authentication flows
  - Test core database operations (currently 0%
    coverage)
  - Create WebSocket handler tests
  - Implement agent orchestration tests

    3.2 Unit Test Coverage

  Priority: MEDIUMImpact: Better code
  qualityEffort: 1 week

  Tasks:
  - Add unit tests for business logic
  - Test tool execution patterns
  - Mock external dependencies properly
  - Achieve 80% coverage target

  ***

  🟢 Phase 4: Performance & Architecture (Weeks
  7-8)

  4.1 Database Optimization

  Priority: MEDIUMImpact: Better performanceEffort:
  4 days

  Tasks:
  - Add database indexes on frequently queried
    fields
  - Fix N+1 query problems in repository patterns
  - Implement proper connection pooling
  - Add query performance monitoring

    4.2 Architecture Improvements

  Priority: MEDIUMImpact: Better
  maintainabilityEffort: 4 days

  Tasks:
  - Implement hexagonal architecture patterns
  - Create service interfaces to reduce coupling
  - Standardize error handling patterns
  - Add proper logging throughout

  ***

  🔧 Implementation Strategy

  Week-by-Week Breakdown

  Week 1: BaseService creation + service pattern
  consolidation (IN PROGRESS)
  Week 2: DatabaseService decomposition ✅ COMPLETED + JWT consolidation
  Week 3: Large file refactoring (frontend API utils)
  Week 4: Backend controller refactoring + legacy modernization
  Week 5: Integration test implementation
  Week 6: Unit test coverage improvements
  Week 7: Database optimization + performance tuning
  Week 8: Architecture improvements + final cleanup

  📊 Current Status (2025-01-06):
  ✅ Phase 1.2 Complete: DatabaseService decomposition
  🔄 Phase 1.1 In Progress: Service pattern consolidation
  🔄 Phase 1.3 Pending: JWT validation consolidation

  Key Achievements:
  - Successfully organized repositories by domain
  - Fixed build errors in ToolService
  - Established proper dependency injection patterns
  - LLM providers properly organized in UserService domain

  Risk Mitigation
  - Gradual Migration: Implement new patterns
    alongside old ones
  - Feature Flags: Use feature toggles for major
    changes
  - Rollback Strategy: Keep original
    implementations until new ones are proven
  - Testing: Comprehensive testing before removing
    old code

  Success Metrics
  - Code Reduction: 40% reduction in duplicate code
  - File Size: No files >500 lines (target: <300
    lines)
  - Test Coverage: 80% coverage on business logic
  - Performance: 25% improvement in API response
    times
  - Maintainability: Reduced complexity scores
    across all services

  ***

  📊 Resource Requirements

  Team Size: 2-3 developersTimeline: 8 weeksRisk
  Level: LOW (mostly refactoring, not new
  features)Dependencies: None (internal cleanup)

  Estimated Impact:
  - Maintenance Time: 50% reduction in bug fix time
  - New Feature Velocity: 30% improvement
  - Code Quality: Significantly improved
    maintainability
  - Developer Experience: Better onboarding and
    debugging

  This plan addresses the real technical debt
  issues while preserving the excellent
  architectural foundation you've built. The focus
  is on consolidation, testing, and modernization
  rather than architectural overhaul.
