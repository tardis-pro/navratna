# api/ — HTTP Domain Modules

22 files. One file per domain + `client.ts` (Axios) + `index.ts` (barrel). Do not call these directly — prefer `uaipAPI` from `utils/uaip-api.ts` which adds normalization and fallbacks on top.

## CALL STACK

```
Component → uaipAPI (utils/uaip-api.ts)     ← USE THIS
          → api/index.ts                     ← direct domain access if uaipAPI lacks method
          → *.api.ts                         ← domain module
          → APIClient (client.ts)            ← Axios singleton
```

## client.ts — APIClient Behavior

- Auto-injects CSRF token (from `CSRFService`, cached 50 min in localStorage)
- Unwraps `{success, data}` response envelope — callers get `data` directly
- Fires `auth:unauthorized` window event on 401 — `AuthContext` catches and redirects to login
- Auto-retries on 403 with a fresh CSRF token (once)
- Throws `APIClientError` with `{status, message, field}` on failures

## DOMAIN FILES

| File | Export | Key Methods |
|------|--------|-------------|
| `agents.api.ts` | `agentsAPI` | list, get, create, update, delete, chat, analyze, plan, executeToolCall, getMetrics |
| `approvals.api.ts` | `approvalsAPI` | create, submitDecision, getPending, bulkApprove, bulkReject, getStats |
| `audit.api.ts` | `auditAPI` | getLogs, search, getComplianceReports, generateComplianceReport, getUserActivity |
| `auth.api.ts` | `authAPI` | login, logout, refreshToken, getCurrentUser, register, changePassword, validateToken |
| `capabilities.api.ts` | `capabilitiesAPI` | search, list, create, update, validate, enable, disable, test, getProviders |
| `constellation.api.ts` | `constellationAPI` | getConstellations (single POST — knowledge constellation fetch) |
| `conversationEnhancement.api.ts` | `conversationEnhancementAPI` | analyzeConversation, getEnhancedContribution, createHybridPersona — **uses raw `fetch`, NOT APIClient** |
| `discussions.api.ts` | `discussionsAPI` | list, get, create, update, start, pause, resume, end, sendMessage, getMessages, manageTurn, getAnalytics |
| `knowledge.api.ts` | `knowledgeAPI` | upload, bulkUpload, search, getGraph, findSimilar, importChatFile, generateQAFromKnowledge |
| `llm.api.ts` | `llmAPI` | listModels, listProviders, generate, analyzeContext; `llmAPI.userLLM.*` for user-specific providers |
| `mcp.api.ts` | `mcpAPI` | getStatus, getConfig, uploadConfig, getTools, executeTool, restartServer, installTool |
| `orchestration.api.ts` | `orchestrationAPI` | executeOperation, getOperationStatus, listWorkflows, executeWorkflow, getWorkflowExecutions |
| `personas.api.ts` | `personasAPI` | list, get, create, update, search, getTemplates, createFromTemplate, clone, activate |
| `projects.api.ts` | `projectsAPI` | list, get, create, update, updateStatus, getMembers, addMember, getFiles, getTools, assignTools |
| `questionforge.api.ts` | `questionforgeAPI` | forge (full pipeline), createInterview, recordAnswer, nextQuestion, completeInterview |
| `security.api.ts` | `securityAPI` | assessRisk, checkApprovalRequired, listPolicies, getEvents, getStats, checkCompliance |
| `tasks.api.ts` | `tasksApi` | getProjectTasks, createTask, updateTask, assignTask, getAssignmentSuggestions, getTaskStatistics; also exports React Query config objects + utility functions |
| `tools.api.ts` | `toolsAPI` | list, get, create, update, execute, getExecutionStatus, getCategories, getRecommendations |
| `user-persona.api.ts` | `userPersonaAPI` | getCurrentPersona, updatePersona, completeOnboarding, updateBehavioralPatterns, getCompatibleAgents |
| `users.api.ts` | `usersAPI` | list, get, create, update, lock, activate, getUserLLMPreferences, updateUserLLMPreferences |

## WHERE TO LOOK

| Task | File |
|------|------|
| Add new domain | `myfeature.api.ts` → export from `index.ts` → add to `uaipAPI` in `utils/uaip-api.ts` |
| Auth/login | `auth.api.ts` |
| Discussions/messages | `discussions.api.ts` |
| Agent chat | `agents.api.ts` → `agentsAPI.chat()` |
| Tool execution | `tools.api.ts` → `toolsAPI.execute()` |
| LLM providers (user-specific) | `llm.api.ts` → `llmAPI.userLLM.*` |

## ANTI-PATTERNS

- `conversationEnhancement.api.ts` uses raw `fetch` — bypasses CSRF injection and error handling; do not copy this pattern for new files
- `utils/api.ts` re-exports these under a legacy namespace — **deprecated**; never import from it
- Calling `*.api.ts` directly when `uaipAPI` facade covers it
- `tasksApi` (note lowercase `a`) exports React Query config objects — only use these in React Query hooks, not plain async calls
