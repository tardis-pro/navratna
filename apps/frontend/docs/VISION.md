# Frontend Vision — Telescope Surface

**Last Updated**: 2026-03-30
**Status**: ACTIVE — TelescopeSurface is the primary frontend, DesktopUnified deleted
**Source**: Synthesized from Telescope Knowledge Surface PRD (spec 06), Strategic Vision 2026 (spec 07), Production-Ready Plan (Layer A+B), and CLAUDE.md

---

## The Paradigm

> "Intent replaces navigation. No pages, no routes, no menus. One intent field, one rendering surface."

The frontend is a **Telescope** — a spatial, intent-driven surface where everything the user sees is determined by a single function:

```
relevance(entity, intent, context) → score
```

This score determines what appears, where it appears, how large, how bright, and how sharp. The entire interface is a real-time projection of relevance scores onto a spatial surface.

**When you open Navratna, it's already alive — showing what matters. Typing is an interruption of already-running intelligence.**

---

## Architecture

### Entry Point

```
apps/frontend/src/main.tsx → DesktopApp.tsx → TelescopeSurface
```

`DesktopUnified.tsx` has been **deleted**. TelescopeSurface is the sole primary interface. Legacy portals are lazy-loaded via `portal_registry.tsx` and wrapped as MaterializableBlocks.

### Phase 1 Components (BUILT + FULLY INTEGRATED)

| Component | Location | Lines | Status |
|---|---|---|---|
| **IntentField** | `src/components/IntentField/` | 606 | Wired to relevance engine, 300ms debounce |
| **MaterializableBlock** + HOC + hook | `src/components/MaterializableBlock/` | 702 | 5 portals wrapped |
| **Microexpression system** (7 states) | `src/components/Microexpression/` | 168 | Agent-driven via `useAgentMicroexpression` |
| **Relevance engine** (4-factor) | Backend: `relevance.ts` | 383 | Wired to IntentField |

### Phase 2: What Must Be Built (Telescope Knowledge Surface)

| Component | Description | Priority |
|---|---|---|
| **Constellation Clustering** | Qdrant vector proximity → semantically grouped MaterializableBlocks | P0 |
| **Force-Directed Layout** | d3-force or Framer Motion spring physics with intent gravity | P0 |
| **Attention Budget** | Max 4 constellations visible, rest faded/hidden (~50 lines) | P0 |
| **Relevance-Driven Rendering** | Size, opacity, blur, position all driven by relevance score | P0 |
| **TelescopeSurface Container** | Composes all Phase 1 components into live UI | P1 |
| **WhisperLine** | "Showing this because..." — reasoning transparency | P1 |
| **Morphing Transitions** | Crystallize/dissolve via Framer Motion spring physics | P1 |
| **Welcome Constellation** | First-open onboarding with 3-4 guided blocks | P1 |
| **Cognitive Portrait Service** | Per-user intelligence model driving relevance | P2 |

---

## Product Language

Every word in the UI follows the content language strategy:

| Term | Use This | NOT This |
|---|---|---|
| Related items | **Constellation** | Cluster, group, bundle |
| Showing things | **Materialize** | Load, open, display |
| Hiding things | **Dissolve** | Close, hide, dismiss |
| UI components | **Blocks** | Panels, cards, widgets |
| System states | **Expressions** | Animations, moods |
| Status text | **Whisper** | Status bar, footer |
| What you type | **Intent** | Query, search, command |

**Tone**: Calm, direct, terse. No emoji. No exclamation marks. Microexpressions replace microcopy. Silence = health.

---

## Three-User Experience (Same Surface)

The Telescope adapts to user context, not user type. Same relevance engine, same attention budget, different intent contexts:

### AI Builder (CTO, senior eng)
Opens Telescope → 4 constellations: pending approvals, stalled tasks, new intelligence, agent recommendations. Knowledge is INSIDE context, not a separate view. "Where's the ball?"

### Team Member (engineer, operator)
Opens Telescope → 4 constellations: their assigned work, code reviews, relevant discussions, domain updates. Filtered by THEIR identity. "What's relevant to MY work?"

### Knowledge Worker (analyst, strategist)
Opens Telescope → 4 constellations: research findings, intelligence summaries, trend analyses, suggested readings. No graph, no nodes, no technical vocabulary. "Give me insights, hide the plumbing."

---

## Rendering Pipeline

```
User types in IntentField
  → debounce (300ms)
  → relevance engine scores all entities
  → attention budget selects top 4 constellations (visible)
  → next N constellations (faded: smaller, muted, peripheral)
  → remaining (hidden: below threshold)
  → force-directed layout positions by relevance score
  → Framer Motion spring physics animate transitions
  → MaterializableBlocks render with size/opacity/blur from score
  → Microexpressions show knowledge health state
  → WhisperLine explains reasoning
```

### Relevance-Driven Visual Properties

| Property | Driven By | Range |
|---|---|---|
| **Size** | relevance score | 0.3x → 1.5x base size |
| **Opacity** | visibility state | 1.0 (visible) → 0.4 (faded) → 0 (hidden) |
| **Blur** | relevance score | 0px (high) → 4px (low) — crystallization effect |
| **Position** | intent gravity | Center (high relevance) → Periphery (low) |
| **Microexpression** | knowledge health | 7 states mapped to lifecycle |

### Microexpression Mapping

| Knowledge State | Expression | Visual |
|---|---|---|
| Stable, not currently relevant | **Calm** | Neutral gray |
| Matches current intent | **Attentive** | Blue |
| Agent actively processing | **Working** | Purple pulse |
| Conflicting information detected | **Alarmed** | Red |
| Ambiguous, needs clarification | **Confused** | Amber |
| Recently validated, high confidence | **Satisfied** | Green glow |
| Heavily connected but possibly outdated | **Strained** | Orange |

---

## Trust Sequence

| Level | State | Timeline | Capability |
|---|---|---|---|
| **L0** | Shows accurate info | Weeks 1-4 | Data ingestion, knowledge graph, search |
| **L1** | Surfaces what I'd have found faster | Months 1-2 | Relevance engine, ambient intelligence |
| **L2** | Shows what I didn't know I needed | Months 2-4 | Cross-referencing, intent prediction |
| **L3** | Acts for me on low-stakes tasks | Months 4-8 | Autonomous workflows with approval gates |
| **L4** | Acts for me on high-stakes tasks | Year 1+ | Full autonomy within earned trust envelope |

Current users at L0→L1 transition. Telescope knowledge surface pushes to L1.

---

## Tech Stack (Frontend)

| Layer | Technology | Version |
|---|---|---|
| Framework | React 19 | ^19 |
| Build | Vite | Latest |
| Styling | Tailwind 4 | ^4 |
| Animation | Framer Motion | ^12.18.1 |
| Graph/Flow | @xyflow/react | ^12.8.1 |
| Command palette | cmdk | ^1.1.1 |
| File naming | PascalCase for .tsx components |
| Dev server | localhost:5173 |
| Monorepo | NX + pnpm workspaces |
| Linting | oxlint |
| Formatting | oxfmt |

---

## Backend Services (Frontend Consumes)

| Port | Service | What Frontend Uses |
|---|---|---|
| 3001 | navratna-core | Agent chat, discussions, artifacts, LLM, relevance engine, knowledge graph |
| 3002 | navratna-gateway | Auth (httpOnly JWT cookies), orchestration, tool/MCP registry |
| 8081 | api-gateway | Nginx reverse proxy (production entry point) |

**Auth**: httpOnly cookies, `credentials: 'include'` on all API calls. No localStorage tokens. Socket.IO auth via correlation-ID pattern.

---

## Existing Backend Infrastructure (Do Not Rebuild)

These services are BUILT and available for frontend consumption:

- **Agent Learning** (685 lines) — confidence adjustments, operation/interaction learning
- **3-Tier Memory** — working → episodic → semantic consolidation
- **Knowledge Graph Pipeline** (15 services) — chat parsers, concept extraction, clustering, embeddings, triple-store sync
- **4 OAuth Adapters** — Jira (bidirectional), Confluence (bidirectional), GitHub, Slack
- **MCP Client** — full protocol support for tool execution
- **Observability** (483 lines) — decision logging, 1000-event history per agent
- **Conversation Intelligence** — 5-min cache, interaction pattern analysis

---

## What NOT to Build

1. **Agent-Generated Modules** — No immune system yet. Year 2.
2. **"Jira inside Navratna"** — Bridge to Jira, don't rebuild it. Navratna is the brain, Jira is the hands.
3. **Disappearing interface** — Interface should be MORE visible at 20 users for word-of-mouth. Disappearing is Year 2 after PMF.
4. **Traditional navigation** — No sidebar, no tabs, no route-based pages. Intent replaces all of that.
5. **Generic dashboards** — Constellations ARE the dashboard. No separate analytics pages.

---

## Laws of UX Applied to Telescope

The Telescope paradigm maps directly to established UX laws. Every design decision should reference these.

### Critical Laws (Hard Gates)

| Law | Telescope Application | Violation = P0 Bug |
|---|---|---|
| **Miller's Law** (7 +/- 2 items) | Attention budget caps visible constellations at 4. This is MORE aggressive than Miller because spatial physics + animation consume additional cognitive bandwidth. Never show more than 4 primary constellations. | Rendering 5+ constellations in `visible` state |
| **Hick's Law** (more choices = slower decisions) | IntentField is a single input. No menus, no sidebar, no navigation. Reducing choices to ONE: type your intent. Every additional UI element that isn't a constellation is a Hick's Law violation. | Adding navigation elements, mode selectors, or persistent menus to the surface |
| **Doherty Threshold** (< 400ms response) | Intent-to-first-visual-response must be < 100ms (fuzzy match). Full semantic results < 400ms. Crystallization animation covers the gap — users perceive continuous response even when Qdrant takes 200ms. | Any keystroke without immediate visual feedback |
| **Fitts's Law** (target time = distance x size) | High-relevance constellations are LARGER and CLOSER to center. Low-relevance are smaller and peripheral. Relevance score directly controls Fitts's Law parameters. Approval actions render as large, center-positioned blocks. | Small, peripheral placement of urgent/actionable items |
| **Cognitive Load** | The effort gradient (zero → light → deep) is a cognitive load management system. Layer 0 (ambient) requires zero cognitive load. Layer 1 (typing) is light. Layer 2 (precise queries) is intentional deep engagement. | Requiring cognitive effort at Layer 0 (ambient should be glanceable) |

### Gestalt Laws (Spatial Layout)

| Law | Telescope Application |
|---|---|
| **Proximity** | Force-directed layout: Neo4j graph relationships create spring forces that keep related constellations close. Semantic similarity from Qdrant reinforces proximity. Related things ARE near each other — physics enforces Gestalt. |
| **Similarity** | All constellations share the same MaterializableBlock visual language. Microexpression states (color, animation, breathing) create similarity groups — all "alarmed" items look alike, all "calm" items look alike. |
| **Common Region** | Each constellation IS a common region — a nested MaterializableBlock containing child blocks. The boundary defines the group. Expanding a constellation reveals its internal structure. |
| **Uniform Connectedness** | Neo4j graph edges render as visible connections between constellations. Edge thickness = relationship strength. Connections make relationships explicit. |
| **Pragnanz** | Constellations at rest are simple shapes — circles or rounded rectangles. Complexity only emerges on interaction (hover to expand, click to drill). The resting surface is maximally simple. |

### Behavior Laws (Engagement)

| Law | Telescope Application |
|---|---|
| **Flow** | The Telescope is designed for flow state: no interruptions, no modals, no page loads. Spring physics transitions maintain continuity. Keyboard-driven (Cmd+K, Tab-to-accept). Context persists across intent changes — you never "lose your place." |
| **Von Restorff Effect** | Alarmed microexpression (red, quick pull) is visually distinct from all other states. Critical items MUST break the visual pattern. One alarmed constellation among calm ones is immediately noticeable. |
| **Peak-End Rule** | Peak = the first time relevance correctly surfaces what you need before you finish typing. End = the dissolving animation when work completes (satisfied expression → warm glow → settles). Nail both. |
| **Paradox of the Active User** | No onboarding tutorial. The Welcome Constellation materializes and dissolves naturally. Users explore by typing, not by reading instructions. The intent field IS the onboarding — type anything, see what happens. |
| **Goal-Gradient Effect** | Operations render as live step blocks with visible progress. Crystallization animation (blur → sharp) IS progress indication. The closer to completion, the sharper the block. |
| **Aesthetic-Usability Effect** | The microexpression system, spring physics, and OKLCH color space exist specifically to make the interface beautiful. Users will forgive relevance inaccuracies if the surface feels alive and responsive. Visual polish is not optional — it IS the product differentiator. |

### Anti-Pattern Watchlist

| UX Law | Anti-Pattern to Avoid |
|---|---|
| **Jakob's Law** | Users expect navigation. The Telescope deliberately breaks this expectation. Mitigation: the IntentField LOOKS like a familiar search bar (cmdk). The paradigm is new, but the entry point is familiar. |
| **Tesler's Law** | The relevance engine contains irreducible complexity (4-factor scoring, triple-store queries). This complexity is hidden behind the `relevance()` function, not eliminated. The WhisperLine makes it transparent without exposing it. |
| **Choice Overload** | Connected to everything = potentially showing everything. The attention budget (4 items) and continuous dimmer (0-100% opacity) are explicit choice-overload prevention. The AI's hardest job is suppressing things, not finding things. |
| **Selective Attention** | Users in Layer 0 (ambient) are scanning, not focusing. Microexpressions must be perceivable in peripheral vision. Color shifts and motion patterns (breathing, pulse) operate at the pre-attentive processing level. |

---

## Performance Architecture (120fps Target)

The Telescope MUST run at 120fps on modern hardware. This is not aspirational — it's a hard gate. A spatial physics interface that drops frames feels broken.

### Frame Budget

| Refresh Rate | Frame Budget | Implication |
|---|---|---|
| 60fps | 16.67ms per frame | Minimum acceptable. Degraded experience. |
| 120fps | 8.33ms per frame | Target. Every render cycle must complete in < 8ms. |
| 144fps | 6.94ms per frame | Stretch goal for high-refresh displays. |

### Rendering Strategy

**GPU-First Rendering:**
- All animations via CSS transforms and opacity (GPU-composited, no layout thrash)
- Framer Motion `layout` animations use `transform` only — never `width`/`height`/`top`/`left`
- OKLCH color transitions via CSS custom properties (GPU-interpolated)
- `will-change: transform, opacity` on all MaterializableBlocks
- `contain: layout style paint` on constellation containers for render isolation

**Physics Simulation:**
- Force-directed layout runs in a **Web Worker** — physics calculations never block the main thread
- Worker posts position updates at 60Hz; main thread interpolates to 120fps via `requestAnimationFrame`
- Spring physics use analytical solutions (not iterative Euler), capped at 1ms per frame
- Position changes applied as `transform: translate3d()` — composited, zero layout cost

**Virtualization:**
- Only constellations in `visible` (4) and `faded` (next N) states are in the DOM
- `hidden` constellations are removed from DOM entirely — zero render cost
- Expanding a constellation lazy-mounts child blocks (React.lazy + Suspense)
- Semantic zoom: scroll changes LOD (level of detail), not element count

### Caching Architecture

**API Response Cache (SWR Pattern):**
```
stale-while-revalidate for all relevance queries
- IntentField results: cache 5s, revalidate in background
- Relevance scores: cache 30s per entity, invalidate on event bus update
- Knowledge graph queries: cache 60s, invalidate on mutation
- Agent state: real-time via Socket.IO (no HTTP cache)
```

**Frontend State Cache:**
- **Hot cache (in-memory):** Last 50 relevance queries + results in `Map<intentHash, ScoredEntity[]>`
- **Warm cache (IndexedDB):** Last 500 knowledge entities with embeddings for instant local fuzzy match
- **Cold cache (none):** Full semantic search always hits Qdrant — no stale vector results

**Render Cache:**
- MaterializableBlock instances memoized via `React.memo` with shallow relevance score comparison
- Constellation layout positions cached — only recompute on intent change, not every frame
- Microexpression state transitions debounced (100ms) — prevent rapid state flickering
- Framer Motion `AnimatePresence` with `mode="popLayout"` for zero-layout-shift exits

**Precomputation:**
- **Speculative pre-rendering:** Top 10 predicted next intents pre-rendered in hidden `<div>` (Swell Prediction)
- **Constellation grouping:** Computed server-side by Qdrant, cached with 60s TTL, sent as pre-grouped
- **Force layout warm start:** Previous frame's positions seeded as initial positions for next computation

### Performance Hard Gates

| Metric | Target | Measurement | Action if Violated |
|---|---|---|---|
| **Frame rate** | 120fps sustained | `requestAnimationFrame` timing + Chrome DevTools Performance | P0 bug — block release |
| **First contentful paint** | < 500ms | Lighthouse | Reduce initial bundle |
| **Intent keystroke → visual response** | < 16ms (1 frame) | Custom telemetry | Move computation to worker |
| **Intent → full semantic results** | < 400ms | Custom telemetry | Crystallization animation covers latency |
| **Constellation reposition (spring)** | < 2ms per frame | Worker profiling | Reduce node count or simplify forces |
| **Memory (JS heap)** | < 200MB | `performance.memory` | Evict warm cache entries |
| **Bundle size (initial)** | < 500KB gzipped | Build stats | Code-split aggressively |
| **Largest contentful paint** | < 1.5s | Lighthouse | Prioritize above-fold constellations |

### Optimization Techniques

**Layout Thrashing Prevention:**
- Batch all DOM reads before DOM writes (forced reflow = frame drop)
- Never read `offsetHeight`/`getBoundingClientRect` in animation loops
- Use `ResizeObserver` (batched, async) instead of polling dimensions

**Animation Performance:**
- Framer Motion `useTransform` for derived motion values (computed on GPU)
- `useMotionValueEvent` instead of `onChange` (avoids React re-renders)
- Spring animations: `damping: 25, stiffness: 120` — tuned for 120fps smoothness
- Crystallization blur: CSS `backdrop-filter` on GPU, NOT `filter` on elements

**React Render Prevention:**
- `useMemo` for relevance-sorted constellation lists (recompute only on score change)
- `useCallback` for all event handlers passed to MaterializableBlocks
- Context splitting: separate contexts for relevance scores, microexpression state, layout positions
- No context providers that re-render the entire tree on single-value changes
- `React.memo` with custom comparator on MaterializableBlock (compare `id` + `score` + `expressionState`)

**Network Performance:**
- Relevance API: single batched request per intent change, not per-entity
- Socket.IO: binary protocol for agent state updates (msgpack, not JSON)
- Preconnect to Qdrant, Neo4j proxy endpoints on app load
- Service Worker for offline-first static assets

---

## Success Metrics

| Metric | Target | Method |
|---|---|---|
| Relevance precision@4 | > 80% | 50 labeled queries benchmark |
| Intent-to-render latency | < 400ms | Telescope telemetry |
| Frame rate | 120fps sustained | requestAnimationFrame timing |
| Constellation coherence | > 85% semantic similarity | Qdrant similarity audit |
| Morphing frame rate | > 120fps | Chrome DevTools Performance |
| Node overlap at rest | Zero | Visual regression tests |
| Actions without leaving Telescope | > 90% | Session analytics |
| Time to first value | < 5 minutes | Onboarding completion tracking |
| JS heap memory | < 200MB | performance.memory |
| Initial bundle | < 500KB gzipped | Build stats |

---

## Production Readiness Context

The frontend exists within a larger production-ready effort (see `.sisyphus/plans/navratna-production-ready.md`):

- **FeatureFactory pattern** — backend domains are self-contained Features composable into core/gateway. Frontend consumes their routes.
- **@uaip/shared-services modularization** — sub-path exports enable granular imports.
- **Legacy cleanup** — ~10,000 lines of dead frontend code targeted for removal (see `docs/plans/2025-12-26-frontend-legacy-cleanup.md`). Many items already completed by DesktopUnified deletion.
- **TS6 migration** (Layer C) — separate sprint, not blocking frontend work.

---

## UX Review Checklist

Before shipping any Telescope feature, verify against these Laws of UX:

- [ ] Attention budget respected — max 4 visible constellations (Miller's Law)
- [ ] Single entry point — no added menus, tabs, or navigation (Hick's Law)
- [ ] Keystroke → visual feedback in < 16ms / 1 frame (Doherty Threshold)
- [ ] High-relevance items are larger and center-positioned (Fitts's Law)
- [ ] Layer 0 (ambient) requires zero cognitive effort (Cognitive Load)
- [ ] Related items positioned near each other by physics (Proximity)
- [ ] Alarmed state is visually distinct from all others (Von Restorff)
- [ ] No modals, no page loads, no interruptions to flow (Flow)
- [ ] Complexity hidden behind `relevance()`, not eliminated (Tesler's Law)
- [ ] Entry point (IntentField) looks like a familiar search bar (Jakob's Law)
- [ ] Frame rate sustained at 120fps during animation (Performance Gate)
- [ ] All animations use GPU-composited properties only (Performance Gate)
- [ ] No layout thrashing in animation loops (Performance Gate)

---

## Reference Documents

| Document | Location |
|---|---|
| CLAUDE.md (architecture truth) | `navratna/CLAUDE.md` |
| Telescope Knowledge Surface PRD | `docs/specs/06-TELESCOPE-KNOWLEDGE-SURFACE-PRD.md` |
| Strategic Vision 2026 | `docs/specs/07-STRATEGIC-VISION-2026.md` |
| Sovereign Shell PRD v3.1 | `docs/specs/00-SOVEREIGN-SHELL-PRD.md` |
| Production-Ready Plan | `.sisyphus/plans/navratna-production-ready.md` |
| Frontend Legacy Cleanup | `apps/frontend/docs/plans/2025-12-26-frontend-legacy-cleanup.md` |
| Product Brief | `_bmad-output/A-Product-Brief/project-brief.md` |
| Content Language Strategy | `_bmad-output/A-Product-Brief/content-language.md` |
| Laws of UX Reference | https://lawsofux.com |
