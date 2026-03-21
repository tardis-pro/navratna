# Navratna Roadmap — Sovereign Cognitive Shell

## Document Control
- **Last Updated**: 2026-03-21
- **Version**: 3.0 (Sovereign Shell Evolution)
- **Previous**: v2.0 (UAIP Platform) — archived

## Current State: v2.0 → v3.0 Transition

### What v2.0 Achieved (2025)
- ✅ 7 microservices (Agent Intelligence, Security Gateway, Orchestration Pipeline, Capability Registry, Discussion Orchestration, Artifact Service, LLM Service)
- ✅ Triple-store knowledge (PostgreSQL + Neo4j + Qdrant)
- ✅ Real-time WebSocket discussions with turn management
- ✅ Multi-provider LLM integration (OpenAI, Ollama, Anthropic)
- ✅ MCP protocol support (2,075 LoC client)
- ✅ Enterprise security foundation (JWT, RBAC, MFA scaffold, OAuth)
- ✅ React 19 frontend with 30+ portal components
- ✅ 132 passing middleware tests
- ✅ Elysia framework (performance-first)

### What v3.0 Changes
The platform evolves from a multi-user enterprise tool to a **personal sovereign agent operating system**:
- Single-owner, multi-agent, multi-machine
- Local-first with cloud burst
- OpenShell sandboxed execution
- Telescope intent-driven UI replacing portal grid
- 14 agents ported from OpenClaw
- Project-based auth with provider fallback chains
- Tauri native shell

## Q1 2026 (March-April): Foundation

### Phase 0: Infrastructure Setup
- [ ] Tailscale mesh between 2 PCs + Mac
- [ ] Per-machine Docker Compose configs
- [ ] Fix: .env template, Docker version pins, database init scripts
- [ ] Install NVIDIA OpenShell on PC-B + Mac
- [ ] Service consolidation: 7 services → 2 (Core + Gateway)

### Phase 1: Telescope Foundation + Agent Port (Week 1-2)
- [ ] IntentField component (merge cmdk + GlobalAutocomplete + KnowledgeSearch)
- [ ] relevance() scoring function against triple-store
- [ ] MaterializableBlock HOC for existing portals
- [ ] Microexpression system (7 states as Framer Motion variants)
- [ ] Port 14 OpenClaw agent personas to Agent Intelligence
- [ ] Port SOPs and task lifecycle to Orchestration Pipeline
- [ ] Port model routing configs to LLM Service
- [ ] Port 13 skills to Capability Registry
- [ ] React code splitting (React.lazy for all 27 portals)
- [ ] httpOnly cookie migration (security fix)

### Phase 2: Telescope Surface + OpenShell (Week 2-3)
- [ ] TelescopeSurface.tsx replaces DesktopUnified (feature-flagged)
- [ ] Ambient stream aggregator (unified Socket.IO)
- [ ] Crystallization renderer (blurry→sharp materialization)
- [ ] OpenShell MCP integration in Capability Registry
- [ ] Golden container image (navratna/coding-workspace)
- [ ] Project-based auth configs (YAML per repo)
- [ ] First coding sandbox: Claude Code in OpenShell
- [ ] Sandbox state → Telescope block rendering

## Q2 2026 (April-May): Intelligence

### Phase 3: Intelligence + Sensorium (Week 3-4)
- [ ] Predictive Intent Model
- [ ] Universal Intent Router (QUERY/COMMAND/MONITOR/ORCHESTRATE/COMMUNICATE)
- [ ] Attention Budget enforcement (4 primary slots)
- [ ] Intent chaining → operation pipelines
- [ ] Sensorium integrations: GOG Gmail, GitHub, RSS
- [ ] WhatsApp bridge (local, grouped)
- [ ] Approval membrane in Security Gateway
- [ ] Agent-to-agent communication protocol

### Phase 4: Tauri + Multi-Machine (Week 4-5)
- [ ] Tauri shell wrapping Telescope
- [ ] Global hotkey, system tray, deep links (telescope://)
- [ ] Multi-machine task routing (volume affinity)
- [ ] RunPod burst integration
- [ ] Context snapshots (survive sandbox death)
- [ ] Repo volume lifecycle (hot/warm/cold/frozen)
- [ ] Local MCP sidecars via Tauri

### Phase 5: Continuity + Polish (Week 5-6)
- [ ] Decision journaling (every approval → Neo4j)
- [ ] The Pronit Model (learned cognitive preferences)
- [ ] Multiplayer cursors (human + agent presence)
- [ ] MCP extension discovery
- [ ] Telescope snapshots (shareable cognitive states)
- [ ] Cron migration (21 OpenClaw jobs → BullMQ scheduled events)

## Q2-Q3 2026 (May-July): Replacements

### ORM Migration
- [ ] Drizzle schema definitions (parallel to TypeORM)
- [ ] Service-by-service migration (Artifact → LLM → Capability → Agent → Discussion → Orchestration → Security)
- [ ] Performance benchmarks (every query must be faster)
- [ ] TypeORM removal after validation

### Message Bus Migration
- [ ] BullMQ EventBus implementation (parallel to RabbitMQ)
- [ ] Service-by-service consumer migration
- [ ] Scheduled job migration (21 cron jobs)
- [ ] RabbitMQ removal after validation

### Infrastructure Trimming
- [ ] Remove MinIO, TEI, monitoring stack containers
- [ ] Remove stub components (ChatPortal, MultiChatManager, MindMap)
- [ ] Remove DashboardPortal (mock data)
- [ ] Remove Marketplace Service

## Q3 2026 (July-September): Maturity

- [ ] LinkedIn read integration (Sensorium)
- [ ] Slack integration (if needed)
- [ ] Advanced Telescope features (semantic zoom, spatial intent)
- [ ] Performance optimization (bundle analysis, query tuning)
- [ ] Comprehensive test coverage (E2E with Playwright)
- [ ] Succession policies and decay rules (Continuity Engine)
- [ ] Multi-window Tauri (pop-out blocks)

## Success Metrics
| Metric | Target | Measured By |
|---|---|---|
| Intent response | < 100ms fuzzy + < 500ms semantic | Telescope telemetry |
| Cold start | < 90 seconds | Machine boot to functional |
| RAM usage | < 5GB full stack | Docker stats |
| Sandbox warm start | < 60 seconds | OpenShell metrics |
| Agent task completion | > 80% autonomous | Task audit trail |
| Monthly cost | < $220 | Billing aggregation |
