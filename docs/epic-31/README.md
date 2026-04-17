# Epic 31 — Spec-Driven UI v1 (JSON-Render Pipeline)

**Jira**: PM-284 | **Status**: Complete | **Branch**: merged to main

## Scope

12 tickets covering the shift from portal TSX components to JSON-defined UI projections rendered by a shared `WorkflowBlockRenderer`.

## Tickets Delivered

### Phase A — Foundation
| Ticket | Summary | Commit |
|--------|---------|--------|
| PM-305 | Workflow instance state subscription API + WebSocket event | `7f687e9` |
| PM-306 | WorkflowUIProjection v2 schema (UINodeSchema + PredicateSchema) | `9253160` |
| PM-307 | Verified component registry (`packages/ui-registry`) | `07d9920` |
| PM-315 | DynamicForm migration to react-hook-form + zod | `7224500` |

### Phase B — Rendering & Actions
| PM-308 | BindingResolver — `{$state.x.y}` path grammar | `9333650` |
| PM-309 | Action dispatch API (`POST /compositions/:id/actions`) | `8023aa3` |
| PM-310 | Wire WorkflowBlockRenderer into TelescopeSurface | `8023aa3` |
| PM-311 | WorkflowStateMachineRuntime (hydrate/transition/subscribe) | `f42c03c` |

### Phase C — Compat & CI
| PM-312 | ComponentRegistry CI pipeline (`.github/workflows/verify-ui-registry.yml`) | `70f1674` |
| PM-313 | `adaptV1ToV2()` legacy projection adapter | `70f1674` |
| PM-314 | `DesignTokenSchema` — structured token Zod schema | `70f1674` |
| PM-316 | Composer prompt v2 — emit actions + token references | `70f1674` |

## Architecture Decisions

1. **Recursive Zod types** — `PredicateSchema` uses `z.lazy()` without explicit `ZodType<T>` annotation due to Zod limitations with discriminated unions inside `z.lazy`. TypeScript `Predicate` type defined manually and exported separately.

2. **Backward-compat union** — `WorkflowUIProjectionSchema` uses `z.union([V2, V1])` (not discriminated union) so legacy data without `version` field falls through to V1 which has `.default(1)`.

3. **WorkflowStateHandler type** — Uses structural `EventBusSubscriber` interface instead of concrete `EventBusService` to avoid worktree/dist path type mismatch (pre-existing issue in navratna-core).

4. **ui-registry package location** — Created in `packages/ui-registry/` per ticket spec. Renderers are stub functions; full React wiring happens post-`pnpm install` in main worktree.

5. **stateVersion derivation** — Uses `updatedAt.getTime()` (epoch ms) as monotonic version counter — avoids schema migration for a new column.

## Follow-ups

- Run `pnpm install` after merge to properly link `packages/ui-registry` node_modules
- Full Playwright-backed axe/contrast CI (scripts scaffolded at `scripts/verify-ui-registry.mjs` and `scripts/check-registry-contrast.mjs`, browser step deferred to follow-up)
- Wire `RegistryEntry.renderer` to actual React components from `WorkflowBlockRenderer`

## Files Created

- `apps/packages/shared-types/src/workflow_composition.ts` — extended with v2 schema + `adaptV1ToV2()`
- `apps/packages/shared-types/src/design_tokens.ts` — new `DesignTokenSchema`
- `apps/backend/services/navratna-core/src/composition/workflow_state_handler.ts` — WS event relay
- `apps/frontend/src/components/WorkflowBlockRenderer/DynamicForm.tsx` — RHF + zod form
- `apps/frontend/src/hooks/use_action_dispatcher.ts` — action dispatch with double-submit prevention
- `apps/frontend/src/hooks/use_workflow_instance_state.ts` — client hook for instance state
- `apps/frontend/src/utils/binding_resolver.ts` — path grammar resolver
- `apps/frontend/src/utils/workflow_state_machine.ts` — state machine runtime
- `packages/ui-registry/` — new workspace package (types + registry + index)
- `scripts/verify-ui-registry.mjs` + `scripts/check-registry-contrast.mjs`
- `.github/workflows/verify-ui-registry.yml`
