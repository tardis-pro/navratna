---
title: 'Shadow Jury + Smallest Viable Model — Parallel Model Eval + Complexity-Based Routing'
date: 2026-04-17
status: design
ticket: PM-39
phase: 2
---

# Shadow Jury + Smallest Viable Model

## Problem Statement

Every agent turn in navratna routes to a single model — statically configured per agent. This creates two failure modes:

1. **Quality drift** — model providers silently update models; quality changes go undetected
2. **Cost waste** — trivial tasks route to expensive models; complex tasks are under-powered

Shadow Jury and Smallest Viable Model are complementary solutions: one optimizes quality, the other optimizes cost.

## Architecture Overview

```
                      Agent Turn Request
                           │
                           ▼
                  ┌─────────────────┐
                  │ ComplexityScorer│ ← PM-10 (existing)
                  │ (0–100 score)   │
                  └────────┬────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
   ┌──────────────────────┐  ┌──────────────────────┐
   │  SMALLEST VIABLE     │  │    SHADOW JURY       │
   │  MODEL ROUTING       │  │  (async, non-blocking)│
   │                      │  │                      │
   │  trivial → haiku     │  │  Primary model       │
   │  medium → sonnet     │  │  + 1-2 shadow models │
   │  complex → opus      │  │  (same prompt)       │
   │                      │  │                      │
   │  Budget check →      │  │  Score all via       │
   │  downgrade if over   │  │  MetaScore API       │
   └──────────┬───────────┘  └──────────┬───────────┘
              │                          │
              ▼                          ▼
      Primary response           Audit log + Telescope
      returned to user           Shadow Jury report
```

## Component Breakdown

### 1. Shadow Jury

On every production agent turn, silently routes the same prompt to 2–3 models in parallel. Scores each via BaseBench-Meta MetaScore. Logs winner to `audit_events`.

**Key design decisions:**
- Non-blocking: primary model response returns to user immediately; shadow runs async
- Configurable per agent: some agents may opt out (cost-sensitive deployments)
- Scores accumulate over time → quality distribution per model per task type

### 2. Smallest Viable Model

Maps ComplexityScorer output (0–100) to model tier:

| Complexity | Tier | Example Models |
|-----------|------|---------------|
| < 20 | trivial | haiku-4-5, gemini-3-flash |
| 20–60 | medium | sonnet-4-6, glm-5v-turbo |
| > 60 | complex | opus-4-7, gemini-3.1-pro |

Agent config can set `minimumTier` override (prevents quality floor violations).

### 3. Token Budget Enforcer

Per-workflow cumulative spend tracking. Auto-downgrades model tier if budget is exhausted. BullMQ event when downgrade occurs.

### 4. Regression Canary

Weekly: run golden test set against each provider. Detect quality regressions before users encounter them. Alert via BullMQ → Telescope notification.

## Integration Points

- **Builds on:** PM-10 (ComplexityScorer), `llm-service/model_routing_service.ts`
- **Scores via:** BaseBench-Meta `/api/v1/evaluate` (async, non-blocking)
- **Logs to:** `audit_events` table with model metadata + MetaScore breakdown
- **Reports via:** Telescope Shadow Jury report panel (UI — follow-up ticket)

## Key Interfaces

See: `apps/shared/services/src/vision/shadow-jury/`

## Open Questions

| # | Question | Decision Needed By |
|---|----------|-------------------|
| OQ-1 | Shadow Jury models: configurable list per agent or global defaults? | Before implementation |
| OQ-2 | Cost of shadow runs: operator-absorbed or metered separately? | Before implementation |
| OQ-3 | MetaScore call: sync (blocks shadow jury) or fire-and-forget with BullMQ? Fire-and-forget preferred | Before implementation |
| OQ-4 | Regression Canary: golden test set — who curates? Manual or auto-generated? | Before implementation |

## Follow-Up Tickets

- `[FOLLOW-UP-F]` Shadow Jury: wire into navratna-core agent turn handler
- `[FOLLOW-UP-G]` Smallest Viable Model: replace static routing in ModelRoutingService
- `[FOLLOW-UP-H]` Token Budget Enforcer: per-workflow spend tracking + downgrade logic
- `[FOLLOW-UP-I]` Regression Canary: golden test runner + alert pipeline
- `[FOLLOW-UP-J]` Telescope: Shadow Jury report panel (model quality vs. cost comparison)

## References

- `apps/backend/services/llm-service/src/services/model_routing_service.ts`
- PM-10 (ComplexityScorer)
- `docs/specs/07-STRATEGIC-VISION-2026.md` Phase 2.2
- BaseBench-Meta `/api/v1/evaluate` endpoint
