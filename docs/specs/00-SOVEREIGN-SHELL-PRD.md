# Navratna: The Sovereign Cognitive Shell — Product Requirements Document

## Document Control
- **Version**: 3.1
- **Date**: 2026-03-21
- **Status**: APPROVED FOR IMPLEMENTATION — Phase 1 Telescope FULLY INTEGRATED, OpenClaw port in progress, expanding to business OS vision
- **Author**: Pronit Das + BMAD Council (Victor, Dr. Quinn, Saga, Sophia, Murat, Freya, Carson, Maya, Caravaggio)
- **Brainstorm Inputs**: 88-idea Telescope session + 362-idea Platform Expansion session (2026-03-21)
- **Related Specs**: 06 (Telescope Knowledge Surface), 07 (Strategic Vision), 08 (BaseBench-Meta), 09 (QuestionForge)

## Vision Statement

<!-- This vision describes v3.0 — the personal sovereign OS.
     The platform is ALSO expanding beyond personal use into a three-product strategy:
     UAIP Core (this), BaseBench-Meta (benchmark), QuestionForge (discovery council).
     See docs/specs/07-STRATEGIC-VISION-2026.md for the full multi-product vision.
     See docs/specs/06-TELESCOPE-KNOWLEDGE-SURFACE-PRD.md for the Telescope knowledge surface spec. -->

Navratna is a personal sovereign agent operating system that runs perpetually on local hardware, acts on behalf of its owner with explicit approval gates, connects to everything in read-only mode by default, and encodes its owner's judgment as policy — creating a digital continuity vessel that persists beyond any single session.

**Core Principle**: THOUGHT TO ACTION — the gap between thinking something and the system responding should be imperceptible.

## Product Pillars

### 1. The Sensorium (Read-Only Integrations)
Every external data source connects in observer mode. The system ingests, indexes, correlates, and surfaces. Write access is privilege escalation requiring explicit authenticated approval.

**Integrations (Phase 1)**:
| Integration | Ring | Mode | Current State | Priority |
|---|---|---|---|---|
| GOG (Gmail) | Ring 0 (Sovereign) | Read-only | Existing CLI tool in OpenClaw | P0 |
| GitHub | Ring 1 (Trusted) | Read + approved write | `gh` CLI exists | P0 |
| LinkedIn | Ring 1 (Trusted) | Read + approved write | Rishi agent posts via API | P1 |
| RSS | Ring 2 (Public) | Read-only | Mirror agent functional | P0 |
| WhatsApp (grouped) | Ring 0 (Sovereign) | Read + approved reply | Channel exists in OpenClaw | P1 |
| Slack | Ring 1 (Trusted) | Read (maybe) | Not built | P2 |

### 2. The Council (Agent Army)
14+ specialized agents ported from OpenClaw into Navratna's native Agent Intelligence Service. Each agent is a first-class entity with a persona, SOPs, communication style, and decision-making principles.

**Agent Roster**:
| Agent | Role | Origin | Navratna Service |
|---|---|---|---|
| Tardis | On-demand main assistant | OpenClaw | Agent Intelligence |
| Bhagwan (PM) | Project orchestration, task dispatch | OpenClaw | Orchestration Pipeline |
| Amy (Comms) | MIT stakeholder interface, intake/BA | OpenClaw | Agent Intelligence + Channel Gateway |
| Karna (Growth) | Lead hunting, market intelligence | OpenClaw | Agent Intelligence + Scheduled Events |
| Nidra (Research) | Overnight autonomous research | OpenClaw | Agent Intelligence + Scheduled Events |
| Rishi (Content) | LinkedIn posting, content strategy | OpenClaw | Agent Intelligence + Scheduled Events |
| Sharma (DevOps) | Infrastructure, CloudFlare deployment | OpenClaw | Capability Registry + OpenShell |
| Veda (Code Review) | PR review, GitHub integration | OpenClaw | Capability Registry + OpenShell |
| Rana (QA) | Browser test automation | OpenClaw | Capability Registry + OpenShell |
| Pixel (Frontend) | UI/UX implementation | OpenClaw | Capability Registry + OpenShell |
| Qadir (Tests) | Unit/integration test generation | OpenClaw | Capability Registry + OpenShell |
| Mahadev (Research) | Research, market intelligence | OpenClaw | Agent Intelligence |
| Mirror (RSS) | RSS/digest aggregation | OpenClaw | Agent Intelligence + Scheduled Events |
| Pronit-Mirror | Personal agent | OpenClaw | Agent Intelligence |

### 3. The Membrane (Approval Architecture)
Nothing crosses from "recommendation" to "action" without explicit, authenticated consent. The approval gate is the core IP — the decision boundary between AI suggestion and real-world impact.

**Trust Rings**:
```
Ring 0 — SOVEREIGN (local device only)
  Raw data ingestion, PII-bearing embeddings, decision memory,
  approval membrane, local LLM for sensitive reasoning

Ring 1 — TRUSTED CLOUD (your infrastructure)
  Sanitized task orchestration, public-facing agent actions,
  cloud LLMs for non-sensitive tasks

Ring 2 — PUBLIC (zero trust)
  Published content, public APIs, RSS, news, market data
  No PII ever reaches this ring
```

**Approval Tiers**:
| Risk Level | Action | Approval Mode |
|---|---|---|
| Low | Read data, fetch RSS, search knowledge | Auto-approve |
| Medium | Create GitHub issue, post to LinkedIn | Notification + auto-approve (configurable) |
| High | Push code, merge PR, send email, deploy | Explicit approval required |
| Critical | Financial transactions, credential rotation, infrastructure changes | Multi-factor approval |

### 4. The Memory (Triple-Store Knowledge)
PostgreSQL (structured) + Neo4j (graph relationships) + Qdrant (vector embeddings) — capturing not just facts but reasoning patterns, taste profiles, and decision history.

**Knowledge Architecture**:
- Every knowledge item exists with the same UUID across all three stores
- Automatic bidirectional sync via KnowledgeBootstrapService
- Decision journaling: every approval/denial + reasoning stored in Neo4j
- Taste profile learning from patterns (inherited from Nidra's taste-profile.md)

### 5. The Continuity Engine (Afterlife Layer)
Learned models of the owner's judgment that can operate autonomously within pre-defined guardrails, with succession policies.

**Components**:
- **The Pronit Model**: Persistent user cognitive model — work patterns, check habits, drill depth preferences
- **Decision History**: Not just what was decided, but WHY — stored in Neo4j graph
- **Decay Policies**: Which preferences the system holds sacred vs. adapts over time
- **Succession Logic**: Who inherits control, who can override

## Interface: The Telescope

The Telescope is not a dashboard. It's an Intent Surface — a living, breathing interface that shows what matters before you ask, and responds to your intent before you finish typing.

### Core UX Principles
1. **Ambient-First, Focus-Second**: Default state is "I already know what you need"
2. **Effort Gradient**: Zero effort (ambient) → Light (type to nudge) → Deep (precise queries)
3. **Four Working Memory Slots**: Never more than 4 primary items on the ambient surface
4. **The Silence is the Feature**: Empty telescope = everything is working
5. **Intent is a Vector, Not a String**: Multi-dimensional encoding compared via Qdrant

### Key Components — Implementation Status

| Component | Status | Lines | Location |
|-----------|--------|-------|----------|
| **IntentField** | ✅ BUILT + INTEGRATED | 606 | `apps/frontend/src/components/IntentField/` |
| **MaterializableBlock** | ✅ BUILT + INTEGRATED | 702 | `apps/frontend/src/components/MaterializableBlock/` |
| **Microexpression System** | ✅ BUILT + INTEGRATED | 168 | `apps/frontend/src/components/Microexpression/` |
| **Relevance Engine** | ✅ BUILT + INTEGRATED | 383 | `backend/services/agent-intelligence/src/services/relevance.ts` |
| **TelescopeSurface** | ⏳ NOT STARTED | — | Replaces DesktopUnified — Phase 2 |
| **Explanation Whisper** | ⏳ NOT STARTED | — | Data exists in agent-event-bus reasoning fields |
| **Ambient Stream Aggregator** | ⏳ NOT STARTED | — | Phase 2 |
| **Crystallization Renderer** | ⏳ NOT STARTED | — | Phase 2 |
| **Attention Budget Enforcer** | ⚠️ PARTIAL — primitives exist, explicit enforcement not built | ~50 | `useMaterializableBlocks` visibility model |

**IntentField Details**: 5 intent types (agent/portal/sop/knowledge/action), Cmd+K activation, fuzzy matching + WebSocket AI suggestions, relevance scoring with sparkle indicators.

**Relevance Engine Details**: 4-factor scoring — vector similarity (40%, Qdrant), graph relationships (30%, Neo4j), recency (20%, Redis sorted sets), keyword matching (10%, metadata). Endpoint at `POST /api/v1/agents/relevance` — **wired to IntentField** via `fetchRelevanceScores()` with 300ms debounce and graceful fallback to local fuzzy matching.

**Microexpression Details**: 7 states with oklch color space, 4 keyframe animations (pulse, alarm, blink, enter/exit), size variants (sm/md/lg), auto-transition to calm. Brainstorm suggested simplifying to 3 for v1 — rejected, all 7 are implemented and differentiate the product.

**MaterializableBlock Details**: Framer Motion animations, `withMaterializableBlock` HOC, `useMaterializableBlocks` hook, visibility states (visible/faded/hidden), z-index management, auto-arrange grid, relevance score badge, expression indicator integration.

### Integration Status
**UPDATE 2026-03-21**: All Phase 1 Telescope integration gaps are now CLOSED:
- IntentField: ✅ Wired — opens via Cmd+K, maps to portal navigation
- MaterializableBlock: ✅ Wired — 5 portals wrapped (Dashboard, AgentManager, Knowledge, Artifacts, Settings)
- MicroexpressionIndicator: ✅ Wired — `useAgentMicroexpression` dispatches `agent-activity` events from IntentField
- Relevance Engine: ✅ Wired — `fetchRelevanceScores()` calls `POST /api/v1/agents/relevance` with 300ms debounce, graceful fallback

Phase 1 Telescope components are fully built AND integrated. TelescopeSurface is the Phase 2 target that composes all components into the ambient paradigm.

### Tauri Shell
- Global hotkey from anywhere on OS
- System tray with ambient health indicator
- Native file system access for local MCP sidecars
- Deep links: `telescope://` protocol
- Multi-window pop-out blocks
- ~10MB binary (Rust native)

## Execution Layer: NVIDIA OpenShell

OpenShell provides sandboxed execution for all tools and coding agents with policy-enforced security.

### Integration Model
OpenShell exposed as MCP server → Navratna's Capability Registry calls it via MCP protocol.

### Sandbox Types
1. **Coding Workspaces**: Each repo gets its own persistent sandbox with Claude Code or OpenCode
2. **Tool Sandboxes**: Browser automation, GOG, scrapers, deploy tools — ephemeral
3. **GPU Inference**: Local models via Ollama in sandboxed environment

### Policy Enforcement (YAML per sandbox)
- **Filesystem**: Read-only by default, write paths explicitly whitelisted
- **Network**: Block unauthorized egress, all inference through Privacy Router
- **Process**: No privilege escalation, dangerous syscalls blocked
- **Inference**: Route model API calls through controlled backends

### Project-Based Configuration
```yaml
project:
  id: orthopulse-hq
  repo: github.com/tardis-create/orthopulse-hq
  storage_limit: 8GB
  providers:
    cloudflare: { scope: [pages, workers, r2] }
    github: { token_ref: vault://github/orthopulse }
  inference:
    primary: claude-sonnet-4-6
    fallback: [minimax-m2.5, glm-5, kimi-k2p5]
    trust_level: ring-1
  authorized_agents: [bhagwan, pixel, sharma, veda, rana, qadir]
  sandbox_policy: policies/coding-workspace.yaml
  coding_agent: claude-code
```

### Coding Workspace Lifecycle
1. Bhagwan receives task → assigns to repo sandbox
2. Orchestration Pipeline creates/reuses sandbox via OpenShell MCP
3. Claude Code picks up task, writes code, runs tests
4. PR created → Veda reviews in separate sandbox
5. Rana validates in browser-test sandbox
6. Membrane: PR merge requires owner approval
7. Sharma deploys via Cloudflare — approval-gated
8. Sandbox hibernates (volume persists, container stops)

## Infrastructure: Multi-Machine Local-First

### Machine Topology
```
PC-A (Memory + Intelligence):
  PostgreSQL, Neo4j, Qdrant, Redis, Ollama
  Agent Intelligence, LLM Service, Capability Registry

PC-B (Control + Compute):
  Security Gateway, Orchestration Pipeline
  OpenShell K3s (10 repo sandboxes)
  Tool sandboxes

Mac (Interface + Overflow):
  Tauri Telescope (primary interface)
  OpenShell K3s (10 repo sandboxes)
  Personal Claude Code sessions

RunPod (Burst Only):
  On-demand for: long tasks, GPU inference, overflow
  Ephemeral — joins Tailscale mesh, works, leaves

Networking: Tailscale WireGuard mesh (zero-config)
```

### Storage Strategy
- 20 repos × 4-12GB = 80-240GB repo data
- Persistent volumes per repo (survive sandbox hibernation)
- Shared dependency caches (pnpm-store, pip-cache)
- Context snapshots in Qdrant (survive sandbox death)
- Hot/Warm/Cold/Frozen repo lifecycle with nightly git fetch

### Cost Model (Local-First)
```
Fixed: ~$35-55/month (electricity, DNS, R2 cold storage)
Variable: ~$58-166/month (RunPod overflow, cloud LLM APIs)
Total: ~$93-220/month
```

## Technical Architecture Evolution

### Stack Decisions
| Current | Target | Rationale |
|---|---|---|
| TypeORM | Drizzle ORM | 10x faster, 0 runtime overhead, SQL at build time |
| RabbitMQ | BullMQ on Redis Streams | Eliminates 512MB container, Redis already running |
| 7 microservices | 2 consolidated services (Core + Gateway) | 3.5GB → 1GB RAM, zero inter-service latency |
| DesktopUnified (portal grid) | TelescopeSurface | Telescope vision replaces window manager entirely |
| 28 Docker containers | 9 containers | 10GB+ → 5GB RAM |
| Express remnants | Full Elysia | Already mostly there, complete the migration |

### Service Consolidation
```
Service A: "CORE" (single process ~512MB)
  Agent Intelligence + Discussion Orchestration +
  Artifact Service + LLM Service

Service B: "GATEWAY" (single process ~512MB)
  Security Gateway + Orchestration Pipeline +
  Capability Registry
```

### Infrastructure Cuts
- MinIO → R2/S3 direct (saves 256MB)
- TEI Embeddings → Ollama (already needed for local LLM)
- Prometheus/Loki/Grafana stack → Grafana Cloud free tier
- Marketplace Service → not needed for personal OS
- Enterprise compose → sovereign, not SOC2

## Build Phases

<!-- STATUS AS OF 2026-03-21:
     Phase 0: NOT STARTED (Sprint 1 begins 2026-03-24)
     Phase 1: Telescope components BUILT + FULLY INTEGRATED. OpenClaw port in progress. httpOnly cookies partially done.
     Phase 2-5: NOT STARTED

     NOTE: IntentField, MaterializableBlock, Microexpressions, and relevance() were built
     during v3.0 planning, BEFORE Sprint 1 formally started. They are marked [x] below.
     See docs/project/NEXT_PHASES.md for the "Already Complete" section and revised sprint tasks.

     INTENT TYPES: The IntentField uses 5 categories (agent/portal/sop/knowledge/action) for
     input classification. The Universal Intent Router (Phase 3) adds routing types
     (QUERY/COMMAND/MONITOR/ORCHESTRATE/COMMUNICATE) that determine HOW the intent is processed.
     These are complementary, not conflicting — category is WHAT, router type is HOW. -->

### Phase 0: Infrastructure Foundation (Week 0)
- [ ] Tailscale mesh: PC-A ↔ PC-B ↔ Mac
- [ ] PC-A: PostgreSQL + Neo4j + Qdrant + Redis + Ollama
- [ ] PC-B: Security Gateway + Orchestration Pipeline (consolidated)
- [ ] Create .env template, fix Docker version mismatches
- [ ] Database init scripts + seed data
- [ ] OpenShell installed on PC-B + Mac

### Phase 1: Telescope Foundation + Agent Port (Week 1-2)
- [x] IntentField (merged cmdk + autocomplete + search) — ✅ 606 lines, fully integrated (Cmd+K, portal navigation)
- [x] relevance() scoring function → existing triple-store — ✅ 383 lines, 4-factor, wired to IntentField (300ms debounce, graceful fallback)
- [x] MaterializableBlock HOC (wraps existing portals) — ✅ 702 lines, fully integrated (5 portals wrapped)
- [x] Microexpression system (7 states) — ✅ 168 lines, fully integrated (useAgentMicroexpression dispatches agent-activity events)
- 🔄 PORT: 14 OpenClaw agent personas → Agent Intelligence — DB seeded, import services built
- 🔄 PORT: SOPs + task lifecycle → Orchestration Pipeline — SOP import service built
- 🔄 PORT: Model routing configs → LLM Service — 4/13+ skills imported, 6 providers not migrated
- 🔄 PORT: Skills → Capability Registry — 4 skills in manifest, 9+ remaining
- [x] CODE SPLITTING: React.lazy() for 19 portals — ✅ done
- 🔄 httpOnly cookie migration — backend sets cookies, frontend partially migrated, remaining localStorage auth reads to clean up

### Phase 2: Telescope Surface + OpenShell (Week 2-3)
- TelescopeSurface replaces DesktopUnified (feature-flagged)
- Ambient stream aggregator (Socket.IO unified)
- Crystallization renderer (blurry→sharp materialization)
- OpenShell MCP integration in Capability Registry
- Coding workspace sandbox template (golden image)
- Project-based auth configs (YAML per repo)
- First coding sandbox: Claude Code in OpenShell
- Sandbox state → Telescope block rendering

### Phase 3: Intelligence + Sensorium (Week 3-4)
- Predictive Intent Model
- Universal Intent Router (QUERY/COMMAND/MONITOR/ORCHESTRATE)
- Attention Budget (4 slots, continuous dimmer)
- Intent chaining → operation pipelines
- GOG (Gmail), GitHub, RSS integrations as Sensorium feeds
- WhatsApp bridge (local, grouped)
- Approval membrane in Security Gateway

### Phase 4: Tauri + Multi-Machine (Week 4-5)
- Tauri shell wrapping Telescope
- Global hotkey, system tray, deep links
- Multi-machine task routing (volume affinity)
- RunPod burst integration
- Context snapshots (survive sandbox death)
- Repo volume warming/cooling strategy
- Local MCP sidecars via Tauri

### Phase 5: Continuity + Polish (Week 5-6)
- Decision journaling (every approval → Neo4j)
- The Pronit Model (learned preferences)
- Multiplayer cursors (human + agent)
- MCP extension discovery
- Telescope snapshots (shareable cognitive states)
- Cron migration (21 OpenClaw jobs → orchestration events)

## Success Metrics
- **Time to first intent response**: < 100ms (cmdk fuzzy) + < 500ms (Qdrant semantic)
- **Cold start (machine boot to functional Telescope)**: < 90 seconds
- **RAM usage (full stack)**: < 5GB on modest hardware
- **Coding sandbox spin-up (warm)**: < 60 seconds
- **Approval latency (notification to owner)**: < 5 seconds
- **Agent task completion rate**: > 80% without human intervention
- **Decision journal coverage**: 100% of approval/denial actions logged

## Non-Functional Requirements
- **Privacy**: No private data leaves local devices without explicit consent
- **Availability**: System continues operating when any single machine is offline (degraded mode)
- **Security**: Zero-trust between all planes, mTLS on inter-machine calls, ephemeral tokens
- **Extensibility**: MCP IS the extension system — any MCP server is a telescope capability
- **Portability**: Tauri binary runs on macOS, Windows, Linux

## Dependencies
- NVIDIA OpenShell (Rust/K3s) — sandbox runtime
- ACP (Agent Connect Protocol) — agent interoperability
- Claude Code / OpenCode — coding agents
- Tailscale — WireGuard mesh networking
- Drizzle ORM — database access layer
- BullMQ — job queue on Redis Streams
- Tauri 2.x — native shell

## Platform Expansion Vision (Beyond v3.0)

<!-- Source: 362-idea brainstorming session (2026-03-21).
     Full output: _bmad-output/brainstorming/brainstorming-session-2026-03-21-111555.md
     Full strategic vision with codebase alignment: docs/specs/07-STRATEGIC-VISION-2026.md
     Related product specs: docs/specs/08-BASEBENCH-META.md, docs/specs/09-QUESTIONFORGE.md -->

### Strategic Direction: Three Products, One Platform

Navratna evolves from personal sovereign agent OS → **metacognitive business intelligence platform.**

| Product | What | Spec |
|---------|------|------|
| **UAIP Core** | Metacognitive agent platform + Telescope UX | `docs/specs/07-STRATEGIC-VISION-2026.md` |
| **BaseBench-Meta** | Metacognitive reliability benchmark (tests epistemic behavior, not answer quality) | `docs/specs/08-BASEBENCH-META.md` |
| **QuestionForge** | Stakeholder discovery council (8 specialist agents, debate mechanics) | `docs/specs/09-QUESTIONFORGE.md` |

**Convergence thesis:** BaseBench-Meta **measures** metacognitive intelligence, UAIP Core **implements** it in production, QuestionForge **demonstrates** it as a product.

The core architectural insight: verticals (finance, HR, legal, marketing) are just ontologies the AI loads — not separate modules to build. Business domains plug into existing Persona/Discussion/Artifact/Operation systems.

### Trust Sequence (Cannot Skip Levels)
| Level | State | Timeline | Capability |
|-------|-------|----------|------------|
| L0 | "Shows accurate info" | Weeks 1-4 | Data ingestion, knowledge graph, search |
| L1 | "Surfaces what I'd have found, faster" | Months 1-2 | Relevance engine, ambient intelligence |
| L2 | "Shows what I didn't know I needed" | Months 2-4 | Cross-referencing, intent prediction, anomaly detection |
| L3 | "Acts for me on low-stakes tasks" | Months 4-8 | Autonomous workflows with approval gates |
| L4 | "Acts for me on high-stakes tasks" | Year 1+ | Full autonomy within earned trust envelope |

*Current users (20) are at L0→L1 transition. Telescope pushes to L1. Chat knowledge ingestion pushes to L2.*

### P0 Priorities (Feasibility × Value Overlap)
| Priority | Idea | Why Feasible | Why Valuable |
|----------|------|-------------|-------------|
| **P0** | Relevance Engine | ✅ relevance.ts exists | Foundation for entire Telescope UX |
| **P0** | MCP Extension Marketplace | marketplace-service + MCP client/server exist | Growth engine, ecosystem moat |
| **P0** | Federated Company Graph | Triple-store deployed, knowledge graph viz exists | Data gravity, foundation for high-value features |
| **P1** | Intent Chaining | Orchestration pipeline handles multi-step | "Wow" moment, demo virality |
| **P1** | Handoff Elimination | Orchestration + MCP provide execution layer | Directly measurable ROI |
| **P1** | Data Exhaust Recycling | Bake into relevance engine from day one | Invisible moat that compounds |

### What NOT to Build First
1. Agent-Generated Modules — No immune system to reject garbage yet. Year 2.
2. AI Supply Chain / Market Microstructure — Requires trust infrastructure that doesn't exist in business law.
3. Synthetic CFO / Platform Lending — Crosses into banking regulation.
4. OpCredits internal currency — Simplify to usage metering in real money for v1.

### Nuclear Combinations (from brainstorm convergence)
1. **"Negative-Latency Business"** — Predictive intent + speculative rendering + onboarding wormhole
2. **"Self-Smelting Knowledge Economy"** — Block primitives + usage smelting + ontology marketplace
3. **"Friction Vampire Finance Stack"** — Unified ledger + payment rail + embedded finance
4. **"Immortal Nervous System"** — Reflexes + circuit breakers + adaptive immunity + dream cycle
5. **"Disappearing Company-in-a-Box"** — Bootstrap → 50-person output with simplifying interface

### Philosophical Framework
**"Understand → Decide → Act → Learn"** — Every capability maps to a phase. Cognitive Shell uses it to decide what surfaces vs. stays ambient.

### Soul of the Platform
"When you open Navratna, it's already alive — showing what matters. Typing is an interruption of already-running intelligence."

### 5 "Can't Go Back" Hooks
1. Ambient Morning Open (system already knows what matters today)
2. Inline Intent Completion (thought → action gap imperceptible)
3. Handoff Elimination (50 invisible micro-frictions removed)
4. Explanation Whisper Line (system earns trust through transparency)
5. Institutional Memory (queryable company history)

### Key Design Decisions
- **Keep biological metaphors** — memory consolidation, microexpressions, metabolic rate ARE the product language, not dev jargon
- **Keep all 7 microexpressions** — brainstorm suggested simplifying to 3, but all 7 are built and differentiate
- **Schema-on-Intent over Schema-on-Write** — simplified to schema-on-write with AI suggestions for v1
- **Ontology marketplace over app marketplace** — knowledge, not code packages

## Existing Learning Infrastructure (Validated)

*Often assumed missing but actually built. Documented here to prevent re-building.*

### Agent Learning System
- `agent-learning.service.ts` (685 lines) — learns from operations + interactions, confidence adjustments ±0.2
- 3-tier memory: working (pressure-based), episodic (significance scoring), semantic (concept confidence + usage tracking)
- Memory consolidation: working → episodic → semantic (triggered by pressure or manual)
- 4 event subscriptions: `agent.learning.operation`, `.interaction`, `.consolidate`, `.update`

### Observability
- `agent-event-bus.ts` (483 lines) — decisions logged with selectedAction, alternatives, confidence, reasoning, duration
- Decision engine: 0.5 confidence minimum, execution plans with estimated durations
- Persona analytics: interaction/quality/usage/performance metrics with trend analysis
- Audit service: 365-day retention, risk levels (LOW/MEDIUM/HIGH/CRITICAL), batch compression

### Conversation Intelligence
- Intent detection with 5-min TTL cache, 0.7 confidence threshold
- Prompt suggestions (3 per query, 0.7 personalization weight)
- Autocomplete (5 suggestions, 300ms debounce, history + tools)
- Topic generation (minimum 3 messages per topic)

### Knowledge Graph Pipeline
Chat parsers (Claude/ChatGPT/WhatsApp/generic) → content classifier → concept extractor → relationship detector → workflow extractor → expertise analyzer → learning detector (7 types) → ontology builder → taxonomy generator → clustering → Q&A generator → embeddings → triple-store sync → reconciliation

## Risk Register

<!-- Updated 2026-03-21 with risks identified during party mode strategic session -->

| Risk | Impact | Mitigation |
|---|---|---|
| OpenShell not mature enough | High | Fallback to raw Docker containers with custom policy scripts |
| 5GB RAM target too aggressive | Medium | Prioritize service consolidation, accept 6-7GB |
| Drizzle migration breaks things | Medium | Feature-flag: TypeORM stays as fallback during migration |
| Tauri WebKit performance on Linux | Medium | Benchmark first, degrade animations on low-perf |
| RunPod cold start too slow | Low | Pre-warmed volumes, context snapshots, golden images |
| Relevance engine surfaces wrong items with high confidence | High | Measurement harness (50 labeled queries) before shipping to all users |
| Knowledge graph force-directed layout too slow for 500+ nodes | High | Cluster first (constellations), render as single blocks, expand on interaction |
| Value leaks through Jira/Notion export (learning loop broken) | High | Bidirectional sync via existing adapters + outcome feedback to knowledge graph |
| Zero frontend tests for Telescope components | High | Build tests alongside components (see test traceability report) |
| Users don't upload chat history during onboarding | Medium | Make optional, show value with just tool connections first |
| v2.0 stale documentation misleads contributors | Medium | Mark v2.0 docs as archived, update ARCHITECTURE.md for v3.0 |
