# navratna-core — @uaip/navratna-core

**Port**: 3001 | **Entry**: `src/index.ts` | **Status**: ⚡ v3 Active (primary development target)

v3.0 consolidated service. Combines agent-intelligence + discussion-orchestration + artifact-service + llm-service into one process. Imports route handlers directly from sibling service `src/` directories.

## PURPOSE

Single-process replacement for 4 legacy services. All agent intelligence, real-time discussions, artifact generation, and LLM routing in one Bun process with shared memory (no inter-process event bus overhead for these domains).

## STRUCTURE

```
src/
└── index.ts     # NavratnaCoreService extends BaseService — mounts all routes + Socket.IO
```

Minimal own source. Routes are imported from:

- `../agent-intelligence/src/routes/agent.routes.ts`
- `../agent-intelligence/src/routes/constellation.routes.ts`
- `../artifact-service/src/routes/artifactRoutes.ts`
- `../artifact-service/src/routes/shortLinkRoutes.ts`
- `../llm-service/src/routes/llm.routes.ts`
- `../llm-service/src/routes/user-llm.routes.ts`

Socket.IO handler from discussion-orchestration patterns.

## WHAT IT EXPOSES

All endpoints from:

- [agent-intelligence endpoints](../agent-intelligence/AGENTS.md)
- [artifact-service endpoints](../artifact-service/AGENTS.md)
- [llm-service endpoints](../llm-service/AGENTS.md)
- Socket.IO namespaces: `/`, `/streaming`, `/conversation-intelligence`, `/coding-agent`

## AUTH

Validates tokens against `navratna-gateway` (not legacy `security-gateway`):

- `POST http://navratna-gateway:3002/api/v1/auth/validate`
- Correlation-ID pattern for Socket.IO auth (same as discussion-orchestration)

## COMMANDS

```bash
pnpm --filter @uaip/navratna-core dev     # bun --hot src/index.ts (or tsx)
pnpm --filter @uaip/navratna-core build
```

## NOTES

- Pre-existing TypeScript errors in `src/index.ts` — packages not yet built in dev. Run `pnpm build:shared` first.
- v3.0 consolidation is in-progress — `navratna-core` is the development target, not legacy services
- `enableEnterpriseEventBus: true` — compliance mode BullMQ queue (RabbitMQ removed)
- When adding new agent/discussion/artifact features, add to the **legacy service first** so navratna-core picks them up via direct import
