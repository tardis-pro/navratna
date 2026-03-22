# Current Sprint Plan — Navratna v3.1

## Document Control

- **Last Updated**: 2026-03-21
- **Sprint Cadence**: 2-week sprints
- **Current Phase**: Phase 1 COMPLETE (Telescope built + integrated), Phase 0 infra NOT STARTED (Sprint 1 begins 2026-03-24)
- **Note**: Phase 1 Telescope components built AND integrated ahead of sprint schedule (see "Already Complete" below). Remaining Phase 1 work: OpenClaw port completion + httpOnly cookie migration + OpenShell sandbox.

<!-- STATUS KEY: [x] = done, 🔄 = in progress, [ ] = not started -->

## Already Complete (Built Ahead of Sprint Schedule)

<!-- These components were built during the v3.0 planning phase, before Sprint 1 formally started.
     They are recorded here to prevent duplication and clarify what Sprint 2 actually needs to deliver. -->

### Telescope Phase 1 Components — BUILT + FULLY INTEGRATED

<!-- Line counts verified against PRD 00 §Key Components (updated by user 2026-03-21).
     All integration gaps CLOSED per 00-PRD §Integration Status (2026-03-21):
     - IntentField: Cmd+K, portal navigation
     - MaterializableBlock: 5 portals wrapped (Dashboard, AgentManager, Knowledge, Artifacts, Settings)
     - Microexpression: useAgentMicroexpression dispatches agent-activity events from IntentField
     - Relevance: fetchRelevanceScores() calls POST /api/v1/agents/relevance with 300ms debounce, graceful fallback -->

- [x] **IntentField** component (606 lines) — merged cmdk + GlobalAutocomplete + KnowledgeSearch, 5 intent types (agent/portal/sop/knowledge/action), Cmd+K activation, fuzzy matching + WebSocket AI suggestions. **Fully integrated** — Cmd+K, portal navigation, wired to relevance engine.
- [x] **MaterializableBlock** HOC (702 lines) — Framer Motion animations, withMaterializableBlock HOC, useMaterializableBlocks hook, visibility states (visible/faded/hidden), z-index management, auto-arrange grid, relevance score badge. **Fully integrated** — 5 portals wrapped (Dashboard, AgentManager, Knowledge, Artifacts, Settings).
- [x] **Microexpression system** (168 lines) — 7 states (calm/attentive/working/alarmed/confused/satisfied/strained), oklch colors, 4 keyframe animations, size variants (sm/md/lg), auto-transition. **Fully integrated** — `useAgentMicroexpression` dispatches `agent-activity` events from IntentField.
- [x] **Relevance engine** (383 lines) — 4-factor scoring: vector similarity 40% (Qdrant), graph relationships 30% (Neo4j), recency 20% (Redis sorted sets), keyword matching 10% (metadata). Endpoint at `POST /api/v1/agents/relevance`. **Fully integrated** — `fetchRelevanceScores()` with 300ms debounce, graceful fallback to local fuzzy matching.
- [x] **Code splitting** — React.lazy for 19 portals (already done)

### OpenClaw Port — PARTIALLY DONE

- [x] 14 agent personas seeded in DB with `origin: "openclaw"` metadata
- [x] `skillImport.service.ts` built — reads from `/openclaw-infra/skills/`, 4 skills imported (anti-ai-writing, capability-evolver, project-context-sync, persona-adapter)
- [x] `sopImport.service.ts` built — reads SOUL.md and PROJECT_SOP.md from `/openclaw-infra/agents/`
- [x] `openclaw-skills.json` manifest with origin tracking
- 🔄 9+ skills remaining to import
- 🔄 6 LLM providers / 30+ models not migrated to LLM Service
- [ ] 21 cron jobs not migrated (planned Q2 2026)
- [ ] 6 Lobster workflows not converted (planned Sprint 2+)

### Integrations — WORKING IN PRODUCTION

- [x] Jira adapter — full bidirectional (create/update/search issues, sprints, transitions, comments), OAuth2
- [x] Confluence adapter — full bidirectional (pages, attachments, comments, blog posts), OAuth2
- [x] GitHub adapter — repos, files, issues, PRs, OAuth2
- [x] Slack adapter — messages, channels, OAuth2
- [x] MCP client service — full protocol (JSON-RPC 2.0, stdio/http/streaming, 20+ API endpoints, tool discovery, analytics, Neo4j relationships)
- [x] Canva — via external MCP server (partially working)
- [x] Notion — via external MCP server (not native adapter)

---

## Sprint 1: Infrastructure Foundation (2026-03-24 → 2026-04-04)

### Goals

- Multi-machine topology operational
- Service consolidation complete
- OpenShell installed and tested
- Database init scripts created

### Tasks

- [ ] Create .env.example with all 30+ required variables
- [ ] Pin all Docker image versions (fix postgres:latest, minio:latest, reranker:latest)
- [ ] Fix version mismatches (Qdrant 1.14.1 vs 1.7.4, RabbitMQ 4.1.0 vs 3.12)
- [ ] Create database init scripts (PostgreSQL + Neo4j + Qdrant)
- [ ] Create docker-compose-pca.yml (PC-A: databases + core service)
- [ ] Create docker-compose-pcb.yml (PC-B: gateway + nginx + OpenShell)
- [ ] Install Tailscale on all 3 machines, verify mesh connectivity
- [ ] Install NVIDIA OpenShell on PC-B + Mac
- [ ] Consolidate services: navratna-core (3001) and navratna-gateway (3002)
- [ ] Pre-build golden container image (navratna/coding-workspace)
- [ ] Verify full stack starts in < 90 seconds
- [ ] Remove: MinIO, TEI, monitoring stack, Marketplace Service

### Definition of Done

- All 3 machines can reach each other via Tailscale
- Navratna Core (PC-A) and Gateway (PC-B) are healthy
- OpenShell can create and destroy a test sandbox
- Database queries work cross-machine

## Sprint 2: Agent Port Completion + Telescope Integration (2026-04-07 → 2026-04-18)

<!-- NOTE: Telescope Phase 1 components are ALREADY BUILT (see "Already Complete" above).
     This sprint focuses on COMPLETING the OpenClaw port and INTEGRATING components into the live UI,
     not building them from scratch. -->

### Goals

- All 14 OpenClaw agents fully functional in Navratna
- Telescope components integrated into live UI (not just built in isolation)
- First coding sandbox operational

### Tasks

#### OpenClaw Port Completion

- [ ] Import remaining 9+ skills to Capability Registry
- [ ] Migrate 6 LLM providers + 30+ model configs to LLM Service
- [ ] Convert Lobster workflows to Navratna operation definitions
- [ ] Verify all 14 agents respond in-character with correct personas

#### Telescope Integration (components exist — wiring COMPLETED 2026-03-21)

<!-- 2026-03-21: All integration gaps addressed by dedicated implementation. -->

- [x] Wire IntentField into DesktopUnified/AppShell (Cmd+K globally accessible) — **DONE**
- [x] Wire MaterializableBlock HOC onto 3-5 high-traffic portals — **DONE** (Dashboard + AgentManager + Knowledge + Artifacts + Settings = 5 portals)
- [x] Wire Microexpression indicators to actual agent/system state — **DONE** (useAgentMicroexpression hook dispatches agent-activity events)
- [x] Wire relevance() backend (`POST /api/v1/agents/relevance`) to IntentField result ranking — **DONE** (fetchRelevanceScores debounced 300ms, graceful fallback)

#### Remaining Phase 1 Tasks

<!-- Code splitting already done (19 portals) — moved to Already Complete section above -->

- [x] Migrate auth tokens to httpOnly cookies — **PARTIALLY DONE** (backend sets httpOnly cookies, frontend conversationEnhancement.api.ts now reads from cookies instead of localStorage, credentials: 'include' added)
- [ ] Complete frontend auth to rely solely on httpOnly cookies (remove any remaining localStorage auth reads)
- [ ] Create first project config: orthopulse-hq.yaml
- [ ] Boot Claude Code in OpenShell sandbox with project config
- [ ] Verify Claude Code can create a PR from sandbox

### Definition of Done

- Typing "Tardis" in IntentField surfaces the Tardis agent with correct persona
- MaterializableBlock-wrapped portals show relevance scores and microexpressions
- Claude Code in sandbox can: clone repo, write code, run tests, create PR
- Initial bundle size reduced by > 50%

## Sprint 3: Telescope Surface + Knowledge Constellations (2026-04-21 → 2026-05-02)

<!-- NOTE: This sprint builds TelescopeSurface — the container that composes IntentField +
     MaterializableBlock + Microexpressions + relevance() into the new paradigm.
     Also addresses knowledge clutter problem via constellation architecture.
     See docs/specs/06-TELESCOPE-KNOWLEDGE-SURFACE-PRD.md for full spec. -->

### Goals

- TelescopeSurface is the default interface (feature-flagged alongside DesktopUnified)
- Knowledge nodes organized into constellations with intent-driven layout
- Read-only integrations feeding ambient layer
- Approval membrane functional

### Tasks

#### TelescopeSurface

- [ ] Build TelescopeSurface.tsx (composes IntentField + MaterializableBlock + Microexpressions)
- [ ] Replace Dagre layout with force-directed physics (d3-force or custom Framer springs)
- [ ] Implement intent gravity (typing in IntentField shifts constellation positions)
- [ ] Implement attention budget enforcement (4 visible constellations max, rest faded/hidden)
- [ ] Build crystallization renderer (blurry→sharp materialization via relevance score)
- [ ] Build morphing transitions (spring physics when intent changes)
- [ ] Feature flag: toggle between TelescopeSurface and legacy DesktopUnified

#### Knowledge Constellations

- [ ] Constellation clustering via Qdrant vector proximity
- [ ] Render constellations as nested MaterializableBlocks (collapsible groups)
- [ ] Map 7 microexpression states to knowledge lifecycle (see spec 06)
- [ ] Build WhisperLine component ("Showing this because..." from relevance reasoning)

#### Sensorium

- [ ] Integrate GOG Gmail as read-only Sensorium feed
- [ ] Integrate GitHub watch (repos, issues, PRs) as ambient blocks
- [ ] Integrate RSS (migrate Mirror agent) as ambient intelligence feed
- [ ] Build Ambient Stream Aggregator (unified Socket.IO for all feeds)

#### Membrane

- [ ] Build Approval Queue in Security Gateway
- [ ] Build approval UI as ambient interrupt in Telescope (alarmed microexpression)

### Definition of Done

- Telescope shows ambient data from Gmail + GitHub + RSS as constellations
- Knowledge nodes cluster semantically, reorganize when intent changes
- Only 4 constellations visible at once, rest faded
- Approval requests surface as alarmed-expression ambient interrupts
- Users can approve/deny from Telescope without leaving the surface
- Feature flag allows switching between Telescope and legacy Desktop
- WhisperLine explains why each visible constellation is shown

## Future Sprints (Planned)

- Sprint 4: Tauri Shell + Multi-Machine Routing
- Sprint 5: BullMQ Migration + Drizzle Migration Start
- Sprint 6: Continuity Engine + Decision Journaling + Jira Outcome Feedback Loop
- Sprint 7: Telescope Polish + Performance + Onboarding (Welcome Constellation + Chat Ingestion)
- Sprint 8: OpenClaw Archive + Production Hardening + BaseBench-Meta v1
