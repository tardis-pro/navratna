# PM-299 Audit: Immutable Audit Chaining (SOC 2 CC7.2)

**Date**: 2026-04-17  
**Auditor**: Sisyphus (epic-30-audit)  
**Status**: DOCUMENTED + FIXED (docstring) + FOLLOW-UP (PM-323)

## Current State

| Component | Status |
|-----------|--------|
| `ImmutableAuditService` | ✅ Exists — INSERT-only, SHA-256 hash chain |
| Linear hash chaining | ✅ Implemented correctly |
| Merkle tree | ❌ NOT implemented (docstring falsely claimed "Merkle-chained") |
| SOC 2 CC7.2 compliance | ✅ Linear chain is sufficient — tamper-evident by sequential inspection |

## Contradiction Resolved

PM-259 marked as Done with the comment that the service was "Merkle-chained". The 2026-04-16 audit correctly identified this as a false claim — the implementation is a **linear hash chain** where each event's hash = `SHA-256(previousHash + eventType + timestamp + JSON(details))`.

**Verdict**: Linear chain satisfies SOC 2 CC7.2. Merkle trees are not required by the standard.

## Gaps Found

### MEDIUM: Misleading "Merkle-chained" in class docstring
The class-level JSDoc said "Merkle-chained audit logging". This creates false compliance documentation — auditors might rely on Merkle-specific guarantees (partial inclusion proofs) that don't exist.

**Fixed**: Updated docstring to correctly state "linear hash-chained", document SOC 2 CC7.2 compliance, explain the hash formula, and note the race condition limitation.

### MEDIUM: Race condition in `appendEvent()` 
`appendEvent()` uses a read-then-insert pattern:
1. Fetch last event hash (`SELECT ... ORDER BY createdAt DESC LIMIT 1`)
2. Insert new event with `previousHash = <fetched>`

Under concurrent writes (two calls in the same millisecond), both calls may read the same "last" event hash, and both insert with the same `previousHash`. This creates a chain fork where `verifyChain()` will detect a broken chain.

**Risk**: LOW in practice — composition audit events are triggered by user actions (create, activate, execute) which are infrequent and not expected to be concurrent. The race window is tiny.

**Action**: Created PM-323 (Medium priority) to fix with PostgreSQL advisory lock or CTE-based atomic insert.

## Fixes Implemented

### `immutable_audit_service.ts`
- Updated class-level docstring: "Merkle-chained" → "linear hash-chained"
- Updated `appendEvent()` docstring: "Computes the Merkle hash chain" → "Computes the linear hash chain link"
- Added SOC 2 CC7.2 compliance statement to class docstring
- Added known limitation (race condition) to class docstring

## Risk Assessment

| Gap | Risk | Action |
|-----|------|--------|
| False "Merkle" claim in docstring | HIGH (compliance docs) | Fixed |
| Race condition in appendEvent | MEDIUM | Follow-up PM-323 |
| Upgrade to Merkle tree | N/A — not required | Accept |

## SOC 2 CC7.2 Compliance Verdict

✅ **COMPLIANT** — linear hash chaining provides tamper-evident audit logs detectable via sequential `verifyChain()` inspection. The CC7.2 control is met.
