---
title: 'MCP Extension Ecosystem — SDK, Hot-Reload, Sandbox, Revenue-Share'
date: 2026-04-17
status: design
ticket: PM-38
phase: 2
---

# MCP Extension Ecosystem

## Problem Statement

The navratna capability-registry has 2,100+ lines of MCP client/server infrastructure but no external developer story. Every new capability requires internal navratna code changes. The extension ecosystem transforms this into a platform: a bazaar where external developers build MCP servers that plug into any navratna instance, hot-reload during development, run in a sandboxed context, and earn revenue share from usage.

This is Phase 2's primary growth flywheel: every new extension increases navratna's capability surface without internal engineering investment.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     DEVELOPER EXPERIENCE                     │
│                                                              │
│  npx mcp-forge init my-ext  →  typed MCP server template   │
│  mcp-forge dev              →  hot-reload dev server        │
│  mcp-forge publish          →  extension registry           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     @uaip/mcp-forge SDK                     │
│                                                              │
│  Scaffolder · Hot-reload client · Type generator            │
│  Test harness (mock UAIP runtime)                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               CAPABILITY HOT-INJECT ENDPOINT (PM-18)        │
│                                                              │
│  POST /api/capabilities/hot-inject                          │
│  navratna-gateway capability-registry                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────┐    ┌──────────────────────────┐
│  EXTENSION SANDBOX  │    │  EXTENSION REGISTRY API  │
│                     │    │                          │
│  isolated-vm        │    │  list / install /        │
│  Resource limits    │    │  uninstall / rate        │
│  Capability grants  │    │  Version management      │
│  Network whitelist  │    │  Stripe Connect          │
└─────────────────────┘    └──────────────────────────┘
```

## Key Interfaces

See: `apps/shared/services/src/vision/mcp-extension-ecosystem/`

### MCPExtensionManifest
The `package.json`-equivalent for extensions. Declares tools, resource limits, capability grants, and pricing.

### ExtensionSandboxConfig  
Resource limits and capability grants for isolated V8 execution.

### ExtensionRegistryEntry
Metadata for marketplace listing: version, author, pricing, usage stats.

### HotReloadSession
Developer session tracking for the hot-reload dev server.

## Integration Plan

### Phase 1: SDK + Types (this ticket)
- Publish `@uaip/mcp-forge` npm package (scaffolder + type generator)
- Ship type definitions in `@uaip/types` (`MCPExtensionManifest`, `ExtensionSandboxConfig`)
- Document MCP hot-inject endpoint contract

### Phase 2: Sandbox (follow-up)
- Integrate `isolated-vm` (not `vm2` — vm2 is deprecated/vulnerable)
- Resource limit enforcement: CPU time budget, heap limit, network whitelist
- Capability grant system: explicit data store access declarations

### Phase 3: Registry + Revenue Share (follow-up)
- Extension Registry API in navratna-gateway
- Stripe Connect: extension author earns % of usage fees
- Semantic versioning, compatibility matrix, deprecation notices

### Phase 4: Widget Extensions (follow-up)
- MaterializableBlock-compatible React components from extension registry
- Sandboxed iframe for untrusted frontend code

## Docker Compose — MCP Forge Dev Server

```yaml
# docker-compose.mcp-dev.yml (to be created in project root)
services:
  mcp-forge-dev:
    image: node:20-alpine
    working_dir: /extension
    volumes:
      - ./my-extension:/extension
      - /extension/node_modules
    environment:
      - NAVRATNA_URL=http://host.docker.internal:3002
      - NAVRATNA_DEV_TOKEN=${NAVRATNA_DEV_TOKEN}
    command: npx mcp-forge dev --watch
    network_mode: host
```

## Developer Experience Target

```bash
# 10-minute developer loop
npx mcp-forge init weather-extension
cd weather-extension
# edit src/tools/getWeather.ts
npx mcp-forge dev
# → hot-reload: extension injected into local navratna in <2s
npx mcp-forge test
# → test against mock UAIP runtime
npx mcp-forge publish --registry https://extensions.navratna.io
```

## Open Questions

| # | Question | Decision Needed By |
|---|----------|-------------------|
| OQ-1 | `isolated-vm` vs Node.js worker_threads for sandbox isolation? isolated-vm preferred (true V8 isolation), but adds a native dep | Before Phase 2 |
| OQ-2 | Revenue share %: 70/30 (author/platform) or configurable per extension? | Before Phase 3 |
| OQ-3 | Should extension Widget components use iframe sandbox or React portals? iframe is safer but limits styling integration | Before Phase 4 |
| OQ-4 | Hot-inject endpoint rate limits for dev mode? Need to prevent abuse on staging | Before Phase 2 |

## Follow-Up Tickets

- `[FOLLOW-UP-A]` Implement isolated-vm sandbox for untrusted MCP server code
- `[FOLLOW-UP-B]` Extension Registry API (CRUD + versioning) in navratna-gateway
- `[FOLLOW-UP-C]` Stripe Connect revenue-share integration
- `[FOLLOW-UP-D]` Widget extension system (MaterializableBlock plugins)
- `[FOLLOW-UP-E]` MCP Forge CLI tool (npm package publishing)

## References

- `apps/backend/services/navratna-gateway/src/` (capability-registry, 2100+ lines)
- `docs/features/CAPABILITIES.md`
- PM-18 (capability hot-inject endpoint — prerequisite)
- `docs/specs/07-STRATEGIC-VISION-2026.md` Phase 2.1
