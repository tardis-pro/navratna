# PM-295 Audit: Composition Policy Rule Coverage

**Date**: 2026-04-17  
**Auditor**: Sisyphus (epic-30-audit)  
**Status**: FIXED

## Current State (Pre-Fix)

`composition_policy_service.ts` implemented 6 of 8 required rule types. `@uaip/types` `PolicyRuleSchema` also missing 3 types.

| # | Required Rule Type | Service Status | Types Status |
|---|-------------------|----------------|--------------|
| 1 | Tool deny-lists (`deny_tool`) | ❌ Missing | ❌ Missing |
| 2 | Tool combination restrictions (`deny_combination`) | ✅ Present | ✅ Present |
| 3 | Blast radius limits (`blast_radius_limit`) | ✅ Present | ✅ Present |
| 4 | Rate limits per tenant per tool (`rate_limit`) | ⚠️ Domain-scoped only | ✅ Present |
| 5 | Approval gate requirements (`require_approval_for_domain`) | ✅ Present (warning) | ✅ Present |
| 6 | Domain confidence thresholds (`confidence_threshold`) | ❌ Missing | ❌ Missing |
| 7 | Secret reference enforcement (`secret_reference_required`) | ❌ Missing | ❌ Missing |
| 8 | Output schema validation (`require_schema_validation`) | ✅ Present (warning) | ✅ Present |

## Gaps Found

### CRITICAL: Rule 6 — `confidence_threshold` missing
Agent confidence score is never checked against domain thresholds. A low-confidence agent could compose and execute high-risk workflows.

### CRITICAL: Rule 7 — `secret_reference_required` missing  
No enforcement that sensitive workflow input fields use `vault:` prefixed references. Inline credentials could silently flow into `WorkflowDefinition` JSONB.

### MEDIUM: Rule 1 — No single tool deny-list
Only combination denials exist. A banned tool (e.g., `gdpr-delete`) used alone is not blocked unless it appears in a `deny_combination` rule with itself as the sole member.

### LOW: Rule 4 — Rate limit is domain-scoped, not per-tenant-per-tool
Spec requires per-tenant per-tool granularity. Current implementation is per-domain. Sufficient for MVP but doesn't satisfy the full spec.

### LOW: Rules 5 and 8 — Produce warnings, not violations
`require_approval_for_domain` emits a warning (caller enforces). `require_schema_validation` is also a warning. This is intentional for the MVP but callers must not ignore these warnings.

## Fixes Implemented

### `composition_policy_service.ts`
- Added `deny_tool` rule type and `evaluateDenyTool()` evaluator
- Added `confidence_threshold` rule type and `evaluateConfidenceThreshold()` evaluator  
- Added `secret_reference_required` rule type and `evaluateSecretReferenceRequired()` evaluator
- Extended `evaluate()` signature: `domainConfidence?: number`, `workflowInputFields?: string[]`

### `apps/packages/shared-types/src/workflow_composition.ts`
- Added `deny_tool`, `confidence_threshold`, `secret_reference_required` to `PolicyRuleSchema`

## Risk Assessment

| Gap | Risk | Action |
|-----|------|--------|
| Missing confidence threshold | HIGH — low-confidence agents execute unchecked | Fixed |
| Missing secret reference enforcement | HIGH — inline credentials in JSONB | Fixed |
| No single tool deny | MEDIUM — partial protection only | Fixed |
| Rate limit granularity | LOW — domain-scoped is adequate for MVP | Accept, follow-up later |
| Approval/schema as warnings | LOW — callers must enforce | Accept |

## Type Divergence Note

`composition_policy_service.ts` maintains its own `PolicyRule` union type (runtime evaluator) while `@uaip/types` exports a `PolicyRuleSchema` (Zod, for DB serialization). These are now aligned on all 8 required types but diverge on the extended types (`regulatory_hold`, `maker_checker`) which are only in `@uaip/types`. Future work should consolidate into a single source of truth.

## Recommendation

**ACCEPT** with fixes applied. Follow-up ticket recommended for rate limit per-tenant-per-tool granularity.
