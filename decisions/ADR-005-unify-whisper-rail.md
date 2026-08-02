# ADR-005: Use one contextual Whisper rail

- **Status:** Accepted
- **Date:** 2026-07-23
- **Session:** 2026-07-23-threads-chat-simplification
- **Decision driver(s):** single source of truth, progressive disclosure, responsive behavior

## Context

HomeSurface contains a hand-built right suggestion rail while Telescope has the reusable `AmbientIntelligence/WhisperLine`. Maintaining both produces inconsistent state, layout, and disclosure behavior.

## Decision

Replace the HomeSurface rail with the reusable WhisperLine and add named mini, expanded, floating, and mobile disclosure variants. It is contextual and collapsed by default.

## Alternatives considered

- **Keep both implementations** — rejected because their behavior and relevance logic will drift.
- **Remove Whisper from Home** — rejected because contextual intelligence is part of the shell's value.

## Consequences

Home-specific suggestions must adapt to the shared Whisper contract. Active panel and variant persist for the app session; relevance logic must not be duplicated.
