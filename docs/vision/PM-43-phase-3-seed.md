# PM-43 — Phase 3 Seed: Institutional Memory + Organizational Nervous System

**Jira**: PM-43 | **Status**: Complete | **Commit**: `7a6bf47`

## Scope

PM-43 is a Phase 3 scoping ticket — architectural preview for the next-gen Tardis capabilities after Vision Phase 2 (PM-36). It does **not** produce code; it produces a design document that seeds Phase 3 planning.

## Institutional Memory

Long-term cross-session memory that transcends individual agent contexts:

- **Organization-level knowledge graph** — persistent facts, decisions, relationships across all agents
- **Temporal versioning** — every fact carries a valid-from/valid-to timestamp
- **Provenance chain** — every claim links to its source (discussion, doc, tool output)
- **Query API** — `/knowledge/query` + Neo4j Cypher for complex traversals

## Organizational Nervous System

Reactive substrate that lets the organization sense and respond to signals:

- **Signal sources** — errors (Sentry), metrics (SigNoz), user behaviour (analytics), agent state changes
- **Triage pipeline** — reuses OIE (PM-176) triage engine + analyst agent
- **Action routing** — signals → appropriate vertical (Finance, HR, Legal, PM) via Business Verticals ontology (PM-40)
- **Feedback loops** — outcomes fed back into Institutional Memory

## Key Interfaces (TypeScript sketches)

```ts
interface InstitutionalMemoryFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  validFrom: Date;
  validTo: Date | null;
  sourceType: 'discussion' | 'document' | 'tool-output' | 'agent-claim';
  sourceId: string;
  confidence: number;
}

interface NervousSystemSignal {
  kind: 'error' | 'metric' | 'user-event' | 'state-change';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  correlationId?: string;
}
```

## Follow-up Tickets

Phase 3 implementation will require (filed as design-phase follow-ups):
- Institutional Memory persistence layer (Neo4j schema + Drizzle shim)
- Signal ingestion pipeline (reuse OIE collector)
- Vertical routing service (depends on PM-40 ontology finalization)
- Query API + GraphQL layer

## Recommendation

**Accept as scoping-only.** No code changes; this is a design document seeding Phase 3 planning. Implementation tickets will be filed when Phase 3 kicks off.
