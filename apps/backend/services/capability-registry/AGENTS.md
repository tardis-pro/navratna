# capability-registry — @uaip/capability-registry

**Port**: 3003 | **Entry**: `src/index.ts` | **Status**: 🔄 Legacy (consolidating into navratna-gateway)

Tool/capability execution backbone. Tool registry, MCP protocol (client + server), OAuth capability discovery (Jira/GitHub/Slack/Confluence), sandbox execution, PostgreSQL↔Neo4j↔Qdrant sync, workspace/coding agent execution.

## STRUCTURE

```
src/
├── index.ts                     # CapabilityRegistryService extends BaseService
├── routes/
│   ├── toolRoutes.ts            # Tool CRUD + execute + search + recommendations
│   ├── mcpRoutes.ts             # MCP server management + tool discovery + streaming
│   ├── capabilityRoutes.ts      # Capability CRUD
│   ├── workspaceRoutes.ts       # Workspace/coding agent
│   └── healthRoutes.ts          # Detailed health: Neo4j/MCP/OAuth/cache/sandbox metrics
├── services/                    # 28 service files
│   ├── mcpClientService.ts      # MCP protocol client (2200+ lines)
│   ├── toolRegistryService.ts   # Core tool registry
│   ├── sandboxExecutionService.ts  # Secure execution (Firecracker micro-VM)
│   ├── toolCacheService.ts      # Redis + in-memory L2 cache
│   ├── oauthCapabilityDiscovery.ts  # Discover tools from Jira/GitHub/Slack/Confluence
│   ├── skillImportService.ts    # Seeds OpenClaw skills as capabilities on boot
│   └── integrationService.ts   # 5-second PG↔Neo4j↔Qdrant sync
├── adapters/                    # Enterprise tool adapters (Jira, Confluence, Slack)
├── skills/                      # OpenClaw skill definitions
└── __tests__/
    └── e2e/approval-flow.e2e.test.ts
```

## ENDPOINTS

| Method              | Path                            | Purpose                                              |
| ------------------- | ------------------------------- | ---------------------------------------------------- |
| GET/POST/PUT/DELETE | `/api/v1/tools`                 | Tool CRUD                                            |
| POST                | `/api/v1/tools/:id/execute`     | Execute tool in sandbox                              |
| GET                 | `/api/v1/tools/search`          | Full-text + tag search                               |
| GET                 | `/api/v1/tools/recommendations` | Neo4j graph-based recommendations                    |
| GET/POST            | `/api/v1/mcp`                   | MCP server management                                |
| GET                 | `/api/v1/mcp/tools`             | Tool discovery via MCP                               |
| GET/POST            | `/api/v1/capabilities`          | Capability CRUD                                      |
| GET/POST            | `/api/v1/workspace`             | Workspace/coding agent execution                     |
| GET                 | `/health`                       | Detailed: DB + Neo4j + MCP + OAuth + cache + sandbox |

## KEY PATTERNS

**MCP protocol** — `mcpClientService.ts` (2200+ lines):

- Auto-starts configured MCP servers on boot
- Tool discovery, invocation, streaming
- `sanitizeServerState()` strips `httpHeaders` (live API keys) before sending to clients — **NEVER** expose `httpHeaders` to clients

**Triple-store sync** — `IntegrationService` runs every 5 seconds:

```
PostgreSQL ↔ Neo4j ↔ Qdrant (UUID-consistent sync)
```

**Skill import** — `SkillImportService` seeds OpenClaw skills as capabilities on startup (idempotent via UUID check).

**Tool cache** — Redis L1 + in-memory L2; invalidated on tool mutations.

**OAuth capability discovery** — connects to Jira/GitHub/Slack/Confluence APIs and exposes their tools as registered capabilities.

## CONFIG

Service config: `enableNeo4j: true`
Uses `InfraEventBusService` (cast from `BaseService.eventBusService`).

## COMMANDS

```bash
pnpm --filter @uaip/capability-registry dev
pnpm --filter @uaip/capability-registry build
pnpm --filter @uaip/capability-registry test   # e2e test requires infra
```

## NOTES

- `toolRegistry.ts` stubs return `[]` for Neo4j-backed recommendation methods — known TODO, do not re-implement
- `@mariozechner/pi-agent-core` used for coding agent workspace execution
- v3.0 target: routes imported by `navratna-gateway`
