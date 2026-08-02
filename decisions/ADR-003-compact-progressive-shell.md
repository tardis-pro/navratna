# ADR-003: Use a compact shell with progressive disclosure

- **Status:** Accepted
- **Date:** 2026-07-23
- **Session:** 2026-07-23-threads-chat-simplification
- **Decision driver(s):** cognitive load, workspace density, responsive usability

## Context

Agent Chat currently renders an animated header, peer-level Discuss/Clear/Float controls, agent selector, capabilities panel, transcript, warning banner, and composer as competing framed regions. Persistent shell chrome would worsen this unless its hierarchy is reduced.

## Decision

Keep only a compact global header, ThreadDock, center workspace, and contextual rail persistently available. Agent capabilities, Clear, Float, settings, tools, and secondary portals remain reachable through popovers, menus, Sheets, Drawers, or focused capability workspaces.

## Alternatives considered

- **Always-expanded controls** — rejected because they reduce center space and repeat the current clutter.
- **Remove secondary capabilities** — rejected because simplification must preserve functionality.

## Consequences

Rare actions take one additional interaction. Every disclosed capability must retain an accessible name, keyboard path, focus return, and mobile equivalent.
