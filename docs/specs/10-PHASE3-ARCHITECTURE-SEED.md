---
title: 'Phase 3 Architecture Seed — Institutional Memory + Organizational Nervous System'
date: 2026-04-17
status: scoping
ticket: PM-43
phase: 3-seed
---

# Phase 3 Architecture Seed

> This is not implementation. This is scoping — the architectural decisions that must be made NOW so Phase 3 doesn't require a rewrite.

---

## The Phase 3 Endgame

UAIP becomes the institutional memory of an organization: queryable company history with decision replay, diffable and forkable company DNA, reflex arcs for routine operations, circuit breakers for cascading failures, and an organizational immune system that generates-tests-selects for novel threats.

The triple-store, the event ledger, the knowledge graph, and the saga pattern must be designed with Phase 3 in mind — or the foundation will crack under it.

---

## Section 1: Institutional Memory Requirements

### What Must Be Queryable

| Data Type | Retention | Query Pattern | Current State |
|-----------|-----------|---------------|---------------|
| Agent turns (prompt + response + MetaScore) | 7 years | By agent, date, user, project | `audit_events` table — exists but not optimized |
| Saga execution logs (plan → outcome) | 7 years | By workflow ID, outcome type, agent | `audit_events` — partial |
| Knowledge graph mutations | Indefinite | What did org know at point T? | Not captured |
| Discussion outcomes | 5 years | By participants, consensus reached | `conversations` table — partial |
| Capability grants and revocations | Indefinite | Who had access to what, when? | `audit_events` — not specialized |

### What Must Be Replayable

Decision replay requires:
1. **Snapshots** — knowledge graph state at point T
2. **Event log** — ordered sequence of all state mutations since snapshot
3. **Agent context** — which models, which prompts, which tools were available at T

Current gap: BullMQ events are ephemeral. No immutable log exists. See Section 2.

### Retention Policy Requirements

- **Hot tier** (0–90 days): PostgreSQL `audit_events`, full resolution, indexed
- **Warm tier** (90 days–7 years): compressed event log, queryable but not indexed
- **Cold tier** (7+ years): archival blob storage (R2 or S3), retrieval SLA 24h
- **Knowledge graph**: indefinite, no deletion (soft-delete only, with `deleted_at`)

### How the Knowledge Graph Evolves Over Years

- Entities gain provenance chains: each knowledge item tracks its origin agents, source events, confidence history
- Trust-weighted edges: relationships gain `trust_score` updated by MetaScore feedback
- Semantic versioning of entity schemas: vertical ontology updates must be backward compatible
- Graph compaction: periodic summarization of low-utility subgraphs (off-hours dream cycle)

---

## Section 2: Event Ledger Hardening

### Current State

BullMQ events are ephemeral — processed and discarded. The `audit_events` PostgreSQL table captures some data but:
- Not content-addressed
- No tamper-evidence
- No ordered guarantee across distributed workers
- Not designed for replay

### Phase 3 Requirement

Immutable, Merkle-hashed operation receipts:

```
EventLedger {
  ledger_id:     UUID
  sequence_num:  BIGINT NOT NULL  -- monotonically increasing per tenant
  event_type:    VARCHAR(128)
  payload_hash:  BYTEA           -- SHA-256 of event payload
  payload:       JSONB
  prev_hash:     BYTEA           -- hash of previous entry (Merkle chain)
  tenant_id:     UUID
  created_at:    TIMESTAMPTZ NOT NULL
}
```

### Schema Changes Needed NOW (Phase 2)

To avoid a migration blocker in Phase 3:

1. **Add `sequence_num` to `audit_events`** — backfillable, but adding now prevents a gap
2. **Add `tenant_id` to `audit_events`** — single-tenant now (null), multi-tenant later (required)
3. **Add `payload_hash`** — SHA-256 of the event payload JSON. Store it even if not yet chained
4. **Do NOT delete `audit_events` rows** — add soft-delete only. Physical deletion breaks Merkle chains.

### Timeline

- Phase 2: Add `sequence_num`, `tenant_id`, `payload_hash` to `audit_events` (nullable, no enforcement)
- Phase 3 start: Add `prev_hash`, enforce Merkle chain in write path
- Phase 3 mid: Move to dedicated `event_ledger` table with full replay support

---

## Section 3: Organizational Nervous System Primitives

### Reflex Arcs

Pattern-triggered automatic responses — no human approval required for recognized stimuli:

```
ReflexArc {
  trigger: EventPattern   -- JSON-match rule on event stream
  condition: Predicate    -- optional guard (e.g., only if confidence > 0.8)
  action: AgentCapability -- capability to invoke automatically
  cooldown_ms: number     -- min time between triggers
  max_consecutive: number -- circuit-breaker: stop after N auto-triggers
}
```

**Anchor services**: BullMQ (event matching), saga (action execution), `audit_events` (logging)

### Circuit Breakers

Cascading failure detection:

```
CircuitBreaker {
  name: string
  errorThresholdPercent: number  -- open when error rate exceeds this
  windowMs: number               -- sliding window
  halfOpenProbes: number         -- how many probes before close attempt
  state: 'closed' | 'open' | 'half-open'
}
```

**Anchor services**: existing saga checkpoint system. Circuit breakers wrap capability invocations.

### Dream Cycle

Off-hours processing (analogous to biological sleep — consolidation, pruning, synthesis):

- Knowledge graph compaction: merge low-utility subgraphs
- MetaScore baseline recalibration: update agent baselines weekly
- Semantic drift detection: compare current distributions to baseline
- Reflex arc optimization: prune arcs with low firing rates

**Anchor services**: BullMQ cron jobs. Dream cycle is a BullMQ scheduler, not a new service.

---

## Section 4: Network Intelligence Prerequisites

### Tenant Isolation (must be single-tenant-clean FIRST)

Before multi-tenant can begin, every data path must enforce:

| Layer | Requirement | Current State |
|-------|-------------|---------------|
| PostgreSQL | Row-Level Security (RLS) on all tables | NOT DONE — no RLS |
| Neo4j | Tenant-scoped graph partitions | NOT DONE — shared graph |
| Qdrant | Collection-per-tenant or namespace isolation | NOT DONE — shared collection |
| BullMQ | Queue-per-tenant or tenant-tagged routing | NOT DONE — shared queues |
| API | `tenant_id` extracted from JWT, propagated to all queries | NOT DONE — single-tenant assumed |

**Phase 2 requirement**: Add `tenant_id` to all tables as nullable. Do not enforce RLS yet. This makes the Phase 3 migration non-breaking.

### Cross-Tenant Embedding Privacy

When Qdrant holds embeddings from multiple tenants:
- Differential privacy noise injection for cross-tenant semantic search
- Tenant A's query results must not be able to reconstruct Tenant B's embeddings
- Implementation: `ε-differential privacy` with calibrated noise (ε ≈ 1.0 for business context)

### Federated Event Mesh

Org A's event stream feeds into Org B's knowledge graph (with consent). Requires:
- Per-event tenant permission claims
- Cross-tenant event bus routing (tenant membrane)
- Receivership side: tenant B filters events based on declared interests

---

## Section 5: Trust Attestation Chain

### Current Trust Model (L0→L4) Compatibility

The Vision Manifest trust sequence (L0: Transparent Ignorance → L4: Institutional Memory) must be compatible with inter-organization trust.

Phase 3 extension:

```
OrganizationTrustEdge {
  from_org_id: UUID
  to_org_id:   UUID
  trust_score: float  -- 0.0–1.0, PageRank-derived
  attestation: {
    basis: 'direct' | 'inferred' | 'third-party'
    evidence: EventLedgerRef[]  -- immutable receipts backing the score
    last_updated: Date
  }
}
```

Trust scores between orgs derive from:
1. Shared successful operations (direct evidence)
2. Third-party attestation (Org C vouches for Org B to Org A)
3. MetaScore baselines of agents operating between orgs

### Phase 2 Additions Needed

- Organization entity in knowledge graph (not just user → tenant mapping)
- `trust_score` field on Agent entities (per-org view of agent trustworthiness)
- Trust attestation event type in event ledger

---

## Section 6: Top 3 Architectural Risks

### Risk 1: No Immutable Event Log

**Current state:** BullMQ events are ephemeral. `audit_events` is append-only but not Merkle-hashed.

**Phase 3 impact:** Decision replay is impossible. Trust attestation has no evidence base. Compliance audits cannot be satisfied.

**Mitigation:** In Phase 2, add `sequence_num`, `tenant_id`, `payload_hash` to `audit_events`. Do this before Phase 2 ends. This is the single highest-leverage preventive step.

**Owner:** Platform infra  
**Deadline:** Before Phase 2 close

---

### Risk 2: Single-Tenant Knowledge Graph

**Current state:** Neo4j graph has no tenant partitioning. All organizations share one graph.

**Phase 3 impact:** Multi-tenant is impossible without a full graph migration. Graph queries cannot enforce tenant isolation without RLS at Neo4j level (which requires a major schema refactor).

**Mitigation:** Add `tenant_id` property to all Neo4j nodes NOW. This is a 1-line Cypher migration on existing nodes (set to current default tenant). This makes future partitioning a filter operation, not a migration.

**Owner:** Knowledge graph team  
**Deadline:** First Phase 3 architecture review

---

### Risk 3: Reflex Arc Without Circuit Breakers

**Current state:** Saga has checkpoints and rollback, but no automatic failure isolation for cascading failures.

**Phase 3 impact:** Reflex arcs (automatic responses to patterns) without circuit breakers will cascade. One misconfigured arc can trigger a runaway loop.

**Mitigation:** Design and implement circuit breaker interface in Phase 2 (even if initially manual-only). Every automated saga must declare a circuit breaker config before Phase 3 activates reflex arcs.

**Owner:** Orchestration team  
**Deadline:** Before any reflex arc is defined

---

## Architectural Invariants (Must Not Be Violated in Phase 2)

These decisions in Phase 2 would require a rewrite in Phase 3:

| Decision | Why It's Load-Bearing |
|----------|----------------------|
| Soft-delete only on all knowledge graph entities | Hard deletes break Merkle chains and decision replay |
| `tenant_id` on all new tables | Cannot add RLS to existing tables without migration |
| Saga as the only orchestration primitive for multi-step ops | Reflex arcs and circuit breakers depend on saga checkpoint semantics |
| MetaScore on every agent turn | Trust attestation chain derives from accumulated MetaScore history |

---

## Open Questions for Phase 3 Start

| # | Question | Recommended Exploration |
|---|----------|------------------------|
| OQ-1 | Event ledger: PostgreSQL with append-only RLS or dedicated ledger service (NATS JetStream)? | Research: NATS JetStream vs PG event sourcing |
| OQ-2 | Neo4j tenant partitioning: node labels vs. separate databases per tenant? | Depends on Neo4j AuraDB tier |
| OQ-3 | Differential privacy parameter ε: what's the right balance for business context? | Academic review + threat modeling |
| OQ-4 | Dream cycle: should it run in navratna-core (as BullMQ cron) or as a separate service? | Evaluate: operational simplicity vs. isolation |
| OQ-5 | Trust PageRank: directed or undirected trust graph? | Product decision: does Org A trusting Org B imply the reverse? |

---

*"The decisions that cost the most to change are the ones that seem most obvious at the time." — Phase 3 design principle*
