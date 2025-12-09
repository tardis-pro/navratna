# Development Guide

## System Requirements

- Node.js >= 20.x
- Docker & Docker Compose (20.10+ / 2.0+)
- pnpm >= 8.0 (recommended)
- Git

## Local Development Setup

### 1. Clone and Install

```bash
# Clone repository
git clone <repository-url>
cd council-of-nycea

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
pnpm install
```

### 2. Environment Setup

```bash
# Backend environment setup
cd backend
cp .env.example .env

# Core environment variables (auto-configured for development)
NODE_ENV=development
POSTGRES_URL=postgresql://uaip_user:uaip_dev_password@localhost:5432/uaip
RABBITMQ_URL=amqp://uaip_user:uaip_dev_password@localhost:5672
REDIS_URL=redis://localhost:6379
NEO4J_URI=bolt://localhost:7687
JWT_SECRET=your-secret-key
```

### 3. Development Server Options

#### Option A: Full Stack Development

```bash
# Terminal 1: Start all infrastructure services
docker-compose up -d

# Wait for services (2-3 minutes)
./scripts/test-system-health.sh

# Terminal 2: Start backend services
npm run dev:backend

# Terminal 3: Start frontend
npm run dev:frontend
```

#### Option B: Backend-Only Development

```bash
# Start required infrastructure
docker-compose up -d postgres neo4j redis rabbitmq

# Start backend services
npm run dev:backend

# Verify endpoints
curl http://localhost:8081/health  # API Gateway
curl http://localhost:3001/health  # Agent Intelligence
curl http://localhost:3002/health  # Orchestration Pipeline
```

#### Option C: Frontend-Only Development

```bash
# Start with mock data (no backend required)
npm run dev:frontend
# Check console for "Backend Offline - Using Mock Data"
```

## Service Management

### Infrastructure Services

```bash
# Basic Docker commands
docker-compose up -d              # Start all services
docker-compose down               # Stop all services
docker-compose restart           # Restart all services
docker-compose ps                # Check service status
docker-compose logs -f           # View all logs

# Individual service management
docker-compose up -d postgres     # Start specific service
docker-compose logs -f neo4j     # View specific logs
```

### Backend Services

```bash
# Start all backend services
npm run dev:backend

# Start individual services
cd services/agent-intelligence && npm run dev
cd services/orchestration-pipeline && npm run dev
cd services/capability-registry && npm run dev
cd services/security-gateway && npm run dev
cd services/discussion-orchestration && npm run dev
```

### Database Operations

```bash
# PostgreSQL CLI access
docker exec -it uaip-postgres psql -U uaip_user -d uaip

# Neo4j browser access
http://localhost:7474 (neo4j/uaip_dev_password)

# Redis CLI
docker exec -it uaip-redis redis-cli
```

## Service URLs

### Core Services

- Frontend: http://localhost:3000
- API Gateway: http://localhost:8081
- API Documentation: http://localhost:8081/docs

### Backend Services

- Agent Intelligence: http://localhost:3001
- Orchestration Pipeline: http://localhost:3002
- Capability Registry: http://localhost:3003
- Security Gateway: http://localhost:3004
- Discussion Orchestration: http://localhost:3005

### Infrastructure

- PostgreSQL: localhost:5432
- Neo4j Browser: http://localhost:7474
- RabbitMQ Management: http://localhost:15672
- Redis: localhost:6379
- Monitoring Dashboard: http://localhost:3000

## Troubleshooting

### Common Issues

#### Services Won't Start

```bash
# Check Docker status
docker-compose ps
docker-compose logs -f

# Check for port conflicts
lsof -i :3001-3005
lsof -i :5432

# Restart services
docker-compose down
docker-compose up -d
```

#### Database Connection Issues

```bash
# Test PostgreSQL
docker exec -it uaip-postgres pg_isready -U uaip_user

# Test Neo4j
docker exec -it uaip-neo4j cypher-shell -u neo4j -p uaip_dev_password

# Check logs
docker-compose logs postgres
docker-compose logs neo4j
```

#### Hot Reloading Issues

1. Check polling configuration in `.env`:

```
CHOKIDAR_USEPOLLING=true
WATCHPACK_POLLING=true
```

2. Verify volume mounts in `docker-compose.yml`

3. Check service logs:

```bash
docker-compose logs -f [service-name]
```

## Development Best Practices

### Code Structure

```
src/
├── config/             # Configuration
├── controllers/        # Route handlers
├── routes/            # API routes
├── services/          # Business logic
│   ├── toolRegistry/  # Tool management
│   ├── executor/      # Execution engine
│   └── discovery/     # Tool discovery
├── models/            # Database models
└── types/             # TypeScript types
```

### TypeScript Guidelines

- Use strict mode
- Prefer interfaces over types
- Always use explicit return types
- Proper error handling with custom error classes

### Testing Requirements

- Unit tests for individual components
- Integration tests for service interactions
- End-to-end tests for complete workflows
- Performance benchmarks for critical paths

## Additional Resources

- [Architecture Documentation](ARCHITECTURE.md)
- [API Reference](API_REFERENCE.md)
- [Security Guide](../technical/SECURITY.md)
- [Testing Guide](../technical/TESTING.md)
- [Contributing Guide](../project/CONTRIBUTING.md)
