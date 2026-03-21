# Current Sprint Plan — Navratna v3.0

## Document Control
- **Last Updated**: 2026-03-21
- **Sprint Cadence**: 2-week sprints
- **Current Phase**: Phase 0 (Infrastructure Foundation)

## Sprint 1: Infrastructure Foundation (2026-03-24 → 2026-04-04)

### Goals
- Multi-machine topology operational
- Service consolidation complete
- OpenShell installed and tested
- Database init scripts created

### Tasks
- [ ] Create .env.example with all 30+ required variables
- [ ] Pin all Docker image versions (fix postgres:latest, minio:latest, reranker:latest)
- [ ] Fix version mismatches (Qdrant 1.14.1 vs 1.7.4, RabbitMQ 4.1.0 vs 3.12)
- [ ] Create database init scripts (PostgreSQL + Neo4j + Qdrant)
- [ ] Create docker-compose-pca.yml (PC-A: databases + core service)
- [ ] Create docker-compose-pcb.yml (PC-B: gateway + nginx + OpenShell)
- [ ] Install Tailscale on all 3 machines, verify mesh connectivity
- [ ] Install NVIDIA OpenShell on PC-B + Mac
- [ ] Consolidate services: navratna-core (3001) and navratna-gateway (3002)
- [ ] Pre-build golden container image (navratna/coding-workspace)
- [ ] Verify full stack starts in < 90 seconds
- [ ] Remove: MinIO, TEI, monitoring stack, Marketplace Service

### Definition of Done
- All 3 machines can reach each other via Tailscale
- Navratna Core (PC-A) and Gateway (PC-B) are healthy
- OpenShell can create and destroy a test sandbox
- Database queries work cross-machine

## Sprint 2: Agent Port + Telescope Foundation (2026-04-07 → 2026-04-18)

### Goals
- 14 OpenClaw agents live in Navratna
- IntentField and MaterializableBlock working
- First coding sandbox operational

### Tasks
- [ ] Extract and port all 14 agent personas from OpenClaw
- [ ] Port SOPs and task lifecycle configuration
- [ ] Port model routing configs (6 providers, 30+ models)
- [ ] Port 13 skills to Capability Registry
- [ ] Build IntentField component (merge cmdk + GlobalAutocomplete)
- [ ] Build MaterializableBlock HOC
- [ ] Build Microexpression system (7 states)
- [ ] Implement code splitting (React.lazy for all portals)
- [ ] Migrate auth tokens to httpOnly cookies
- [ ] Create first project config: orthopulse-hq.yaml
- [ ] Boot Claude Code in OpenShell sandbox with project config
- [ ] Verify Claude Code can create a PR from sandbox

### Definition of Done
- Typing "Tardis" in IntentField surfaces the Tardis agent
- All agents respond in-character
- Claude Code in sandbox can: clone repo, write code, run tests, create PR
- Initial bundle size reduced by > 50%

## Sprint 3: Telescope Surface + Sensorium (2026-04-21 → 2026-05-02)

### Goals
- TelescopeSurface is the default interface (feature-flagged)
- Read-only integrations feeding ambient layer
- Approval membrane functional

### Tasks
- [ ] Build TelescopeSurface.tsx (physics-based layout with Framer Motion)
- [ ] Implement relevance() scoring function
- [ ] Build Ambient Stream Aggregator (unified Socket.IO)
- [ ] Build Crystallization renderer
- [ ] Integrate GOG Gmail as Sensorium feed
- [ ] Integrate GitHub watch (repos, issues, PRs)
- [ ] Integrate RSS (migrate Mirror agent)
- [ ] Build Approval Queue in Security Gateway
- [ ] Build approval UI as ambient interrupt in Telescope
- [ ] Implement Explanation Whisper (reasoning transparency)

### Definition of Done
- Telescope shows ambient data from Gmail + GitHub + RSS
- Approval requests surface as yellow-tinted ambient interrupts
- Users can approve/deny from Telescope without leaving the surface
- Feature flag allows switching between Telescope and legacy Desktop

## Future Sprints (Planned)
- Sprint 4: Tauri Shell + Multi-Machine Routing
- Sprint 5: BullMQ Migration + Drizzle Migration Start
- Sprint 6: Continuity Engine + Decision Journaling
- Sprint 7: Telescope Polish + Performance
- Sprint 8: OpenClaw Archive + Production Hardening
