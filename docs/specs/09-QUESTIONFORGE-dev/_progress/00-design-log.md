# QuestionForge — Design Log

## Project
- **Name**: QuestionForge
- **Spec**: `docs/specs/09-QUESTIONFORGE.md` (status: approved)
- **MVP Input**: Project brief pasted in → Stakeholder-specific question packs + contradictions + interview script
- **Start Date**: 2026-03-22

---

## Design Loop Status

| Scenario | Phase | Page | Status | Date |
|----------|-------|------|--------|------|
| questionforge-mvp | 01 | Scope & Plan | complete | 2026-03-22 |
| questionforge-mvp | 02 | Phase 1 — Foundation | complete | 2026-03-22 |
| questionforge-mvp | 03 | Phase 2 — Backend Core | complete | 2026-03-22 |
| questionforge-mvp | 04 | Phase 3 — Frontend | not_started | — |

---

## Context

### What is QuestionForge?
QuestionForge uses a debating council of 8 AI specialist agents to generate the exact questions teams should ask real stakeholders before committing to product, backend, architecture, and delivery decisions.

### Strategic Fit (from ROADMAP.md)
- One of three strategic products: UAIP Core, BaseBench-Meta, QuestionForge
- BaseBench-Meta **measures** metacognitive intelligence
- UAIP Core **implements** it in production
- QuestionForge **demonstrates** it as a product

### Existing Infrastructure to Reuse
| Service | Readiness | Key Files |
|---------|-----------|-----------|
| Discussion Orchestration | 70% | `discussion-orchestration/src/`, `debate-orchestrator.service.ts` |
| Persona System | 40% | `personaService.ts`, `persona.entity.ts`, `persona.ts` |
| Artifact Service | 60% | `artifact-service/src/`, generators framework exists |
| Orchestration Pipeline | 50% | `orchestration-pipeline/src/` |
| Knowledge Graph | 40% | KG schema exists, needs QF entity types |
| Relevance Engine | 60% | `relevance.ts`, needs QF-specific scoring |

---

## Implementation Plan

### Phase 1: Foundation (Layer 0 → 1)
1. **E1-E3** — Add shared types: `QUESTION_PACK` artifact type, `ProjectType.QUESTIONFORGE`, KG types for Assumption/Contradiction/Question
2. **B1-B8** — Create 8 specialist persona definitions in `personaDefaults.ts`

### Phase 2: Backend Core Services (Layer 2)
3. **C2** — `InputNormalizerService` — parse briefs/notes into structured format
4. **C3** — `QuestionRankerService` — extend relevance with decision-leverage + stakeholder-relevance + assumption-coverage
5. **C5** — `DebateFlowExtension` — custom 2-round council flow on top of existing DebateOrchestrator
6. **C6** — `InterviewCaptureService` — capture answers, close questions, trigger regeneration
7. **C1** — `QuestionForgeService` — main orchestrator tying all services together
8. **C4** — `QuestionPackGenerator` — artifact generator for stakeholder question packs

### Phase 3: Frontend (Layer 3)
9. **D1** — `QuestionForgeLanding` page — brief input form
10. **D5** — `ProjectContextPanel` — shows brief + normalized output
11. **D2** — `CouncilDebateView` — real-time 8-agent debate UI
12. **D3** — `QuestionPackView` — stakeholder-filtered question packs with clusters
13. **D4** — `InterviewCaptureView` — answer capture flow

### Phase 4: Integration & Polish
14. WebSocket wiring for real-time debate updates
15. End-to-end flow test
16. Documentation

---

## Key File Paths

**Spec**: `/navratna/docs/specs/09-QUESTIONFORGE.md`

**Types to Modify**:
- `packages/shared-types/src/artifact.ts`
- `packages/shared-types/src/project.ts`
- `packages/shared-types/src/knowledge-graph.ts`
- `packages/shared-types/src/personaDefaults.ts`

**New Files**:
- `backend/services/questionforge/src/questionForge.service.ts`
- `backend/services/questionforge/src/inputNormalizer.service.ts`
- `backend/services/questionforge/src/questionRanker.service.ts`
- `backend/services/questionforge/src/debateFlow.extension.ts`
- `backend/services/questionforge/src/interviewCapture.service.ts`
- `backend/services/questionforge/src/questionPack.generator.ts`
- `backend/services/questionforge/src/entities/` (Assumption, Contradiction, Question entities)
- `apps/frontend/src/pages/questionforge/` (D1-D5 pages)

**Existing Infrastructure**:
- `backend/shared/services/src/cognitive/debate-orchestrator.service.ts`
- `backend/shared/services/src/personaService.ts`
- `backend/shared/services/src/knowledge-graph/knowledge-graph.service.ts`
- `backend/services/artifact-service/src/ArtifactFactory.ts`
- `backend/services/orchestration-pipeline/src/orchestrationEngine.ts`
- `backend/services/agent-intelligence/src/services/relevance.ts`

---

## Resolved Questions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Standalone service or integrated? | **Standalone service on port 3008** | Follows BaseService pattern. Low infra cost — shared DBs (PG/Neo4j/Qdrant), shared RabbitMQ. Clean single-responsibility boundary. |
| LLM access pattern? | **Central LLM Service via RabbitMQ events** | All cognitive services use this pattern — publish `debate.argument.request`, receive response via event bus. No direct LLM calls. Leverages `UnifiedModelSelectionFacade` for provider routing. |
| Interview capture approach? | **Extend Discussion as `discussionMode: 'interview'`** | Discussion already has `QUESTION`/`ANSWER` message types, turn strategies, WebSocket infra. Add `interviewConfig` to schema — 90% code reuse. No separate conversation system needed. |
