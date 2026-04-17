# PM-303 Audit: DAG Node Backpressure and Semaphore

**Date**: 2026-04-17  
**Auditor**: Sisyphus (epic-30-audit)  
**Status**: VERIFIED COMPLETE (no changes needed)

## Findings

`TaskDAGService` (`apps/shared/services/src/cognitive/task_d_a_g_service.ts`) already fully implements the required backpressure mechanisms from PM-262:

| Mechanism | Implementation | Status |
|-----------|---------------|--------|
| Per-DAG node semaphore | `Semaphore` class (lines 46–70), limit 20 concurrent nodes per DAG | ✅ |
| Global DAG OOM guard | `MAX_CONCURRENT_DAGS` (default 100, env-configurable), `enforceDAGLimit()` (lines 98–111) | ✅ |
| DAG result TTL cleanup | `DAG_RETENTION_TTL_MS` = 5 min, `scheduleDAGCleanup()` (lines 115+) | ✅ |
| Cleanup timer management | `dagCleanupTimers` Map, cancels existing timer on re-execute | ✅ |
| Batch execution | `Promise.allSettled()` per topological batch, semaphore gates each node | ✅ |

## Detail

The semaphore is instantiated at DAG execution start (line 263) with `max=20` and used in every parallel batch:
```typescript
const semaphore = new Semaphore(20);
// Per node in each batch:
await semaphore.acquire();
try { return await this.executeNode(dag, node); }
finally { semaphore.release(); }
```

This caps parallel execution at 20 nodes per DAG regardless of batch size. The max can be made configurable via env var if needed (currently hardcoded).

## Recommendation

**ACCEPT** — implementation is correct and complete. 

Optional improvement: expose `MAX_CONCURRENT_NODES_PER_DAG` as an env var (currently hardcoded `20`) for operator tunability.
