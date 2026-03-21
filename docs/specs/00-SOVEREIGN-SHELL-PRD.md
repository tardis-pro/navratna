# Navratna: The Sovereign Cognitive Shell — Product Requirements Document

## Document Control
- **Version**: 3.0
- **Date**: 2026-03-21
- **Status**: APPROVED FOR IMPLEMENTATION
- **Author**: Pronit Das + BMAD Council (Victor, Dr. Quinn, Saga, Sophia, Murat, Freya)

## Vision Statement

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

### Key Components
- **IntentField**: Merged cmdk + GlobalAutocomplete + KnowledgeSearch — polymorphic input
- **TelescopeSurface**: Physics-based layout with Framer Motion, replaces DesktopUnified
- **MaterializableBlock**: HOC wrapping existing portals — portal code unchanged
- **Microexpression System**: 7 states (Calm, Attentive, Working, Alarmed, Confused, Satisfied, Strained)
- **Explanation Whisper**: Persistent reasoning transparency line
- **Relevance Engine**: `relevance(entity, intent, context) → score` using existing triple-store

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
| 7 microservices | 2-3 consolidated services | 3.5GB → 1GB RAM, zero inter-service latency |
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

### Phase 0: Infrastructure Foundation (Week 0)
- Tailscale mesh: PC-A ↔ PC-B ↔ Mac
- PC-A: PostgreSQL + Neo4j + Qdrant + Redis + Ollama
- PC-B: Security Gateway + Orchestration Pipeline (consolidated)
- Create .env template, fix Docker version mismatches
- Database init scripts + seed data
- OpenShell installed on PC-B + Mac

### Phase 1: Telescope Foundation + Agent Port (Week 1-2)
- IntentField (merged cmdk + autocomplete + search)
- relevance() scoring function → existing triple-store
- MaterializableBlock HOC (wraps existing portals)
- Microexpression system (7 states)
- PORT: 14 OpenClaw agent personas → Agent Intelligence
- PORT: SOPs + task lifecycle → Orchestration Pipeline
- PORT: Model routing configs → LLM Service
- PORT: Skills → Capability Registry
- CODE SPLITTING: React.lazy() for all portals
- httpOnly cookie migration (security fix)

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

## Risk Register
| Risk | Impact | Mitigation |
|---|---|---|
| OpenShell not mature enough | High | Fallback to raw Docker containers with custom policy scripts |
| 5GB RAM target too aggressive | Medium | Prioritize service consolidation, accept 6-7GB |
| Drizzle migration breaks things | Medium | Feature-flag: TypeORM stays as fallback during migration |
| Tauri WebKit performance on Linux | Medium | Benchmark first, degrade animations on low-perf |
| RunPod cold start too slow | Low | Pre-warmed volumes, context snapshots, golden images |
