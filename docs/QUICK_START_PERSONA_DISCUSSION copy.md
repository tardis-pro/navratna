# Quick Start: UAIP Persona and Discussion System

## 🚀 Get Started in 5 Minutes

This guide will get you up and running with the UAIP Persona and Discussion System quickly.

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)
- pnpm (package manager)

## 1. Start the System

```bash
# Navigate to backend directory
cd backend

# Start all services
docker-compose up -d

# Wait for services to be healthy (2-3 minutes)
docker-compose ps
```

## 2. Verify Installation

Run the automated test suite:

```bash
./test-persona-discussion-system.sh
```

Expected output:
```
🚀 Starting UAIP Persona and Discussion System Tests
==================================================

🔧 Infrastructure Tests
----------------------
ℹ️  Testing database connectivity...
✅ Database connection successful
ℹ️  Testing database schema...
✅ All required tables exist
ℹ️  Found 3 personas and 1 discussions
✅ Sample personas created successfully
✅ Sample discussions created successfully

🏥 Service Health Tests
----------------------
✅ Agent Intelligence is healthy
✅ Orchestration Pipeline is healthy
✅ Capability Registry is healthy
✅ Discussion Orchestration is healthy

🎉 UAIP Persona and Discussion System is ready!
```

## 3. Access the System

### Management Interfaces

- **RabbitMQ Management**: http://localhost:15672
  - Username: `uaip_user`
  - Password: `uaip_dev_password`

- **Grafana Monitoring**: http://localhost:3000
  - Username: `admin`
  - Password: `admin`

### API Endpoints

- **API Gateway**: http://localhost:8081/api/v1/
- **Discussion Orchestration**: http://localhost:3005/
- **Agent Intelligence**: http://localhost:3001/

## 4. Test API Endpoints

### Check Service Health

```bash
# All services
curl http://localhost:3001/health  # Agent Intelligence
curl http://localhost:3002/health  # Orchestration Pipeline
curl http://localhost:3003/health  # Capability Registry
curl http://localhost:3005/health  # Discussion Orchestration

# Via API Gateway
curl http://localhost:8081/health
```

### Get Service Information

```bash
# Discussion Orchestration info
curl http://localhost:3005/api/v1/info

# Expected response:
{
  "service": "discussion-orchestration",
  "version": "1.0.0",
  "description": "UAIP Discussion Orchestration Service",
  "features": [
    "Discussion lifecycle management",
    "Multiple turn strategies",
    "Real-time WebSocket communication",
    "Event-driven architecture"
  ]
}
```

## 5. Explore the Database

### Connect to PostgreSQL

```bash
# Using psql (if installed)
psql postgresql://uaip_user:uaip_dev_password@localhost:5432/uaip

# Or using Docker
docker exec -it uaip-postgres psql -U uaip_user -d uaip
```

### Sample Queries

```sql
-- View all personas
SELECT id, name, role, status FROM personas;

-- View discussions
SELECT id, title, topic, status FROM discussions;

-- Check table structure
\d personas
\d discussions
```

## 6. Monitor Events

### RabbitMQ Queues

1. Open http://localhost:15672
2. Go to "Queues" tab
3. Look for event exchanges and queues

### Real-time Logs

```bash
# Watch all services
docker-compose logs -f

# Watch specific service
docker-compose logs -f discussion-orchestration

# Watch database logs
docker-compose logs -f postgres
```

## 7. Development Workflow

### Local Development

```bash
# Install dependencies
pnpm install

# Build shared packages
pnpm run build:shared

# Start development server (example)
cd services/discussion-orchestration
pnpm run dev
```

### Making Changes

1. **Database Changes**: Add migrations to `database/migrations/`
2. **Service Changes**: Modify services in `services/`
3. **Shared Code**: Update `shared/` packages
4. **Testing**: Run `./test-persona-discussion-system.sh`

## 8. Common Tasks

### Reset Database

```bash
# Stop services
docker-compose down

# Remove database volume
docker volume rm backend_postgres_data

# Restart (will recreate schema)
docker-compose up -d postgres
```

### View Service Logs

```bash
# All services
docker-compose logs

# Specific service with follow
docker-compose logs -f discussion-orchestration

# Last 100 lines
docker-compose logs --tail=100 postgres
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart discussion-orchestration

# Rebuild and restart
docker-compose up -d --build discussion-orchestration
```

## 9. Troubleshooting

### Services Won't Start

```bash
# Check service status
docker-compose ps

# Check logs for errors
docker-compose logs [service-name]

# Verify ports aren't in use
netstat -tulpn | grep -E ':(3001|3002|3003|3005|5432|5672|6379)'
```

### Database Connection Issues

```bash
# Test direct connection
docker exec -it uaip-postgres pg_isready -U uaip_user

# Check if database exists
docker exec -it uaip-postgres psql -U uaip_user -l
```

### Event Bus Issues

```bash
# Check RabbitMQ status
curl -u uaip_user:uaip_dev_password http://localhost:15672/api/overview

# Check exchanges
curl -u uaip_user:uaip_dev_password http://localhost:15672/api/exchanges
```

## 10. Next Steps

### Explore Features

1. **Create Personas**: Use the PersonaService API
2. **Start Discussions**: Initialize multi-agent conversations
3. **Monitor Events**: Watch real-time event flow
4. **Analyze Data**: Use the analytics views

### Development

1. **Add New Personas**: Create custom persona templates
2. **Implement Turn Strategies**: Add new discussion flow patterns
3. **Extend Analytics**: Add custom metrics and insights
4. **Build Integrations**: Connect external AI services

### Production Deployment

1. **Environment Configuration**: Set production environment variables
2. **Security Setup**: Configure authentication and authorization
3. **Monitoring**: Set up comprehensive observability
4. **Scaling**: Configure horizontal scaling

## 📚 Additional Resources

- **Full Documentation**: `PERSONA_DISCUSSION_IMPLEMENTATION.md`
- **API Documentation**: Available at service `/api/v1/info` endpoints
- **Database Schema**: See `database/migrations/` files
- **Service Architecture**: Review `shared/services/` implementations

## 🆘 Getting Help

If you encounter issues:

1. Run the test script: `./test-persona-discussion-system.sh`
2. Check service logs: `docker-compose logs [service]`
3. Verify configuration: Review environment variables
4. Check documentation: Read the full implementation guide

The system is designed to be self-healing and provides comprehensive error reporting to help diagnose issues quickly. 