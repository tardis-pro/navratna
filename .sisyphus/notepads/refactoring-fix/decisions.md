# Refactoring Fixes - Architectural Decisions

## Poison Message Risk Fix

### Decision Date

January 27, 2026

### Issue

When no dead letter exchange (DLX) is configured, failed messages were endlessly requeued with `this.channel.nack(msg, false, true)`, creating poison message scenarios where malformed messages block the queue indefinitely.

### Solution Chosen

Changed the requeue parameter from `true` to `false` in the error handler's else branch:

```typescript
// Before (BROKEN):
this.channel.nack(msg, false, true); // Requeue indefinitely

// After (FIXED):
this.channel.nack(msg, false, false); // Reject and discard
```

### Rationale

1. **Prevent infinite loops**: Without DLX, requeuing failed messages creates an infinite loop that blocks the queue
2. **Fail fast**: Better to lose a malformed message than to block all subsequent messages
3. **Security**: Malformed messages could be attack vectors - discarding them limits impact
4. **Graceful degradation**: With DLX configured, messages are still handled via dead letter queue
5. **Explicit policy**: Makes failure handling clear - messages are either dead-lettered or discarded, never retried indefinitely

### Trade-offs

- **Lost messages**: Failed messages are discarded when no DLX exists
  - Mitigation: Operators should configure DLX for production environments
- **No retry logic**: Without DLX, there's no retry mechanism
  - Mitigation: Implement application-level retry logic where needed
  - Alternative: Configure DLX with TTL and retry policies

### Alternative Considered

Add retry counter to message headers with max retry limit:

```typescript
const retryCount = msg.properties.headers['x-retry-count'] || 0;
if (retryCount < 3) {
  msg.properties.headers['x-retry-count'] = retryCount + 1;
  this.channel.nack(msg, false, true);
} else {
  this.channel.nack(msg, false, false);
}
```

**Rejected because**:

- Adds complexity to error handling
- Retry logic should be at application layer, not infrastructure layer
- DLX is the proper RabbitMQ pattern for failed message handling
- Simpler solution addresses the critical issue (infinite loops)

### Impact Assessment

- **Breaking change**: No - applications without DLX already had buggy behavior
- **Performance**: Positive - prevents queue blocking
- **Reliability**: Positive - eliminates poison message scenario
- **Security**: Positive - limits impact of malformed messages

## 2026-01-27 - EventBus JWT Verification

### Decision

Validate internal service tokens in `EventBusService` with `jwt.verify` using `config.jwt.secret` instead of decoding the payload without signature checks.

### Rationale

- Prevents forged internal tokens from bypassing authentication.
- Aligns EventBus verification with existing JWT configuration in shared config.
