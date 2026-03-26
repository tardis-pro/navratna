# portals/ — 32 Portal Components

32 `.tsx` files. **21 registered** in `TelescopeSurface/portal_registry.tsx`. **11 standalone** (used as sub-components or only in `PortalWorkspace`). **3 stubs**. **1 deprecated**.

⚠️ **No 4-file pattern here** — all portals are single-file monoliths. Types/interfaces are declared inline at the top of each file.

## REGISTERED PORTALS (21 — in portal_registry.tsx)

| Registry Key             | File                             | Score | Lines | Status                                                            |
| ------------------------ | -------------------------------- | ----- | ----- | ----------------------------------------------------------------- |
| `chat`                   | `ChatPortal.tsx`                 | 0.9   | 10    | Thin wrapper → `<UnifiedChatSystem mode="portal">`                |
| `agent-manager`          | `AgentManagerPortal.tsx`         | 0.9   | 2418  | **Core** — agent+persona CRUD, model assignment                   |
| `dashboard`              | `DashboardPortal.tsx`            | 0.9   | ~400  | System overview: agent/discussion/artifact metrics                |
| `discussion`             | `../../DiscussionPortal.tsx`     | 0.8   | 1108  | Live discussion UI (not in this dir — `components/`)              |
| `discussion-log`         | `DiscussionLogPortal.tsx`        | 0.8   | 14    | **STUB** — placeholder only                                       |
| `discussion-controls`    | `DiscussionControlsPortal.tsx`   | 0.8   | 16    | **STUB** — placeholder only                                       |
| `user-chat`              | `UserChatPortal.tsx`             | 0.8   | 1171  | User+agent chat with voice/video controls                         |
| `consolidated-user-chat` | `ConsolidatedUserChatPortal.tsx` | 0.8   | 1738  | Multi-session user+agent+WebRTC chat                              |
| `knowledge`              | `KnowledgePortal.tsx`            | 0.75  | ~472  | Knowledge CRUD + search + tags                                    |
| `artifacts`              | `ArtifactsPortal.tsx`            | 0.75  | ~338  | Artifact repo: code/docs/images/video                             |
| `project-management`     | `ProjectManagementPortal.tsx`    | 0.75  | 820   | Project CRUD + tasks + members                                    |
| `intelligence-panel`     | `IntelligencePanelPortal.tsx`    | 0.75  | 967   | Cognitive analytics: metrics, trends, agent analysis              |
| `settings`               | `SettingsPortal.tsx`             | 0.6   | ~289  | Settings hub — navigation cards to sub-portals                    |
| `security`               | `SecurityPortal.tsx`             | 0.6   | 767   | Security dashboard: metrics, policies, compliance                 |
| `provider-settings`      | `ProviderSettingsPortal.tsx`     | 0.6   | ~684  | LLM provider config + per-task model preferences                  |
| `tools-integrations`     | `ToolsIntegrationsPortal.tsx`    | 0.6   | 13    | **DEPRECATED** — re-exports `UnifiedToolPortal`                   |
| `tool-management`        | `ToolManagementPortal.tsx`       | 0.6   | 840   | Tool registry CRUD from UAIPContext                               |
| `unified-tool`           | `UnifiedToolPortal.tsx`          | 0.6   | 979   | Tool discovery + MCP config upload (Discover/Manage/Monitor tabs) |
| `general-settings`       | `GeneralSettingsPortal.tsx`      | 0.6   | 14    | **STUB** — placeholder only                                       |
| `system-config`          | `SystemConfigPortal.tsx`         | 0.4   | ~384  | System config: theme/language/DB/performance                      |
| `mini-browser`           | `MiniBrowserPortal.tsx`          | 0.4   | 907   | In-app web browser → screenshot → KnowledgeContext                |

## STANDALONE PORTALS (11 — not in registry, used elsewhere)

| File                              | Lines | Used By / Purpose                                              |
| --------------------------------- | ----- | -------------------------------------------------------------- |
| `UnifiedChatSystem.tsx`           | 2390  | **Core chat engine** — ChatPortal + MultiChatManager wrap this |
| `MultiChatManager.tsx`            | 10    | Thin wrapper → `<UnifiedChatSystem mode="floating">`           |
| `AtomicKnowledgeViewer.tsx`       | ~697  | Deep-dive viewer for a single knowledge item                   |
| `CapabilityRegistry.tsx`          | ~411  | Browse/search capabilities from UAIPContext                    |
| `EventStreamMonitor.tsx`          | ~393  | Live BullMQ/Redis event stream viewer                          |
| `InsightsPanel.tsx`               | ~554  | AI insights from UAIPContext insights array                    |
| `KnowledgeGraphVisualization.tsx` | ~643  | ReactFlow + Dagre interactive knowledge graph                  |
| `MindMap.tsx`                     | ~408  | ReactFlow mind map builder                                     |
| `OperationsMonitor.tsx`           | ~496  | UAIP operations list + play/pause/stop controls                |
| `ProjectOnboardingFlow.tsx`       | 1011  | Multi-step project setup wizard (GitHub + team)                |
| `SecurityGateway.tsx`             | ~589  | Approval queue + audit log from UAIPContext                    |
| `ToolsPanel.tsx`                  | 920   | Tool execution panel: browse + invoke + results                |

## CHAT SYSTEM ARCHITECTURE

```
ChatPortal (registered `chat`)
  └── UnifiedChatSystem (core engine, 2390 lines)
        ├── discussionsAPI.create/start/sendMessage  ← all messages persisted to backend
        ├── useEnhancedWebSocket → agent_response events
        ├── useConversationIntelligence → topic generation
        └── ChatWindow[] ← one per open agent (deduped by agentId)

ConsolidatedUserChatPortal (registered `consolidated-user-chat`)
  └── Same WebSocket + discussionsAPI pattern + WebRTC calls

UserChatPortal (registered `user-chat`)
  └── Similar pattern, single-user focus
```

## LARGE PORTALS — KEY INTERNALS

**AgentManagerPortal** (2418 lines):

- Views: `grid | list | settings | create | create-persona`
- Uses `useAgents()` + `useDiscussion()` context
- Sub-components: `<PersonaSelector>`, `<AgentEditModal>` (separate file)
- Paginated: 12 per grid page, 10 per list page

**IntelligencePanelPortal** (967 lines):

- Modes: `realtime | deep | predictive`
- All metrics are deterministic (no `Math.random()`) — computed from discussion state
- Deep analysis: `uaipAPI.ai.analyzeContext()` (only in `deep` mode, on interval)

**UnifiedToolPortal** (979 lines):

- Tabs: `discover | manage | monitor`
- Merges `uaipAPI.tools.list()` + `uaipAPI.mcp.getTools()` (MCP tools get `category: 'mcp'`)

## ADDING A PORTAL TO TELESCOPESURFACE

1. Create `MyPortal.tsx` here with a named export `export const MyPortal: React.FC = () => ...`
2. In `TelescopeSurface/portal_registry.tsx`:
   - Add `const MyPortal = lazy(() => import('./portals/MyPortal').then(m => ({ default: m.MyPortal })))`
   - Add `'my-portal': MyPortal` to `PORTAL_COMPONENTS`
   - Add entry to `createInitialBlocks()` with `relevanceScore`, `expression`, `metadata: { title: '...' }`

## ANTI-PATTERNS

- Splitting a portal into the 4-file pattern mid-file — extract to a **new directory** next to `portals/`, not inside it
- Copying `ChatWindow`/`ChatMessage` types from UnifiedChatSystem — extract to a shared types file if needed by multiple portals
- Using `ChatPersistenceService` — deprecated; use `discussionsAPI` directly (as UnifiedChatSystem does)
- Adding business logic that belongs in a context or hook — portals are UI, not orchestration
- `ToolsIntegrationsPortal` already deprecated — do not add features to it; use `UnifiedToolPortal`
