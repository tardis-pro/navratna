FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy shared dependencies
COPY shared/ ./shared/

# Copy service-specific files
COPY services/agent-intelligence/package.json ./services/agent-intelligence/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY services/agent-intelligence/ ./services/agent-intelligence/

# Build the application
WORKDIR /app/services/agent-intelligence
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy shared dependencies
COPY shared/ ./shared/

# Copy service package.json
COPY services/agent-intelligence/package.json ./services/agent-intelligence/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application
COPY --from=base /app/services/agent-intelligence/dist ./services/agent-intelligence/dist

WORKDIR /app/services/agent-intelligence

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the service
CMD ["node", "dist/index.js"] 