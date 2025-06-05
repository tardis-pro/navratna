FROM node:24 AS base

# Install build dependencies for native modules
RUN npm install -g pnpm

# Set working directory and create user first
WORKDIR /app
RUN addgroup -gid 1001 nodejs && \
    adduser -u 1001 -ingroup nodejs -disabled-login uaip

# Copy workspace configuration files as root first
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY tsconfig.build_shared.json ./
COPY esbuild.config.js ./
COPY .env ./

# Copy shared dependencies and all package.json files as root
COPY shared/ ./shared/
COPY services/ ./services/

# Now change ownership of everything to uaip user
RUN chown -R uaip:nodejs /app

# Switch to uaip user for the rest of the build
USER uaip

RUN echo "Checking workspace packages..." && \
    find . -name "package.json" && \
    echo "Workspace file:" && cat pnpm-workspace.yaml

# Install dependencies (this installs workspace dependencies properly)
RUN pnpm install

# Clean and build
RUN pnpm clean
RUN pnpm build-shared 
RUN pnpm build-services

# Create entrypoint script
USER root
COPY --chown=uaip:nodejs <<'EOF' /app/entrypoint.sh
#!/bin/sh

# Default values
SERVICE_NAME=${SERVICE_NAME:-orchestration-pipeline}
SERVICE_PORT=${SERVICE_PORT:-3002}

# Validate service name
case "$SERVICE_NAME" in
  "artifact-service"|"orchestration-pipeline"|"security-gateway"|"capability-registry"|"agent-intelligence"|"discussion-orchestration")
    echo "Starting service: $SERVICE_NAME on port: $SERVICE_PORT"
    ;;
  *)
    echo "Error: Invalid SERVICE_NAME. Must be one of: orchestration-pipeline, security-gateway, capability-registry, agent-intelligence, discussion-orchestration"
    exit 1
    ;;
esac

# Change to service directory
cd "/app/services/$SERVICE_NAME"

# Check if dist directory exists
if [ ! -d "dist" ]; then
  echo "Error: dist directory not found for service $SERVICE_NAME"
  echo "Available files in service directory:"
  ls -la .
  echo "Available services:"
  ls -la /app/services/
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
EXPOSE 3001 3002 3003 3004 3005

# Health check script that uses the SERVICE_PORT
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${SERVICE_PORT:-3002}/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"] 