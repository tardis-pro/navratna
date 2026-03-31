# Telescope Knowledge Surface & Platform Activation — PRD

## Document Control

- **Version**: 1.1
- **Date**: 2026-03-21
- **Last Verified**: 2026-03-30
- **Status**: ACTIVE — TelescopeSurface built, DesktopUnified deleted
- **Source**: BMAD Party Mode with 9 agents + Karpathy/Elon/Pichai/Zuckerberg mental models
- **Inputs**: 88-idea Telescope brainstorm, 362-idea platform expansion brainstorm, product brief, content language strategy, user stories, test traceability report, full codebase audit
- **Related Specs**: 00 (Sovereign Shell PRD), 07 (Strategic Vision), 08 (BaseBench-Meta), 09 (QuestionForge)

---

## Executive Summary

<!-- This PRD focuses on the Telescope Knowledge Surface — the first Telescope-native surface
     that proves the paradigm for all other surfaces. It was distilled from a full-day strategic
     session (2026-03-21) involving 9 BMAD agents analyzing the codebase, user behavior data,
     two brainstorming sessions (88 + 362 ideas), product brief, and content language strategy.

     For the broader platform vision (three products, metacognitive agents, business OS expansion),
     see docs/specs/07-STRATEGIC-VISION-2026.md. -->

Navratna is a 50K LOC, 10-month-old multi-user metacognitive agent platform with 20 active users, 57 database entities, 3 running services (navratna-core, navratna-gateway, questionforge — consolidating 7 legacy modules via FeatureFactory), a triple-store knowledge graph (PG/Neo4j/Qdrant), 4 working OAuth adapters (Jira/Confluence/GitHub/Slack), full MCP protocol support, a 685-line agent learning system, 3-tier cognitive memory, and a conversation intelligence engine. The backend is ~90% complete. DesktopUnified.tsx has been **deleted** — TelescopeSurface is now the primary frontend.

The platform is expanding into three convergent products: **UAIP Core** (agent platform + Telescope UX), **BaseBench-Meta** (metacognitive benchmark), and **QuestionForge** (stakeholder discovery council). See `docs/specs/07-STRATEGIC-VISION-2026.md` for full vision.

The Telescope is the frontend that finally matches the backend. Phase 1 components (IntentField, MaterializableBlock, Microexpressions, Relevance Engine) are BUILT + FULLY INTEGRATED (~1,859 lines). The critical next step is TelescopeSurface — and this PRD argues that **knowledge is the first Telescope surface** because it's the most visible pain point and proves the paradigm for every other surface.

---

## The Problem

### Knowledge Display Is Broken

`KnowledgeGraphVisualization.tsx` (616 lines) uses Dagre hierarchical layout with:

- Fixed node sizes (200x80), no relevance-based scaling
- Static colors by type only, no visual weight by importance
- 12 arbitrary initial nodes (not the 12 most relevant)
- Hard graph reset on filter change (no morphing)
- Zero clustering logic
- Zero connection to the relevance engine (383 lines, already built)
- Uniform edges (all gray, all animated, no relationship-strength variation)

**Result**: Users see a cluttered dump of equally-weighted nodes that doesn't reorganize around their intent.

### Value Leaks Through Export

User behavior data (20 users, March 2026):

| Usage Pattern                    | Users    | Value Leak                                                  |
| -------------------------------- | -------- | ----------------------------------------------------------- |
| Codebase exploration             | Majority | Low — stays in knowledge graph                              |
| Planning → export to Jira/Notion | Many     | **CRITICAL** — artifact leaves system, learning loop breaks |
| RSS intelligence gathering       | Some     | Medium                                                      |
| Marketing campaign prep          | Some     | Medium — depends on workflow                                |
| Financial planning               | Some     | **HIGH** — likely exported to spreadsheets                  |

Plans created in Navratna leave for Jira/Notion. Financial models leave for spreadsheets. The learning system (agent-learning.service.ts, episodic memory, semantic memory) is **starved of outcome data** because highest-value activities exit the system before feedback loops close.

### The Paradigm Gap

The product brief defines: _"Intent replaces navigation. No pages, no routes, no menus. One intent field, one rendering surface."_

The previous UI (DesktopUnified, now deleted) had 30+ portals in a window manager. DesktopUnified has been replaced by TelescopeSurface, but the portal-as-tab paradigm persists in lazy-loaded portal components. The Telescope vision demands intent-driven surfacing, not tab navigation.

---

## The Solution

### Core Principle

Every UI decision flows from one function:

```
relevance(entity, intent, context) → score
```

This score determines what appears, where, how bright, how large. The entire interface is a real-time projection of relevance scores onto a spatial surface.

### Knowledge as First Telescope Surface

Build the knowledge experience as the first Telescope-native surface. It proves the pattern that discussions, tasks, agents, and integrations follow.

---

## Architecture

### What Already Exists (No Rebuild Needed)

<!-- Line counts and integration status from PRD 00 §Key Components + §Integration Status, verified 2026-03-21.
     All 4 integration gaps CLOSED same day: relevance wired to IntentField, 5 portals wrapped,
     microexpressions driven by agent state via useAgentMicroexpression hook. -->

| Component                                 | Status                                                     | Location                                                                                | Lines     |
| ----------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| IntentField                               | ✅ BUILT + FULLY INTEGRATED                                | `apps/frontend/src/components/IntentField/`                                             | 606       |
| MaterializableBlock + HOC + hook          | ✅ BUILT + FULLY INTEGRATED (5 portals)                    | `apps/frontend/src/components/MaterializableBlock/`                                     | 702       |
| Microexpression system (7 states)         | ✅ BUILT + FULLY INTEGRATED (agent-driven)                 | `apps/frontend/src/components/Microexpression/`                                         | 168       |
| Relevance engine (4-factor)               | ✅ BUILT + WIRED TO INTENTFIELD (300ms debounce, fallback) | `backend/services/agent-intelligence/src/services/relevance.ts`                         | 383       |
| Agent learning service                    | BUILT                                                      | `backend/services/agent-intelligence/src/services/agent-learning.service.ts`            | 685       |
| Agent event bus (telemetry)               | BUILT                                                      | `backend/shared/services/src/observability/agent-event-bus.ts`                          | 483       |
| Conversation intelligence                 | BUILT                                                      | `backend/services/agent-intelligence/src/services/conversation-intelligence.service.ts` | ~150      |
| 3-tier memory (working/episodic/semantic) | BUILT                                                      | `backend/shared/services/src/agent-memory/agent-memory.service.ts`                      | ~150      |
| Decision engine (confidence)              | BUILT                                                      | `backend/shared/services/src/agent/agent-intelligence/decision-engine.ts`               | ~150      |
| Persona analytics                         | BUILT                                                      | `backend/shared/services/src/entities/personaAnalytics.entity.ts`                       | 125       |
| Knowledge graph pipeline (15 services)    | BUILT                                                      | `backend/shared/services/src/knowledge-graph/`                                          | Extensive |
| Chat parsers (Claude/GPT/WhatsApp)        | BUILT                                                      | `backend/shared/services/src/knowledge-graph/chat-parser.service.ts`                    | —         |
| Triple-store sync (UUID consistent)       | BUILT                                                      | `backend/shared/services/src/knowledge-graph/knowledge-sync.service.ts`                 | —         |
| Jira adapter (bidirectional)              | BUILT                                                      | `backend/services/capability-registry/src/adapters/jira-adapter.ts`                     | —         |
| Confluence adapter (bidirectional)        | BUILT                                                      | `backend/services/capability-registry/src/adapters/confluence-adapter.ts`               | —         |
| GitHub adapter                            | BUILT                                                      | `backend/services/capability-registry/src/adapters/github-adapter.ts`                   | —         |
| Slack adapter                             | BUILT                                                      | `backend/services/capability-registry/src/adapters/slack-adapter.ts`                    | —         |
| MCP client service (full protocol)        | BUILT                                                      | `backend/services/capability-registry/src/services/mcpClientService.ts`                 | —         |
| Framer Motion                             | INSTALLED                                                  | `framer-motion ^12.18.1`                                                                | —         |
| @xyflow/react                             | INSTALLED                                                  | `@xyflow/react ^12.8.1`                                                                 | —         |
| cmdk                                      | INSTALLED                                                  | `cmdk ^1.1.1`                                                                           | —         |

### What Must Be Built

#### 1. Constellation Clustering

Semantically related knowledge nodes grouped into **constellations** (product terminology — not "clusters").

**Implementation**: Qdrant vector proximity → group nodes within similarity threshold → render as nested MaterializableBlock containing child MaterializableBlocks.

Each constellation:

- Has a name (auto-generated from dominant topic)
- Has a microexpression (health of the knowledge cluster)
- Is collapsible (click to expand into individual nodes)
- Has a relevance score (aggregate of children)
- Morphs position based on intent gravity

#### 2. Force-Directed Layout with Intent Gravity

Replace Dagre with physics simulation:

| Force         | Source                         | Effect                                     |
| ------------- | ------------------------------ | ------------------------------------------ |
| **Gravity**   | User intent (from IntentField) | Pulls relevant constellations to center    |
| **Spring**    | Neo4j graph relationships      | Keeps connected nodes/constellations close |
| **Repulsion** | Visual clarity                 | Prevents overlap                           |
| **Friction**  | Stability                      | Prevents jitter                            |

When user types "auth migration" in IntentField:

- Authentication constellation surges to center, grows larger
- Related constellations (security, database) orbit nearby
- Unrelated constellations (RSS, marketing) drift to edges and fade

**Implementation**: d3-force or custom Framer Motion spring physics. @xyflow/react supports custom layout algorithms.

#### 3. Attention Budget Enforcement

Maximum 4 constellations in `visible` state. Rest are `faded` (smaller, muted, peripheral) or `hidden` (below relevance threshold).

**Implementation**: ~50 lines in `useMaterializableBlocks` hook. Sort by relevance score, top 4 get `visible`, next N get `faded`, rest `hidden`.

#### 4. Relevance-Driven Rendering

Wire the existing relevance engine to the display:

| Property            | Driven By        | Range                                           |
| ------------------- | ---------------- | ----------------------------------------------- |
| **Size**            | relevance score  | 0.3x → 1.5x base size                           |
| **Opacity**         | visibility state | 1.0 (visible) → 0.4 (faded) → 0 (hidden)        |
| **Blur**            | relevance score  | 0px (high) → 4px (low) — crystallization effect |
| **Position**        | intent gravity   | Center (high relevance) → Periphery (low)       |
| **Microexpression** | knowledge health | 7 states mapped to lifecycle                    |

#### 5. Morphing Transitions

When intent changes, constellations don't snap — they FLOW:

- Framer Motion `layout` prop with spring physics
- `transition={{ type: "spring", damping: 25, stiffness: 120 }}`
- Entering constellations crystallize (blur → sharp)
- Exiting constellations dissolve (sharp → blur → gone)

#### 6. WhisperLine Component

Persistent reasoning transparency: "Showing this because..."

**Implementation**: Pull from relevance engine reasoning + agent event bus `reasoning` field. Render as a subtle line below the surface — the product brief calls it "the co-pilot who only speaks when it matters."

#### 7. Microexpression Mapping for Knowledge

| Knowledge State                         | Microexpression | Visual       |
| --------------------------------------- | --------------- | ------------ |
| Stable, not currently relevant          | **Calm**        | Neutral gray |
| Matches current intent                  | **Attentive**   | Blue         |
| Agent actively processing               | **Working**     | Purple pulse |
| Conflicting information detected        | **Alarmed**     | Red          |
| Ambiguous, needs clarification          | **Confused**    | Amber        |
| Recently validated, high confidence     | **Satisfied**   | Green glow   |
| Heavily connected but possibly outdated | **Strained**    | Orange       |

---

## Product Language (from Content Language Strategy)

| Term           | Use This          | NOT This               |
| -------------- | ----------------- | ---------------------- |
| Related items  | **Constellation** | Cluster, group, bundle |
| Showing things | **Materialize**   | Load, open, display    |
| Hiding things  | **Dissolve**      | Close, hide, dismiss   |
| UI components  | **Blocks**        | Panels, cards, widgets |
| System states  | **Expressions**   | Animations, moods      |
| Status text    | **Whisper**       | Status bar, footer     |
| What you type  | **Intent**        | Query, search, command |

**Tone**: Calm, direct, terse. No emoji. No exclamation marks. Microexpressions replace microcopy. Silence = health.

---

## Three-User Experience (Same Surface)

### AI Builder (CTO, senior eng)

Opens Telescope → 4 constellations: pending approvals, stalled tasks, new intelligence, agent recommendations. Knowledge is INSIDE context, not a separate view. "Where's the ball?"

### Team Member (engineer, operator)

Opens Telescope → 4 constellations: their assigned work, their code reviews, their relevant discussions, their domain updates. Filtered by THEIR identity. "What's relevant to MY work?"

### Knowledge Worker (analyst, strategist)

Opens Telescope → 4 constellations: research findings, intelligence summaries, trend analyses, suggested readings. No graph, no nodes, no technical vocabulary. "Give me insights, hide the plumbing."

**Same relevance engine. Same attention budget. Three different intent contexts.** The Universal Intent Router (QUERY/COMMAND/MONITOR/ORCHESTRATE) handles all vocabulary levels equally.

---

## Value Leak Closure

### Jira/Notion Bridge (P0)

Adapters already exist and work bidirectionally. The missing piece: **outcome feedback loop.**

```
Current:  Think (Navratna) → Export → Execute (Jira) → [context lost]
Target:   Think (Navratna) → Sync (Jira) → Execute → Outcome flows back → Learn
```

**Implementation**:

1. Bidirectional sync: plans created in Navratna push to Jira via existing adapter
2. Jira task completion events flow back to knowledge graph
3. Agent learning service ingests outcome data (was the plan good? what stalled? what changed?)
4. Relevance engine improves (plans that led to successful outcomes rank higher next time)
5. The constellation for a project shows LIVE status from Jira, not a stale export

### Canva/MCP Workflow

Canva "kind of works" via MCP. The Telescope solve:

- "Marketing Campaign Q2" constellation contains: strategy (from agent), copy (from content agent), design brief (pushed to Canva via MCP), Canva output (pulled back), performance metrics
- ONE constellation, FIVE tools, ZERO navigation between them

---

## Trust Sequence

| Level  | State                               | Timeline   | Capability                                              |
| ------ | ----------------------------------- | ---------- | ------------------------------------------------------- |
| **L0** | Shows accurate info                 | Weeks 1-4  | Data ingestion, knowledge graph, search                 |
| **L1** | Surfaces what I'd have found faster | Months 1-2 | Relevance engine, ambient intelligence                  |
| **L2** | Shows what I didn't know I needed   | Months 2-4 | Cross-referencing, intent prediction, anomaly detection |
| **L3** | Acts for me on low-stakes tasks     | Months 4-8 | Autonomous workflows with approval gates                |
| **L4** | Acts for me on high-stakes tasks    | Year 1+    | Full autonomy within earned trust envelope              |

**Current users at L0→L1 transition.** Telescope knowledge surface pushes to L1. Chat ingestion + cross-referencing pushes to L2.

Trust calibration should be **per-user, not global.** User who uploads full Claude history and gets amazing cross-references progresses faster. Each override tightens confidence threshold. Each acceptance loosens it. `user-preferences.entity.ts` already has `confidenceThreshold` — make it dynamic.

---

## Onboarding: The Welcome Constellation

First open for new user with zero data:

1. **"Getting Started" constellation materializes** — contains 3-4 blocks:
   - "Connect your tools" → Jira/GitHub/Notion/Slack connectors
   - "Import your brain" → chat history upload (Claude/GPT/WhatsApp parsers already built)
   - "Meet your first agent" → conversational agent interviews user about their work
2. As user completes each block, Welcome constellation **dissolves**
3. Real constellations **materialize** from imported data
4. Transition from empty → living telescope in first session = aha moment

**First aha target**: Upload 3 months of Claude conversations → watch constellations form in real-time → ask a question → agent responds with context from YOUR history → "I can't go back."

---

## Cognitive Portrait (Per-User Intelligence Model)

Each user gets a cognitive model built from:

- Chat history imports (expertise analyzer, learning detector)
- Interaction patterns (conversation intelligence, 5-min cache)
- Tool usage (which adapters they use most)
- Decision patterns (override vs. accept ratio)
- Communication style (from user persona entity)

This model powers EVERYTHING:

- Relevance scoring (personal weight 0.7, already configured)
- Intent prediction (personal patterns)
- Agent tone (matched to user)
- Microexpression thresholds (calibrated to noise tolerance)
- Attention budget priority (personal work patterns)

**Already built pieces**: expertise analyzer, learning detector, user preferences entity with cognitive profile (workStyle, communicationPreference, domainExpertise, toolPreferences, workflowStyle, problemSolvingApproach, decisionMaking, learningStyle), relevance engine with 0.7 personalization weight.

**Missing**: dynamic preference learning (currently static), cognitive portrait aggregation service, per-user relevance calibration.

---

## Strategic Priorities (User-Data-Driven)

### P0 — Immediate (Days-Weeks)

| What                                | Why                                                   | Effort                                                  |
| ----------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| **Constellation clustering**        | Solves cluttered knowledge, proves Telescope paradigm | Medium — Qdrant similarity + nested MaterializableBlock |
| **Relevance-driven layout**         | Replace Dagre with force-directed + intent gravity    | Medium — d3-force or custom Framer physics              |
| **Attention budget enforcement**    | 4-item cap on visible constellations                  | Small — ~50 lines in useMaterializableBlocks            |
| **Jira outcome feedback loop**      | Closes biggest value leak, feeds learning system      | Small — wire existing adapter events to knowledge graph |
| **Relevance precision measurement** | Validate intelligence before scaling                  | Small — 50 manually labeled queries as benchmark        |

### P1 — Next Sprint

| What                           | Why                                          | Effort                                |
| ------------------------------ | -------------------------------------------- | ------------------------------------- |
| **TelescopeSurface container** | Composes all Phase 1 components into live UI | Medium                                |
| **WhisperLine component**      | Trust through transparency                   | Small — pull from existing telemetry  |
| **Morphing transitions**       | Crystallize/dissolve instead of hard reset   | Medium — Framer Motion spring physics |
| **Chat ingestion onboarding**  | New user aha moment                          | Small — parsers built, need UX flow   |
| **Welcome Constellation**      | First-open experience                        | Small — 3-4 blocks with guided flow   |

### P2 — Following Sprints

| What                           | Why                               | Effort             |
| ------------------------------ | --------------------------------- | ------------------ |
| **Cognitive Portrait service** | Per-user intelligence model       | Medium             |
| **Dynamic trust calibration**  | Per-user confidence thresholds    | Medium             |
| **Notion MCP bridge**          | Second biggest export target      | Small — MCP config |
| **RSS constellation**          | Some users already depend on this | Small              |
| **Financial planning view**    | Users already doing this          | Medium             |

### Deferred (Year 1-2)

<!-- These items come from the 362-idea brainstorm and the Strategic Vision spec (07).
     They require the Telescope paradigm to be proven first (L2+ trust level). -->

Business vertical expansion (ontology marketplace, embedded finance, cross-company intelligence, network effects), metacognitive agent infrastructure (Merkle receipts, explanation DAGs, confidence-gated execution), BaseBench-Meta benchmark suite, QuestionForge product launch. See `docs/specs/07-STRATEGIC-VISION-2026.md` for full roadmap with codebase alignment.

---

## What NOT to Build

1. **Agent-Generated Modules** — No immune system yet. Year 2.
2. **AI Supply Chain / Market Microstructure** — Requires trust infrastructure that doesn't exist in business law.
3. **Synthetic CFO / Platform Lending** — Banking regulation.
4. **OpCredits internal currency** — Usage metering in real money for v1.
5. **"Jira inside Navratna"** — Don't rebuild Jira. Bridge to it. Navratna is the brain, Jira is the hands.
6. **Disappearing interface for acquisition phase** — Interface should be MORE visible at 20 users for word-of-mouth. Disappearing is Year 2 after PMF.

---

## Existing Learning Infrastructure (Do Not Rebuild)

### Agent Learning (685 lines)

- Learns from operations + interactions
- Confidence adjustments: success +0.1, failure -0.05, feedback ×0.05, discovery ×0.02
- Events: `agent.learning.operation`, `.interaction`, `.consolidate`, `.update`

### 3-Tier Memory

- Working memory (pressure-based consolidation)
- Episodic memory (significance: importance × novelty × success × impact)
- Semantic memory (concept confidence + usage tracking: successRate, timesAccessed, lastUsed)
- Consolidation flow: working → episodic → semantic

### Observability (483 lines)

- Decisions logged with: selectedAction, alternatives, confidence, reasoning, duration
- 1000-event history per agent
- Activity summaries: state changes, decisions, tool executions, avg times

### Knowledge Graph Pipeline (15 services)

Chat parsers → content classifier → concept extractor → relationship detector → workflow extractor → expertise analyzer → learning detector (7 types) → ontology builder → taxonomy generator → clustering → Q&A generator → embeddings → triple-store sync → reconciliation

---

## OpenClaw Port Status

| What                         | Source               | Target                     | Status           |
| ---------------------------- | -------------------- | -------------------------- | ---------------- |
| 14 agent personas            | SOUL.md files        | Agent Intelligence DB seed | ✅ Seeded        |
| SOP import                   | PROJECT_SOP.md       | Orchestration Pipeline     | ✅ Service built |
| 4 core skills                | skills/              | Capability Registry        | ✅ Imported      |
| 9+ remaining skills          | skills/              | Capability Registry        | ⏳ Not imported  |
| 6 LLM providers / 30+ models | openclaw.json        | LLM Service                | ⏳ Not migrated  |
| 21 cron jobs                 | cron-jobs.json       | BullMQ events              | ⏳ Q2 2026       |
| 6 Lobster workflows          | workflows/           | Navratna operations        | ⏳ Planned       |
| Channel configs              | channels-config.json | TBD                        | ⏳ Planned       |

Full extraction spec: `docs/specs/03-OPENCLAW-EXTRACTION.md` (435 lines).

---

## Success Metrics

| Metric                            | Target                                 | Method                            |
| --------------------------------- | -------------------------------------- | --------------------------------- |
| Relevance precision@4             | > 80%                                  | 50 labeled queries benchmark      |
| Intent-to-render latency          | < 500ms                                | Telescope telemetry               |
| Constellation coherence           | > 85% semantic similarity within group | Qdrant similarity audit           |
| Morphing frame rate               | > 30fps                                | Framer Motion performance monitor |
| Node overlap at rest              | Zero                                   | Visual regression tests           |
| Day-7 return rate                 | > 60%                                  | Audit events                      |
| Chat imports per new user         | > 1 source                             | Onboarding funnel                 |
| Jira sync adoption                | > 50% of planning users                | Adapter usage analytics           |
| Time to first value               | < 5 minutes                            | Onboarding completion tracking    |
| Actions without leaving Telescope | > 90%                                  | Session analytics                 |
| Trust level progression           | L0→L1 by month 2                       | User behavior pattern analysis    |

---

## Risk Register

| Risk                                                       | Impact | Mitigation                                                             |
| ---------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| Force-directed layout too slow for 500+ nodes              | High   | Cluster first, render clusters as single blocks, expand on interaction |
| Users resist paradigm shift from portals to Telescope      | Medium | Feature flag: old DesktopUnified stays as fallback                     |
| Relevance engine surfaces wrong items with high confidence | High   | Measurement harness (50 labeled queries) BEFORE shipping to all users  |
| Constellation naming is poor (auto-generated topics)       | Medium | Allow user rename, learn from corrections                              |
| Jira sync creates duplicate/stale items                    | Medium | Reconciliation service already exists, extend to Jira bridge           |
| Zero frontend tests for new Telescope components           | High   | Build tests alongside components, not after                            |
| Users don't upload chat history (onboarding friction)      | Medium | Make it optional, show value with just tool connections first          |

---

## The One-Sentence Vision

**"When you open Navratna, it's already alive — showing what matters. Typing is an interruption of already-running intelligence."**

---

## Reference Documents

| Document                                  | Location                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| Sovereign Shell PRD v3.1                  | `docs/specs/00-SOVEREIGN-SHELL-PRD.md`                                  |
| OpenClaw Extraction Spec                  | `docs/specs/03-OPENCLAW-EXTRACTION.md`                                  |
| Roadmap                                   | `docs/project/ROADMAP.md`                                               |
| Sprint Plan                               | `docs/project/NEXT_PHASES.md`                                           |
| Telescope Brainstorm (88 ideas)           | `_bmad-output/brainstorming/brainstorming-session-2026-03-21-003539.md` |
| Platform Expansion Brainstorm (362 ideas) | `_bmad-output/brainstorming/brainstorming-session-2026-03-21-111555.md` |
| Strategic Vision 2026                     | `docs/specs/07-STRATEGIC-VISION-2026.md`                                |
| BaseBench-Meta Spec                       | `docs/specs/08-BASEBENCH-META.md`                                       |
| QuestionForge Spec                        | `docs/specs/09-QUESTIONFORGE.md`                                        |
| Product Brief                             | `_bmad-output/A-Product-Brief/project-brief.md`                         |
| Content Language Strategy                 | `_bmad-output/A-Product-Brief/content-language.md`                      |
| Decision Log                              | `_bmad-output/A-Product-Brief/dialog/decisions.md`                      |
| User Stories & Gap Analysis               | `_bmad-output/user-stories-2026-03-21.md`                               |
| Test Traceability Report                  | `_bmad-output/test-artifacts/traceability-report.md`                    |
