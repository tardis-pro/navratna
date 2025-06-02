FROM node:20-alpine AS base

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ && npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./
COPY esbuild.config.js ./

# Copy shared dependencies
COPY shared/ ./shared/

# Copy all service package.json files
COPY services/orchestration-pipeline/package.json ./services/orchestration-pipeline/
COPY services/security-gateway/package.json ./services/security-gateway/
COPY services/capability-registry/package.json ./services/capability-registry/
COPY services/agent-intelligence/package.json ./services/agent-intelligence/
COPY services/discussion-orchestration/package.json ./services/discussion-orchestration/

# Install dependencies (this installs workspace dependencies properly)
RUN pnpm install --frozen-lockfile

# Copy all service source code BEFORE building
COPY services/ ./services/
RUN pnpm run build:shared
# Build all packages using the enhanced esbuild configuration
RUN pnpm build:esbuild

# Ensure discussion-orchestration is built (fallback)
RUN if [ ! -d "services/discussion-orchestration/dist" ]; then \
      echo "Building discussion-orchestration with pnpm..."; \
      cd services/discussion-orchestration && pnpm run build; \
    fi

# Production stage
FROM node:20-alpine AS production

# Install pnpm, curl for health checks, and build dependencies for native modules
# Keep build dependencies for native module rebuilding
RUN apk add --no-cache curl python3 make g++ && npm install -g pnpm

# Add non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S uaip -u 1001

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy shared dependencies (source and built)
COPY --from=base --chown=uaip:nodejs /app/shared/ ./shared/

# Copy all service package.json files
COPY services/orchestration-pipeline/package.json ./services/orchestration-pipeline/
COPY services/security-gateway/package.json ./services/security-gateway/
COPY services/capability-registry/package.json ./services/capability-registry/
COPY services/agent-intelligence/package.json ./services/agent-intelligence/
COPY services/discussion-orchestration/package.json ./services/discussion-orchestration/

# Install ALL dependencies first (including dev dependencies to ensure workspace resolution)
RUN pnpm install --frozen-lockfile

# Debug: Check if bcrypt is installed
RUN echo "=== Debugging bcrypt installation ===" && \
    find /app -name "bcrypt" -type d 2>/dev/null || echo "No bcrypt directories found" && \
    find /app -name "*bcrypt*" 2>/dev/null | head -10 || echo "No bcrypt files found" && \
    ls -la /app/node_modules/.pnpm/ | grep bcrypt || echo "No bcrypt in pnpm store" && \
    cd /app/services/security-gateway && \
    echo "Security gateway dependencies:" && \
    pnpm list bcrypt || echo "bcrypt not listed in security-gateway"

# Copy all built applications (dist directories only)
COPY --from=base --chown=uaip:nodejs /app/services/ ./services/

# Try to install bcrypt specifically in the security-gateway service
RUN cd /app/services/security-gateway && \
    echo "Installing bcrypt specifically in security-gateway..." && \
    pnpm add bcrypt@5.1.1

# Check bcrypt native binary before rebuild
RUN echo "=== Checking bcrypt native binary before rebuild ===" && \
    ls -la /app/node_modules/.pnpm/bcrypt@5.1.1/node_modules/bcrypt/lib/binding/ 2>/dev/null || echo "No binding directory found"

# Rebuild native modules for Alpine Linux architecture
# Force rebuild bcrypt specifically
RUN echo "=== Rebuilding native modules ===" && \
    cd /app/node_modules/.pnpm/bcrypt@5.1.1/node_modules/bcrypt && \
    npm rebuild --verbose && \
    echo "=== Checking bcrypt native binary after rebuild ===" && \
    ls -la lib/binding/ 2>/dev/null || echo "No binding directory after rebuild"

# Alternative: Try rebuilding from workspace root
RUN echo "=== Alternative rebuild from workspace root ===" && \
    pnpm rebuild bcrypt --verbose

# Final check of bcrypt binary
RUN echo "=== Final check of bcrypt binary ===" && \
    find /app -name "*bcrypt_lib.node" 2>/dev/null || echo "No bcrypt_lib.node found anywhere" && \
    ls -la /app/node_modules/.pnpm/bcrypt@5.1.1/node_modules/bcrypt/lib/binding/ 2>/dev/null || echo "No binding directory in final check"

# Verify bcrypt installation with more context
RUN echo "=== Final bcrypt verification ===" && \
    cd /app/services/security-gateway && \
    echo "Current directory: $(pwd)" && \
    echo "Checking bcrypt in workspace:" && \
    node -e "try { require('bcrypt'); console.log('bcrypt loaded successfully'); } catch(e) { console.error('bcrypt failed:', e.message); console.error('Module paths:', module.paths); process.exit(1); }"

# Now prune dev dependencies to reduce image size
RUN pnpm prune --prod

# Change ownership of the working directory
RUN chown -R uaip:nodejs /app

USER uaip

# Create entrypoint script
COPY --chown=uaip:nodejs <<'EOF' /app/entrypoint.sh
#!/bin/sh

# Default values
SERVICE_NAME=${SERVICE_NAME:-orchestration-pipeline}
SERVICE_PORT=${SERVICE_PORT:-3002}

# Validate service name
case "$SERVICE_NAME" in
  "orchestration-pipeline"|"security-gateway"|"capability-registry"|"agent-intelligence"|"discussion-orchestration")
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

# Expose port (will be overridden by SERVICE_PORT)
EXPOSE 3001 3002 3003 3004 3005

# Health check script that uses the SERVICE_PORT
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${SERVICE_PORT:-3002}/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"] 