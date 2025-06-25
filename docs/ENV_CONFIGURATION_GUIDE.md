# Environment Configuration Guide

This guide provides comprehensive documentation for all environment variables used in the Council of Nycea backend system.

## Quick Start

1. Copy `sample.env` to `.env` in the root directory
2. Modify values as needed for your environment
3. Ensure all required variables are set before starting services

## Configuration Categories

### Core Application Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Application environment (development/production/test) |
| `SERVICE_NAME` | `shared-service` | Service identifier for logging and monitoring |
| `SERVICE_VERSION` | `1.0.0` | Service version for tracking |
| `PORT` | `3000` | Default port (overridden per service) |

### Database Configuration

#### PostgreSQL
Configure using either URL or individual parameters:

**Option 1: Connection URL**
```bash
POSTGRES_URL=postgresql://uaip_user:uaip_password@localhost:5432/uaip
```

**Option 2: Individual Parameters**
```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=uaip_user
POSTGRES_PASSWORD=uaip_password
POSTGRES_DB=uaip
```

**Additional PostgreSQL Settings**
- `DB_SSL=false` - Enable SSL connection
- `DB_MAX_CONNECTIONS=20` - Maximum connection pool size
- `DB_TIMEOUT=30000` - Query timeout in milliseconds

#### Neo4j Graph Database
Configure using either URL or individual parameters:

**Option 1: Connection URL**
```bash
NEO4J_URL=bolt://neo4j:uaip_dev_password@localhost:7687
```

**Option 2: Individual Parameters**
```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=uaip_dev_password
NEO4J_DATABASE=neo4j
```

#### Qdrant Vector Database
```bash
QDRANT_URL=http://localhost:6333  # Auto-detects Docker environment
QDRANT_COLLECTION_NAME=knowledge_embeddings
```

### Redis Configuration

Configure using either URL or individual parameters:

**Option 1: Connection URL**
```bash
REDIS_URL=redis://:uaip_redis_password@localhost:6379/0
```

**Option 2: Individual Parameters**
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=uaip_redis_password
REDIS_DB=0
```

**Redis Performance Settings**
- `REDIS_MAX_RETRIES=3` - Maximum retry attempts
- `REDIS_RETRY_DELAY=100` - Retry delay in milliseconds
- `REDIS_OFFLINE_QUEUE=true` - Enable offline command queuing

### TypeORM Specific Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `TYPEORM_SYNC=false` | `false` | Auto-sync database schema (development only) |
| `TYPEORM_LOGGING=false` | `false` | Enable SQL query logging |
| `TYPEORM_DISABLE_CACHE=false` | `false` | Disable Redis query cache |
| `TYPEORM_MIGRATIONS_RUN=true` | `true` | Auto-run migrations on startup |

### Service Ports & URLs

Each service can be configured with custom ports and URLs:

```bash
# Agent Intelligence Service
AGENT_INTELLIGENCE_PORT=3001
AGENT_INTELLIGENCE_URL=http://localhost:3001

# Orchestration Pipeline Service
ORCHESTRATION_PIPELINE_PORT=3002
ORCHESTRATION_PIPELINE_URL=http://localhost:3002

# Capability Registry Service
CAPABILITY_REGISTRY_PORT=3003
CAPABILITY_REGISTRY_URL=http://localhost:3003

# Security Gateway Service
SECURITY_GATEWAY_PORT=3004
SECURITY_GATEWAY_URL=http://localhost:3004

# Discussion Orchestration Service
DISCUSSION_ORCHESTRATION_PORT=3005
DISCUSSION_ORCHESTRATION_URL=http://localhost:3005

# Artifact Service
ARTIFACT_SERVICE_PORT=3006
ARTIFACT_SERVICE_URL=http://localhost:3006

# LLM Service
LLM_SERVICE_PORT=3007
LLM_SERVICE_URL=http://localhost:3007
```

### TEI (Text Embeddings Inference) Configuration

```bash
# TEI Service URLs
TEI_EMBEDDING_URL=http://localhost:8080
TEI_RERANKER_URL=http://localhost:8081
TEI_EMBEDDING_CPU_URL=http://localhost:8082

# TEI Model Configuration
TEI_EMBEDDING_MODEL=BAAI/bge-large-en-v1.5
TEI_RERANKER_MODEL=BAAI/bge-reranker-base
TEI_EMBEDDING_CPU_MODEL=sentence-transformers/all-mpnet-base-v2
TEI_REQUEST_TIMEOUT=30000        # Request timeout in milliseconds
TEI_RETRY_ATTEMPTS=3             # Number of retry attempts

# Hugging Face Configuration
HUGGINGFACE_HUB_CACHE=/data
JSON_OUTPUT=true
```

### Execution & Performance Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `OPERATION_TIMEOUT_MAX` | `3600000` | Maximum operation timeout (1 hour) |
| `STEP_TIMEOUT_MAX` | `300000` | Maximum step timeout (5 minutes) |
| `MAX_CONCURRENT_OPERATIONS` | `10` | Maximum concurrent operations |
| `MAX_RETRY_ATTEMPTS` | `3` | Maximum retry attempts |
| `CLEANUP_INTERVAL` | `300000` | Cleanup interval (5 minutes) |
| `CHECKPOINT_INTERVAL` | `60000` | Checkpoint interval (1 minute) |
| `RESOURCE_MONITORING_INTERVAL` | `10000` | Monitoring interval (10 seconds) |

### Security & Authentication

#### JWT Configuration
```bash
JWT_SECRET=uaip_dev_jwt_secret_key_change_in_production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
JWT_ISSUER=uaip-security-gateway
JWT_AUDIENCE=uaip-services
JWT_REFRESH_SECRET=uaip_dev_jwt_refresh_secret_key_change_in_production
```

#### CORS Configuration
```bash
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
CORS_CREDENTIALS=true
```

### Service-Specific Configuration

#### Capability Registry
```bash
TOOL_EXECUTION_TIMEOUT=30000     # Tool execution timeout (30 seconds)
MAX_CONCURRENT_EXECUTIONS=10     # Maximum concurrent tool executions
ENABLE_APPROVAL_WORKFLOW=false   # Enable approval workflow for tools
DEFAULT_COST_LIMIT=100.0         # Default cost limit for tool usage
```

#### Discussion Orchestration
```bash
WEBSOCKET_ENABLED=true           # Enable WebSocket support
```

### LLM Provider Configuration

```bash
# API Keys (leave empty if not using)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Local LLM Services
OLLAMA_URL=http://localhost:11434
LLM_STUDIO_URL=http://localhost:1234

# Encryption for stored provider credentials
LLM_PROVIDER_ENCRYPTION_KEY=default-key-change-in-production
```

### Monitoring & Logging

```bash
# Logging Configuration
LOG_LEVEL=info                   # error | warn | info | debug | trace
DETAILED_LOGGING=false          # Enable verbose logging

# Metrics
METRICS_ENABLED=true            # Enable Prometheus metrics
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000
```

### Docker & Container Configuration

The system automatically detects containerized environments and adjusts URLs accordingly:

```bash
DOCKER_ENV=false                # Manually set Docker environment
KUBERNETES_SERVICE_HOST=        # Auto-detected in Kubernetes
HOSTNAME=                       # Auto-set by Docker
```

### Development Settings

```bash
# Frontend Development (Vite)
VITE_API_URL=http://localhost:8081
VITE_API_TARGET=http://api-gateway:80
CHOKIDAR_USEPOLLING=true
WATCHPACK_POLLING=true

# Debugging
DEBUG=false
VERBOSE_ERRORS=false
```

## Environment-Specific Configurations

### Development Environment
- Use `localhost` URLs for all services
- Enable detailed logging and SQL query logging
- Disable cache for faster development cycles
- Enable hot reloading for frontend

### Production Environment
- Use service names for Docker Compose
- Enable SSL for databases
- Use strong secrets and passwords
- Enable metrics and monitoring
- Disable sync and enable migrations

### Testing Environment
- Use separate test databases
- Disable external services where possible
- Use mock providers for LLM services
- Enable detailed logging for debugging

## Security Considerations

1. **Change Default Passwords**: All default passwords should be changed in production
2. **Use Strong Secrets**: JWT secrets and encryption keys should be cryptographically strong
3. **Enable SSL**: Database connections should use SSL in production
4. **Restrict CORS**: Limit CORS origins to known frontend domains
5. **API Keys**: Store API keys securely and rotate regularly

## Troubleshooting

### Database Connection Issues
- Verify database URLs and credentials
- Check network connectivity
- Ensure databases are running and accessible
- Review timeout settings

### Redis Cache Issues
- Redis is optional; system continues without cache
- Check Redis connectivity and credentials
- Verify Redis database number

### Service Discovery Issues
- In Docker: Use service names instead of localhost
- Check Docker network configuration
- Verify port mappings

### Performance Issues
- Adjust timeout values based on your infrastructure
- Tune connection pool sizes
- Monitor resource usage and adjust limits

## Examples

### Local Development
```bash
NODE_ENV=development
POSTGRES_URL=postgresql://uaip_user:uaip_password@localhost:5432/uaip
REDIS_URL=redis://:uaip_redis_password@localhost:6379
NEO4J_URL=bolt://neo4j:uaip_dev_password@localhost:7687
```

### Docker Compose
```bash
NODE_ENV=development
POSTGRES_URL=postgresql://uaip_user:uaip_password@postgres:5432/uaip
REDIS_URL=redis://:uaip_redis_password@redis:6379
NEO4J_URL=bolt://neo4j:uaip_dev_password@neo4j:7687
```

### Production
```bash
NODE_ENV=production
POSTGRES_URL=postgresql://prod_user:secure_password@db.example.com:5432/uaip_prod
REDIS_URL=redis://:secure_redis_password@cache.example.com:6379
NEO4J_URL=bolt://neo4j:secure_neo4j_password@graph.example.com:7687
DB_SSL=true
TYPEORM_SYNC=false
TYPEORM_MIGRATIONS_RUN=true
``` 