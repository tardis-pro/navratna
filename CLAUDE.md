# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Council of Nycea is a **Unified Agent Intelligence Platform (UAIP)** - a production-ready backend infrastructure for multi-agent collaboration, intelligent discussion orchestration, and capability-driven automation. The system uses a microservices architecture with a hybrid database strategy and event-driven communication.

## Development Notes

- You use puppeteer on 5173 always
- Its running in docker compose is hotreloading

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
- **Agent Intelligence** (3001) - AI agent management, context analysis, persona handling
- **Orchestration Pipeline** (3002) - Workflow coordination, operation management
- **Capability Registry** (3003) - Tool management, sandboxed execution  
- **Security Gateway** (3004) - Authentication, authorization, auditing
- **Discussion Orchestration** (3005) - Real-time collaborative discussions via WebSocket
- **LLM Service** (llm-service) - Multi-provider LLM integration (OpenAI, Anthropic, Ollama)
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

- **Security**: All requests go through Security Gateway for auth/authz
- **Events**: RabbitMQ for async communication between services
- **Real-time**: WebSocket connections for agent discussions and live updates
- **Caching**: Redis for API responses, sessions, and real-time data
- **Audit**: Comprehensive audit trails for all operations
- **Sandboxing**: Secure tool execution in Capability Registry
- **Multi-agent**: Sophisticated agent personas with contextual awareness

## Troubleshooting

- **Port conflicts**: Check ports 3000-3005, 5432, 6379, 7474, 8081
- **Database connection**: Ensure infrastructure started and ready (~30-60 seconds)
- **Memory issues**: System requires minimum 8GB RAM (16GB recommended)
- **Build failures**: Always build shared packages first with `npm run build:shared`
- **Import errors**: Check monorepo import patterns, verify path mappings in tsconfig.json
- **Test failures**: Middleware tests expect proper mock setup; check Jest configuration and workspace imports

## Recent Development Progress

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