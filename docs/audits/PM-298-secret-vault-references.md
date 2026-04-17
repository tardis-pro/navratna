# PM-298 Audit: Secret Vault References in WorkflowDefinition JSONB

**Date**: 2026-04-17  
**Auditor**: Sisyphus (epic-30-audit)  
**Status**: FIXED

## Current State (Pre-Fix)

| Component | Status |
|-----------|--------|
| `SecretReferenceService.scanForRawSecrets()` | ✅ Exists — comprehensive regex patterns |
| Called at `activate()` time | ✅ Blocks activation if secrets detected |
| Called at `create()` time | ❌ Not called — secrets stored to DB immediately |
| Called at `update()` time | ❌ Not called — secrets stored to DB on update |

## Gaps Found

### HIGH: `create()` stores JSONB without secret scan
`WorkflowCompositionService.create()` wrote the full `CompositionDefinition` object to the `definition` JSONB column without any secret scanning. A caller could POST a definition with `apiKey: "sk_live_..."` and it would be persisted to the unencrypted column immediately. The scan only happened later at `activate()` — but the JSONB column already held the plaintext secret.

### HIGH: `update()` stores JSONB without secret scan
Same issue for `update()`. Definition merges (partial updates) were written to DB without scanning, allowing secrets to enter the JSONB via an update even on a workflow that was previously clean.

### LOW: `activate()` scan is defense-in-depth (preserved)
The existing scan at activation time is correct behavior. It blocks workflows with secrets from going live. But it does not prevent secrets from reaching the DB during create/update.

## Fixes Implemented

### `workflow_composition_service.ts`
- `create()`: scan definition BEFORE inserting to DB. Throw `Error` if any raw secrets detected.
- `update()`: scan merged definition BEFORE writing to DB. Throw `Error` if any raw secrets detected.
- Both throw with a message listing the flagged paths, guiding the caller to use `vault://` or `secret://` references.
- `activate()` scan preserved — now third line of defense rather than only one.

## Risk Assessment

| Gap | Risk | Action |
|-----|------|--------|
| Secrets reach JSONB on `create()` | HIGH — unencrypted at-rest exposure | Fixed |
| Secrets reach JSONB on `update()` | HIGH — same exposure | Fixed |

## Pattern Coverage (SECRET_PATTERNS in SecretReferenceService)

The scanner catches: Bearer tokens, `sk_*` / `pk_*` / `key_*` API keys, OAuth tokens, Base64-encoded strings >40 chars. This covers the most common credential types. Custom secrets not matching these patterns would still escape — recommend adding the `fieldPatterns` approach from `secret_reference_required` composition policy rule (PM-295) as a complementary defense.
