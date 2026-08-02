# ADR-001: Make HomeSurface the persistent application shell

- **Status:** Accepted
- **Date:** 2026-07-23
- **Session:** 2026-07-23-threads-chat-simplification
- **Decision driver(s):** navigation continuity, state preservation, product coherence

## Context

`HomeSurface` and `TelescopeSurfacePage` are currently sibling routes. Entering `/explore` unmounts Threads, active chat, Whisper state, selected agent, and HomeSurface event listeners. This makes Explore feel like a separate application and causes capability events to miss listeners.

## Decision

HomeSurface becomes the persistent shell for Home, Threads, Explore, and Telescope capabilities. Routes select the center workspace while compact header, ThreadDock, shell state, and contextual rail remain mounted.

## Alternatives considered

- **Keep sibling routes** — rejected because it destroys shell state and preserves the split-product experience.
- **Make Explore the default app surface** — rejected because discovery is a mode, not Home.

## Consequences

`HomeSurface.tsx` must be split into a shell layout and child workspaces. Shell-owned state moves above the child route outlet. Dedicated product/task routes remain explicit exceptions until separately migrated.
