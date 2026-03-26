# contexts/ — React Context Providers

10 providers. All wrapped in `DesktopApp.tsx`. `AuthContext` must be outermost (others depend on it).

## PROVIDER ORDER (DesktopApp.tsx — must match)

```
AuthContext (outermost)
  └── AgentContext (depends on AuthContext)
        └── UAIPContext (aggregates AgentContext + external APIs)
              └── DiscussionContext (depends on AgentContext + AuthContext)
                    └── KnowledgeContext
                          └── DocumentContext (auto-ingests to KnowledgeContext)
                                └── SecurityContext
                                      └── OnboardingContext
                                            └── UserPreferencesContext
                                                  └── FocusContext (innermost)
```

## CONTEXT REFERENCE

| Context                  | Hook                 | Consumer Count | State                                                                                                                                                                           |
| ------------------------ | -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthContext`            | `useAuth`            | **26 files**   | `user`, `isAuthenticated`, `isLoading`, `error`; `login`, `logout`, `refreshUser`; flow execution (`executeFlow`, `getFlowStatus`)                                              |
| `AgentContext`           | `useAgents`          | **15 files**   | `agents: Record<id, AgentState>`, model providers + models; `addAgent`, `removeAgent`, `executeToolCall`, `refreshAgents`, `loadProviders`, `loadModels`                        |
| `DiscussionContext`      | `useDiscussion`      | **8 files**    | `isActive`, `participants`, `messages`, `history`, `currentTurn`; `start`, `stop`, `pause`, `resume`, `addMessage`, `loadHistory`                                               |
| `UAIPContext`            | `useUAIP`            | **8 files**    | `agents`, `operations`, `capabilities`, `approvals`, `insights`, `events`, `systemMetrics`; `executeOperation`, `approveExecution`, `rejectExecution`; auto-refreshes every 30s |
| `KnowledgeContext`       | `useKnowledge`       | **5 files**    | `items: Record<id, KnowledgeItem>`, `searchResults`, `stats`, `uploadQueue`; `uploadKnowledge`, `searchKnowledge`, `refreshStats`, `fetchAllItems`                              |
| `OnboardingContext`      | `useOnboarding`      | **3 files**    | `isFirstTime`, `showOnboarding`, `onboardingStep`; `startOnboarding`, `completeOnboarding`, `skipOnboarding` — **⚠️ hardcoded to always show**                                  |
| `SecurityContext`        | `useSecurity`        | **3 files**    | `permissions`, `mfaStatus`, `settings`, `metrics`, `auditLog`, `oauthConnections` — **⚠️ mock data only**                                                                       |
| `DocumentContext`        | `useDocument`        | **2 files**    | `documents: Record<id, Doc>`, `activeDocumentId`; `addDocument` auto-ingests to `KnowledgeContext` if content > 50 chars                                                        |
| `FocusContext`           | `useFocus`           | **2 files**    | Thin wrapper around `useFocusManager`; global `FocusPreview` overlay; `registerElement`, `focusElement`, `closePreview`                                                         |
| `UserPreferencesContext` | `useUserPreferences` | **2 files**    | `preferences` (theme/language/notifications/ui/desktop); localStorage-persisted; `setTheme`, `toggleTheme`, `effectiveTheme`, `resetToDefaults`                                 |

## DECISION GUIDE

- Agent list/state → `useAgents()` from `AgentContext`
- Auth check → `useAuth()` from `AuthContext`
- Discussion lifecycle → `useDiscussion()` from `DiscussionContext`
- Cross-system ops/approvals → `useUAIP()` from `UAIPContext`
- Theme / user prefs → `useUserPreferences()`
- Knowledge items → `useKnowledge()`

## ADDING A CONTEXT

1. `contexts/MyContext.tsx` — export `MyProvider` + `useMyContext`
2. Add `<MyProvider>` to provider stack in `DesktopApp.tsx`
3. Position matters — outermost contexts are available to inner ones

## KNOWN ISSUES

- **`SecurityContext`**: All methods use mock data (`securityAPI` never called); `useSecurity()` returns hardcoded values
- **`OnboardingContext`**: `checkIfFirstTime()` always returns `true` (line 45) — API check is commented out; every user sees onboarding
- **`DocumentContext`** + **`FocusContext`** + **`UserPreferencesContext`**: Near-zero consumers outside their own definition — effectively unused in most flows
- **`UAIPContext`** depends on `AgentContext` — never import `UAIPContext` outside its provider subtree
