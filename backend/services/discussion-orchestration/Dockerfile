FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy shared dependencies
COPY shared/ ./shared/

# Copy service-specific files
COPY services/discussion-orchestration/package.json ./services/discussion-orchestration/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared packages first
RUN pnpm --filter "@uaip/types" build
RUN pnpm --filter "@uaip/utils" build
RUN pnpm --filter "@uaip/config" build
RUN pnpm --filter "@uaip/shared-services" build
RUN pnpm --filter "@uaip/middleware" build

# Copy source code
COPY services/discussion-orchestration/ ./services/discussion-orchestration/

# Build the application
WORKDIR /app/services/discussion-orchestration
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

# Install pnpm and curl for health checks
RUN npm install -g pnpm && apk add --no-cache curl

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy shared dependencies
COPY shared/ ./shared/

# Copy service package.json
COPY services/discussion-orchestration/package.json ./services/discussion-orchestration/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application
COPY --from=base /app/services/discussion-orchestration/dist ./services/discussion-orchestration/dist

WORKDIR /app/services/discussion-orchestration

# Expose port
EXPOSE 3005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3005/health || exit 1

# Start the service
CMD ["node", "dist/index.js"] 