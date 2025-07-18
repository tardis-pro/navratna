# Task Completion Checklist

## Before Committing Code

### 1. Build Verification
```bash
# Always build shared packages first
pnpm run build:shared

# Then build backend services
pnpm run build:backend

# Finally build frontend
pnpm run build:frontend

# Or build everything at once
pnpm run build
```

### 2. Code Quality Checks
```bash
# Run linting across all packages
pnpm run lint

# Auto-fix linting issues
pnpm run lint:fix
```

### 3. Testing (Limited Coverage Currently)
```bash
# Run available tests
pnpm test

# Test specific functionality
pnpm run test:artifacts  # For artifact generation
```

### 4. Integration Testing
```bash
# Run integration tests if available
pnpm run test:integration
```

## Development Workflow

### 1. Start Development Environment
```bash
# Full system with hot reloading
pnpm run dev

# Or start services individually
pnpm run dev:backend
pnpm run dev:frontend
```

### 2. Access Points
- **Frontend**: http://localhost:5173
- **API Gateway**: http://localhost:8081
- **Health Checks**: http://localhost:8081/health
- **API Documentation**: http://localhost:8081/docs

### 3. Database Access
- **PostgreSQL**: localhost:5432 (user: uaip_user, db: uaip)
- **Neo4j**: localhost:7474 (user: neo4j, pass: uaip_dev_password)
- **Redis**: localhost:6379

## Pre-Deployment Checks
- [ ] All services build successfully
- [ ] No TypeScript compilation errors
- [ ] ESLint passes without errors
- [ ] Integration tests pass (if available)
- [ ] Docker containers start successfully
- [ ] Database migrations applied
- [ ] Environment variables configured

## Known Issues to Check
- **Path Imports**: Ensure using `@uaip/*` aliases, not relative paths
- **Build Order**: Shared packages must build before backend services
- **Port Conflicts**: Check ports 3001-3005, 5173, 8081, 5432, 7474, 6379
- **Memory Usage**: System requires minimum 8GB RAM (16GB recommended)