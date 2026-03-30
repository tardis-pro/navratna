FROM oven/bun:1 AS base

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://get.pnpm.io/install.sh | PNPM_HOME=/usr/local/bin ENV="$HOME/.shrc" SHELL="$(which sh)" sh -

WORKDIR /app

# ── Workspace manifests ──────────────────────────────────────────────────────
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.json ./
COPY tsconfig.base.json ./
COPY nx.json ./

# ── Shared packages ──────────────────────────────────────────────────────────
COPY apps/packages/ ./apps/packages/
COPY apps/shared/   ./apps/shared/

# ── Backend service manifests (install before copying source) ─────────────────
COPY apps/backend/package.json  ./apps/backend/
COPY apps/backend/tsconfig.json ./apps/backend/
COPY apps/backend/services/navratna-core/package.json        ./apps/backend/services/navratna-core/
COPY apps/backend/services/navratna-gateway/package.json     ./apps/backend/services/navratna-gateway/
COPY apps/backend/services/agent-intelligence/package.json   ./apps/backend/services/agent-intelligence/
COPY apps/backend/services/discussion-orchestration/package.json ./apps/backend/services/discussion-orchestration/
COPY apps/backend/services/artifact-service/package.json     ./apps/backend/services/artifact-service/
COPY apps/backend/services/llm-service/package.json          ./apps/backend/services/llm-service/
COPY apps/backend/services/security-gateway/package.json     ./apps/backend/services/security-gateway/
COPY apps/backend/services/orchestration-pipeline/package.json ./apps/backend/services/orchestration-pipeline/
COPY apps/backend/services/capability-registry/package.json  ./apps/backend/services/capability-registry/

RUN pnpm install --frozen-lockfile

# ── Build shared packages (NX resolves dep order) ────────────────────────────
RUN pnpm nx run-many -t build --projects=@uaip/types,@uaip/utils,@uaip/contracts,@uaip/config,@uaip/infra,@uaip/middleware,@uaip/shared-services,@uaip/llm-service

# ── Copy all service sources (v3 services import from legacy sibling src/) ───
COPY apps/backend/services/navratna-core/src/                ./apps/backend/services/navratna-core/src/
COPY apps/backend/services/navratna-core/tsconfig.json       ./apps/backend/services/navratna-core/
COPY apps/backend/services/navratna-gateway/src/             ./apps/backend/services/navratna-gateway/src/
COPY apps/backend/services/navratna-gateway/tsconfig.json    ./apps/backend/services/navratna-gateway/
COPY apps/backend/services/agent-intelligence/src/              ./apps/backend/services/agent-intelligence/src/
COPY apps/backend/services/agent-intelligence/tsconfig.json     ./apps/backend/services/agent-intelligence/
COPY apps/backend/services/discussion-orchestration/src/        ./apps/backend/services/discussion-orchestration/src/
COPY apps/backend/services/discussion-orchestration/tsconfig.json ./apps/backend/services/discussion-orchestration/
COPY apps/backend/services/artifact-service/src/                ./apps/backend/services/artifact-service/src/
COPY apps/backend/services/artifact-service/tsconfig.json       ./apps/backend/services/artifact-service/
COPY apps/backend/services/llm-service/src/                     ./apps/backend/services/llm-service/src/
COPY apps/backend/services/llm-service/tsconfig.json            ./apps/backend/services/llm-service/
COPY apps/backend/services/security-gateway/src/                ./apps/backend/services/security-gateway/src/
COPY apps/backend/services/security-gateway/tsconfig.json       ./apps/backend/services/security-gateway/
COPY apps/backend/services/orchestration-pipeline/src/          ./apps/backend/services/orchestration-pipeline/src/
COPY apps/backend/services/orchestration-pipeline/tsconfig.json ./apps/backend/services/orchestration-pipeline/
COPY apps/backend/services/capability-registry/src/             ./apps/backend/services/capability-registry/src/
COPY apps/backend/services/capability-registry/tsconfig.json    ./apps/backend/services/capability-registry/

# ── Build services ────────────────────────────────────────────────────────────
RUN pnpm nx run-many -t build --projects=@uaip/agent-intelligence,@uaip/discussion-orchestration,@uaip/artifact-service,@uaip/llm-service-api,@uaip/security-gateway,@uaip/orchestration-pipeline,@uaip/capability-registry,@uaip/navratna-core,@uaip/navratna-gateway

RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --no-create-home uaip && \
    chown -R uaip:nodejs /app

USER uaip

EXPOSE 3001 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${SERVICE_PORT:-3001}/health || exit 1

CMD ["bun", "run", "apps/backend/services/navratna-core/dist/index.js"]
