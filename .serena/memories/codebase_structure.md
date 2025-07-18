# Codebase Structure

## Monorepo Organization
This is a **TypeScript monorepo** managed with pnpm workspaces:

```
council-of-nycea/
├── apps/frontend/              # React frontend (port 5173)
├── packages/                   # Shared packages
│   ├── shared-types/          # @uaip/types - TypeScript type definitions
│   └── shared-utils/          # @uaip/utils - Utility functions
├── backend/
│   ├── services/              # 8 microservices (ports 3001-3005)
│   │   ├── agent-intelligence/
│   │   ├── capability-registry/
│   │   ├── artifact-service/
│   │   ├── security-gateway/
│   │   ├── llm-service/
│   │   ├── orchestration-pipeline/
│   │   ├── discussion-orchestration/
│   │   └── marketplace-service/
│   └── shared/                # Backend shared libraries
│       ├── services/          # @uaip/shared-services
│       ├── middleware/        # @uaip/middleware
│       ├── llm-service/       # @uaip/llm-service
│       └── config/            # @uaip/config
└── infrastructure/            # Docker, scripts, deployment configs
```

## Port Allocation
- **Frontend**: 5173 (Vite dev server)
- **API Gateway**: 8081 (centralized routing)
- **Agent Intelligence**: 3001
- **Orchestration Pipeline**: 3002
- **Capability Registry**: 3003
- **Security Gateway**: 3004
- **Discussion Orchestration**: 3005
- **PostgreSQL**: 5432
- **Neo4j**: 7474 (HTTP), 7687 (Bolt)
- **Redis**: 6379
- **RabbitMQ**: 5672
- **Qdrant**: 6333

## Import Path Aliases
- `@uaip/types` → packages/shared-types/src
- `@uaip/utils` → packages/shared-utils/src
- `@uaip/shared-services` → backend/shared/services
- `@uaip/middleware` → backend/shared/middleware
- `@uaip/llm-service` → backend/shared/llm-service
- `@uaip/config` → backend/shared/config
- `@/` → service-specific src directory