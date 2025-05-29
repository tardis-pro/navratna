# Development Setup Guide

This guide explains how to set up and run the UAIP backend services in development mode, where infrastructure services run in Docker containers and application services run locally on your machine.

## 🏗️ Architecture Overview

### Infrastructure Services (Docker)
- **PostgreSQL** - Primary database
- **Neo4j** - Graph database for relationships
- **Redis** - Caching and session storage
- **RabbitMQ** - Message queue for event-driven communication
- **Qdrant** - Vector database for embeddings
- **Prometheus** & **Grafana** - Monitoring (optional)

### Application Services (Local)
- **Agent Intelligence** (Port 3001) - Core AI agent management
- **Orchestration Pipeline** (Port 3002) - Workflow orchestration
- **Capability Registry** (Port 3003) - Service discovery and capabilities
- **Security Gateway** (Port 3004) - Authentication and authorization

## 🚀 Quick Start

### Prerequisites

1. **Docker & Docker Compose** - For infrastructure services
   ```bash
   docker --version
   docker-compose --version
   ```

2. **Node.js 18+** - For running application services
   ```bash
   node --version
   npm --version
   ```

3. **Git** - For version control
   ```bash
   git --version
   ```

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd council-of-nycea/backend
npm install
```

### 2. Set Up Environment Variables

```bash
# Generate environment variables
npm run config:dev

# Or manually export (copy from config.development.js output):
export NODE_ENV="development"
export POSTGRES_URL="postgresql://uaip_user:uaip_dev_password@localhost:5432/uaip"
export RABBITMQ_URL="amqp://uaip_user:uaip_dev_password@localhost:5672"
# ... etc
```

### 3. Start Infrastructure Services

```bash
# Start all infrastructure services
npm run infrastructure:up

# Wait for services to be ready
npm run dev:wait-infrastructure

# Check status
npm run infrastructure:status
```

### 4. Run Application Services

#### Option A: All Services at Once
```bash
npm run dev
```

#### Option B: Individual Services
```bash
# Terminal 1 - Agent Intelligence
npm run dev:local:agent

# Terminal 2 - Orchestration Pipeline
npm run dev:local:orchestration

# Terminal 3 - Capability Registry
npm run dev:local:capability

# Terminal 4 - Security Gateway
npm run dev:local:security
```

#### Option C: One-Command Setup
```bash
# This will start infrastructure, wait for readiness, then start all services
npm run dev:local
```

## 📋 Available Scripts

### Infrastructure Management
```bash
npm run infrastructure:up      # Start infrastructure services
npm run infrastructure:down    # Stop infrastructure services
npm run infrastructure:restart # Restart infrastructure services
npm run infrastructure:status  # Check container status
npm run infrastructure:logs    # View container logs
```

### Development Scripts
```bash
npm run dev                    # Start all application services
npm run dev:local              # Start infrastructure + all services
npm run dev:local:agent        # Start agent intelligence service only
npm run dev:local:orchestration # Start orchestration service only
npm run dev:local:capability   # Start capability registry service only
npm run dev:local:security     # Start security gateway service only
```

### Monitoring
```bash
npm run monitoring:up          # Start Prometheus & Grafana
npm run monitoring:down        # Stop monitoring stack
```

### Utilities
```bash
npm run dev:wait-infrastructure # Wait for infrastructure readiness
npm run config:dev             # Show development environment variables
npm run db:migrate             # Run database migrations
npm run db:seed                # Seed database with test data
```

## 🔧 Service URLs & Access

### Application Services
- **Agent Intelligence**: http://localhost:3001
- **Orchestration Pipeline**: http://localhost:3002  
- **Capability Registry**: http://localhost:3003
- **Security Gateway**: http://localhost:3004

### Infrastructure Services
- **PostgreSQL**: `localhost:5432` (user: `uaip_user`, password: `uaip_dev_password`)
- **Redis**: `localhost:6379`
- **RabbitMQ AMQP**: `localhost:5672`
- **RabbitMQ Management**: http://localhost:15672 (user: `uaip_user`, password: `uaip_dev_password`)
- **Neo4j Bolt**: `localhost:7687`
- **Neo4j Browser**: http://localhost:7474 (user: `neo4j`, password: `uaip_dev_password`)
- **Qdrant**: http://localhost:6333

### Monitoring (Optional)
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)

## 🐛 Troubleshooting

### Infrastructure Services Won't Start

1. **Check Docker is running**:
   ```bash
   docker ps
   ```

2. **Check for port conflicts**:
   ```bash
   lsof -i :5432  # PostgreSQL
   lsof -i :5672  # RabbitMQ
   lsof -i :6379  # Redis
   ```

3. **Restart infrastructure**:
   ```bash
   npm run infrastructure:restart
   ```

4. **Check container logs**:
   ```bash
   npm run infrastructure:logs
   # Or specific service:
   docker logs uaip-postgres-dev
   ```

### Application Services Issues

1. **EventBus Connection Errors**:
   - Ensure RabbitMQ is running: `docker ps | grep rabbitmq`
   - Check RabbitMQ logs: `docker logs uaip-rabbitmq-dev`
   - The services will retry connections automatically

2. **Database Connection Errors**:
   - Ensure PostgreSQL is running: `docker ps | grep postgres`
   - Test connection: `docker exec uaip-postgres-dev psql -U uaip_user -d uaip -c "SELECT 1;"`

3. **Port Already in Use**:
   - Check what's using the port: `lsof -i :3001`
   - Kill the process or change the port in environment variables

### Performance Issues

1. **Slow Docker Startup**:
   - Increase Docker memory allocation (Docker Desktop settings)
   - Consider using Docker BuildKit: `export DOCKER_BUILDKIT=1`

2. **High Memory Usage**:
   - Reduce Neo4j heap size in `docker-compose.infrastructure.yml`
   - Stop monitoring services if not needed: `npm run monitoring:down`

## 🔄 Development Workflow

### Typical Development Day

1. **Start infrastructure** (usually leave running):
   ```bash
   npm run infrastructure:up
   ```

2. **Work on specific service**:
   ```bash
   npm run dev:local:agent  # Focus on agent intelligence
   ```

3. **Test changes**:
   ```bash
   npm test
   npm run lint
   ```

4. **Stop when done**:
   ```bash
   # Ctrl+C to stop services
   npm run infrastructure:down  # If you want to stop infrastructure
   ```

### Making Changes

- **Shared code changes**: Restart all affected services
- **Service-specific changes**: Hot reload should work automatically
- **Database schema changes**: Run migrations with `npm run db:migrate`
- **Environment changes**: Restart services to pick up new variables

### Testing Event Bus

1. **Check RabbitMQ Management UI**: http://localhost:15672
2. **Monitor message flow** in the Queues tab
3. **Check service logs** for event publishing/consumption

## 📊 Monitoring Development

### Health Checks

```bash
# Check all services are healthy
curl http://localhost:3001/health  # Agent Intelligence
curl http://localhost:3002/health  # Orchestration
curl http://localhost:3003/health  # Capability Registry
curl http://localhost:3004/health  # Security Gateway
```

### Service Discovery

```bash
# Check service registration
curl http://localhost:3003/api/services  # Available services
```

### Event Monitoring

```bash
# RabbitMQ Management
open http://localhost:15672

# Check event bus health in application
curl http://localhost:3001/api/health/eventbus
```

## 🏭 Production Differences

This development setup differs from production in several ways:

- **Infrastructure**: In production, these services run in a Kubernetes cluster
- **Networking**: Production uses service mesh (Istio) for communication
- **Security**: Production has proper SSL/TLS, secrets management, and network policies
- **Scaling**: Production services auto-scale based on load
- **Monitoring**: Production has comprehensive observability with distributed tracing

## 🤝 Contributing

When contributing:

1. Test your changes with `npm test`
2. Ensure all services start correctly with `npm run dev:local`
3. Check that the event bus is working (no connection errors in logs)
4. Verify health checks pass for all services
5. Update this guide if you change the development setup

## 📚 Additional Resources

- [Monorepo Structure Guide](./MONOREPO_GUIDE.md)
- [Event Bus Documentation](./docs/event-bus.md)
- [Database Schema](./database/README.md)
- [API Documentation](./docs/api.md) 