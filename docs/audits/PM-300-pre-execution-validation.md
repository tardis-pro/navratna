# PM-300 Audit: Pre-Execution Workflow Validation

**Date**: 2026-04-17  
**Auditor**: Sisyphus (epic-30-audit)  
**Status**: FIXED

## Current State (Pre-Fix)

| Check | At Activation | At Execution |
|-------|--------------|--------------|
| (a) Schema compatibility | ✅ `validateSchemaCompatibility()` | ❌ Not re-checked |
| (b) Blast radius limits | ✅ `estimateBlastRadius()` estimates | ❌ Not checked vs policy |
| (c) Rate limits | ✅ Policy rules exist | ❌ `policyService.evaluate()` not called at execution |
| Rate limit tracking | N/A | ❌ `recordExecution()` never called |

## Gaps Found

### CRITICAL: Rate limits not checked at execution time
`CompositionPolicyService.rate_limit` rules existed and tracked counters in-memory, but `recordExecution()` was never called — meaning rate limit counters were always zero. Rate limit enforcement was effectively disabled.

### HIGH: Blast radius not enforced at execution time  
`blast_radius_limit` policy rules were only used during Phase 3 composition (at design time), not at execution time. A workflow that was within limits when composed might exceed them by the time it executes.

### MEDIUM: Schema compatibility not re-validated at execution
Tool schemas can change between activation and execution. In practice, tools rarely change schema post-activation, so this is low urgency. Risk: LOW.

## Fixes Implemented

### `workflow_composition_service.ts`
- Added `CompositionPolicyService` import and field
- Added `policyService` to constructor (with singleton fallback)
- In `execute()`, before creating the instance:
  1. Extracts `workflowTools` from definition steps
  2. Calls `policyService.evaluate(workflowTools, domain, { records: definition.steps.length })` 
  3. Throws `Error` with violation messages if policy blocked
  4. Logs warnings for non-blocking policy flags
  5. Calls `policyService.recordExecution(domain)` after instance creation to track rate limits

## Risk Assessment

| Gap | Risk | Action |
|-----|------|--------|
| Rate limits never tracked | HIGH — enforcement was dead code | Fixed |
| Blast radius not enforced at exec | HIGH — budget overrun possible | Fixed |
| Schema re-validation at exec | LOW — tools rarely change schema | Accept |

## Blast Radius Estimate
The execution-time blast radius estimate uses `definition.steps.length` for `records`. This is conservative — it assumes every step could produce a record. Future improvement: count only `tool` steps with known write-side-effects from tool metadata.
