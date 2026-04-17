# PM-189 — Extract discussion endpoints into importable route files

**Jira**: PM-189 | **Status**: BLOCKED — scoped as follow-up | **Priority**: Medium

## Original Scope

> Extract discussion endpoints from `discussion-orchestration` into importable route files for `navratna-core`.

## Why Blocked

PM-189 is a **structural refactor**, not a bug fix. It requires:

1. **Splitting the `discussion-orchestration` service** into two packages:
   - `@uaip/discussion-routes` — importable Elysia route definitions (new package)
   - `apps/backend/services/discussion-orchestration` — runtime wrapper that still exposes the routes

2. **Dependency untangling**: `discussion-orchestration` currently pulls in Socket.IO handlers, event bus subscribers, and UserChatHandler that are runtime-specific and cannot be imported cleanly into `navratna-core`.

3. **Type graph rewriting**: The `DiscussionService` class depends on `EventBusService`, `DiscussionOrchestrationFeature`, and 8+ domain services. These need to be decoupled via interfaces before routes can be cleanly imported.

4. **Bun/Elysia workspace plumbing**: Creating a new `apps/packages/discussion-routes/` package requires `pnpm install` to resolve the new workspace member, which is explicitly forbidden inside a parallel worktree per the session constraints.

## Scope Estimate

- **Effort**: 2–3 days focused work
- **Risk**: High (many runtime dependencies)
- **Impact**: Medium (consolidation only — current routing works via gateway proxy)

## Recommendation

**File as separate consolidation epic.** This is not a drop-in fix; it's a refactor that benefits from its own branch, `pnpm install` cycle, and full test pass. PM-189's current runtime behaviour (routes served from `discussion-orchestration` and reverse-proxied by `navratna-gateway`) is functional; the consolidation is a code-health improvement, not a bug.

## Follow-up

Create a new Workstream ticket: **"Consolidation: Package discussion-routes as importable workspace member"** with:
- Design doc for interface split
- Migration plan (routes → interfaces → consumers)
- Test strategy (existing discussion integration tests must still pass)

## Context Files

- `apps/backend/services/discussion-orchestration/src/routes/discussion_routes.ts` (source routes)
- `apps/backend/services/discussion-orchestration/src/services/` (dependencies to untangle)
- `apps/backend/services/navratna-core/src/features/` (target consumer)
