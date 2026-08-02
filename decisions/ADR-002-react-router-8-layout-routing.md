# ADR-002: Use React Router 8.3 declarative layout routing

- **Status:** Accepted
- **Date:** 2026-07-23
- **Session:** 2026-07-23-threads-chat-simplification
- **Decision driver(s):** persistent layout, deep links, browser history, dependency currency

## Context

The submitted v7-specific wording was rejected with the note: **“react router v8.3.0 needs to be used, ”**. Registry and workspace verification found that `react-router@8.3.0` is available, but this workspace currently resolves `react-router-dom@7.13.2`.

## Decision

Migrate to `react-router@8.3.0`, React/React DOM 19.2.7 or newer, and use declarative `BrowserRouter` + nested `<Routes>` + `<Outlet>` for `HomeShellLayout`. Use `/`, `/thread/:threadId`, `/explore`, and `/explore/:blockId` as shell child routes.

## Alternatives considered

- **Remain on React Router 7.13.2** — rejected by the submitted version requirement.
- **Query-param overlay** — rejected because it duplicates routing semantics and weakens capability deep links.
- **Local state toggle** — rejected because reload and Back/Forward cannot restore the workspace.
- **Switch to `createBrowserRouter`** — rejected for now because loaders/actions are not required.

## Consequences

`react-router-dom` imports in nine frontend files migrate to `react-router`; Router 8 is ESM-only and requires Node 22.22.0+ (the current Node 22.22.1 qualifies). React class error-boundary wrappers must isolate child workspaces because declarative routes do not honor data-router `errorElement`. Inner scroll restoration remains shell-owned.
