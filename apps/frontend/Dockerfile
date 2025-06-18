FROM node:20 AS development

# Install pnpm globally
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -gid 1001 nodejs && \
    adduser -u 1001 -ingroup nodejs -disabled-login frontend

# Copy root workspace files first (as root)
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy shared packages
COPY packages/ ./packages/

# Copy frontend app
COPY apps/frontend/ ./apps/frontend/

# Change ownership to frontend user
RUN chown -R frontend:nodejs /app

# Switch to frontend user
USER frontend

# Install all dependencies (this will install workspace dependencies)
RUN echo "Installing dependencies..." && \
    pnpm install --frozen-lockfile

# Build shared packages first (required for frontend)
RUN echo "Building shared packages..." && \
    pnpm build:shared

# Verify shared packages are built correctly
RUN echo "Verifying shared packages..." && \
    ls -la packages/shared-types/dist/ && \
    ls -la packages/shared-utils/dist/ && \
    echo "Shared packages verification complete"

# Change to frontend directory
WORKDIR /app/apps/frontend

# Verify frontend dependencies
RUN echo "Verifying frontend setup..." && \
    ls -la package.json && \
    ls -la src/main.tsx && \
    ls -la index.html && \
    echo "Frontend verification complete"

# Expose port
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:5173 || exit 1

# Start development server with hot reloading
CMD ["sh", "-c", "echo 'Starting frontend development server...' && pnpm dev --host 0.0.0.0 --port 5173"] 