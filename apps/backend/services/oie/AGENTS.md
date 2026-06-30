# oie — @uaip/oie

**Port**: none (background worker) | **Entry**: `src/feature.ts` → `oieFeature` | **Status**: 🆕 New library, not yet wired

**Operational Intelligence Engine** — provider-agnostic, continuous improvement pipeline. Ingests observability signals (errors/metrics/traces/incidents) from SigNoz and Sentry, dedups and triages them, auto-creates Jira tickets, proposes code fixes, verifies outcomes, and detects SLO drift. Runs entirely as a BullMQ pipeline on Redis — no HTTP server, no Elysia app, no port.

## STATUS

**Library-only Feature.** Exports `oieFeature: Feature` via `./feature` subpath — intended to be registered in navratna-core or navratna-gateway through `FeatureFactory`. **Not currently imported by either consolidated service** (no `FEATURE_OIE` env wiring yet). Building, linting, and type-checking work via NX; there is no `dev` script because it's not standalone.

## STRUCTURE

```
src/
├── feature.ts                    # oieFeature (FeatureFactory entry): initializes adapters + 8 pipeline services
├── index.ts                      # Barrel exports (all services, adapters, types)
├── adapters/
│   ├── adapter_registry.ts       # AdapterRegistry singleton
│   ├── signoz_adapter.ts         # SigNoz REST (queryErrors/Metrics/Traces/getIncidents)
│   └── sentry_adapter.ts         # Sentry REST (same interface; onNewIncident webhook support)
├── collector/
│   └── collector_service.ts      # Polls registered adapters every OIE_POLL_INTERVAL_MS, fan-out to queue
├── triage/
│   ├── triage_engine.ts          # Redis dedup + occurrence counting + severity escalation
│   └── decision_trees.ts         # Pure classification: category, severity, action
├── ticketing/
│   ├── auto_jira_service.ts      # Consumes triaged incidents → creates/updates Jira tickets (fully implemented)
│   └── jira_ticketing_adapter.ts # Jira REST adapter implementing TicketingAdapter
├── analyst/
│   └── analyst_agent.ts          # RCA agent (STUB — high/critical only)
├── fix_proposer/
│   └── fix_proposer_agent.ts     # Confidence-routed fix proposer (STUB — routing real, body empty)
├── verifier/
│   ├── verifier_service.ts       # 7-day verification window (STUB)
│   └── github_source_control_adapter.ts  # GitHub REST v2022-11-28 (getFile/createPR/getCommitsSince/getDiff) — fully implemented but not yet wired
├── learner/
│   └── learner_service.ts        # IncidentOutcome storage (STUB — no DB write)
├── reconciliation/
│   └── reconciliation_loop.ts    # 5-min SLO drift check → DriftVector
└── types/                        # OIEEvent, TriagedIncident, SLOConfig, DriftVector, all adapter interfaces
```

## PIPELINE (BullMQ queues on Redis)

```
[SigNoz / Sentry]
  ↓ poll every OIE_POLL_INTERVAL_MS (default 60s)
CollectorService  → oie.events.collected
  ↓
TriageEngine      → oie.incidents.triaged  (Redis dedup, 1h/24h occurrence counters)
  ↓                    ↓
AnalystAgent      → oie.analysis.completed  (STUB, high/critical only)
AutoJiraService   ← oie.incidents.triaged   (parallel consumer; creates/updates Jira)
  ↓
FixProposerAgent  → oie.fix.proposed        (STUB; routing: auto_pr ≥0.8, shadow_jury ≥0.5, jira_comment <0.5)
VerifierService   → oie.verification.completed (STUB; 7-day window)
  ↓
LearnerService     (terminal; STUB — outcome shape built, not persisted)

ReconciliationLoop → oie.reconciliation.report  (independent 5-min loop)
```

## INTEGRATION

- **Databases**: Redis only (BullMQ + ioredis). No PostgreSQL / Neo4j / Qdrant.
- **External APIs**: SigNoz, Sentry (optional), Jira, GitHub.
- **Event bus**: internal BullMQ queues only — no publishing to navratna-core/gateway topics.
- **HTTP**: none.

## ENV VARS

| Var                             | Default              | Purpose                                                        |
| ------------------------------- | -------------------- | -------------------------------------------------------------- |
| `OIE_PROJECT_ID`                | `navratna`           | Project identifier on every event                              |
| `OIE_POLL_INTERVAL_MS`          | `60000`              | Collector poll frequency                                       |
| `OIE_LOOKBACK_MINUTES`          | `5`                  | Initial lookback                                               |
| `OIE_ERROR_DEDUP_COOLDOWN_MS`   | `30000`              | Triage dedup window                                            |
| `OIE_SEVERITY_ESCALATION_1H`    | `10`                 | Count to escalate severity (1h)                                |
| `OIE_SEVERITY_ESCALATION_24H`   | `50`                 | Count to escalate severity (24h)                               |
| `OIE_CONFIDENCE_THRESHOLD`      | `0.8`                | Min confidence for auto-PR routing                             |
| `SIGNOZ_API_URL`                | `http://localhost:3301` | SigNoz endpoint                                             |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` | —                 | Required to enable SentryAdapter; skipped if unset             |
| `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` | —  | Jira auth                                                      |
| `JIRA_PROJECT_KEY`              | `PM`                 | Jira project key for auto-tickets                              |
| `GITHUB_TOKEN`                  | —                    | GitHub PAT (used by GitHubSourceControlAdapter when wired)     |

## COMMANDS

```bash
pnpm --filter @uaip/oie build    # tsc
pnpm --filter @uaip/oie lint     # oxlint src
# No dev/start script — mount via FeatureFactory in navratna-core or navratna-gateway
```

## GOTCHAS

- **Multiple stubs**: `AnalystAgent.performAnalysis()`, `FixProposerAgent.proposeFix()`, `VerifierService.scheduleVerification()`, `LearnerService.storeOutcome()` all return shape-correct but empty results. End-to-end pipeline runs but produces no real RCA, no real fix diffs, no DB writes.
- **Parallel consumers on `oie.incidents.triaged`**: both `AutoJiraService` and `AnalystAgent` are BullMQ Workers on this queue — BullMQ distributes (does not broadcast). Jira gets every incident; Analyst gets a subset. Likely intentional, but confirm before adding a third consumer.
- **`GitHubSourceControlAdapter` is fully implemented** but never instantiated in `feature.ts`. Ready to wire into `FixProposerAgent` when that stub is replaced. `addPRComment` is unimplemented — logs a warning, does nothing.
- **`AutoJiraService` dedup** uses JQL search on `oie-auto` label + `service:{name}` label + summary match. If found, adds a comment instead of creating duplicate.
- **`tsc` build only** — no Bun build. This is a library/feature module; different from navratna-core/gateway which use `bun build`.
- **No tests** — no `vitest.config.ts`.
- **Not yet in `FeatureFactory` env toggles** — when wiring, add `FEATURE_OIE=true` pattern and import `oieFeature` from `@uaip/oie/feature` in navratna-core or navratna-gateway.
