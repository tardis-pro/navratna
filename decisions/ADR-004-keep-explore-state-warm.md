# ADR-004: Keep Explore state warm for the app session

- **Status:** Accepted
- **Date:** 2026-07-23
- **Session:** 2026-07-23-threads-chat-simplification
- **Decision driver(s):** continuity, network efficiency, user orientation

## Context

Telescope block relevance, pins, focus target, scroll, and dynamic refresh state currently live inside the `/explore` component tree and disappear on unmount.

## Decision

Lift Explore state into a typed provider mounted above the shell outlet. Navigating Home ↔ Explore preserves the catalog, relevance, pins, dynamic blocks, focused context, and scroll for the current app session; URLs restore the active mode and focused block after reload.

## Alternatives considered

- **Reset Explore on every exit** — rejected because it contradicts the persistent-workspace model and repeats API refresh work.
- **Persist everything permanently** — rejected for this phase; cross-session layout persistence is separate scope.

## Consequences

Explore lifecycle and refresh ownership move out of `TelescopeSurfacePage`. The provider needs explicit reset semantics and must not leak stale timers or listeners.
