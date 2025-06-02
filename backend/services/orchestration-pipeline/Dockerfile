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
COPY services/orchestration-pipeline/package.json ./services/orchestration-pipeline/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared packages first in correct dependency order
RUN pnpm --filter "@uaip/types" build
RUN pnpm --filter "@uaip/utils" build  
RUN pnpm --filter "@uaip/config" build
RUN pnpm --filter "@uaip/shared-services" build
RUN pnpm --filter "@uaip/middleware" build

# Copy source code
COPY services/orchestration-pipeline/ ./services/orchestration-pipeline/

# Build the application
WORKDIR /app/services/orchestration-pipeline
RUN pnpm build

# Production stage
FROM node:18-alpine AS production

# Install pnpm
RUN npm install -g pnpm

# Add non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S orchestration -u 1001

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy shared dependencies
COPY shared/ ./shared/

# Copy service package.json
COPY services/orchestration-pipeline/package.json ./services/orchestration-pipeline/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application and change ownership
COPY --from=base --chown=orchestration:nodejs /app/services/orchestration-pipeline/dist ./services/orchestration-pipeline/dist

# Change to service directory
WORKDIR /app/services/orchestration-pipeline

# Change ownership of the working directory
RUN chown -R orchestration:nodejs /app

USER orchestration

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/index.js"] 