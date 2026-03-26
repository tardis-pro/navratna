# Removal Specification — Navratna v3.0

## Document Control

- **Version**: 1.1
- **Date**: 2026-03-26
- **Original**: 2026-03-21
- **Purpose**: Document all components, services, and infrastructure being removed in the Sovereign Cognitive Shell evolution
- **Updated**: 2026-03-26 — Added status tracking from codebase audit. 8 of 22 items DONE, 3 PARTIAL, 11 NOT DONE.

## Removal Philosophy

Every removal is driven by one of three principles:

1. **Dead weight**: Not functional, stubbed, or demo-only
2. **Resource hog**: Consumes RAM/CPU disproportionate to value on modest consumer hardware
3. **Superseded**: Replaced by a better approach in the new architecture

## Infrastructure Removals

### 1. MinIO Container

- **Location**: docker-compose.yml service `minio`
- **Why**: Resource hog (256MB RAM). Cloudflare R2 provides S3-compatible storage at zero egress cost. For local dev, direct filesystem is sufficient.
- **Replacement**: Cloudflare R2 for cloud storage, local filesystem for dev
- **Migration**: Update any S3 client configs to point to R2 endpoint
- **Risk**: Low — MinIO was used for artifact storage, R2 is API-compatible

### 2. TEI Embeddings (GPU) Container

- **Location**: docker-compose.yml service `tei-embeddings-gpu`
- **Why**: Resource hog (2GB+ RAM, requires NVIDIA GPU). Ollama already needed for local LLM inference can serve embedding models too.
- **Replacement**: Ollama with embedding models (nomic-embed-text, mxbai-embed-large)
- **Migration**: Update embedding service calls to use Ollama API
- **Risk**: Low — Ollama embedding quality is comparable

### 3. TEI Reranker Container

- **Location**: docker-compose.yml service `tei-reranker` (michaelf34/infinity:latest — UNVERSIONED!)
- **Why**: Dead weight for single-user system. Reranking is valuable at scale, not for personal OS.
- **Replacement**: Relevance engine in Telescope uses Qdrant cosine similarity directly
- **Migration**: Remove reranker calls from search pipeline
- **Risk**: None — single user doesn't need reranking sophistication

### 4. Prometheus Container

- **Location**: docker-compose.yml service `prometheus`
- **Why**: Resource hog (256MB+). Overkill for personal 3-machine setup.
- **Replacement**: Grafana Cloud free tier (50GB logs, 10K metrics series)
- **Migration**: Point metric exporters to Grafana Cloud remote write endpoint
- **Risk**: Low — Grafana Cloud free tier is generous for personal use

### 5. Loki Container

- **Location**: docker-compose.yml service `loki`
- **Why**: Resource hog with Prometheus. Structured logs to file + Grafana Cloud is simpler.
- **Replacement**: Winston structured JSON logs → file rotation → Grafana Cloud Loki (or just grep)
- **Migration**: Already using Winston throughout — just configure file transport
- **Risk**: None

### 6. Grafana Container (Local)

- **Location**: docker-compose.yml service `grafana`
- **Why**: Resource hog (256MB). Use the cloud version instead.
- **Replacement**: Grafana Cloud free tier
- **Migration**: Export dashboards as JSON, import to Grafana Cloud
- **Risk**: None

### 7. Promtail Container

- **Location**: docker-compose.yml service `promtail`
- **Why**: Goes with Loki removal
- **Replacement**: Not needed if using file-based logs
- **Migration**: Remove from compose
- **Risk**: None

### 8. Three Exporter Containers (postgres-exporter, redis-exporter, neo4j-exporter)

- **Location**: docker-compose.yml
- **Why**: Go with Prometheus removal
- **Replacement**: Direct health checks via Tailscale monitoring or Grafana Cloud integrations
- **Migration**: Remove from compose
- **Risk**: None

### 9. RabbitMQ Container

- **Location**: docker-compose.yml service `rabbitmq`
- **Why**: Resource hog (512MB RAM) for simple pub/sub patterns. Being replaced by BullMQ on Redis Streams.
- **Replacement**: BullMQ + Redis Streams (Redis already running)
- **Migration**: See 02-REPLACEMENT-SPEC.md for EventBus migration details
- **Risk**: Medium — requires careful migration of all event consumers. Feature-flag recommended.
- **Dependencies**: All 7 backend services use EventBus wrapper

### 10. TEI Embeddings (CPU) Container

- **Location**: docker-compose.yml service `tei-embeddings-cpu`
- **Why**: Redundant with Ollama embedding support
- **Replacement**: Ollama
- **Migration**: Same as GPU TEI removal
- **Risk**: Low

**Total Infrastructure Savings**: ~3.5GB RAM, 10 fewer containers

## Service Removals

### 11. Marketplace Service

- **Location**: /backend/services/marketplace-service/
- **Why**: Dead weight — only 33 lines of real code (20% functional). Not needed for personal sovereign OS.
- **Replacement**: None — if marketplace features are needed later, build as Telescope extension
- **Migration**: Remove service directory, remove from docker-compose, remove from pnpm-workspace
- **Risk**: None — barely functional

### 12. Enterprise Docker Compose

- **Location**: docker-compose.enterprise.yml
- **Why**: Superseded — designed for SOC2/HIPAA compliance with 5 security tiers and 4+ separate database instances. Personal sovereign OS uses Ring-based trust model instead.
- **Replacement**: Multi-machine Tailscale topology with project-based auth
- **Migration**: Archive file (don't delete — may be useful reference for future enterprise offering)
- **Risk**: None — not currently in use

## Frontend Removals

### 13. DesktopUnified Window Manager

- **Location**: /apps/frontend/src/components/DesktopUnified.tsx (1,927 lines)
- **Why**: Superseded by TelescopeSurface. Window management (drag, resize, minimize, maximize, Z-index) is the opposite of the Telescope vision.
- **Replacement**: TelescopeSurface.tsx — physics-based intent surface
- **Migration**: Feature-flagged. Old Desktop stays as fallback until Telescope reaches parity. Then remove.
- **Timeline**: Remove after Phase 2 completion (Week 3-4)
- **Risk**: Medium — this is the current primary interface. Feature flag is mandatory.

### 14. DashboardPortal

- **Location**: /apps/frontend/src/components/futuristic/portals/DashboardPortal.tsx
- **Why**: Dead weight — uses hardcoded mock data ("45% CPU, 68% memory"). Comment in code: "Mock data - in real implementation, this would come from APIs"
- **Replacement**: Telescope ambient layer shows real system state as atmospheric conditions (microexpressions)
- **Migration**: Remove portal, metrics become Telescope weather
- **Risk**: Low

### 15. MiniBrowserPortal

- **Location**: /apps/frontend/src/components/futuristic/portals/MiniBrowserPortal.tsx (899 lines)
- **Why**: Dead weight — HTML2Canvas-based screenshots, not real browsing. Not useful for Telescope.
- **Replacement**: Browser automation runs in OpenShell sandbox, results surface as Telescope blocks
- **Migration**: Remove portal
- **Risk**: None

### 16. ChatPortal (Stub)

- **Location**: /apps/frontend/src/components/futuristic/portals/ChatPortal.tsx (11 lines)
- **Why**: Dead weight — 11-line stub wrapping UnifiedChatSystem
- **Replacement**: UnifiedChatSystem consumed directly by Telescope
- **Migration**: Update imports
- **Risk**: None

### 17. MultiChatManager (Stub)

- **Location**: /apps/frontend/src/components/futuristic/portals/MultiChatManager.tsx (3 lines)
- **Why**: Dead weight — 3-line bare import
- **Replacement**: None needed
- **Migration**: Remove file
- **Risk**: None

### 18. MindMap (Visual Demo)

- **Location**: /apps/frontend/src/components/MindMap/ or similar
- **Why**: Dead weight — visualization without data binding
- **Replacement**: Neo4j knowledge graph renders as Telescope spatial constellation
- **Migration**: Remove component
- **Risk**: None

### 19. KnowledgeGraphVisualization (Demo)

- **Location**: /apps/frontend/src/components/KnowledgeGraphVisualization/
- **Why**: Dead weight — visual demo without live data
- **Replacement**: Knowledge graph integrated into Telescope relevance engine, renders as spatial entities
- **Migration**: Remove component, build new graph rendering in MaterializableBlock
- **Risk**: Low

## Dependency Removals

### 20. TypeORM (After Migration)

- **Location**: package.json across all backend services
- **Why**: Superseded by Drizzle ORM (10x faster, 0 runtime overhead)
- **Replacement**: Drizzle ORM
- **Migration**: See 02-REPLACEMENT-SPEC.md. Feature-flagged migration — TypeORM stays until Drizzle migration is complete and tested.
- **Timeline**: Remove after Phase 1 migration complete
- **Risk**: High — core data access layer. Careful migration required.

### 21. amqplib / RabbitMQ Client

- **Location**: package.json, EventBus implementation
- **Why**: Goes with RabbitMQ container removal
- **Replacement**: bullmq package
- **Migration**: See 02-REPLACEMENT-SPEC.md
- **Risk**: Medium — all inter-service communication depends on this

## OpenClaw Complete Removal

### 22. OpenClaw Infrastructure Directory

- **Location**: /openclaw-infra/
- **Why**: Superseded — all valuable content extracted to Navratna native services. OpenClaw framework no longer needed.
- **What's Extracted First** (see 03-OPENCLAW-EXTRACTION.md):
  - Agent personas (SOUL.md files) → Agent Intelligence
  - SOPs → Orchestration Pipeline
  - Skills → Capability Registry
  - Cron jobs → Scheduled Events
  - Model configs → LLM Service
- **Timeline**: Remove AFTER all extraction is verified complete
- **Migration**: Archive to git history (never truly deleted)
- **Risk**: Medium — must verify all valuable data extracted before removal

## Status Dashboard (2026-03-26 Audit)

| #   | Item                        | Phase | Status          | Notes                                                                                                                          |
| --- | --------------------------- | ----- | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | MinIO                       | 0     | **DONE** ✅     | Removed from docker-compose.yml                                                                                                |
| 2   | TEI Embeddings GPU          | 0     | **DONE** ✅     | Removed from docker-compose.yml                                                                                                |
| 3   | TEI Reranker                | 0     | **DONE** ✅     | Removed from docker-compose.yml                                                                                                |
| 4   | Prometheus                  | 0     | **NOT DONE** ❌ | Still in docker-compose.yml (line 291)                                                                                         |
| 5   | Loki                        | 0     | **NOT DONE** ❌ | Still in docker-compose.yml (line 308)                                                                                         |
| 6   | Grafana (Local)             | 0     | **NOT DONE** ❌ | Still in docker-compose.yml (line 424)                                                                                         |
| 7   | Promtail                    | 0     | **NOT DONE** ❌ | Still in docker-compose.yml (line 321)                                                                                         |
| 8   | Exporter Containers         | 0     | **PARTIAL** ⚠️  | neo4j-exporter removed; postgres-exporter (338), redis-exporter (352), node-exporter (367), nginx-exporter (405) still present |
| 9   | RabbitMQ                    | 1     | **PARTIAL** ⚠️  | Removed from main compose; still in test/enterprise/infra compose + scripts + monitoring                                       |
| 10  | TEI Embeddings CPU          | 0     | **DONE** ✅     | Removed from docker-compose.yml                                                                                                |
| 11  | Marketplace Service         | 0     | **NOT DONE** ❌ | Directory still exists at apps/backend/services/marketplace-service/                                                           |
| 12  | Enterprise Docker Compose   | 3     | **EXISTS** ℹ️   | At infrastructure/docker-compose.enterprise.yml — spec says archive, not delete                                                |
| 13  | DesktopUnified              | 2     | **DONE** ✅     | DesktopUnified.tsx + DesktopWorkspace.tsx deleted                                                                              |
| 14  | DashboardPortal             | 0     | **NOT DONE** ❌ | Still exists, lazy-loaded via portal_registry.tsx                                                                              |
| 15  | MiniBrowserPortal           | 0     | **NOT DONE** ❌ | Still exists, lazy-loaded via portal_registry.tsx                                                                              |
| 16  | ChatPortal                  | 0     | **NOT DONE** ❌ | Still exists, lazy-loaded via portal_registry.tsx                                                                              |
| 17  | MultiChatManager            | 0     | **NOT DONE** ❌ | Still exists in futuristic/portals/                                                                                            |
| 18  | MindMap                     | 0     | **NOT DONE** ❌ | Still exists as MindMap.tsx in futuristic/portals/                                                                             |
| 19  | KnowledgeGraphVisualization | 0     | **NOT DONE** ❌ | Still exists as KnowledgeGraphVisualization.tsx in futuristic/portals/                                                         |
| 20  | TypeORM                     | 1     | **DONE** ✅     | Zero traces in source, deps, config, lockfile                                                                                  |
| 21  | amqplib / RabbitMQ Client   | 1     | **DONE** ✅     | Zero in source, zero in package.json                                                                                           |
| 22  | OpenClaw Infrastructure     | 3     | **DONE** ✅     | /openclaw-infra/ directory does not exist                                                                                      |

**Scorecard**: 8 DONE ✅ | 2 PARTIAL ⚠️ | 11 NOT DONE ❌ | 1 INFO ℹ️

**Undocumented containers still in docker-compose.yml** (not in original removal spec):

- `node-exporter` (line 367) — not mentioned in spec, should be evaluated
- `nginx-exporter` (line 405) — not mentioned in spec, should be evaluated

---

## Removal Order

**Phase 0** (Immediate — unblocks development):

1. Remove MinIO, TEI (GPU/CPU/Reranker), monitoring stack (containers 1-10)
2. Remove stubs: ChatPortal, MultiChatManager, MindMap, KnowledgeGraphVisualization
3. Remove DashboardPortal (mock data)
4. Remove MiniBrowserPortal
5. Remove Marketplace Service

**Phase 1** (After replacements built — Week 2-3): 6. Remove RabbitMQ (after BullMQ migration verified) 7. Remove TypeORM (after Drizzle migration verified)

**Phase 2** (After Telescope reaches parity — Week 4-5): 8. Remove DesktopUnified (after feature flag period)

**Phase 3** (After extraction verified — Week 5-6): 9. Archive OpenClaw infrastructure 10. Archive Enterprise docker-compose

## Verification Checklist

Before each removal:

- [ ] Replacement is functional and tested
- [ ] No imports reference the removed component
- [ ] No configuration files reference the removed service
- [ ] Docker compose runs cleanly without the removed container
- [ ] All tests pass after removal
- [ ] Git commit with clear message documenting what was removed and why

## Priority Cleanup Queue (2026-03-26)

Based on the audit, the following removals are overdue (were planned for Phase 0 but not executed):

**HIGH PRIORITY** (Phase 0 items still pending):

1. Remove monitoring stack from docker-compose.yml: prometheus, loki, grafana, promtail, postgres-exporter, redis-exporter (#4–8)
2. Delete frontend stubs: ChatPortal, MultiChatManager, MindMap, KnowledgeGraphVisualization (#16–19) — and update portal_registry.tsx
3. Delete DashboardPortal (mock data) and MiniBrowserPortal (#14–15) — and update portal_registry.tsx
4. Delete marketplace-service directory (#11)

**MEDIUM PRIORITY** (Phase 1 items with residual): 5. Clean RabbitMQ from infrastructure compose files, scripts, monitoring configs (see 02-REPLACEMENT-SPEC.md D3–D8)

**Decision needed**:

- node-exporter and nginx-exporter: remove with monitoring stack or keep for basic health monitoring?
- Portal components: some are lazy-loaded and functional — confirm they should be deleted vs kept as Telescope content
