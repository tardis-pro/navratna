# ADR 0003 — OIE posture: Agent Autopsy over real telemetry, stubs off

**Status:** Accepted (2026-07-16). **Context:** Convergence sprint, Waves 0 & 5.

## Decision

The Operational Intelligence Engine (OIE) is scoped to a **transparency surface
("Agent Autopsy") over telemetry that already exists** — not an autonomous
fix-it agent.

- The stubbed cognition tier (`AnalystAgent`, `FixProposerAgent`,
  `VerifierService`, `LearnerService`) stays **OFF**. It returns confidence 0.0
  and no-ops, so surfacing it would erode trust. Gated behind
  `FEATURE_OIE_AUTONOMY` (default off).
  - This also fixes a fan-out bug: `AnalystAgent` and `AutoJiraService` both
    subscribed to `oie.incidents.triaged`; BullMQ load-balances across workers on
    one queue, so running the Analyst stole ~half the incidents from AutoJira.
    With it off, AutoJira is the sole consumer.
- The Autopsy surface (deploy-later / next cycle) reads only **real** signals:
  MCP injection/quarantine flags, tool/capability execution failures, the coding
  session immutable audit sink, agent event-bus decisions, and
  collector→triage→auto-Jira outcomes.

## Boundaries

- OIE is not federated / multi-tenant across the fleet (reverses the assimilation
  Wave-4 idea) — single-tenant Navratna only.
- If auto-Jira ops hygiene is later wanted, the empty-config boot bug
  (`oie/src/feature.ts` passes `{}` to adapters whose `validate()` throws before
  the env fallback) and AutoJira's fail-open dedup must be fixed first, and it
  must be dry-run against a sandbox Jira project (ticket-storm risk).
