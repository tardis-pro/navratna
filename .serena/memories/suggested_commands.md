# Suggested Commands

## Development Environment Setup

```bash
# Full system (takes ~2 minutes to start)
pnpm run dev

# Infrastructure only (databases, message queue)
./dev-start.sh --services infrastructure --daemon

# Backend services only
pnpm run dev:backend

# Frontend only
pnpm run dev:frontend

# Minimal development (core services only)
cd backend && pnpm run dev:minimal
```

## Build Commands

```bash
# Build everything (shared packages, backend, frontend)
pnpm run build

# Build shared packages first (required before backend)
pnpm run build:shared

# Build backend services
pnpm run build:backend

# Build frontend
pnpm run build:frontend

# Development build
pnpm run build:dev
```

## Testing Commands

```bash
# Run all tests across packages
pnpm test

# Test artifact generation system
pnpm run test:artifacts

# Test specific artifact types
pnpm run test:artifacts:prd
pnpm run test:artifacts:code

# Integration tests
pnpm run test:integration
pnpm run test:integration:setup
pnpm run test:integration:oauth
pnpm run test:integration:security
```

## Linting & Code Quality

```bash
# Lint all packages
pnpm run lint

# Auto-fix linting issues
pnpm run lint:fix

# Clean build artifacts
pnpm run clean
```

## Development Utilities

```bash
# Generate SDK
pnpm run generate:sdk

# Watch mode for SDK generation
pnpm run generate:sdk:watch

# Development script runner
./dev-start.sh --help
```

## Docker Commands

```bash
# Start infrastructure services
docker-compose up -d

# Start specific services
docker-compose up -d postgres neo4j redis

# View logs
docker-compose logs -f [service-name]
```
