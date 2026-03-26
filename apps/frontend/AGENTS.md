# FRONTEND — @council/frontend

React 19 + Vite + Tailwind 4 SPA. Ambient Telescope surface with portal-based navigation, 10 context providers, Socket.IO real-time, shadcn/ui components.

## STRUCTURE

```
src/
├── main.tsx                    # Mounts <DesktopApp /> into #root
├── DesktopApp.tsx              # Root: all 10 providers + BrowserRouter + Routes
├── api/                        # Domain-specific API modules (22 files)
│   ├── client.ts               # Axios singleton with CSRF + auth error handling
│   └── *.api.ts                # One file per domain (agents, discussions, knowledge, etc.)
├── components/
│   ├── TelescopeSurface/       # PRIMARY UX — ambient block grid, relevance engine
│   ├── MaterializableBlock/    # HOC: visibility/microexpression/relevance wrapper
│   ├── IntentField/            # Cmd+K command palette (cmdk + WebSocket AI)
│   ├── Microexpression/        # 7-state visual indicator system
│   ├── AmbientIntelligence/    # WhisperLine, MorningFog, BreathCycle, RedlineGauge
│   ├── AttentionBudget/        # 4-item attention enforcer
│   ├── futuristic/
│   │   ├── portals/            # 32 lazy-loaded portal components
│   │   └── desktop/            # DesktopHeader, QuickActionsDock, ActivityFeed
│   └── ui/                     # 60 shadcn/ui primitives
├── contexts/                   # 10 React contexts (auth, UAIP, agent, discussion...)
├── hooks/                      # 20 custom hooks (useApiCall, useDataFetch, useStreamingChat...)
├── pages/                      # Index, NotFound, workspace/*, questionforge/*
├── services/                   # CSRFService, ChatPersistenceService, WallpaperService
├── types/                      # frontend-extensions.ts only — real types from @uaip/types
└── utils/
    ├── uaip-api.ts             # High-level API facade (prefer over api/* directly)
    └── api.ts                  # Re-exports uaip-api
```

## ROUTING

All routes declared in `DesktopApp.tsx`. The app is primarily single-surface — navigation happens inside `TelescopeSurface` via portal switching, not URL changes.

| Path                                         | Component                    |
| -------------------------------------------- | ---------------------------- |
| `/`                                          | `TelescopeSurface` (default) |
| `/questionforge`                             | `QuestionForgeLanding`       |
| `/questionforge/results`                     | `QuestionForgeResults`       |
| `/projects/:id/workspace`                    | `WorkspacePage`              |
| `/projects/:id/workspace/session/:sessionId` | `CodingSessionPage`          |

## WHERE TO LOOK

| Task                 | Location                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| Add new portal       | `futuristic/portals/MyPortal.tsx` → add to `portalRegistry.tsx` `PORTAL_COMPONENTS` + `createInitialBlocks()` |
| Add new API domain   | `api/myfeature.api.ts` → export from `api/index.ts` → add to `utils/uaip-api.ts`                              |
| Add new context      | `contexts/MyContext.tsx` → wrap in `DesktopApp.tsx` provider tree                                             |
| Add new page/route   | `pages/MyPage.tsx` → add `<Route>` in `DesktopApp.tsx`                                                        |
| Add new hook         | `hooks/useMyHook.ts` → export from `hooks/index.ts`                                                           |
| Global styles        | `globals.css` (Tailwind directives), `App.css` (animations, z-index vars, glass)                              |
| UI components        | `components/ui/` — shadcn/ui only; install with `npx shadcn@latest add <component>`                           |
| API base URL / proxy | `config/apiConfig.ts` (`API_ROUTES`, `buildAPIURL()`); Vite proxy in `vite.config.ts`                         |

## STATE MANAGEMENT

No Redux, no Zustand. Three mechanisms:

1. **React Context** (10 providers) — primary cross-cutting state:
   - `UAIPContext` — central data hub: agents, operations, capabilities, approvals, insights
   - `AuthContext` — identity, login/logout, security flow dispatch
   - `AgentContext` — agent list + orchestration pipeline
   - `DiscussionContext` — discussion state + WebSocket events
   - Others: `KnowledgeContext`, `SecurityContext`, `OnboardingContext`, `UserPreferencesContext`, `DocumentContext`, `FocusContext`

2. **React Query** — server cache. `QueryClient` config: `staleTime: 5min`, `retry: 3`, `refetchOnWindowFocus: false`

3. **`useReducer`** — only for `DebateArena` (`debateReducer.ts`); use sparingly for complex local state machines

**Decision guide**: React Query for cacheable server data → Context for cross-app state → `useReducer` for local state machines → `useState` for everything else.

## API LAYER

```
Component/Hook
  → uaipAPI (utils/uaip-api.ts)     ← prefer this: high-level, normalized
  → api (api/index.ts)              ← domain modules (agents.api.ts, etc.)
  → APIClient (api/client.ts)       ← Axios singleton
  → Vite proxy → nginx:8081 → backend
```

`APIClient` auto-injects CSRF, unwraps `{success, data}` envelopes, fires `auth:unauthorized` event on 401.
All `/api/*` and `/socket.io/*` requests proxy to `VITE_API_TARGET` (default `localhost:8081`).

## REAL-TIME / WEBSOCKET

- `useEnhancedWebSocket` — general Socket.IO with exponential backoff, auth state tracking
- `useStreamingChat` — LLM streaming via `/streaming` Socket.IO namespace, session-based
- Never instantiate Socket.IO directly in components — always use these hooks

## TELESCOPE / PORTAL SYSTEM

`TelescopeSurface` renders `MaterializableBlock` wrappers sorted by `relevanceScore`. Each block with `type: 'portal'` lazy-loads from `portalRegistry.tsx`.

Relevance rules: `score < 0.2` → hidden | `score < 0.5` → faded | top 4 → visible (attention budget). Auto-refreshes every 30s.

`MaterializableBlock` HOC adds: 7 microexpression states, visibility transitions, drag/resize, relevance badge.

## CANONICAL HOOKS

Always use these instead of raw `try/catch` + `useState`:

- `useApiCall<T>` — imperative (button clicks, form submits)
- `useDataFetch<T>` — declarative mount-time fetching with race-condition guard
- `useAsyncEffect` — async `useEffect` with cleanup + mounted guard

## CONVENTIONS

- **OKLCH colors** throughout — not hex/hsl (see `MaterializableBlock.styles.ts`)
- **Glass morphism**: `backdrop-blur-md bg-white/10 border-white/20`
- **Z-index**: CSS vars `--z-wallpaper` through `--z-active-window` (−1 to 1100)
- **`cn()` utility**: `clsx` + `tailwind-merge` via `src/lib/utils.ts` — always use for conditional classes
- **4-file component pattern** for complex components: `ComponentName.tsx` + `.types.ts` + `.styles.ts` + `index.ts`
- **No `console.log`** — oxlint enforces this; use structured logger or remove debug calls

## COMMANDS

```bash
pnpm dev:frontend                        # → nx run @council/frontend:dev (Vite HMR → http://localhost:5173)
nx run @council/frontend:dev             # NX direct form (equivalent)
pnpm build:frontend                      # → nx run @council/frontend:build → dist/
pnpm lint                                # oxlint
pnpm test                                # Vitest (from apps/frontend/)
pnpm --filter @council/frontend test     # per-package
```

## ANTI-PATTERNS

- Directly accessing `api/*` modules when `uaipAPI` has the method — use the facade
- Context providers in wrong order in `DesktopApp.tsx` — `AuthContext` must be outer
- `useEffect` with async callbacks without cleanup — use `useAsyncEffect` hook
- Hardcoding API URLs — use `buildAPIURL()` from `config/apiConfig.ts`
- Adding shadcn-style components to `futuristic/portals/` — portals are app-specific, not UI primitives
- Feature work in `marketplace-service` portal — marketplace is scheduled for removal in v3.0
- Instantiating Socket.IO (`io()`) directly in components — use `useEnhancedWebSocket` or `useStreamingChat`
- Importing from `utils/api.ts` — it's deprecated; use `uaipAPI` from `utils/uaip-api.ts`
- Editing `tailwind.config.ts` — it is an **empty directory**; all Tailwind 4 config lives in `globals.css` `@theme {}` blocks
- Using `ChatPersistenceService` — fully deprecated; delegate to `discussionsAPI` directly

## KNOWN GOTCHAS

- `SecurityContext` — uses **mock data only**, not wired to `securityAPI`
- `OnboardingContext` — hardcoded to always show onboarding (line 45: `return true`); real API check commented out
- `DiscussionControlsPortal`, `DiscussionLogPortal`, `GeneralSettingsPortal` — **stubs** (14–16 lines each), placeholder only
- `ToolsIntegrationsPortal` — **deprecated** redirect shim to `UnifiedToolPortal`; remove from registry
- `src/types/frontend-extensions.ts` — only file in `types/`; provides re-exports + `createAgentStateFromShared()` factory
- Two portal systems coexist: `TelescopeSurface` (ambient grid, primary UX) and `PortalWorkspace` (floating windows, legacy alternative)
- `tsconfig.app.json` has `strict: false` but `noImplicitAny: true` — contradictory; `strictNullChecks` is globally off
- `src/components/ui/` contains committed build artifacts: `base-widget.js`, `base-widget.d.ts.*`
- `use-toast.ts` duplicated: `src/hooks/use-toast.ts` AND `src/components/ui/use-toast.ts` — use `hooks/` version
