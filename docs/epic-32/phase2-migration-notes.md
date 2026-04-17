# Epic 32 Phase 2 — Migration Notes

## PM-319: SecurityPortal + AgentManagerPortal

### SecurityPortal (`security`)

**Original**: 767-line TSX with live data from `securityAPI` + `auditAPI`.

**Layout** (original):
- Security metrics row (threats blocked, active sessions, compliance score, last audit)
- Events table (paginated, filterable by severity + type)
- Role-gated actions (pause monitoring, configure policies, download audit report)

**Spec conversion** (`card` display):
- Shows static field schema; data populated at render via future spec-data-binding
- Interactive actions mapped to `ActionProjection` array
- Events list NOT in Phase 2 spec (requires `table` + live fetch orchestration — Phase 3)

**Gaps surfaced by conversion**:
1. No live data binding in `WorkflowBlockRenderer` — specs receive `data` as static prop only
2. Role-gated conditional rendering not supported in spec format
3. Event filtering/pagination requires custom React state

**Escape-hatch**: `SecurityPortal.tsx` remains loadable via `PORTAL_COMPONENTS`. Remove `PORTAL_SPECS['security']` to revert to TSX.

---

### AgentManagerPortal (`agent-manager`)

**Original**: 2418-line TSX with agent CRUD, persona management, model assignment, paginated lists.

**Layout** (original):
- Grid/list views (12 per grid page, 10 per list page)
- Create agent flow (multi-step form)
- Edit modal (`AgentEditModal`)
- Persona selector

**Spec conversion** (`table` display):
- Shows agent list as table rows (name, status, model, type)
- CRUD actions mapped as `ActionProjection` entries
- Multi-step create flow, modals, pagination: NOT specifiable — Phase 4 escape-hatch

**Gaps surfaced by conversion**:
1. Multi-step forms not representable in single `WorkflowBlockProjection`
2. Inline modal (AgentEditModal) has no equivalent in spec
3. Context-driven data (`useAgents()`, `useDiscussion()`) needs adapter layer

**Recommendation**: AgentManagerPortal should use **escape-hatch** pattern in PM-320 — keep as TSX, do not migrate to spec. Mark in portal_registry with `@spec-escape-hatch` annotation.

---

## Data Binding Gap — Cross-Phase Issue

All spec-driven portals in Phase 1–2 receive `data: Record<string, unknown>` as static props.
For live data portals, a `SpecDataAdapter` layer is needed:

```
portal-specs.ts
  └── PortalBlockSpec
        └── dataSource?: {
              endpoint: string;
              method: 'GET' | 'POST';
              refreshIntervalMs?: number;
              queryParams?: Record<string, string>;
            }
```

This is out-of-scope for Epic 32 but should be filed as a follow-up ticket.
