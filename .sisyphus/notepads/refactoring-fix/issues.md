# Refactoring Fixes - Issues Log

## Current Issues Being Addressed

### CRITICAL Issues (Must Fix Before Deployment)

1. **EventBus Internal Service Authentication is Fundamentally Broken**
   - File: `backend/shared/infra/src/eventBus.ts`
   - Lines: 537-570
   - Issue: `publish()` does NOT include authentication tokens in message headers
   - Impact: Any service can publish events without authentication

2. **Response Handler Structure Mismatch (Critical Bug)**
   - Files: `backend/shared/services/src/tool-execution.service.ts`
   - Lines: 354-356
   - Issue: `responseHandler` expects `{ data?: { success?: boolean... } }`
   - Impact: Tool execution will never complete successfully

### HIGH Priority Issues

3. **Wildcard Pattern Matching Bug in DangerToolList**
   - File: `backend/services/capability-registry/src/services/dangerToolList.ts`
   - Lines: 59-62
   - Issue: Pattern `*.read` matches `deleteread` incorrectly

4. **Weak Idempotency Key Generation**
   - File: `backend/shared/services/src/tool-execution.service.ts`
   - Lines: 75-80
   - Issue: Base64 encoding instead of SHA256 cryptographic hash

5. **Poison Message Risk in Dead Letter Handling** ✅ FIXED
   - File: `backend/shared/infra/src/eventBus.ts`
   - Lines: 614-617
   - Issue: Failed messages endlessly requeued if no DLX configured
   - Fix: Changed `this.channel.nack(msg, false, true)` to `this.channel.nack(msg, false, false)`

6. **x-max-retries Not Standard RabbitMQ Argument**
   - File: `backend/shared/infra/src/eventBus.ts`
   - Lines: 505-507
   - Issue: `x-max-retries` is not a standard RabbitMQ queue argument

7. **Idempotency Lookup Returns Null**
   - File: `backend/services/capability-registry/src/services/tool-execution-coordinator.service.ts`
   - Lines: 445-450
   - Issue: Idempotency check is a no-op, always returns null

### MEDIUM Priority Issues

8. **Nginx Query Parameter Token Security Risk**
   - File: `api-gateway/nginx.conf`
   - Lines: 105-113
   - Issue: Tokens in URL query params leak to logs, browser history

9. **Repetitive Response Object Code**
   - File: `backend/services/capability-registry/src/routes/toolRoutes.ts`
   - Lines: Throughout
   - Issue: Same `res: any` object duplicated 15+ times

## Issue #6 Fix Applied ✅

**Date**: 2026-01-27  
**Issue**: x-max-retries Not Standard RabbitMQ Argument  
**File**: `backend/shared/infra/src/eventBus.ts`  
**Lines**: 505-507  
**Fix**: Removed the unsupported `'x-max-retries': options.retryAttempts` argument from queueOptions.arguments  
**Impact**: Queue configuration now only uses standard RabbitMQ arguments like `x-dead-letter-exchange`

## 2026-01-27 Updates

- EventBus internal token validation now requires JWT signature verification.
