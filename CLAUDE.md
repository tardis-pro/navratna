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

### ✅ Mini Browser Portal Implementation (Completed)
- **Mini Browser Portal**: Complete iframe-based web browser with screenshot capture and knowledge integration
  - **Location**: `apps/frontend/src/components/futuristic/portals/MiniBrowserPortal.tsx`
  - **Core Features**: 
    - Multi-tab browsing with add/close functionality
    - Viewport switching (Desktop 1200x800, Tablet 768x1024, Mobile 375x667)
    - URL navigation with browser controls (back, forward, refresh, bookmark)
    - Real-time tab management with loading states
  - **Screenshot System**: 
    - Placeholder implementation with styled canvas screenshots
    - Direct integration with knowledge base saving
    - Metadata preservation (URL, title, timestamp, dimensions)
    - Tag and note support for knowledge organization
  - **X-Frame-Options Handling**: 
    - Graceful detection of iframe embedding restrictions
    - User-friendly error messages with alternative suggestions
    - Curated list of iframe-friendly websites for testing
  - **Knowledge Integration**: 
    - Direct saving to knowledge base with KnowledgeType classification
    - Full metadata support including screenshots as data URLs
    - Integration with existing KnowledgeContext and upload workflows
  - **Quick Access Panel**: Pre-configured iframe-friendly sites (Example.com, Wikipedia, MDN, Stack Overflow, JSONPlaceholder, Lorem Ipsum)
- **Desktop Integration**: Fully integrated into desktop workspace and application system
  - **Location**: Added to `apps/frontend/src/components/DesktopUnified.tsx` APPLICATIONS array (line 111)
  - **Desktop Icon**: Globe icon in DesktopWorkspace.tsx secondary row (lines 183-191)
  - **Portal Management**: 'mini-browser' type added to usePortalManager.ts (line 21)
  - **Keyboard Shortcut**: Ctrl+B for quick access
- **Technical Implementation**:
  - Avoided html2canvas dependency issues by implementing placeholder screenshot system
  - Comprehensive error handling for iframe restrictions and loading states
  - Responsive design with sidebar for screenshot management
  - Full TypeScript implementation with proper interface definitions

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

### ✅ Global Knowledge Management System (Completed)
- **Global Upload Capability**: System-wide knowledge creation accessible from anywhere
  - **Location**: `apps/frontend/src/components/GlobalUpload.tsx`
  - **Access**: `Ctrl+Shift+N` keyboard shortcut triggers upload dialog globally
  - **Features**: Dual-mode upload (text notes OR file uploads), smart file type detection, auto-tagging
  - **File Support**: `.txt`, `.md`, `.json`, `.csv`, `.js`, `.ts`, `.py`, `.java`, `.xml`, `.yml`, `.html`, `.css`, `.sql`, `.log`
  - **Batch Processing**: Upload multiple files simultaneously with progress tracking
  - **Auto-categorization**: Files automatically categorized by type (Factual, Procedural, Semantic, etc.)
- **Knowledge Quick Access System**: Universal search and examination
  - **Location**: `apps/frontend/src/components/KnowledgeShortcut.tsx`
  - **Access**: `Ctrl+K` keyboard shortcut for global knowledge search
  - **Features**: Real-time search, direct examination, portal integration, preview content
  - **Actions**: Quick examine, open in Knowledge Portal, search filtering
- **Streamlined Knowledge Portal**: Focused on search, results, and examination
  - **Location**: `apps/frontend/src/components/futuristic/portals/KnowledgePortal.tsx`
  - **Features**: Minimal list view with 5 core actions per item (copy, download, discuss, edit, delete)
  - **Tabs**: Simplified to List, Graph, Examine - removed upload functionality (moved to global system)
  - **Clean Interface**: Removed clutter, headings, excessive metadata - content-first approach
- **Direct Knowledge Examination**: Multiple methods for accessing detailed knowledge view
  - **Full-screen Modal**: Dedicated examination experience with atomic viewer
  - **Atomic Viewer Enhancement**: Streamlined to 3 tabs (Content, Related, Details) with minimal metadata
  - **Event System**: Custom events for cross-component communication and direct shortcuts
- **Desktop Integration**: Complete integration with desktop system
  - **Location**: `apps/frontend/src/components/DesktopUnified.tsx`
  - **Global Shortcuts**: Knowledge search (`Ctrl+K`), Upload (`Ctrl+Shift+N`), Actions (`Alt+Space`)
  - **Modal Management**: Full-screen examination modal with escape handling
  - **Shortcut Documentation**: Integrated help in actions menu with keyboard shortcut display

**Global Keyboard Shortcuts**:
- `Ctrl+K`: Knowledge Search & Quick Access
- `Ctrl+Shift+N`: Global Upload (Text/Files)
- `Alt+Space`: Quick Actions Menu
- `Ctrl+Shift+T`: Toggle Shortcut Bar
- `Escape`: Close All Dialogs

**Creating Direct Knowledge Shortcuts**:
1. **Via Quick Access**: `Ctrl+K` → Search → Click 👁️ Examine
2. **Via Portal**: Knowledge Portal → List view → Click 👁️ Eye button
3. **Via Events**: `window.dispatchEvent(new CustomEvent('openKnowledgePortal', { detail: { itemId } }))`

**Benefits Achieved**:
- **System-wide Access**: Knowledge management from anywhere, not portal-specific
- **Streamlined Workflows**: Quick capture, search, and examination without navigation overhead
- **Content-first Design**: Removed clutter and unnecessary metadata display
- **Multiple Access Methods**: Keyboard shortcuts, direct examination, portal integration
- **Unified Experience**: Global upload replaces portal-specific upload functionality

## Enhanced Discussion UX Features

### Purpose-Driven Discussion Triggers

The system now supports intelligent discussion triggers from multiple contexts with purpose-driven artifact generation:

#### **From Knowledge Cards:**
```typescript
// Automatically triggered with knowledge context
<DiscussionTrigger
  trigger={<Button>Discuss</Button>}
  contextType="knowledge"
  contextData={{
    knowledgeItem: {
      id: "knowledge-123",
      content: "Research findings on AI trends...",
      type: "RESEARCH",
      tags: ["ai", "trends", "analysis"]
    }
  }}
/>
```

#### **From Chat Interface:**
```typescript
// Includes full conversation history
<DiscussionTrigger
  trigger={<Button>Discuss</Button>}
  contextType="chat"
  contextData={{
    chatHistory: messages,
    topic: "Chat with Research Agent"
  }}
  preselectedAgents={[selectedAgentId]}
/>
```

### Discussion Purposes & Artifact Generation

**8 Discussion Purposes:**
- **Brainstorming**: Generate creative ideas → Document, Action Plan, Presentation
- **Analysis & Review**: Deep dive analysis → Analysis Report, Document, Presentation  
- **Code Generation**: Collaborative coding → Code, Document, Analysis Report
- **Documentation**: Create documentation → Document, Presentation, Research Summary
- **PRD Creation**: Product requirements → PRD, Document, Presentation
- **Problem Solving**: Systematic resolution → Action Plan, Analysis Report, Decision Matrix
- **Research & Investigation**: Fact-finding → Research Summary, Document, Analysis Report
- **Decision Making**: Structured decisions → Decision Matrix, Analysis Report, Action Plan

**Intelligent Context Passing:**
```typescript
const discussionContext = {
  purpose: 'analysis',
  targetArtifact: 'analysis-report',
  contextType: 'knowledge',
  originalContext: knowledgeItem,
  additionalContext: userInput,
  expectedOutcome: 'Generate Analysis Report through analysis'
};
```

### Multi-Chat Manager Integration

Enhanced multi-window chat system with persistent discussions:

#### **Features:**
- **Persistent Chat History**: Integration with discussion service for message persistence
- **Load More History**: Pagination support for long conversations
- **Agent-Specific Windows**: Independent chat windows per agent
- **Discussion Integration**: Each chat creates a dedicated discussion thread
- **Real-time Status**: Visual indicators for persistent vs memory-only chats

#### **Usage:**
```typescript
// Trigger from agent card or portal
window.dispatchEvent(new CustomEvent('openAgentChat', {
  detail: { agentId: 'agent-123', agentName: 'Research Assistant' }
}));

// Chat persists to discussion service
const discussion = await uaipAPI.discussions.create({
  title: `Chat with ${agentName}`,
  description: `Direct chat conversation with agent ${agentName}`,
  // Auto-generated discussion for chat persistence
});
```

### Discussion UI Components

#### **DiscussionTrigger Component:**
- **Location**: `apps/frontend/src/components/DiscussionTrigger.tsx`
- **Features**: Modal dialog with purpose selection, agent picker, context preview
- **Context Types**: Knowledge, Chat, General
- **Visual Design**: Card-based purpose selection with icons and descriptions

#### **Knowledge Portal Integration:**
- **Location**: `apps/frontend/src/components/futuristic/portals/KnowledgePortal.tsx`
- **Trigger Location**: Knowledge item details panel → "Discuss" button
- **Context**: Passes knowledge content, type, tags automatically

#### **Chat Portal Integration:**
- **Location**: `apps/frontend/src/components/futuristic/portals/ChatPortal.tsx`
- **Trigger Location**: Chat header → "Discuss" button (when messages exist)
- **Context**: Passes conversation history and current agent

#### **Multi-Chat Manager:**
- **Location**: `apps/frontend/src/components/futuristic/portals/MultiChatManager.tsx`
- **Features**: Floating multi-window chat interface
- **Persistence**: Automatic discussion creation for message history
- **Event System**: Global `openAgentChat` event for cross-component triggers

### User Experience Flow

1. **From Knowledge Discovery:**
   ```
   Knowledge Portal → Select Item → View Details → Click "Discuss" 
   → Choose Purpose → Select Artifact → Configure Agents → Start Discussion
   ```

2. **From Chat Conversation:**
   ```
   Chat Portal → Active Conversation → Click "Discuss" 
   → Purpose Selection (pre-filled with chat context) → Start Multi-Agent Discussion
   ```

3. **Multi-Window Chat:**
   ```
   Agent Card → Open Chat → Persistent Window → Load History 
   → Send Messages → Auto-save to Discussion Service
   ```

### Technical Architecture

#### **Context Flow:**
```typescript
KnowledgeItem/ChatHistory → DiscussionTrigger → DiscussionContext 
→ Enhanced CreateDiscussionRequest → Discussion Service → Agents
```

#### **Persistence Model:**
- **Chat Messages**: Stored in discussion service with full metadata
- **Discussion Context**: Enhanced with purpose, artifact type, original context
- **Agent Selection**: Persistent per discussion with role assignment

## Mini Browser Usage Examples

### Accessing the Mini Browser

```typescript
// Desktop Access
Desktop → Click Globe Icon (Secondary Row) → Mini Browser Portal Opens
// Or use keyboard shortcut: Ctrl+B
```

### Basic Web Browsing

```typescript
// Navigate to iframe-friendly sites
URL Bar → Enter "https://example.com" → Press Enter
URL Bar → Enter "https://en.wikipedia.org" → Press Enter

// Quick Access Panel
Quick Access → Click "MDN Docs" → Loads https://developer.mozilla.org
Quick Access → Click "Stack Overflow" → Loads https://stackoverflow.com
```

### Multi-Tab Management

```typescript
// Create new tab
Tab Bar → Click "+" → New tab opens with example.com
Tab Bar → Click tab title → Switch between tabs
Tab Bar → Click "X" on tab → Close tab (minimum 1 tab required)
```

### Viewport Testing

```typescript
// Switch viewport sizes
Viewport Selector → Select "Desktop" → 1200x800 iframe
Viewport Selector → Select "Tablet" → 768x1024 iframe  
Viewport Selector → Select "Mobile" → 375x667 iframe
```

### Screenshot Capture & Knowledge Integration

```typescript
// Capture screenshot
Browser → Click "Screenshot" → Placeholder screenshot generated
Screenshot Dialog → Add tags: "research, documentation, web"
Screenshot Dialog → Add notes: "Important API documentation for project"
Screenshot Dialog → Select Knowledge Type: "Factual"
Screenshot Dialog → Click "Save to Knowledge Base"

// Result: Screenshot saved with metadata:
{
  content: "Screenshot from https://developer.mozilla.org...",
  type: KnowledgeType.FACTUAL,
  tags: ["research", "documentation", "web", "screenshot", "web-capture"],
  source: {
    type: SourceType.EXTERNAL_API,
    identifier: "https://developer.mozilla.org",
    metadata: {
      screenshotId: "screenshot-123456789",
      captureDate: "2024-01-01T10:00:00Z",
      dimensions: { width: 1200, height: 800 },
      dataUrl: "data:image/png;base64,..."
    }
  }
}
```

### Handling X-Frame-Options Restrictions

```typescript
// When site blocks iframe embedding:
URL Bar → Enter "https://google.com" → Navigate
Result → Error Display: "Cannot Display Site - X-Frame-Options restriction"
Error Screen → Click "Example.com" → Loads working alternative
Error Screen → Click "Wikipedia" → Loads working alternative

// Sites that work well in iframes:
✅ https://example.com
✅ https://en.wikipedia.org  
✅ https://developer.mozilla.org
✅ https://stackoverflow.com
✅ https://jsonplaceholder.typicode.com
✅ https://loremipsum.io

// Sites that typically block iframes:
❌ https://google.com (X-Frame-Options: sameorigin)
❌ https://facebook.com (X-Frame-Options: deny)
❌ https://github.com (X-Frame-Options: deny)
```

### Screenshot Management

```typescript
// View screenshots
Screenshots Sidebar → Shows all captured screenshots
Screenshot Card → Display: thumbnail, title, URL, timestamp, tags
Screenshot Card → "Save" button → Opens knowledge integration dialog
Screenshot Card → Shows "Saved" status when uploaded to knowledge base

// Screenshot metadata includes:
- Original URL and page title
- Capture timestamp  
- Image dimensions
- Data URL for image content
- User-added tags and notes
- Knowledge base integration status
```

### Browser Controls

```typescript
// Navigation controls
Browser Controls → Back button (disabled - placeholder)
Browser Controls → Forward button (disabled - placeholder)  
Browser Controls → Refresh button → Reloads current iframe
Browser Controls → Bookmark button (placeholder)

// URL management
URL Bar → Type new URL → Press Enter → Navigate to site
URL Bar → Shows current tab's URL
URL Bar → Auto-prefixes with https:// if protocol missing
```

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

## Global Knowledge Management Usage Examples

### Daily Knowledge Capture Workflows

```typescript
// Reading an article → Instant capture
Article in browser → Ctrl+Shift+N → Paste content → Tag "research, ai-trends" → Upload
Result: Knowledge instantly available system-wide

// Code snippet discovery → Quick save
GitHub code → Copy snippet → Ctrl+Shift+N → Paste → Auto-tagged "js, react, components"
Result: Code accessible via Ctrl+K search from anywhere

// Meeting notes → Structured capture
During meeting → Ctrl+Shift+N → Type notes → Tag "meeting, project-planning, 2024-q1" → Save
Result: Searchable meeting knowledge with temporal tags
```

### Quick Knowledge Lookup Workflows

```typescript
// Need specific information → Lightning fast access
Working on feature → Ctrl+K → Search "authentication" → Results appear instantly
Click examine → Full atomic view with related items

// Looking for related code → Contextual discovery
In codebase → Ctrl+K → Search "login component" → Find item → View related items
Discover related patterns, documentation, and examples

// Reference lookup → Direct examination
Need API docs → Ctrl+K → Search "API documentation" → Direct examine
Full-screen view with content-first interface
```

### Knowledge Organization & Management

```typescript
// File upload workflows → Batch processing
Multiple documents → Ctrl+Shift+N → Select files → Auto-categorized by type
.js files → Tagged "js, code" → Categorized as Procedural
.md files → Tagged "md, documentation" → Categorized as Factual
.json files → Tagged "json, data" → Categorized as Semantic

// Cross-referencing → Connection building
Upload related items → Ctrl+K → Search → Examine → View related items
System automatically suggests connections based on tags and content
```

### Streamlined Knowledge Portal Usage

```typescript
// List view actions → 5 core operations per item
Knowledge Portal → List view → Each item shows:
1. 📋 Copy → Copy content to clipboard
2. 📥 Download → Download as text file  
3. 💬 Discuss → Start multi-agent discussion
4. ✏️ Edit → Modify knowledge item
5. 🗑️ Delete → Remove from knowledge base
6. 👁️ Examine → Open in atomic viewer

// Search integration → Portal meets global search
Portal search → Shows same results as Ctrl+K
Seamless transition between global search and portal examination
```

### Creating Knowledge Shortcuts

```typescript
// Method 1: Via global search
Ctrl+K → Search "important-reference" → Examine → Remember item
Later: Ctrl+K → Search "important" → Quick access to item

// Method 2: Via portal examination
Knowledge Portal → Find frequently used item → Click examine
Bookmark the atomic view for direct access

// Method 3: Via tagging strategy
Tag important items with "shortcut" or "frequent"
Ctrl+K → Search "shortcut" → Access all shortcut items
```

### Integration with Existing Features

```typescript
// Mini Browser → Knowledge integration
Mini Browser → Screenshot capture → Auto-saved to knowledge base
Tagged with "screenshot, web-capture" + custom tags
Accessible via Ctrl+K search like any knowledge item

// Discussion system → Knowledge context
Ctrl+K → Find relevant knowledge → Discuss button → Auto-populated context
Agents receive full knowledge context for informed discussions

// Agent chat → Knowledge enhancement
Chat with agent → Agent automatically accesses relevant knowledge
Real-time knowledge integration during conversations
```

### Advanced Shortcuts & Power User Features

```typescript
// Keyboard-driven workflows → No mouse needed
Ctrl+K → Type search → Arrow keys → Enter to examine → Esc to close
Ctrl+Shift+N → Type content → Tab through fields → Enter to save

// Event-driven shortcuts → Developer integration
Custom buttons → window.dispatchEvent(new CustomEvent('openKnowledgePortal', { detail: { itemId } }))
Direct knowledge examination from any component

// Cross-component communication → Seamless integration
Knowledge → Discuss → Agents → Tools → Back to Knowledge
Unified workflow across all platform features
```

## Important File Changes

### Backend Schema & Type Changes
- **`packages/shared-types/src/agent.ts`**: Enhanced `AgentCreateRequestSchema` with tool attachment and chat configuration support
- **`backend/services/agent-intelligence/src/controllers/agentController.ts`**: Added tool attachment, chat configuration, and enhanced chat capabilities
- **`backend/services/agent-intelligence/src/services/agent-core.service.ts`**: Core agent operations with tool integration support

### Frontend UI Enhancements  
- **`apps/frontend/src/components/futuristic/portals/AgentManagerPortal.tsx`**: Tool attachment UI and chat configuration interface
- **`apps/frontend/src/components/futuristic/portals/ChatPortal.tsx`**: Enhanced chat with tool execution visualization and capability displays

### Global Knowledge Management Components
- **`apps/frontend/src/components/GlobalUpload.tsx`**: System-wide upload dialog for text and files with smart categorization
- **`apps/frontend/src/components/KnowledgeShortcut.tsx`**: Universal knowledge search and quick access with real-time results
- **`apps/frontend/src/components/futuristic/portals/KnowledgePortal.tsx`**: Streamlined to minimal list view, removed upload functionality
- **`apps/frontend/src/components/futuristic/portals/AtomicKnowledgeViewer.tsx`**: Enhanced to 3-tab interface (Content, Related, Details)
- **`apps/frontend/src/components/DesktopUnified.tsx`**: Integrated global shortcuts and modal management

### Configuration & Routing
- **`api-gateway/nginx.conf`**: CORS centralization and knowledge routes properly configured
- **All backend services**: Removed individual CORS middleware in favor of nginx centralization

### Knowledge Architecture
- **Security Gateway**: User knowledge management routes (`/api/v1/knowledge`)
- **Agent Intelligence**: Agent-specific knowledge operations during conversations (internal)
- **Global Upload System**: Centralized knowledge creation accessible from anywhere
- **Event-driven Shortcuts**: Custom events for cross-component knowledge examination```