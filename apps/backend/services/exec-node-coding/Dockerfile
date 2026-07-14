# =============================================================================
# exec-node-coding — Fly.io sandbox image
# Multi-stage Bun/pnpm monorepo build.
# Runtime UID/GID 1001 (uaip/nodejs). Root runs only the entrypoint workspace
# ownership initializer, then immediately execs the server under tini.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: base — Bun + pinned pnpm
# ---------------------------------------------------------------------------
FROM oven/bun:1.1.43-debian AS base

# Pin pnpm to the workspace-declared version (10.12.1)
ENV PNPM_VERSION=10.12.1
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://get.pnpm.io/install.sh \
       | PNPM_VERSION="${PNPM_VERSION}" PNPM_HOME="${PNPM_HOME}" \
         ENV="/root/.bashrc" SHELL="$(command -v bash)" bash - \
    && pnpm --version \
    && ln -s /usr/local/bin/bun /usr/local/bin/node

WORKDIR /build

# ---------------------------------------------------------------------------
# Stage 2: deps — install with frozen lockfile
# ---------------------------------------------------------------------------
FROM base AS deps

# Workspace root descriptor files required for pnpm workspace resolution
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.json ./
COPY tsconfig.base.json ./
COPY nx.json ./

# Shared packages: descriptor files for dep resolution (no source yet)
COPY apps/packages/shared-types/package.json        ./apps/packages/shared-types/
COPY apps/packages/shared-types/tsconfig.json       ./apps/packages/shared-types/
COPY apps/packages/shared-types/tsconfig.build.json ./apps/packages/shared-types/
COPY apps/packages/shared-utils/package.json        ./apps/packages/shared-utils/
COPY apps/packages/shared-utils/tsconfig.json       ./apps/packages/shared-utils/
COPY apps/packages/shared-utils/tsconfig.build.json ./apps/packages/shared-utils/

# Backend workspace root
COPY apps/backend/package.json     ./apps/backend/
COPY apps/backend/tsconfig.json    ./apps/backend/

# exec-node-coding descriptors only (for dep calculation)
COPY apps/backend/services/exec-node-coding/package.json         \
     ./apps/backend/services/exec-node-coding/
COPY apps/backend/services/exec-node-coding/tsconfig.json        \
     ./apps/backend/services/exec-node-coding/
COPY apps/backend/services/exec-node-coding/tsconfig.build.json  \
     ./apps/backend/services/exec-node-coding/

RUN pnpm install --frozen-lockfile --shamefully-hoist

# ---------------------------------------------------------------------------
# Stage 3: builder — compile shared packages then the service
# ---------------------------------------------------------------------------
FROM deps AS builder

# Build @uaip/types
COPY apps/packages/shared-types/src/ ./apps/packages/shared-types/src/
RUN /build/node_modules/.bin/tsc -b /build/apps/packages/shared-types/tsconfig.build.json

# Build @uaip/utils
COPY apps/packages/shared-utils/src/ ./apps/packages/shared-utils/src/
RUN /build/node_modules/.bin/tsc -b /build/apps/packages/shared-utils/tsconfig.build.json

# Build exec-node-coding
COPY apps/backend/services/exec-node-coding/src/ \
     ./apps/backend/services/exec-node-coding/src/
RUN /build/node_modules/.bin/tsc -b /build/apps/backend/services/exec-node-coding/tsconfig.build.json

# ---------------------------------------------------------------------------
# Stage 4: runtime — minimal production image
# ---------------------------------------------------------------------------
FROM oven/bun:1.1.43-debian AS runtime

# Install runtime tools:
#   tini  — PID 1 signal reaping (exec via entrypoint)
#   git, openssh-client — coding agent operations
#   ca-certificates, curl — network tools
#   ripgrep, bash — coding agent shell utilities
# No Docker socket, no daemon.
RUN apt-get update && apt-get install -y --no-install-recommends \
      tini \
      gosu \
      nftables \
      iptables \
      git \
      openssh-client \
      ca-certificates \
      curl \
      ripgrep \
      bash \
    && rm -rf /var/lib/apt/lists/*

# Create the two non-root users. Both locked (nologin).
#   UID 1001 (uaip)   — application runtime; no network authority.
#   UID 1002 (egress) — runs the trusted CONNECT proxy + admin /phase listener.
RUN groupadd --gid 1001 nodejs \
 && useradd  --uid 1001 --gid nodejs --no-create-home --shell /usr/sbin/nologin uaip \
 && groupadd --gid 1002 egress \
 && useradd  --uid 1002 --gid egress --no-create-home --shell /usr/sbin/nologin egress

WORKDIR /app

ENV PNPM_VERSION=10.12.1
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://get.pnpm.io/install.sh \
       | PNPM_VERSION="${PNPM_VERSION}" PNPM_HOME="${PNPM_HOME}" \
         ENV="/root/.bashrc" SHELL="$(command -v bash)" bash - \
    && pnpm --version \
    && ln -s /usr/local/bin/bun /usr/local/bin/node

# Workspace descriptors for prod install
COPY --from=builder /build/pnpm-workspace.yaml ./
COPY --from=builder /build/pnpm-lock.yaml      ./
COPY --from=builder /build/package.json        ./
COPY --from=builder /build/tsconfig.json       ./
COPY --from=builder /build/tsconfig.base.json  ./

# Built @uaip/types
COPY --from=builder /build/apps/packages/shared-types/dist/        ./apps/packages/shared-types/dist/
COPY --from=builder /build/apps/packages/shared-types/package.json ./apps/packages/shared-types/
COPY --from=builder /build/apps/packages/shared-types/tsconfig.json ./apps/packages/shared-types/

# Built @uaip/utils
COPY --from=builder /build/apps/packages/shared-utils/dist/        ./apps/packages/shared-utils/dist/
COPY --from=builder /build/apps/packages/shared-utils/package.json ./apps/packages/shared-utils/
COPY --from=builder /build/apps/packages/shared-utils/tsconfig.json ./apps/packages/shared-utils/

# Built exec-node-coding service
COPY --from=builder /build/apps/backend/services/exec-node-coding/dist/    \
     ./apps/backend/services/exec-node-coding/dist/
COPY --from=builder /build/apps/backend/services/exec-node-coding/package.json \
     ./apps/backend/services/exec-node-coding/
COPY --from=builder /build/apps/backend/package.json ./apps/backend/

# Install production dependencies only (resolves workspace links)
RUN pnpm install --prod --frozen-lockfile --shamefully-hoist

# Copy entrypoint (root-executed workspace ownership initializer)
COPY apps/backend/services/exec-node-coding/entrypoint.sh /entrypoint.sh
COPY apps/backend/services/exec-node-coding/git-askpass.sh /usr/local/libexec/uaip-git-askpass
RUN chmod 0755 /entrypoint.sh \
 && chmod 0555 /usr/local/libexec/uaip-git-askpass \
 && chown root:root /usr/local/libexec/uaip-git-askpass

# Egress proxy + nft ruleset.
#   - ruleset is root-owned (0444) and applied by the entrypoint before
#     dropping to UID1001. UID1001 cannot `nft` because chmod 0710 + group
#     `nodejs` (which UID1001 is not in) means the mode for "other" is
#     deny-by-default.
#   - the proxy entrypoint ships in /usr/local/share/uaip (root-owned,
#     read-only, no execute bit beyond root) and is invoked via gosu from
#     the entrypoint script.
COPY apps/backend/services/exec-node-coding/scripts/nft-ruleset.nft /usr/local/share/uaip/nft-ruleset.nft
COPY --from=builder /build/apps/backend/services/exec-node-coding/dist/egress_bin.js /usr/local/share/uaip/egress_bin.js
COPY --from=builder /build/apps/backend/services/exec-node-coding/dist/egress/ /usr/local/share/uaip/egress/
RUN chown -R root:egress /usr/local/share/uaip \
 && find /usr/local/share/uaip -type d -exec chmod 0550 {} + \
 && find /usr/local/share/uaip -type f -exec chmod 0440 {} +

# UID1001 cannot execute nft; even a copied binary would still lack
# CAP_NET_ADMIN after gosu drops root privileges.
RUN chmod 0700 /usr/sbin/nft \
 && chown root:root /usr/sbin/nft

RUN mkdir -p /workspace /app/logs /var/log \
 && chown uaip:nodejs /workspace /app/logs \
 && chown egress:egress /var/log

ENV NODE_ENV=production
# HOST defaults to :: (all IPv6 interfaces). Production overrides to fly-local-6pn.
ENV HOST=::
ENV PORT=3009
ENV WORKSPACE_ROOT=/workspace
ENV SESSION_DIR=/workspace/.navratna/sessions

# Health check over IPv6 loopback
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD curl -sf "http://[::1]:${PORT}/healthz" >/dev/null || exit 1

EXPOSE 3009

# tini as PID 1; entrypoint fixes /workspace ownership then execs server as uid 1001
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
