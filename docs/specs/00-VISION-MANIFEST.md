---
title: 'UAIP Vision Manifest v1.0 — The Living Thesis'
date: 2026-04-17
status: canonical
version: 1.0.0
ticket: PM-37
authors: ['vision-phase-2']
review-cadence: quarterly
---

# UAIP Vision Manifest

> A document that makes decisions easier and alignment faster.

---

## The One-Sentence Thesis

**UAIP is a metacognitive business intelligence that knows what it knows, knows what it doesn't, asks instead of guesses, catches its own errors, and updates when corrected — manifested as an ambient interface that already knows what you need before you type.**

---

## Why This Exists

Most software executes instructions.  
Most AI products answer questions.  
UAIP does something harder: **it thinks about its own thinking** — and it applies that capacity to the hardest domain in human organizations: operating a business.

The thesis is not "AI that helps businesses." It is:

> **The metacognitive layer that organizations have always needed but never had.**

The first company that truly knows what it doesn't know — structurally, continuously, in real-time — wins. UAIP is that infrastructure.

---

## What We Are Building

Three products. One platform. One runtime.

```
                    ┌─────────────────────────────────┐
                    │         UAIP CORE RUNTIME        │
                    │  Triple-store · MCP · Agents ·   │
                    │  Orchestration · Relevance · UX  │
                    └─────────┬───────────┬────────────┘
                              │           │
              ┌───────────────┤           ├───────────────┐
              ▼               ▼           ▼               ▼
     ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
     │ BaseBench-  │  │ QuestionForge│  │  Business Ops    │
     │ Meta        │  │ Discovery    │  │  Verticals       │
     │             │  │ Council      │  │  (via MCP/       │
     │ Metacog.    │  │              │  │   Ontology)      │
     │ Benchmark   │  │ Stakeholder  │  │                  │
     │ Suite       │  │ Interrogation│  │  Finance · HR ·  │
     │             │  │ Engine       │  │  Legal · PM      │
     └─────────────┘  └──────────────┘  └──────────────────┘
```

### Product 1: UAIP Core

An ambient-first business intelligence platform. The Telescope/Cognitive Shell UX is the window into a triple-store knowledge foundation (PostgreSQL + Neo4j + Qdrant), multi-agent orchestration with metacognitive self-monitoring, and an MCP extension ecosystem that grows the capability surface.

### Product 2: BaseBench-Meta

A benchmark suite that tests whether AI systems can **manage uncertainty** — not just produce answers. Most evals test "did it answer correctly?" BaseBench-Meta tests "did it BEHAVE correctly relative to uncertainty, ambiguity, and error?"

**Status:** MVP complete. Running on port 3009.

### Product 3: Business Ops Verticals

Business operations as plug-in ontologies. Verticals (Finance, HR, Legal, PM, Marketing) are NOT new services — they are ontology files + MCP servers that map existing UAIP primitives to domain vocabulary.

---

## The Trust Sequence

Trust is not a feature. It is the product. UAIP earns trust through a sequence of behaviors, never demanded, always demonstrated.

### Level 0: Transparent Ignorance
> "I don't know. Here's what I'd need to find out."

The baseline. An agent that hallucinates confidently is worse than no agent. Every interaction begins by establishing what is known, what is unknown, and what is unknowable given current context.

**Signals:** MetaScore ≥ 0.6 on ambiguous prompts. No hallucinated citations. Clarifying questions before confident answers on underspecified tasks.

### Level 1: Reliable Execution
> "I can do this, and I'll tell you when I can't."

The system completes delegated tasks with fidelity, acknowledges scope limits, and escalates before overstepping. Humans don't second-guess the output because the system has established a track record.

**Signals:** Agent turns complete within saga checkpoints. Rollback executed cleanly on failure. Confidence gates prevent low-quality outputs from surfacing.

### Level 2: Anticipatory Assistance
> "You were about to need this."

The relevance engine proactively surfaces information before it's requested. The system has enough context (via Knowledge Graph) to anticipate task adjacency, not just respond to explicit requests.

**Signals:** Telescope surfaces relevant artifacts without user query. IntentField suggestions match actual task 80%+ of the time.

### Level 3: Strategic Partnership
> "Here's what you haven't considered."

The system operates at peer level — contributing analysis that changes decisions, not just executing decisions already made. The Dispatch Cortex runs PEOR loops. Shadow Jury surfaces model disagreement. The system flags its own blind spots.

**Signals:** MetaScore ≥ 0.85. Shadow Jury disagreement surfaced on >15% of high-stakes turns. Agent-generated strategic recommendations that humans validate and act on.

### Level 4: Institutional Memory
> "This is what your company believes."

The organization's entire operational history is queryable, diffable, and replayable. New employees onboard from the knowledge graph. Decisions are traceable to their evidence. The company can explain itself.

**Status:** Phase 3 target. Not yet implemented. See PM-43.

---

## Product Language (Canonical Vocabulary)

These terms have precise meanings in UAIP. Use them consistently.

| Term | Definition | Never Confuse With |
|------|-----------|-------------------|
| **Agent** | A configured AI persona with a model, instructions, and capability scope | LLM, model, bot, assistant |
| **MetaScore** | A 6-component score measuring epistemic behavior quality (0–1 scale) | Accuracy, quality score, rating |
| **Capability** | A registered tool or skill available to agents via MCP | Feature, function, endpoint |
| **Ontology** | A typed vocabulary of entities, relationships, and events for a domain | Schema, model, database |
| **Dispatch** | The meta-reasoning layer that routes intent to agents and capabilities | Router, proxy, load balancer |
| **PEOR Loop** | Plan → Execute → Observe → Replan. The autonomous task cycle | Agentic loop, ReAct, workflow |
| **Trust Level** | A stage in the trust sequence (0–4). Not a user permission level | Role, tier, plan level |
| **Shadow Jury** | Parallel model evaluation on production turns for quality benchmarking | A/B test, canary, fallback |
| **Vertical** | A business domain plugin: ontology + MCP server + event types | Service, module, product |
| **Telescope** | The ambient UX surface (Cognitive Shell). Not a product name. | App, dashboard, UI |
| **IntentField** | The primary input component — understands intent, not just commands | Search bar, chat box, prompt |
| **Saga** | A long-running orchestrated workflow with checkpoints and rollback | Job, task, pipeline |
| **Triple-Store** | PG (relational) + Neo4j (graph) + Qdrant (vector). Together, not separately | Database, storage, backend |

---

## Decision Principles

When facing a build decision, apply these in order:

### 1. Does it move us along the trust sequence?

If a feature does not help users trust the system more — either by improving reliability, improving transparency, or improving anticipation — it is not a priority. "Cool" is not a reason.

### 2. Does it belong in the ontology or in the service?

New business logic almost always belongs as a vertical ontology + MCP server, not a new backend service. If you're about to add a new Elysia service for a domain concept, ask: is this actually a new entity type + relationship type + MCP tool?

### 3. Is the complexity appropriate to the trust level?

Don't build Level 3 behaviors (strategic partnership) if Level 1 (reliable execution) isn't solid. Each trust level is a precondition for the next. Skipping levels creates systems that impress in demos and fail in production.

### 4. Does the agent know it doesn't know?

Any new agent capability must handle the unknown gracefully. Confidently wrong is worse than honestly uncertain. MetaScore is the instrument for verifying this.

### 5. Is this a one-way or two-way door?

One-way doors (schema changes, architectural pivots, agent persona commitments) require deeper scrutiny. Two-way doors (tool additions, UI experiments, ontology extensions) can move fast. Classify before committing.

---

## What We Never Build

| Category | Why |
|----------|-----|
| Confident agents on unverifiable claims | Hallucination is a trust-destroyer. Better silence than false confidence. |
| Black-box routing | Every dispatch decision must be explainable. No routing without a rationale. |
| New backend services for domain logic | Verticals are ontologies, not services. This is the architectural commitment. |
| Features that skip trust levels | Users at Level 1 cannot receive Level 3 behavior safely. Trust must be earned. |
| Hardcoded model routing | Shadow Jury + Smallest Viable Model decide routing. No static assignments post-Phase 2. |
| Client-side secrets | Never. Security is structural, not advisory. |

---

## What Success Looks Like

### In 3 months (end of Phase 2)
- Shadow Jury running on 100% of production agent turns
- MCP Forge SDK published, 1 external extension live
- 2 business verticals (Finance, HR) with ontology + MCP server
- Universal Dispatch Cortex: single entry point handling all intent categories
- BaseBench-Meta MetaScore monitoring on every agent turn (async)
- This manifest referenced in onboarding for every new contributor

### In 12 months (end of Phase 3)
- Institutional Memory: company history queryable at the knowledge graph level
- 5+ business verticals live, each with documented ontology
- MetaScore ≥ 0.85 maintained across all deployed agents
- Agent turns per day: 10,000+ with <200ms p95 latency
- External developer ecosystem: 10+ MCP extensions in marketplace

---

## The Architectural Commitments

These decisions are load-bearing. Reversing them would require a significant rewrite.

1. **Triple-store is non-negotiable.** PG for relational, Neo4j for graph traversal, Qdrant for semantic search. Each has a distinct role. No single-database shortcuts.

2. **MCP is the extension surface.** New capabilities enter via MCP servers, not custom Elysia routes. The 2,100-line MCP infrastructure is the platform, not a feature.

3. **Saga is the orchestration primitive.** Long-running tasks use saga with checkpoints and rollback. No fire-and-forget for anything user-facing.

4. **MetaScore is the quality gate.** No agent graduates to production without a MetaScore baseline. The benchmark is not optional.

5. **Verticals are ontologies, not services.** This is the scalability bet. 100 verticals should be addable without touching backend service code.

---

## Open Questions

| # | Question | Owner | Due |
|---|----------|-------|-----|
| OQ-1 | Should MetaScore thresholds differ by trust level? Who defines the thresholds? | Platform team | Phase 2 end |
| OQ-2 | Revenue-share model for MCP extension marketplace: flat fee, revenue %, or hybrid? | Product | Phase 2 mid |
| OQ-3 | Phase 3 institutional memory: should company history be in Neo4j or a separate ledger? | Architecture | Phase 3 start |
| OQ-4 | Should Shadow Jury results be surfaced to end users, or only to platform operators? | Product + UX | Phase 2 end |
| OQ-5 | Trust Level assignment: per-user, per-agent, or per-organization? | Product | Phase 2 mid |

---

## Document Governance

This manifest is owned by the platform team. It should be updated:
- Quarterly: review of trust sequence metrics, open questions
- On architectural pivots: any decision that changes Section 6 (Architectural Commitments)
- On product additions: any new product or vertical must be reflected here

**Last reviewed:** 2026-04-17  
**Next review:** 2026-07-17  
**Version:** 1.0.0

---

*"The goal is not to build a system that looks intelligent. The goal is to build a system that behaves trustworthy." — UAIP Design Principle*
