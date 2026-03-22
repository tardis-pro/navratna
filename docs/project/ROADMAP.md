# Navratna Roadmap — Sovereign Cognitive Shell

## Document Control

- **Last Updated**: 2026-03-21
- **Version**: 3.1 (Sovereign Shell Evolution + Platform Expansion Vision)
- **Previous**: v2.0 (UAIP Platform) — archived
- **Status**: Phase 1 Telescope components BUILT, OpenClaw port IN PROGRESS, 362-idea expansion brainstormed, BaseBench-Meta + QuestionForge specs drafted

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

<!-- Line counts verified by user 2026-03-21. Integration gaps CLOSED per 00-PRD §Integration Status. -->

- [x] IntentField component (606 lines — cmdk + fuzzy + WebSocket AI suggestions + 5 intent types) — fully integrated, Cmd+K, portal navigation
- [x] relevance() scoring function (383 lines — 4-factor: vector 40%, graph 30%, recency 20%, keyword 10%) — wired to IntentField (300ms debounce, graceful fallback)
- [x] MaterializableBlock HOC (702 lines — HOC + hook + styles + visibility states) — fully integrated, 5 portals wrapped
- [x] Microexpression system (168 lines — 7 states, oklch colors, 4 animations, size variants) — fully integrated, useAgentMicroexpression dispatches events
- [x] Code splitting (React.lazy for 19 portals) — done
- 🔄 Port 14 OpenClaw agent personas — DB seeded with origin:openclaw, import services built
- 🔄 Port SOPs and task lifecycle — sopImport.service.ts built, reads from openclaw-infra/agents/
- 🔄 Port model routing configs — 4/13+ skills in manifest, 6 LLM providers not migrated
- 🔄 Port 13 skills to Capability Registry — skillImport.service.ts built, 4 skills imported
- 🔄 httpOnly cookie migration — backend sets cookies, frontend partially migrated (credentials: 'include'), remaining localStorage reads to clean up

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

## Beyond v3.0: Platform Expansion (362-Idea Brainstorm)

Full brainstorm output: `_bmad-output/brainstorming/brainstorming-session-2026-03-21-111555.md`

### Strategic Vision: Three Products, One Platform

| Product            | What                                                                  | Spec                                     |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------- |
| **UAIP Core**      | Metacognitive agent platform + Telescope UX                           | `docs/specs/07-STRATEGIC-VISION-2026.md` |
| **BaseBench-Meta** | Metacognitive reliability benchmark (8 task families, scoring rubric) | `docs/specs/08-BASEBENCH-META.md`        |
| **QuestionForge**  | Stakeholder discovery council (8 specialist agents, debate mechanics) | `docs/specs/09-QUESTIONFORGE.md`         |

**Convergence thesis:** BaseBench-Meta **measures** metacognitive intelligence, UAIP Core **implements** it in production, QuestionForge **demonstrates** it as a product.

### Key Architectural Bets

- Verticals as ontologies (not modules) loaded by AI — business domains plug into existing Persona/Discussion/Artifact/Operation systems
- MCP as universal extension system (bazaar model) with SDK, hot-reload, sandbox, revenue-share
- Trust gradients replacing binary approvals — continuous, earned, cross-domain
- Schema-on-intent (data model emerges from use)
- Metacognitive agent layer — agents that know what they know, ask instead of guess, catch their own errors
- Model evaluation & token optimization — smallest viable model per task, cost-quality Pareto frontier

### Metacognitive Agent Infrastructure (Ideas #303-362)

- Merkle-hashed operation receipts for verifiability
- Workflow-level idempotency envelopes
- Explanation DAGs from real-time reasoning capture
- Deterministic session replay for reproducible debugging
- Confidence-gated execution with dynamic thresholds
- Multi-agent verification quorum for critical operations
- Shadow jury parallel model evaluation on production traffic
- Complexity-based model routing (trivial→haiku, complex→opus)
- Universal Dispatch Cortex — one input, universal resolution via meta-reasoning → gap detection → foraging → delegation → PEOR loop

### Security Hardening (Ideas #333-347)

- KMS envelope encryption replacing hardcoded keys
- mTLS service mesh, network microsegmentation
- DLP scanning, automated secret rotation
- Canary tokens, Merkle-chained audit logs
- Live security posture scoring with auto-tightening

### Trust Sequence

L0 (accurate info) → L1 (faster surfacing) → L2 (unknown unknowns) → L3 (low-stakes autonomy) → L4 (high-stakes autonomy). Current users at L0→L1.

See `docs/specs/07-STRATEGIC-VISION-2026.md` for full 4-phase roadmap with codebase alignment per item.

## Success Metrics

| Metric                  | Target                           | Measured By                |
| ----------------------- | -------------------------------- | -------------------------- |
| Intent response         | < 100ms fuzzy + < 500ms semantic | Telescope telemetry        |
| Cold start              | < 90 seconds                     | Machine boot to functional |
| RAM usage               | < 5GB full stack                 | Docker stats               |
| Sandbox warm start      | < 60 seconds                     | OpenShell metrics          |
| Agent task completion   | > 80% autonomous                 | Task audit trail           |
| Monthly cost            | < $220                           | Billing aggregation        |
| Relevance precision@4   | > 80%                            | Telescope feedback loop    |
| Trust level progression | L0→L1 by month 2                 | User behavior analytics    |
| Chat imports per user   | > 1 source                       | Onboarding funnel          |
| Day-7 return rate       | > 60%                            | Audit events               |
