# Testing Strategy

This project uses a 4-layer testing strategy to balance fast feedback with realistic system validation.

## Layer 1: Unit Tests (Vitest/Jest)

- Goal: verify deterministic logic and component behavior in isolation.
- Scope: utility functions, reducers, pure services, and UI component behavior.
- Frameworks: Vitest (frontend) and Jest where already in use.

## Layer 2: Integration Tests (Mocked Infrastructure)

- Goal: validate feature flows across modules with controlled dependencies.
- Scope: service boundaries, API adapters, orchestration logic, and persistence boundaries.
- Approach: use mocked or in-memory infrastructure for repeatable, CI-friendly runs.

## Layer 3: Cognitive Evals (Manual/CI Eval Runs)

- Goal: evaluate reasoning quality and behavior of agent workflows.
- Scope: prompt-driven behavior checks, qualitative regressions, and scenario-based assessments.
- Execution: run manually during development and periodically in CI.

## Layer 4: Simulation Tests (k6 Load Testing)

- Goal: validate system behavior under concurrency, spikes, and sustained load.
- Scope: API throughput, response time distribution, and resilience under stress.
- Tooling: k6 simulations for representative production traffic patterns.

## Run Commands

- `pnpm test`
- `pnpm test:integration`
