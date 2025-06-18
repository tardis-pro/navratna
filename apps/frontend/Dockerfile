FROM node:20 AS development

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy root workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy shared packages
COPY packages/ ./packages/

# Copy frontend app
COPY apps/frontend/ ./apps/frontend/

# Install dependencies
RUN pnpm install

# Build shared packages
RUN pnpm build:shared

# Change to frontend directory
WORKDIR /app/apps/frontend

# Expose port
EXPOSE 5173

# Start development server with hot reloading
CMD ["pnpm", "dev", "--host", "0.0.0.0"] 