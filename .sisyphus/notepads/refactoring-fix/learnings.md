# Refactoring Fixes - Learnings

## Issues Fixed

### HIGH: Wildcard Pattern Matching Bug (dangerToolList.ts)

**Problem**: Pattern `*.read` would match `deleteread` because `endsWith("read")` matches incorrectly.
**Fix**: Changed to `toolId.endsWith(`.${suffix}`) || toolId === suffix` to require a dot before the suffix.

### HIGH: Weak Idempotency Key Generation (tool-execution.service.ts)

**Problem**: Used base64 encoding instead of cryptographic hash.
**Fix**: Changed to `crypto.createHash('sha256').update(keyMaterial).digest('hex')`.

### HIGH: Idempotency Lookup Not Implemented (tool-execution-coordinator.service.ts)

**Problem**: Always returned null - no actual lookup implementation.
**Fix**: Implemented Redis-based idempotency key → requestId index lookup.

### HIGH: Poison Message Risk (eventBus.ts)

**Problem**: If no DLX configured, failed messages are endlessly requeued.
**Fix**: Reject and discard if no DLX (instead of indefinite requeue).

### HIGH: x-max-retries Not Standard RabbitMQ (eventBus.ts)

**Problem**: `x-max-retries` is not a standard RabbitMQ argument.
**Fix**: Removed the unsupported argument.

### MEDIUM: Token in Query Parameter Security (nginx.conf)

**Problem**: Tokens in URL query params leak to logs, browser history, Referer header.
**Fix**: Removed support for `?token=` query parameter.

### MEDIUM: Repetitive Response Object Code (toolRoutes.ts)

**Problem**: Same `res: any` object duplicated 15+ times throughout the file.
**Fix**: Extracted to helper function `createResponseObject()`.

### CRITICAL: EventBus Authentication Missing Signature Verification (eventBus.ts)

**Problem**: Only parses base64 JWT payload without cryptographic signature verification.
**Fix**: Added jwt.verify() with proper signature verification.

### CRITICAL: Response Handler Structure Mismatch (tool-execution.service.ts)

**Problem**: Handler expected nested `response.data` structure but received flat structure.
**Fix**: Updated response handler to match actual ToolExecutionCoordinator response format.

## Status

- Total Issues: 9
- Fixed: 1
- In Progress: 0
- Pending: 8

## 2026-01-27

- EventBus token validation must use `jwt.verify` with `config.jwt.secret` to avoid accepting unsigned payloads.
- toolRoutes response helper refactor centralizes status/json stub creation via `createResponseObject()`.

## Implementation Details for Idempotency Key Fix

### Change Summary

- **File**: `backend/shared/services/src/tool-execution.service.ts`
- **Lines Modified**: 1 (import), 75-76 (hash generation)
- **Before**: `Buffer.from(keyMaterial).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)`
- **After**: `createHash('sha256').update(keyMaterial).digest('hex').slice(0, 32)`

### Why Base64 is NOT Cryptographic

- **Reversible**: Base64 is an encoding scheme, not a hash function
- **Predictable**: Same input always produces same output pattern
- **Collision-prone**: No avalanche effect - similar inputs produce similar outputs
- **Security weakness**: Attackers can potentially craft inputs to match existing keys

### Why SHA256 is the Right Choice

- **One-way**: Cryptographically secure hash function
- **Avalanche effect**: Small input changes produce completely different outputs
- **Collision-resistant**: Extremely low probability of hash collisions
- **Standard**: Widely supported, battle-tested in production systems
- **Performance**: Fast enough for idempotency key generation

### Technical Details

- Import added: `createHash` from `node:crypto` (Node.js built-in module)
- Output format: Hexadecimal string (0-9, a-f characters)
- Length: 64 characters (full SHA256), sliced to 32 for idempotency key
- No character cleaning needed: Hex digest already contains only [0-9a-f]

## Issue #6 Fix Status Update (2026-01-27)

**Issue**: x-max-retries Not Standard RabbitMQ Argument  
**Status**: ✅ FIXED  
**File**: `backend/shared/infra/src/eventBus.ts`  
**Lines**: 505-507 (removed)

**What Was Changed**:

- Removed the spread operator block for `x-max-retries`: `...(options?.retryAttempts && { 'x-max-retries': options.retryAttempts })`
- The `queueOptions.arguments` object now only contains the standard `x-dead-letter-exchange` argument

**Verification**:

- File syntax is valid TypeScript
- No new errors introduced by this change
- LSP diagnostics show only pre-existing hints (deprecated substr calls unrelated to this fix)

**Why This Was Wrong**:

- RabbitMQ does not support `x-max-retries` as a queue argument
- Standard RabbitMQ retry mechanism uses DLX (Dead Letter Exchange) with `x-dead-letter-exchange` and `x-dead-letter-routing-key`
- Retry logic should be handled by the consumer, not queue arguments

## Issue #7 Fix Status Update (2026-01-27)

**Issue**: Idempotency Lookup Always Returns Null (tool-execution-coordinator.service.ts)  
**Status**: ✅ FIXED  
**File**: `backend/services/capability-registry/src/services/tool-execution-coordinator.service.ts`  
**Lines**: 416-428 (updateExecutionStatus), 441-455 (getExecutionStatusByIdempotency)

**What Was Changed**:

### 1. updateExecutionStatus() - Added Idempotency Mapping

```typescript
// Added after storing execution status:
if (status.metadata?.idempotencyKey) {
  const idempotencyKey = `tool:idempotency:${status.metadata.idempotencyKey}`;
  await this.redis.set(idempotencyKey, status.requestId, ttl);
}
```

### 2. getExecutionStatusByIdempotency() - Implemented Actual Lookup

```typescript
// Replaced placeholder that always returned null:
const idempotencyKeyRedis = `tool:idempotency:${idempotencyKey}`;
const requestId = await this.redis.get(idempotencyKeyRedis);

if (!requestId) {
  logger.debug('Idempotency key not found', { idempotencyKey });
  return null;
}

return await this.getExecutionStatus(requestId);
```

**Why This Was Critical**:

- The duplicate detection logic at lines 148-169 in `handleToolExecutionRequest()` depends on this lookup
- Without this fix, ALL requests with the same idempotency key would be re-executed
- This defeats the entire purpose of idempotency, leading to:
  - Duplicate tool executions
  - Wasted resources
  - Potential data corruption
  - Race conditions

**Verification**:

- File syntax is valid TypeScript
- No new errors introduced by this change
- LSP diagnostics show only pre-existing hints (unused imports unrelated to this fix)
- Redis key pattern is consistent with existing patterns (`tool:execution:*`)

**Redis Key Design**:

- Pattern: `tool:idempotency:{idempotencyKey}` → `requestId`
- TTL: Matches execution timeout (300 seconds / 5 minutes)
- Purpose: Fast O(1) lookup from idempotency key to requestId, then use `getExecutionStatus(requestId)` to get full status

**Impact**: Duplicate executions will now be correctly detected and skipped, preventing resource waste and ensuring idempotency semantics work as intended.
