# UAIP Knowledge Graph – Tonight's Task Checklist

> **Goal:** By the end of tonight, have the three-layered Knowledge Graph (General, User, Agent) fully wired end-to-end in both the database and the service layer, with routes exposed through the Security Gateway.

---

## 📋 Phase 1 – Data-Model & Storage (PostgreSQL + Qdrant)

- [ ] **Add columns to entities**  
  • File: `shared/services/src/entities/knowledge-item.entity.ts`  
  • File: `shared/services/src/entities/knowledge-relationship.entity.ts`  
  ∘ `userId?: string` *(nullable)*  
  ∘ `agentId?: string` *(nullable)*  
  ∘ `summary?: string` *(nullable)*
- [ ] **Create TypeORM migration**  
  `$ pnpm typeorm migration:generate -d shared/services/typeorm.config.ts AddOwnershipAndSummaryColumns`  
  Then run: `$ pnpm typeorm migration:run`
- [ ] **Back-fill existing rows**  
  Write script to set `agentId` on legacy agent-memory items; keep others `NULL`.
- [ ] **Indexing**  
  Add compound indexes `(userId, type)` and `(agentId, type)` in migration.
- [ ] **Qdrant payload schema**  
  POST `/collections/knowledge/payload_index` for `userId` and `agentId`.

---

## 📋 Phase 2 – Core Service Refactor

- [ ] **Define `KnowledgeScope` type** in `@uaip/types`.
- [ ] **Refactor `KnowledgeGraphService`**  
  ∘ All public methods accept `scope: KnowledgeScope`.  
  ∘ Inject scope into Postgres queries & Qdrant filters.
- [ ] **Update `KnowledgeRepository` queries** to respect `scope` in WHERE clauses.
- [ ] **Consolidate `AgentMemoryService`**  
  Remove direct DB logic → call `KnowledgeGraphService` with `{ agentId }`.
- [ ] **Implement `UserKnowledgeService`**  
  Wrapper around `KnowledgeGraphService` that always passes `{ userId }`.

---

## 📋 Phase 3 – Security Gateway API

- [ ] **Add routes** in `services/security-gateway`:
  ```text
  POST   /v1/knowledge            -> add user knowledge
  GET    /v1/knowledge/search     -> search user knowledge
  PATCH  /v1/knowledge/:itemId    -> update user knowledge
  DELETE /v1/knowledge/:itemId    -> delete user knowledge
  ```
- [ ] **Middleware** – ensure JWT `sub` → `req.context.userId`; forbid cross-user access.

---

## 📋 Phase 4 – Context Orchestration

- [ ] **Create `ContextOrchestrationService`**  
  ∘ Query order: `{ agentId }` ➜ `{ userId }` ➜ `{}` (general)  
  ∘ Rank & merge, cut to `MAX_TOKENS`.
- [ ] **Integrate into `agent-intelligence` controllers** instead of direct memory calls.

---

## 📋 Phase 5 – Tests & Docs

- [ ] **Unit tests** for scoping, relationship CRUD, auth guard.
- [ ] **Integration tests** – two users, isolation verified.
- [ ] **Update API docs** (`01_Backend_Integration.md` + Postman collection).

---

## ⏰ Execution Instructions (Tonight)

1. **Start with migrations** – schema must exist before refactors.  
2. **Parallelize:** One dev on entity + migration, another on service refactor.  
3. **Run tests continually**: `pnpm test --watch` in shared services.  
 
5. **Aim to deploy local stack by midnight** to verify Security Gateway routes.  
6. **Buffer 2 hrs** (midnight–2 AM) for bug-fix & documentation.

> **Done Criteria:** All checkboxes above ticked, test suite green, local e2e scenario passes with three-layered context retrieval.
