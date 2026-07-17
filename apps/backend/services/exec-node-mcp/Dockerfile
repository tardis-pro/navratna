# exec-node-mcp — Hybrid Execution Mesh docker-mcp node-agent.
#
# Runs on the EC2 Docker host. It shells out to the `docker` CLI against the
# HOST daemon (socket mounted at /var/run/docker.sock), so this image ships the
# docker CLI but runs NO daemon of its own.
#
# BUILD CONTEXT = repo root:
#   docker build -f apps/backend/services/exec-node-mcp/Dockerfile -t uaip/exec-node-mcp .
#
# The node-agent needs the host Docker socket AND the platform's Redis. See the
# compose snippet in this directory (compose.exec-node-mcp.yml).

FROM node:22-slim AS build
WORKDIR /app

# pnpm via corepack.
RUN corepack enable

# Workspace manifests first for cached installs.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json ./

# Shared packages the node-agent depends on (+ their manifests).
COPY apps/packages ./apps/packages
COPY apps/shared ./apps/shared
COPY apps/backend/tsconfig.json ./apps/backend/tsconfig.json
COPY apps/backend/services/tsconfig.base.json ./apps/backend/services/tsconfig.base.json
COPY apps/backend/services/exec-node-mcp ./apps/backend/services/exec-node-mcp

RUN pnpm install --filter @uaip/exec-node-mcp... --frozen-lockfile || pnpm install --filter @uaip/exec-node-mcp...

# Build shared deps then the node-agent.
RUN pnpm --filter @uaip/types build \
 && pnpm --filter @uaip/utils build \
 && pnpm --filter @uaip/config build \
 && pnpm --filter @uaip/infra build \
 && pnpm --filter @uaip/exec-node-mcp build

# ---- runtime ----
FROM node:22-slim AS runtime
WORKDIR /app

# docker CLI only (talks to the mounted host socket).
RUN apt-get update \
 && apt-get install -y --no-install-recommends docker.io ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app
WORKDIR /app/apps/backend/services/exec-node-mcp

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
