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
COPY services/capability-registry/package.json ./services/capability-registry/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared packages first
RUN pnpm --filter "@uaip/types" build
RUN pnpm --filter "@uaip/utils" build
RUN pnpm --filter "@uaip/config" build
RUN pnpm --filter "@uaip/shared-services" build
RUN pnpm --filter "@uaip/middleware" build

# Copy source code
COPY services/capability-registry/ ./services/capability-registry/

# Build the application
WORKDIR /app/services/capability-registry
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

# Install pnpm
RUN npm install -g pnpm

# Add non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S capability -u 1001

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy shared dependencies
COPY shared/ ./shared/

# Copy service package.json
COPY services/capability-registry/package.json ./services/capability-registry/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application and change ownership
COPY --from=base --chown=capability:nodejs /app/services/capability-registry/dist ./services/capability-registry/dist

# Change to service directory
WORKDIR /app/services/capability-registry

# Change ownership of the working directory
RUN chown -R capability:nodejs /app

USER capability

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/index.js"] 