# PM-296 Audit: Domain-Scoped Confidence Tracking

**Date**: 2026-04-17  
**Auditor**: Sisyphus (epic-30-audit)  
**Status**: FIXED

## Current State (Pre-Fix)

| Component | Status |
|-----------|--------|
| `ConfidenceGatedExecutionService` | ✅ Exists — fully domain-scoped via `(agentId, taskType, domain)` key |
| `DomainConfidenceProfile` type | ✅ Exists in `@uaip/types` |
| `domain_confidence_profiles` DB table | ✅ Exists in control schema |
| `checkGate()` called from execution path | ❌ Never called — dead code |
| `WorkflowCompositionService.execute()` gates on confidence | ❌ No gate check |

## Gaps Found

### CRITICAL: `checkGate()` never called from composition execution
`ConfidenceGatedExecutionService.checkGate()` was defined but never invoked outside the service. PM-256 created the service; PM-296 audits whether it's wired in. It was not.

The `WorkflowCompositionService.execute()` method started instances unconditionally without checking agent confidence against domain thresholds. A low-confidence agent in finance could execute workflow compositions that require high confidence.

### MEDIUM: Composer `applyPolicies()` doesn't pass `domainConfidence` to `CompositionPolicyService.evaluate()`
The `confidence_threshold` policy rule (added in PM-295) requires the caller to pass `domainConfidence`. The composer Phase 3 call at line 288 omits it. This is a secondary gap — policy evaluation can run without it but won't enforce confidence thresholds via policy.

## Fixes Implemented

### `workflow_composition_service.ts`
- Added `ConfidenceGatedExecutionService` import
- Added `confidenceGateService` field and wired into constructor (with singleton fallback)
- Extended `execute()` signature with optional `agentId` and `agentConfidence` params
- When agent params are provided, calls `checkGate(agentId, 'workflow_execution', agentConfidence, domain)` before creating instance
- If gate fails: instance created with `status: 'pending_approval'` instead of flowing through to `running`
- If gate passes: existing behavior (pending → running) preserved

## Risk Assessment

| Gap | Risk | Action |
|-----|------|--------|
| `checkGate()` never called | HIGH — domain confidence enforcement was dead code | Fixed |
| `applyPolicies()` missing confidence | MEDIUM — policy evaluation, not execution gate | Accept (covered by execution gate fix) |

## Remaining Limitations

- Agent callers must pass `agentId` + `agentConfidence` to `execute()` — if omitted, gate is skipped (safe default for human-triggered runs)
- The `applyPolicies()` phase does not look up historical confidence from DB — it would need `ConfidenceGatedExecutionService.getProfile()` and that requires agentId at compose-time
- `pending_approval` instances are not yet automatically routed to an approval queue (PM-300 scope)
