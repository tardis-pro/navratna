# hooks/ — Custom React Hooks

20 hooks. Most components should reach for the canonical trio first; specialized hooks exist for real-time, discussion orchestration, and visual state.

## CANONICAL TRIO — always prefer these over raw try/catch + useState

| Hook | Signature | Use When |
|------|-----------|---------|
| `useApiCall<T>` | `{data, loading, error, execute, reset}` | User-triggered: button clicks, form submits |
| `useDataFetch<T>` | `{data, loading, error, refetch}` | Mount-time data loading; has request-ID race-condition guard |
| `useAsyncEffect` | `(effect, deps)` | Async `useEffect` with mounted guard + cleanup support |

```tsx
// imperative
const { execute, loading } = useApiCall<Agent>();
await execute(() => uaipAPI.agents.create(payload));

// declarative
const { data: agents } = useDataFetch(() => uaipAPI.agents.list());

// async effect
useAsyncEffect(async () => {
  const data = await load();
  setState(data);
  return () => cleanup();
}, [id]);
```

## REAL-TIME / WEBSOCKET

| Hook | Use |
|------|-----|
| `useEnhancedWebSocket` | **The only sanctioned Socket.IO hook.** Exponential backoff, auth tracking (`authenticated/unauthenticated/pending`). Returns `{isConnected, socket, sendMessage, authStatus}`. |
| `useStreamingChat` | LLM token streaming via `/streaming` Socket.IO namespace. Returns `{isStreaming, content, tokenCount, startStream, cancelStream}`. |

## DISCUSSION

- `useDiscussionManager` — 610-line orchestration hook. Lower-level alternative to `DiscussionContext`. Full lifecycle: create/start/stop/pause/resume/addMessage/syncWithBackend. Prefer `useDiscussion()` from `DiscussionContext` in most cases.

## VISUAL / MICROEXPRESSION

| Hook | Purpose |
|------|---------|
| `useMicroexpression` | Base 7-state machine: `express()`, `flash()`, `reset()`, `autoTransition`. States: `calm/attentive/working/strained/satisfied/alarmed/confused` |
| `useAgentMicroexpression` | Agent-specific variant — driven by window `AGENT_ACTIVITY_EVENT` + `error`/`unhandledrejection` events |
| `useKnowledgeMicroexpression` | Pure `useMemo` — maps `ConstellationHealth` + `relevanceScore` → microexpression state; no side effects |

## UTILITY

| Hook | Purpose |
|------|---------|
| `useDebounce<T>` | Standard debounce |
| `useIsMobile` | Responsive breakpoint detection |
| `useToast` / `toast` | shadcn/ui notifications — canonical import is `hooks/use-toast.ts` (NOT `components/ui/use-toast.ts`) |
| `useWallpaper` | `WallpaperService` singleton wrapper: slideshow, theme, image cycling |
| `useFocusManager` | DOM-level focus/hover registry + preview positioning |

## AI / CONVERSATION

| Hook | Purpose |
|------|---------|
| `useConversationEnhancement` | Wraps `conversationEnhancementAPI` for React usage |
| `useConversationIntelligence` | Socket.IO to `/conversation-intelligence`: intent detection, topic generation, autocomplete (300ms debounce) |
| `useDebatePrompts` | Pure prompt-building for 4 debate phases — no API calls |

## KNOWN ISSUES

- `useConversationIntelligence` + `useStreamingChat` both instantiate `io()` directly — they bypass `useEnhancedWebSocket`. This violates the Socket.IO-only rule but is intentional for namespace-specific connections. Do not copy this pattern.
- `useUAIP.ts` — exports `useAsyncData`, `useAgents`, `useOperations`, `useInsights`, etc. These are standalone context-bypassing hooks. Prefer context hooks (`useAgents` from `AgentContext`, `useUAIP` from `UAIPContext`) for cross-component state.
- `use-toast.ts` exists in both `hooks/` AND `components/ui/` — always import from `hooks/`.

## ADDING A HOOK

1. Create `src/hooks/useMyHook.ts`
2. Export from `src/hooks/index.ts`
3. If it wraps a service singleton, follow `useWallpaper` pattern (change listener + cleanup)
4. If async mount-time data: use `useDataFetch` internally rather than reimplementing the pattern
