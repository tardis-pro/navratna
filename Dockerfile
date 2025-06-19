FROM node:22 AS base

# Install build dependencies for native modules
RUN npm install -g pnpm typescript

# Set working directory and create user first
WORKDIR /app
RUN addgroup -gid 1001 nodejs && \
    adduser -u 1001 -ingroup nodejs -disabled-login uaip

# Copy root workspace configuration files as root first
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy shared packages (monorepo-wide)
COPY packages/ ./packages/

# Copy backend configuration and code
COPY backend/package.json ./backend/
COPY backend/pnpm-workspace.yaml ./backend/
COPY backend/pnpm-lock.yaml ./backend/
COPY backend/tsconfig.json ./backend/
COPY backend/tsconfig.build.json ./backend/
COPY backend/tsconfig.build_shared.json ./backend/
COPY backend/esbuild.config.js ./backend/
COPY backend/.env ./backend/

# Copy backend shared dependencies and services
COPY backend/shared/ ./backend/shared/
COPY backend/services/ ./backend/services/

# Now change ownership of everything to uaip user
RUN chown -R uaip:nodejs /app

# Switch to uaip user for the rest of the build
USER uaip

RUN echo "Checking workspace packages..." && \
    find . -name "package.json" && \
    echo "Root workspace file:" && cat pnpm-workspace.yaml && \
    echo "Backend workspace file:" && cat backend/pnpm-workspace.yaml

# Install dependencies (this installs workspace dependencies properly)
RUN pnpm install

# Build shared packages first (monorepo-wide)
RUN pnpm build:shared

# Build backend services
RUN cd backend && pnpm clean && pnpm build-shared && pnpm build-services

# Create entrypoint script
USER root
COPY --chown=uaip:nodejs <<'EOF' /app/entrypoint.sh
#!/bin/sh

# Default values
SERVICE_NAME=${SERVICE_NAME:-orchestration-pipeline}
SERVICE_PORT=${SERVICE_PORT:-3002}

# Validate service name
case "$SERVICE_NAME" in
  "artifact-service"|"orchestration-pipeline"|"security-gateway"|"capability-registry"|"agent-intelligence"|"discussion-orchestration"|"llm-service")
    echo "Starting service: $SERVICE_NAME on port: $SERVICE_PORT"
    ;;
  *)
    echo "Error: Invalid SERVICE_NAME. Must be one of: orchestration-pipeline, security-gateway, capability-registry, agent-intelligence, discussion-orchestration, artifact-service, llm-service"
    exit 1
    ;;
esac

# Change to service directory
cd "/app/backend/services/$SERVICE_NAME"

# Check if dist directory exists
if [ ! -d "dist" ]; then
  echo "Error: dist directory not found for service $SERVICE_NAME"
  echo "Available files in service directory:"
  ls -la .
  echo "Available services:"
  ls -la /app/backend/services/
  exit 1
fi

# Check if main entry file exists
if [ ! -f "dist/index.js" ]; then
  echo "Error: dist/index.js not found for service $SERVICE_NAME"
  echo "Available files in dist directory:"
  ls -la dist/
  exit 1
fi

# Start the service
exec node dist/index.js
EOF

RUN chmod +x /app/entrypoint.sh

# Switch back to uaip user for runtime
USER uaip

# Expose port (will be overridden by SERVICE_PORT)
EXPOSE 3001 3002 3003 3004 3005 3006 3007

# Health check script that uses the SERVICE_PORT
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${SERVICE_PORT:-3002}/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"] 