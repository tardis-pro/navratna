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

**Build  ** - Just build it will building the entire set:

1. `pnpm build` - Build packages/shared-types, packages/shared-utils, backend/shared/*

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
3. You are in a ec2 work instance, you make a change, its hot reloaded. 
4. always use pupeeter to test some ui things, 
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
- **Chat History Management**: Comprehensive chat history browser with time-grouped sessions and export capabilities
- **Modal-Based Editing**: Streamlined agent editing without navigation disruption using modal overlays
- **Event-Driven Chat Communication**: Custom events for clear intent separation between new and resume chat actions
- **Window Uniqueness**: Only one chat window per agent with proper focus management and duplicate prevention

## Recent Session Achievements (2025-01-04)

### ✅ Tool System Architecture Alignment
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

### 🎯 Next Steps: Tool System Evolution

**Immediate Priorities:**
1. **Tool Execution Engine**: Implement the simplified execution methods currently stubbed out
2. **Neo4j Integration**: Connect tool relationship and recommendation systems
3. **Redis Cache Layer**: Implement tool usage caching and performance optimization
4. **Project Tool Integration**: Complete the project-tool association features
5. **Enterprise Tool Adapters**: Expand Jira, Confluence, Slack integrations

**Architecture Goals:**
- **Human-Agent Parity**: Ensure tools work identically for human users and AI agents
- **Security Consistency**: All tools follow the same security framework across the platform
- **Performance Optimization**: Tool execution with proper caching and rate limiting
- **Graph-Based Discovery**: Neo4j-powered tool recommendations and relationships

## Troubleshooting

- **Port conflicts**: Check ports 3000-3005, 5432, 6379, 7474, 8081
- **Database connection**: Ensure infrastructure started and ready (~30-60 seconds)
- **Memory issues**: System requires minimum 8GB RAM (16GB recommended)
- **Build failures**: Always build shared packages first with `npm run build:shared`
- **Import errors**: Check monorepo import patterns, verify path mappings in tsconfig.json
- **Test failures**: Middleware tests expect proper mock setup; check Jest configuration and workspace imports
Council of Nycea: Technical Debt Cleanup Plan

  Executive Summary

  Based on comprehensive analysis, the codebase has
   moderate technical debt with excellent
  foundational architecture. Redis and Neo4j are
  fully integrated. The main issues center around
  duplicate patterns, large files, and insufficient
   testing coverage.

  ---
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
  - /backend/services/*/src/index.ts (7 services)
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
  -
  /backend/shared/middleware/src/authMiddleware.ts
  - /backend/services/security-gateway/src/index.ts
  - /backend/services/security-gateway/src/services
  /enhancedAuthService.ts

  ---
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

  ---
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

  ---
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

  ---
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

  ---
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