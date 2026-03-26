# Navratna — Sovereign Cognitive Shell

**Version**: 3.1 — Sovereign Shell Evolution + Platform Expansion Vision
**Status**: Backend 90% Complete | Telescope Phase 1 BUILT | v3.0 Transition Active
**Last Updated**: 2026-03-21

## Overview

Navratna is a **metacognitive agent operating system** — a personal sovereign AI platform with ambient intelligence, multi-agent orchestration, and a triple-store knowledge foundation. The system evolves from a multi-user enterprise tool (v2.0) to a single-owner, multi-agent, multi-machine cognitive shell (v3.0).

Three convergent products:

- **UAIP Core** — Agent platform + Telescope ambient UX
- **BaseBench-Meta** — Metacognitive reliability benchmark
- **QuestionForge** — Stakeholder discovery council

### Key Capabilities

- **Telescope/Cognitive Shell**: Ambient-first UX with intent-driven navigation, 7-state microexpression system, attention budget (4 items)
- **Multi-Agent Orchestration**: 14 specialized agents with 3-tier memory, confidence-gated execution, learning service
- **Triple-Store Knowledge**: PostgreSQL (57 entities) + Neo4j (graph relationships) + Qdrant (vector embeddings) with UUID-consistent sync
- **MCP Protocol**: Full client/server (2,075 LoC), 10 transport types, tool discovery, streaming
- **Enterprise Security**: JWT + MFA + 5 OAuth providers + RBAC (USER/ADMIN/AGENT/SERVICE)
- **Real-time Intelligence**: WebSocket discussions with turn strategies, consensus building, conversation enhancement

## System Architecture

### Backend Services (7 → consolidating to 2)

| Service                  | Port       | Status     |
| ------------------------ | ---------- | ---------- |
| Agent Intelligence       | 3001       | Production |
| Orchestration Pipeline   | 3002       | Production |
| Capability Registry      | 3003       | Production |
| Security Gateway         | 3004       | Production |
| Discussion Orchestration | 3005       | Production |
| LLM Service              | (via 3001) | Production |
| Artifact Service         | (via 3002) | Production |
| API Gateway (nginx)      | 8081       | Production |

**v3.0 consolidation target**: 2 services (navratna-core + navratna-gateway)

### Infrastructure

| Component  | Port      | Purpose                                               |
| ---------- | --------- | ----------------------------------------------------- |
| PostgreSQL | 5432      | Primary database (57 entities, 17 migrations)         |
| Neo4j      | 7474/7687 | Graph relationships, knowledge graph, recommendations |
| Qdrant     | 6333      | Vector embeddings, semantic search (1024-dim)         |
| Redis      | 6379      | Cache, sessions, pub/sub, recency scoring             |
| BullMQ/Redis | (via 6379) | Event bus — BullMQ queues on Redis (RabbitMQ removed) |

### Frontend

React 19 + Vite + Tailwind 4 + shadcn/ui (50 components) + Framer Motion

**Telescope Phase 1 — BUILT:**

- IntentField (606 lines — cmdk + fuzzy + WebSocket AI suggestions + 5 intent types)
- MaterializableBlock HOC (702 lines — visibility states, microexpressions, drag/resize)
- Microexpression system (168 lines — 7 states, OKLCH colors, animations)
- Relevance engine (383 lines — 4-factor scoring: vector 40%, graph 30%, recency 20%, keyword 10%)

## Documentation

### Start Here

- `docs/GETTING_STARTED.md` — Setup and local development
- `docs/ENVIRONMENT_CONFIG.md` — Environment variables and configuration

### Strategy & Vision

- `docs/specs/07-STRATEGIC-VISION-2026.md` — Platform vision, 4-phase roadmap, three-product convergence
- `docs/specs/08-BASEBENCH-META.md` — Metacognitive benchmark specification
- `docs/specs/09-QUESTIONFORGE.md` — Stakeholder discovery council specification

### Specifications

- `docs/specs/00-SOVEREIGN-SHELL-PRD.md` — Sovereign Shell master PRD
- `docs/specs/06-TELESCOPE-KNOWLEDGE-SURFACE-PRD.md` — Telescope knowledge surface PRD

### Project

- `docs/project/ROADMAP.md` — Long-term roadmap (v3.0 → beyond)
- `docs/project/NEXT_PHASES.md` — Sprint plan (current: Sprint 1, 2026-03-24)

### Architecture

- `docs/ARCHITECTURE.md` — System design overview
- `docs/API_REFERENCE.md` — API endpoints
- `docs/technical/DATABASE.md` — Triple-store architecture
- `docs/technical/SECURITY.md` — Security architecture

### Features

- `docs/features/AGENTS.md` — Agent system and personas
- `docs/features/DISCUSSIONS.md` — Discussion orchestration
- `docs/features/CAPABILITIES.md` — Tool/MCP execution
- `docs/features/ARTIFACTS.md` — Artifact generation

## Quick Start

```bash
# Clone and install (NX monorepo + pnpm workspaces)
git clone <repository-url>
cd navratna
pnpm install

# Start full stack (NX orchestrates all services with hot-reload)
pnpm dev

# Or start infrastructure only (databases + observability)
docker-compose up -d postgres neo4j redis qdrant

# Access
# Frontend: http://localhost:5173
# API Gateway: http://localhost:8081
# API Docs: http://localhost:8081/docs
```

## Current State (2026-03-21)

### Completed

- 7 production microservices (consolidating to 2)
- 57 database entities, 17 migrations
- Triple-store knowledge graph with UUID-consistent sync
- 14 agent personas seeded from OpenClaw
- Telescope Phase 1 components (1,859 lines)
- 132 passing middleware tests
- Full MCP protocol support
- 685-line agent learning service with 3-tier memory
- 4 OAuth adapters (Jira/Confluence/GitHub/Slack)
- 20 active users

### In Progress (Sprint 1: 2026-03-24 → 2026-04-04)

- Multi-machine topology (Tailscale mesh)
- Service consolidation (7 → 2)
- OpenShell sandboxed execution
- Database init scripts

### Next

- TelescopeSurface (replaces DesktopUnified, feature-flagged)
- Ambient intelligence layer (morning open, attention budget, whisper line)
- Intent chaining (NL goal → multi-step workflow DAG)
- Chat ingestion onboarding (first value in 5 minutes)

See `docs/project/ROADMAP.md` for full v3.0 roadmap and `docs/specs/07-STRATEGIC-VISION-2026.md` for platform expansion vision (362-idea brainstorm distilled into 4-phase roadmap).

## License

This project is proprietary.
