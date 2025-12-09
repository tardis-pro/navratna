# Quick Start Guide

**Get the Council of Nycea UAIP system running in 15 minutes**

## Prerequisites

- **Docker & Docker Compose** (v24.0+ recommended)
- **Node.js** (v18+ required)
- **Git** for cloning the repository
- **8GB RAM** minimum (16GB recommended for full stack)

## 🚀 Quick Setup (5 Minutes)

### 1. Clone and Install

```bash
git clone <repository-url>
cd council-of-nycea
npm install
```

### 2. Environment Setup

```bash
# Copy sample environment file
cp sample.env .env

# Edit .env with your API keys (optional for basic functionality)
nano .env
```

### 3. Start the System

```bash
# Start all services with hot reloading
./dev-start.sh

# OR start in background (daemon mode)
./dev-start.sh --daemon
```

### 4. Verify Installation

- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:8081
- **API Documentation**: http://localhost:8081/docs
- **Health Check**: http://localhost:8081/health

## 🔧 Development Mode

### Hot Reloading Development

```bash
# Start infrastructure in background
./dev-start.sh --services infrastructure --daemon

# Start backend services with hot reloading
./dev-start.sh --services backend --daemon

# Start frontend interactively to see live changes
./dev-start.sh --services frontend
```

### Service-Specific Development

```bash
# Work on a specific backend service
./dev-start.sh --services "infrastructure agent-intelligence" --daemon

# Work on frontend only
./dev-start.sh --services "infrastructure backend" --daemon
./dev-start.sh --services frontend
```

## 📋 Service Overview

### Service Groups Available

| Group            | Services                           | Ports                  | Purpose         |
| ---------------- | ---------------------------------- | ---------------------- | --------------- |
| `infrastructure` | PostgreSQL, Neo4j, Redis, RabbitMQ | 5432, 7474, 6379, 5672 | Data layer      |
| `backend`        | 5 microservices                    | 3001-3005              | Business logic  |
| `frontend`       | React app                          | 3000                   | User interface  |
| `gateway`        | API Gateway                        | 8081                   | Request routing |

### Individual Services

- **Agent Intelligence** (3001) - AI agent management and context analysis
- **Orchestration Pipeline** (3002) - Workflow coordination and operation management
- **Capability Registry** (3003) - Tool management and sandboxed execution
- **Security Gateway** (3004) - Authentication, authorization, and auditing
- **Discussion Orchestration** (3005) - Real-time collaborative discussions

## 🛠️ Common Commands

### Service Management

```bash
# View service status
./dev-start.sh status

# View logs for all services
./dev-start.sh logs

# Follow logs for specific service
./dev-start.sh logs agent-intelligence --follow

# Stop all services
./dev-start.sh stop

# Restart with rebuild
./dev-start.sh restart --rebuild
```

### Development Workflows

```bash
# Rebuild only backend (keeps databases running)
./dev-start.sh rebuild-backend

# Start specific service groups
./dev-start.sh --services "infrastructure backend" --daemon

# Force recreate all containers
./dev-start.sh restart --force-recreate
```

## 🔍 Testing Your Setup

### 1. Health Checks

```bash
# Check all services are healthy
curl http://localhost:8081/health

# Check individual service health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

### 2. Basic API Test

```bash
# Test authentication
curl -X POST http://localhost:8081/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}'

# Test agent intelligence
curl http://localhost:8081/api/agents \
  -H "Authorization: Bearer <your-token>"
```

### 3. Frontend Test

1. Open http://localhost:3000
2. Login with default credentials (admin/admin)
3. Navigate through the dashboard
4. Test real-time features (discussions, agent interactions)

## 🐛 Troubleshooting

### Services Won't Start

```bash
# Check Docker daemon is running
docker --version
docker-compose --version

# Check port conflicts
netstat -tulpn | grep :3000
netstat -tulpn | grep :8081

# Force clean restart
./dev-start.sh stop
docker system prune -f
./dev-start.sh --rebuild
```

### Database Connection Issues

```bash
# Ensure infrastructure is healthy
./dev-start.sh --services infrastructure --daemon
./dev-start.sh logs postgres --follow

# Wait for databases to be ready (30-60 seconds)
docker-compose exec postgres pg_isready
```

### Hot Reloading Not Working

```bash
# Enable polling in .env file
echo "CHOKIDAR_USEPOLLING=true" >> .env
echo "WATCHPACK_POLLING=true" >> .env

# Restart frontend service
./dev-start.sh restart --services frontend
```

### Performance Issues

```bash
# Check resource usage
docker stats

# Reduce services for development
./dev-start.sh --services "infrastructure agent-intelligence frontend" --daemon
```

## 🎯 Next Steps

### For Developers

1. **[Development Guide](DEVELOPMENT_GUIDE.md)** - Coding standards and best practices
2. **[API Reference](API_REFERENCE.md)** - Complete API documentation
3. **[Architecture](ARCHITECTURE.md)** - System design and technical details

### For Users

1. **[Persona System](PERSONA_SYSTEM.md)** - Understanding AI agents and personas
2. **[Frontend Integration](FRONTEND_INTEGRATION.md)** - Using the web interface
3. **[Capability Registry](CAPABILITY_REGISTRY.md)** - Managing tools and capabilities

### For Operators

1. **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Production deployment
2. **[Operations Manual](OPERATIONS_MANUAL.md)** - Monitoring and maintenance
3. **[Security Architecture](SECURITY_ARCHITECTURE.md)** - Security configuration

## 📞 Getting Help

### Common Issues

- **Port conflicts**: Change ports in `docker-compose.yml`
- **Memory issues**: Increase Docker memory allocation
- **Permission errors**: Check Docker daemon permissions

### Support Channels

- **Documentation**: Check the specific guide for your use case
- **GitHub Issues**: Report bugs and request features
- **Community**: Join discussions for questions and tips

---

**Success Indicator**: When you see the frontend at http://localhost:3000 and can login with admin/admin, you're ready to explore the system!
