---
title: 'QuestionForge: Stakeholder Discovery Council'
date: 2026-03-21
status: draft
type: product-specification
one-line-pitch: 'QuestionForge uses a debating council of AI specialists to generate the exact questions teams should ask real stakeholders before committing to product, backend, architecture, and delivery decisions.'
---

# QuestionForge by Navratna

## Problem

Projects fail not from lack of code. They fail because:

- Wrong assumptions were never challenged
- Stakeholders were asked shallow questions
- Product, engineering, and business each assumed the others had clarity
- Fake certainty spread faster than truth

## Solution

Instead of asking AI to give answers too early, use AI to generate the **best missing questions**. Turn agents into interrogators, contradiction hunters, assumption extractors, risk mappers, and question designers.

## Product Positioning

| Audience                 | Pitch                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Startups                 | Before building, run your idea through an AI council that finds hidden gaps in product, backend, and architecture |
| Agencies / Consultancies | Generate better stakeholder discovery faster and reduce requirement churn                                         |
| Enterprise teams         | Standardize requirement interrogation across product, engineering, legal, and security                            |
| VCs / Due Diligence      | Stress-test founder claims and roadmap assumptions before investing                                               |

## Core Flow

### Step 1: Input Intake

Accepts:

- Text briefs, docs, meeting notes, transcripts
- Tickets, PRDs, architecture notes
- Client requirements, sales promises
- Bug themes, feature requests

### Step 2: Normalization Layer

Parser extracts:

- Goals, actors, assumptions, constraints
- Success metrics, missing information
- Contradictions, domain terms

### Step 3: Council Debate

8 specialist agents review from different lenses:

| Agent                 | Focus                                              |
| --------------------- | -------------------------------------------------- |
| Product Strategist    | User value, scope, priorities, edge cases          |
| Backend Architect     | APIs, data flows, scaling, reliability             |
| Software Architect    | Boundaries, coupling, extensibility, failure modes |
| Delivery Manager      | Dependencies, sequencing, estimation risks         |
| Security / Compliance | Auth, data risk, audit gaps                        |
| Business / Commercial | ROI, market fit, commercial assumptions            |
| User Advocate         | What real humans may object to                     |
| Skeptic / Red Team    | Attacks hidden assumptions                         |

Each agent emits:

- Observed assumptions + hidden assumptions
- Strongest risks
- What other agents are likely missing
- Top 10 questions with confidence per question
- Why each answer matters
- What decision depends on it

### Step 4: Debate Graph

Second round:

- Challenge two other agents' weak points
- Merge overlapping questions
- Escalate blockers

Produces:

- Claims, concerns, assumptions, questions
- Contradiction map between agents
- Consensus points and unresolved disagreements

### Step 5: Question Synthesis

Clusters questions into:

- **Must ask now** — gates decisions
- **Can defer** — useful but not blocking
- **Blockers** — cannot proceed without answer
- **Nice-to-know** — context enrichment
- **Contradictory assumptions** — needing resolution between stakeholders

### Step 6: Stakeholder-Specific Output

Generate question packs per role:

- Founder / client
- PM / product owner
- Backend lead
- Frontend lead
- Architect
- Design / UX
- Legal / compliance
- Ops / infra
- Sales / GTM
- End user interview

**Output structure per stakeholder:**

```markdown
## Stakeholder: Backend Lead

### Critical Blockers

- What consistency guarantees are actually required for this workflow?
- What is the expected read/write load by peak user type?
- Which failures must be recoverable versus fatal?

### Ambiguities

- Are retries safe or can they create duplicate actions?
- Which APIs are internal only vs partner-facing?

### Contradictions to Resolve

- Product expects real-time updates; infra budget assumes async batch
- Sales promised multi-tenant; schema proposal is single-tenant biased

### Why These Matter

These answers affect schema design, caching, queueing, and failure recovery.
```

### Step 7: Interview Capture + Feedback Loop

- Interviewer picks stakeholder role
- Asks generated questions, captures answers
- System updates assumptions, closes resolved questions
- Identifies new contradictions from answers
- Regenerates next-round questions

**This loop is the gold.**

## Debate Mechanics

Forced structure, not opinion dumps:

**Round 1:** Each agent emits observed assumptions, hidden assumptions, strongest risks, top 10 questions with confidence, why each answer matters, what decision depends on it.

**Round 2:** Attack two other agents' weak points. Merge overlapping questions. Escalate blockers.

**Synthesis:** Remove fluff. Compress duplicates. Order by decision leverage.

## QA Architecture

### Layer 1: Internal Reasoning QA

Are the agents producing good questions?

- Relevance, specificity, non-duplication, coverage
- Contradiction detection, stakeholder appropriateness, actionability
- % questions tied to explicit assumptions
- % questions judged high-value by humans
- Redundancy rate, missing-critical-domain recall

### Layer 2: Stakeholder Interview QA

Do generated questions improve discovery quality?

- Blocker discovery rate
- Requirement change reduction
- Post-interview ambiguity reduction
- Number of high-impact assumptions resolved

### Layer 3: Outcome QA

Did this improve delivery?

- Fewer requirement reversals
- Fewer missed edge cases
- Fewer architecture pivots
- Better sprint predictability
- Lower rework cost

**Most AI products stop at "cool output." QuestionForge needs downstream proof.**

## Data Model

### Core Entities

- Project, Artifact, Stakeholder, Agent
- DebateRound, Claim, Assumption, Risk
- Contradiction, Question, Answer
- Decision, ConfidenceScore, Evidence

### Key Relationships

- Project has many Artifacts
- Agent generates Questions
- Question targets Stakeholder
- Question tests Assumption
- Answer resolves Question
- Contradiction links two Claims
- Decision depends on Answer(s)
- Risk emerges from unresolved Assumption

### Intelligence queries enabled:

- Which assumptions repeatedly caused delivery issues?
- Which stakeholder types leave the most ambiguity?
- Which agents generate the most useful blocker questions?

## UAIP Integration

QuestionForge runs natively on existing UAIP infrastructure:

| QuestionForge Component | UAIP Service                         | How It Maps                                                      |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Agent Council           | Discussion Orchestration (port 3005) | Multi-agent debates with turn strategies, objectives, outcomes   |
| Specialist Agents       | Persona System                       | 8 personas with expertise, traits, systemPrompt                  |
| Project Context         | Knowledge Graph (PG/Neo4j/Qdrant)    | Stores assumptions, decisions, contradictions                    |
| Question Packs          | Artifact Service                     | Generated as deployable, versionable artifacts                   |
| Debate Pipeline         | Orchestration Pipeline (port 3002)   | Manages debate→synthesize→output workflow                        |
| Question Ranking        | Relevance Engine                     | Scores question importance and stakeholder relevance             |
| Interview Capture       | Discussion System                    | Structured conversations with turn strategies                    |
| Metacognitive Quality   | BaseBench-Meta integration           | Agents tested for calibration, bluff resistance, self-correction |

## MVP Scope

**Input:** Project brief pasted in
**Output:** Stakeholder-specific question packs, contradictions, top unresolved assumptions, interview script
**Human workflow:** Interviewer asks questions → types answers back in → system regenerates round 2

That alone is already useful.

## v2 Additions

- Document upload + parsing
- Memory from prior projects
- Scoring dashboard
- Answer sufficiency analysis
- Meeting transcript processing
- Role-based exports

## v3 Additions

- Live meeting copilot
- Suggested follow-up questions during call
- Automatic contradiction detection across stakeholders
- Decision-readiness score
- PRD completeness score
- Architecture readiness score
