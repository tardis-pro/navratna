---
title: 'Business Ops Verticals as Ontologies — Plug-In Vertical Architecture'
date: 2026-04-17
status: design
ticket: PM-40
phase: 2
---

# Business Ops Verticals as Ontologies

## Problem Statement

Business verticals (Finance, HR, Legal, PM, Marketing) would traditionally require new backend services. Each would add deployment complexity, maintenance burden, and a new failure surface.

The architectural bet: **business verticals are NOT new services**. They plug into existing navratna systems via ontology files + MCP servers.

## The Key Insight

UAIP primitives already model the entire business domain — they just need domain vocabulary:

| UAIP Primitive | Finance | HR | Legal | PM |
|---------------|---------|-----|-------|-----|
| Persona | Employee Profile | Job Role | Counsel | Team Member |
| Discussion | Contract Negotiation | Performance Review | Dispute Resolution | Sprint Planning |
| Artifact | Invoice | OKR | Legal Brief | Specification |
| Operation | Payroll Run | Onboarding | Document Filing | Release |
| Relevance Engine | Lead Scoring | Candidate Match | Case Relevance | Backlog Priority |
| SecurityPolicy | Regulatory Compliance | PII Governance | Privilege | Access Control |
| Knowledge Graph | Business Intelligence | Org Chart | Case History | Dependency Map |

**Zero new backend services required.**

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   ONTOLOGY PLUGIN SYSTEM                    │
│                                                              │
│  VerticalOntology {                                         │
│    name: 'finance'                                          │
│    entities: [Invoice, Payment, Budget, ...]                │
│    relationships: [BELONGS_TO, REDUCES, ...]                │
│    vocabulary: { 'invoice': 'artifact', ... }               │
│    mcpTools: [create_invoice, query_budget, ...]            │
│    eventTypes: ['invoice.created', 'budget.exceeded', ...]  │
│  }                                                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────┐    ┌──────────────────────────┐
│  ONTOLOGY REGISTRY  │    │   KNOWLEDGE GRAPH        │
│  (capability-reg.)  │    │   (Neo4j)                │
│                     │    │                          │
│  load / unload /    │    │  Vertical entities as    │
│  list verticals     │    │  knowledge_items with    │
│                     │    │  domain type tags        │
│  Per-project active │    │                          │
│  vertical set       │    │  Constellation types     │
└─────────────────────┘    │  in Telescope surface    │
                           └──────────────────────────┘
```

## Activation Flow

```
User in Telescope: "Enable Finance vertical for this project"
  → OntologyRegistry.activate('finance', projectId)
  → Entities available in knowledge graph
  → MCP tools appear in capability-registry  
  → Telescope surface gains Finance constellation types
  → Agent turns can now invoke Finance MCP tools
```

## Finance Vertical (First Implementation)

**Entities:** Invoice, Payment, Budget, Expense, ForecastScenario

**Relationships:**
- `invoice BELONGS_TO project`
- `expense REDUCES budget`
- `payment SETTLES invoice`
- `forecast PROJECTS budget`

**MCP Tools:**
- `create_invoice` — create invoice with line items, attach to project
- `query_budget` — retrieve budget state with expense breakdown
- `run_forecast` — project future cash position from actuals
- `export_to_csv` — export financial data for external tools

**Relevance Engine wiring:** lead scoring = `relevance(prospect, user_intent)` → score

## HR Vertical (Second Implementation)

**Entities:** Employee, Role, ReviewCycle, OKR, CompensationBand

**MCP Tools:**
- `create_okr` — create OKR linked to employee and review cycle
- `schedule_review` — schedule performance review with agenda
- `compute_band_fit` — score employee against compensation band criteria

## Key Interfaces

See: `apps/shared/services/src/vision/business-verticals/`

## Integration Points

- **OntologyRegistry** in capability-registry: loads/unloads verticals per project
- **Neo4j Knowledge Graph**: vertical entities stored as `knowledge_items` with domain type tags
- **Telescope surface**: constellation types expand when vertical activated
- **Capability-registry MCP tools**: vertical MCP tools auto-appear on activation

## Open Questions

| # | Question | Decision Needed By |
|---|----------|-------------------|
| OQ-1 | Ontology storage: filesystem JSON files or database records? JSON files preferred (version-controllable) | Before implementation |
| OQ-2 | Per-project or per-workspace vertical activation? | Before implementation |
| OQ-3 | Vertical MCP servers: bundled with navratna or external packages? | Before implementation |
| OQ-4 | Knowledge graph migration: do existing artifacts retroactively get vertical type tags? | Before implementation |

## Follow-Up Tickets

- `[FOLLOW-UP-K]` Implement Finance vertical MCP server (create_invoice, query_budget, run_forecast)
- `[FOLLOW-UP-L]` OntologyRegistry: load/unload/list in capability-registry
- `[FOLLOW-UP-M]` Telescope constellation types for Finance vertical
- `[FOLLOW-UP-N]` HR vertical MCP server (create_okr, schedule_review, compute_band_fit)
- `[FOLLOW-UP-O]` Ontology → Knowledge Graph sync (entity creation triggers knowledge_items insert)

## References

- `docs/specs/07-STRATEGIC-VISION-2026.md` Phase 2.3
- `apps/backend/services/navratna-gateway/src/` (capability-registry)
- `apps/shared/services/src/database/drizzle/schemas/intelligence.schema.ts` (knowledge_items)
