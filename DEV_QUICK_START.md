# Council of Nycea - Development Quick Start Guide

## Enhanced Development Script

The `dev-start.sh` script has been completely rewritten to provide better control over the development environment with proper hot reloading, daemon mode, and selective service management.

## Key Features

- ✅ **True Hot Reloading**: Source code changes are automatically reflected without container restarts
- ✅ **Daemon Mode**: Run services in background for development
- ✅ **Selective Service Management**: Start/stop/restart specific service groups
- ✅ **Backend-Only Rebuild**: Rebuild only backend services without affecting databases
- ✅ **Enhanced Logging**: Colorized output with proper status indicators
- ✅ **Service Health Monitoring**: Wait for services to be healthy before proceeding

## Quick Commands

### Basic Usage
```bash
# Start all services interactively (with hot reloading)
./dev-start.sh

# Start all services in daemon mode (background)
./dev-start.sh --daemon

# Start only backend services in daemon mode
./dev-start.sh --services backend --daemon

# Start only infrastructure (databases, etc.)
./dev-start.sh --services infrastructure --daemon
```

### Service Management
```bash
# Stop all services
./dev-start.sh stop

# Stop only backend services
./dev-start.sh stop --services backend

# Restart frontend with rebuild
./dev-start.sh restart --services frontend --rebuild

# Rebuild only backend services (without stopping databases)
./dev-start.sh rebuild-backend
```

### Development Workflow
```bash
# Start infrastructure in daemon mode
./dev-start.sh --services infrastructure --daemon

# Start backend services for development
./dev-start.sh --services backend --daemon

# Start frontend interactively to see live changes
./dev-start.sh --services frontend

# Or start everything in daemon mode and follow logs
./dev-start.sh --daemon
./dev-start.sh logs agent-intelligence --follow
```

### Logging and Monitoring
```bash
# View status of all services
./dev-start.sh status

# View logs for all services
./dev-start.sh logs

# Follow logs for specific service
./dev-start.sh logs agent-intelligence --follow

# View logs for service group
./dev-start.sh logs --services backend
```

## Service Groups

| Group | Services | Purpose |
|-------|----------|---------|
| `infrastructure` | postgres, neo4j, redis, qdrant, rabbitmq | Core data services |
| `backend` | agent-intelligence, orchestration-pipeline, capability-registry, security-gateway, discussion-orchestration, artifact-service, llm-service | Backend microservices |
| `frontend` | frontend | React frontend with Vite |
| `monitoring` | prometheus, grafana | Monitoring stack |
| `gateway` | api-gateway | Nginx reverse proxy |
| `all` | All of the above | Complete environment |

## Hot Reloading Details

### Backend Services
- **File Watching**: Monitors `src/`, `backend/shared/`, and `packages/` directories
- **Auto Restart**: Uses nodemon with tsx for TypeScript execution
- **Shared Package Builds**: Automatically rebuilds shared packages when changed
- **Volume Mounts**: Source code is mounted for immediate reflection

### Frontend Service
- **Vite HMR**: Full Hot Module Replacement support
- **File Watching**: Monitors all source files and dependencies
- **Polling**: Enabled for file systems that don't support native watching
- **Volume Mounts**: Source and config files mounted for immediate updates

## Development Workflow Examples

### Full Stack Development
```bash
# Start everything in daemon mode
./dev-start.sh --daemon

# Work on your code with hot reloading active
# View logs when needed
./dev-start.sh logs frontend --follow

# Rebuild backend when needed (keeps databases running)
./dev-start.sh rebuild-backend
```

### Backend-Only Development
```bash
# Start infrastructure
./dev-start.sh --services infrastructure --daemon

# Start specific backend service interactively
./dev-start.sh --services agent-intelligence

# Or start all backend services in daemon mode
./dev-start.sh --services backend --daemon
./dev-start.sh logs --follow
```

### Frontend-Only Development
```bash
# Start infrastructure and backend in daemon mode
./dev-start.sh --services "infrastructure backend" --daemon

# Start frontend interactively to see changes
./dev-start.sh --services frontend
```

## Troubleshooting

### Hot Reloading Not Working
1. Check if polling is enabled in `.env`:
   ```
   CHOKIDAR_USEPOLLING=true
   WATCHPACK_POLLING=true
   ```

2. Verify volume mounts in `docker-compose.yml`

3. Check service logs:
   ```bash
   ./dev-start.sh logs [service-name] --follow
   ```

### Services Not Starting
1. Check service status:
   ```bash
   ./dev-start.sh status
   ```

2. View service logs:
   ```bash
   ./dev-start.sh logs [service-name]
   ```

3. Force recreate containers:
   ```bash
   ./dev-start.sh restart --force-recreate
   ```

### Database Connection Issues
1. Ensure infrastructure is running:
   ```bash
   ./dev-start.sh --services infrastructure --daemon
   ```

2. Wait for health checks to pass before starting dependent services

### Build Issues
1. Rebuild with clean slate:
   ```bash
   ./dev-start.sh stop
   docker system prune -f
   ./dev-start.sh --rebuild
   ```

## Environment Variables

The script automatically creates a `.env` file with these defaults:

```env
# Development Environment Variables
NODE_ENV=development

# LLM Service Configuration
OPENAI_API_KEY=your-openai-key-here
ANTHROPIC_API_KEY=your-anthropic-key-here
OLLAMA_URL=http://localhost:11434
LLM_STUDIO_URL=http://localhost:1234
LLM_PROVIDER_ENCRYPTION_KEY=dev-encryption-key-change-in-production

# Development URLs
VITE_API_URL=http://localhost:8081

# Hot Reloading Configuration
CHOKIDAR_USEPOLLING=true
WATCHPACK_POLLING=true
```

## Service URLs

Once services are running, access them at:

- **Frontend**: http://localhost:8081
- **API Gateway**: http://localhost:8081/api
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **RabbitMQ**: http://localhost:15672 (uaip_user/uaip_password)
- **Neo4j**: http://localhost:7474 (neo4j/uaip_dev_password)

Individual backend services run on ports 3001-3007. 