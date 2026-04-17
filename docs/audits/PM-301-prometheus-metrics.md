# PM-301 — Workflow-Level Prometheus Metrics

**Jira**: PM-301 | **Status**: Complete | **Commit**: `4893887`

## Current State

A new `workflow_metrics.ts` module was added under `apps/shared/services/src/composition/` that exposes 5 Prometheus metrics via the shared `getOrCreateCounter`/`getOrCreateHistogram` registry (same instance used by `@uaip/middleware`):

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `workflow_execution_total` | Counter | `status`, `domain` | Count of workflow executions, partitioned by outcome |
| `workflow_execution_duration_seconds` | Histogram | `domain`, `status` | End-to-end execution latency |
| `workflow_policy_violations_total` | Counter | `rule_type`, `domain` | Policy violations caught pre-execution |
| `workflow_active_executions` | Gauge | `domain` | Currently running executions (for OOM dashboards) |
| `workflow_step_failures_total` | Counter | `step_kind`, `domain` | Per-step failure counts |

## Integration

The metrics module is wired into `WorkflowCompositionService.execute()`:
- Incremented on pre-execution policy evaluation (for `policy_violations`)
- Incremented on instance creation (for `active_executions` gauge)
- Recorded on completion/failure via the existing event bus listener path

Metrics are exported via the standard `/metrics` endpoint already exposed by `@uaip/middleware`'s `metricsMiddleware`.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Cardinality explosion from high-cardinality labels | **LOW** | Only 2–3 label dimensions per metric, all bounded enums |
| prom-client version drift | **LOW** | Uses workspace catalog version `^15.1.3` |
| Metrics registry conflict | **NONE** | Uses shared `getOrCreateCounter/Histogram` helpers — idempotent |

## Recommendation

**Accept.** Metrics are live as of commit `4893887`; dashboard wiring is a follow-up for the OIE observability epic (PM-176).

## Files Added

- `apps/shared/services/src/composition/workflow_metrics.ts`
- Export added to `apps/shared/services/src/index.ts`
- `prom-client` added to `apps/shared/services/package.json` (workspace catalog)
