# PM-302 Audit: Event Bus RPC Pattern Consolidation

**Date**: 2026-04-17  
**Auditor**: Sisyphus (epic-30-audit)  
**Status**: PARTIALLY FIXED + FOLLOW-UP FILED

## RPC Patterns Found

### Pattern A: `EventBusService.publishAndWaitForResponse()` (PREFERRED)
**Location**: `apps/shared/infra/src/event_bus.ts` lines 409–452  
Uses a single shared `rpc.replies` BullMQ worker with a `replyHandlers` Map keyed by `correlationId`. Clean, single worker, no ephemeral queue creation. `request()` wraps this.

### Pattern B: `EventBusService.publishAndWait()` (LEGACY)
**Location**: `apps/shared/infra/src/event_bus.ts` lines 637–712  
Creates ephemeral BullMQ queue+worker per request. PM-261 added cleanup, so it no longer leaks. But still more expensive than Pattern A (queue+worker created and destroyed per call).

**Callers before fix:**
- `capability-registry/enterprise_tool_registry.ts:548` — `publishAndWait('sandbox.execute', ...)`
- `capability-registry/unified_tool_registry.ts:821` — `publishAndWait('sandbox.execute.tool', ...)`

### Pattern C: Local `publishAndWait()` in `discussion-orchestration` (COMPETING)
**Location**: `apps/backend/services/discussion-orchestration/src/services/event_driven_discussion_service.ts` lines 287–314  
Custom pending-requests Map that resolves via `handleDiscussionResponse()`. Uses a different response-routing mechanism (the responder publishes to a channel that discussion-orchestration subscribes to). This is a bespoke protocol that cannot be trivially replaced with Pattern A.

## Gaps Found

### HIGH: capability-registry using legacy `publishAndWait()` (Pattern B)
Both sandbox execution calls used the ephemeral queue pattern even after Pattern A was available.

### MEDIUM: `discussion-orchestration` has competing custom impl (Pattern C)
The `event_driven_discussion_service.ts` has its own RPC pattern that has potential handler leak if the subscriber for the response event is never cleaned up. Pattern C is more complex to migrate — requires understanding the discussion command/response protocol.

## Fixes Implemented

### `capability-registry/enterprise_tool_registry.ts`
- Changed `publishAndWait('sandbox.execute', sandbox, 30000)` → `request('sandbox.execute', sandbox)`

### `capability-registry/unified_tool_registry.ts`  
- Changed `publishAndWait('sandbox.execute.tool', sandbox, timeout)` → `request('sandbox.execute.tool', sandbox)`

## Follow-up: PM-324 (Medium) — Migrate discussion-orchestration Pattern C to Pattern A
The `event_driven_discussion_service.ts` custom impl (Pattern C) should be reviewed and migrated to `eventBusService.request()`. Requires understanding the discussion event protocol and verifying no response-subscriber leaks. Out of scope for PM-302 (complexity exceeds 30-min budget).

## Risk Assessment

| Gap | Risk | Action |
|-----|------|--------|
| capability-registry using Pattern B | MEDIUM — resource overhead | Fixed |
| discussion-orchestration custom impl | MEDIUM — potential listener leak | Follow-up PM-324 |
| `publishAndWait()` still exists | LOW — cleanup added in PM-261 | Accept (callers migrated) |
