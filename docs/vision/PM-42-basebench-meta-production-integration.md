---
title: 'BaseBench-Meta Production Integration — Live MetaScore on Every Agent Turn'
date: 2026-04-17
status: design
ticket: PM-42
phase: 2
---

# BaseBench-Meta Production Integration

## Problem Statement

BaseBench-Meta (port 3009) is a complete standalone benchmark suite — but isolated from production. Every agent turn in navratna goes unscored against the metacognitive rubric. The platform cannot continuously know whether its agents are behaving correctly.

This ticket closes that loop: **every production agent turn generates a MetaScore, async, with < 500ms overhead**.

## Architecture Overview

```
Agent Turn in navratna-core
         │
         ▼
┌─────────────────────────────────┐
│  MetaScore Middleware           │
│  (navratna-core Elysia hook)    │
│                                 │
│  1. Capture turn response       │
│  2. Async POST to basebench     │
│     /api/v1/evaluate            │
│  3. Receive MetaScore breakdown │
│  4. Store in audit_events table │
│  5. Publish to event bus        │
└─────────────────────────────────┘
         │                │
         ▼                ▼
┌──────────────┐  ┌────────────────────────┐
│ audit_events │  │ Telescope              │
│ table        │  │ AGI Vital Signs portal │
│ (PostgreSQL) │  │                        │
│              │  │ 7-day rolling avg      │
│ turn_id      │  │ per agent              │
│ agent_id     │  │                        │
│ meta_score   │  │ Semantic Drift alerts  │
│ breakdown    │  └────────────────────────┘
└──────────────┘
```

## MetaScore Components

| Component | Weight | Description |
|-----------|--------|-------------|
| Action Appropriateness | 25% | Did it choose the right epistemic action? |
| Calibration Quality | 20% | Is confidence proportional to evidence? |
| Answer Accuracy | 20% | Is the answer correct when it proceeds? |
| Clarification Quality | 15% | Did it ask the right question when uncertain? |
| Self-Error Detection | 10% | Did it catch its own mistakes? |
| Belief Updating | 10% | Did it revise correctly on new evidence? |
| **Overconfidence Penalty** | -N | Deducted when confidence exceeds evidence |
| **Unnecessary Abstention Penalty** | -N | Deducted when refusing when answer exists |

## Bad Equilibria Detection

Two failure modes that erode trust:

- **Confident Liar**: overconfidence penalty > 20 → alert: agent is confabulating
- **Timid Bureaucrat**: unnecessary abstention penalty > 20 → alert: agent is refusing valid tasks

Both trigger BullMQ event → Telescope notification → operator investigation.

## AGI Vital Signs Dashboard

| Metric | Definition |
|--------|-----------|
| Transfer Learning Index | Cross-capability improvement correlation |
| Self-Correction Rate | Confidence adjustments → improved scores |
| Capability Velocity | Second derivative of capability score (acceleration) |
| Generalization Width | Distinct capabilities exceeding baseline |

## Semantic Drift Detector

Weekly: compare agent confidence distributions to baseline snapshot. Alert when:
- Agent starts over-expressing confidence on a domain it previously was calibrated on
- Agent starts under-expressing confidence (growing timidity)

Feed corrections back into capability evolution cycle.

## Key Interfaces

See: `apps/shared/services/src/vision/basebench-integration/`

## Integration Points

- **Hook point**: navratna-core agent turn response handler (after response formed, before return)
- **Target**: `basebench-meta` service at `/api/v1/evaluate` (port 3009)
- **Storage**: `audit_events` table in control schema (PostgreSQL)
- **Downstream**: BullMQ event bus for alerts, Telescope AGI Vital Signs portal

## Performance Constraint

MetaScore must add < 500ms overhead to agent turns. The call to basebench-meta is async (fire-and-forget with BullMQ acknowledgment). User receives response immediately; scoring happens in background.

## Open Questions

| # | Question | Decision Needed By |
|---|----------|-------------------|
| OQ-1 | Fire-and-forget vs. wait-for-score: should agent turns block on MetaScore? No — async preferred | Before implementation |
| OQ-2 | MetaScore sampling: score every turn, or statistical sample (1 in 10)? Every turn preferred for Phase 2 | Before implementation |
| OQ-3 | AGI Vital Signs portal: new Telescope portal or integrated into existing agent monitor? | Before UI work |
| OQ-4 | Semantic Drift Detector baseline: how many turns before baseline is statistically valid? | Before implementation |

## Follow-Up Tickets

- `[FOLLOW-UP-T]` MetaScore middleware in navratna-core (Elysia hook)
- `[FOLLOW-UP-U]` audit_events schema extension for MetaScore columns
- `[FOLLOW-UP-V]` Telescope AGI Vital Signs portal (7-day trending per agent)
- `[FOLLOW-UP-W]` Semantic Drift Detector (weekly cron, BullMQ alert)
- `[FOLLOW-UP-X]` Bad equilibria detection (confident liar + timid bureaucrat alerts)

## References

- `apps/backend/services/basebench-meta/` (standalone service, port 3009, fully built)
- `docs/specs/07-STRATEGIC-VISION-2026.md` Part II: BaseBench-Meta
- `apps/shared/services/src/database/drizzle/schemas/control.schema.ts` (audit_events table)
