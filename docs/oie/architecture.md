# OIE Architecture (PM-176)

## Overview

The Operational Intelligence Engine (OIE) is a modular, provider-agnostic continuous improvement platform. It runs as a FeatureFactory module inside `navratna-core` (enabled via `FEATURE_OIE=true`).

## Pipeline Stages

```
┌─────────────────────────────────────────────────────────────┐
│  SigNoz (traces/metrics)     Sentry (errors/issues)         │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
    ┌──────────▼──────────────────────────▼──────────┐
    │  Collector (PM-180)                             │
    │  BullMQ repeatable job @ 60s                    │
    │  Normalizes → OIEEvent → oie.events.collected   │
    └────────────────────┬────────────────────────────┘
                         │
    ┌────────────────────▼────────────────────────────┐
    │  Triage Engine (PM-181)                         │
    │  Deterministic decision trees                   │
    │  Dedup / frequency scoring / severity escalation│
    │  Routes → oie.incidents.triaged                 │
    └───┬───────────────┬────────────────────────┬────┘
        │               │                        │
    create_ticket    alert                     retry/dlq
        │
    ┌───▼──────────────────────────┐
    │  AutoJira (PM-182)           │
    │  Wraps JiraTicketingAdapter  │
    │  Dedup existing tickets      │
    └──────────────────────────────┘
        │
    ┌───▼──────────────────────────┐
    │  Analyst Agent (PM-183)      │  ← high/critical only
    │  LLM root cause analysis     │
    │  → oie.analysis.completed    │
    └───────────────────┬──────────┘
                        │
    ┌───────────────────▼──────────┐
    │  Fix Proposer (PM-185)       │
    │  Confidence Gate             │
    │  auto_pr / shadow_jury / jira│
    └───────────────────┬──────────┘
                        │ (after merge)
    ┌───────────────────▼──────────┐
    │  Verifier (PM-184)           │
    │  7-day monitoring window     │
    │  → oie.verification.completed│
    └───────────────────┬──────────┘
                        │
    ┌───────────────────▼──────────┐
    │  Learner (PM-186)            │
    │  Triple-store: PG + Neo4j +  │
    │  Qdrant for cross-project    │
    │  knowledge                   │
    └──────────────────────────────┘

    ┌──────────────────────────────┐
    │  Reconciliation Loop (PM-187)│  ← independent, every 5min
    │  Per-project SLO drift detect│
    │  → oie.reconciliation.report │
    └──────────────────────────────┘
```

## Service Layout

```
apps/backend/services/oie/
├── package.json               @uaip/oie
├── tsconfig.json
└── src/
    ├── index.ts               public API
    ├── feature.ts             FeatureFactory module (PM-176 wiring)
    ├── types/                 all OIE types (local, not in @uaip/types)
    │   ├── base_adapter.ts
    │   ├── observability_adapter.ts
    │   ├── oie_event.ts
    │   ├── triage.ts
    │   ├── ticketing_adapter.ts
    │   ├── source_control_adapter.ts
    │   └── learner.ts
    ├── adapters/              PM-179
    │   ├── signoz_adapter.ts
    │   ├── sentry_adapter.ts
    │   └── adapter_registry.ts
    ├── collector/             PM-180
    │   └── collector_service.ts
    ├── triage/                PM-181
    │   ├── decision_trees.ts
    │   └── triage_engine.ts
    ├── ticketing/             PM-182
    │   ├── jira_ticketing_adapter.ts
    │   └── auto_jira_service.ts
    ├── analyst/               PM-183
    │   └── analyst_agent.ts
    ├── verifier/              PM-184
    │   ├── github_source_control_adapter.ts
    │   └── verifier_service.ts
    ├── fix_proposer/          PM-185
    │   └── fix_proposer_agent.ts
    ├── learner/               PM-186
    │   └── learner_service.ts
    └── reconciliation/        PM-187
        └── reconciliation_loop.ts
```

## BullMQ Topics

| Topic | Publisher | Subscriber |
|-------|-----------|-----------|
| `oie.events.collected` | CollectorService | TriageEngine |
| `oie.incidents.triaged` | TriageEngine | AutoJiraService, AnalystAgent |
| `oie.analysis.completed` | AnalystAgent | FixProposerAgent, VerifierService |
| `oie.fix.proposed` | FixProposerAgent | (human review / GitHub) |
| `oie.verification.completed` | VerifierService | LearnerService |
| `oie-collector` | (scheduler) | CollectorService |
| `oie-reconciliation` | (scheduler) | ReconciliationLoop |
| `oie.reconciliation.report` | ReconciliationLoop | (Jira/Slack webhook) |

## Environment Variables

See `sample.env` → OIE section for all configuration knobs.

## Enable OIE

```bash
FEATURE_OIE=true
SIGNOZ_API_URL=http://localhost:8080
SENTRY_AUTH_TOKEN=sntryu_...
SENTRY_ORG=sentry
SENTRY_PROJECT=navratna
JIRA_BASE_URL=https://yourorg.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=...
JIRA_PROJECT_KEY=PM
```

## Sprint 2+ Status

PM-183 (Analyst), PM-184 (Verifier/SourceControl), PM-185 (Fix Proposer), PM-186 (Learner), PM-187 (Reconciliation) all have production-ready framework with event subscriptions. The LLM call in AnalystAgent and the Learner's triple-store writes are stubbed — marked with `[STUB]` in logs. Full implementation requires:

- PM-183: Wire ModelSelectionOrchestrator + RAG from SourceControlAdapter
- PM-184: Wire webhook detection for PR merge events
- PM-185: Wire SourceControlAdapter.getFile + diff generation
- PM-186: Drizzle schema for `incident_outcomes` table + Neo4j + Qdrant embeddings
