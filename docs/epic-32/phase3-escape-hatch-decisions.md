# Epic 32 Phase 3 — Escape-Hatch Decisions

## PM-320: Discussion + WorkflowStudio

These portals are officially escape-hatched. They will NOT be converted to spec-driven
rendering in Epic 32. Their TSX implementations remain as first-class portals.

---

### DiscussionLogPortal (`discussion-log`) — ESCAPE-HATCH

**Reason**: Real-time chat log with WebSocket streaming.

- Uses `useDiscussion()` context + `discussionsAPI` for live message fetching
- Message list renders from live Socket.IO events, not REST polling
- Auto-scroll, message timestamps, sender/role display — custom rendering
- `WorkflowBlockRenderer` has no streaming data source or live-update mechanism

**Verdict**: Cannot be spec-driven without a streaming data adapter. Keep TSX.

---

### DiscussionControlsPortal (`discussion-controls`) — ESCAPE-HATCH

**Reason**: Real-time discussion control panel with participant management.

- Live discussion state: turn strategy, participant list, transcript export
- WebSocket event dispatch (`start_turn`, `skip_turn`, `end_discussion`)
- Role-gated control visibility (facilitator vs participant)
- `WorkflowBlockRenderer` actions are fire-and-forget, not streaming control

**Verdict**: Cannot be spec-driven. Escape-hatch. Keep TSX.

---

### WorkflowStudioPortal (`workflow-studio`) — ESCAPE-HATCH

**Reason**: Multi-view workflow management UI (list + create + edit + history).

- View modes: `list | create | edit | history` — internal navigation state machine
- Workflow execution status polling via `orchestrationAPI`
- Edit view is a form with conditional sections (trigger, steps, schedule)
- WorkflowBlockRenderer's `form` type is flat — does not support nested step editors

**Verdict**: Cannot be spec-driven without major extensions to WorkflowBlockRenderer.
          Register as escape-hatch permanently. Candidate for `custom-url` embedding
          of a dedicated Workflow Studio micro-frontend in a future sprint.

---

## Escape-Hatch Registry Pattern

Portals that are escape-hatched are:
1. Excluded from `PORTAL_SPECS` (no entry)
2. Retained in `PORTAL_COMPONENTS` in `portal_registry.tsx`
3. Annotated with `// @spec-escape-hatch: <reason>` adjacent to their lazy import

These portals will remain TSX-based until the portal_registry is deleted (PM-322),
at which point they need a new hosting mechanism (e.g., route-based pages, micro-frontend).
