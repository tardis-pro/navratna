# Environment Configuration Guide

**Complete configuration reference for the UAIP platform**

## 🎯 Overview

The UAIP platform uses environment variables for configuration across all services. This guide covers all configuration options, from development to production deployment.

## 📋 Configuration Files

### Primary Configuration Files

- **`.env`** - Main environment configuration
- **`sample.env`** - Template with all available options
- **`docker-compose.yml`** - Docker service configuration
- **`package.json`** - Node.js dependencies and scripts

### Service-Specific Configuration

- Each service has its own environment variables
- Shared configuration through monorepo workspace
- Override capabilities for different environments

## 🔧 Core Configuration

### Application Settings

```bash
# Environment
NODE_ENV=development|production|test
DEBUG=true|false
LOG_LEVEL=debug|info|warn|error

# Application
APP_NAME=council-of-nycea
APP_VERSION=2.0.0
API_VERSION=v1

# Server Configuration
HOST=localhost
PORT=3000
API_GATEWAY_PORT=8081
```

### Service Ports

```bash
# Backend Services
AGENT_INTELLIGENCE_PORT=3001
ORCHESTRATION_PIPELINE_PORT=3002
CAPABILITY_REGISTRY_PORT=3003
SECURITY_GATEWAY_PORT=3004
DISCUSSION_ORCHESTRATION_PORT=3005

# Infrastructure Services
POSTGRESQL_PORT=5432
NEO4J_HTTP_PORT=7474
NEO4J_BOLT_PORT=7687
REDIS_PORT=6379
RABBITMQ_PORT=5672
RABBITMQ_MANAGEMENT_PORT=15672
```

## 🗄️ Database Configuration

### PostgreSQL Settings

```bash
# Connection
POSTGRESQL_HOST=localhost
POSTGRESQL_PORT=5432
POSTGRESQL_DATABASE=uaip_dev
POSTGRESQL_USERNAME=postgres
POSTGRESQL_PASSWORD=postgres
POSTGRESQL_URL=postgresql://postgres:postgres@localhost:5432/uaip_dev

# Connection Pool
POSTGRESQL_MAX_CONNECTIONS=100
POSTGRESQL_MIN_CONNECTIONS=5
POSTGRESQL_IDLE_TIMEOUT=30000
POSTGRESQL_CONNECTION_TIMEOUT=10000

# SSL Configuration (Production)
POSTGRESQL_SSL=true
POSTGRESQL_SSL_CERT_PATH=/path/to/cert.pem
POSTGRESQL_SSL_KEY_PATH=/path/to/key.pem
POSTGRESQL_SSL_CA_PATH=/path/to/ca.pem
```

### Neo4j Settings

```bash
# Connection
NEO4J_HOST=localhost
NEO4J_HTTP_PORT=7474
NEO4J_BOLT_PORT=7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
NEO4J_URL=bolt://neo4j:password@localhost:7687

# Configuration
NEO4J_DATABASE=neo4j
NEO4J_MAX_CONNECTIONS=50
NEO4J_CONNECTION_TIMEOUT=30000
NEO4J_MAX_TRANSACTION_RETRY_TIME=15000

# Memory Settings
NEO4J_HEAP_INITIAL_SIZE=512m
NEO4J_HEAP_MAX_SIZE=2G
NEO4J_PAGECACHE_SIZE=1G
```

### Redis Settings

```bash
# Connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DATABASE=0
REDIS_URL=redis://localhost:6379

# Configuration
REDIS_MAX_RETRIES=3
REDIS_RETRY_DELAY=100
REDIS_CONNECTION_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=5000

# Cluster Configuration (Production)
REDIS_CLUSTER_ENABLED=false
REDIS_CLUSTER_NODES=redis1:6379,redis2:6379,redis3:6379
```

### RabbitMQ Settings

```bash
# Connection
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/
RABBITMQ_URL=amqp://guest:guest@localhost:5672/

# Management
RABBITMQ_MANAGEMENT_PORT=15672
RABBITMQ_MANAGEMENT_USERNAME=admin
RABBITMQ_MANAGEMENT_PASSWORD=admin

# Configuration
RABBITMQ_HEARTBEAT=60
RABBITMQ_CONNECTION_TIMEOUT=10000
RABBITMQ_PREFETCH_COUNT=10
```

## 🔐 Security Configuration

### JWT Settings

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
JWT_ALGORITHM=HS256
JWT_ISSUER=uaip-platform
JWT_AUDIENCE=uaip-users

# Session Configuration
SESSION_SECRET=your-session-secret-here
SESSION_MAX_AGE=86400000
SESSION_SECURE=false
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
```

### Security Settings

```bash
# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:8081
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_CREDENTIALS=true
CORS_MAX_AGE=86400

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS=false

# Security Headers
HELMET_ENABLED=true
CSP_ENABLED=true
HSTS_ENABLED=true
```

### Authentication Providers

```bash
# OAuth Configuration
OAUTH_GITHUB_CLIENT_ID=your-github-client-id
OAUTH_GITHUB_CLIENT_SECRET=your-github-client-secret
OAUTH_GITHUB_CALLBACK_URL=http://localhost:8081/auth/github/callback

OAUTH_GOOGLE_CLIENT_ID=your-google-client-id
OAUTH_GOOGLE_CLIENT_SECRET=your-google-client-secret
OAUTH_GOOGLE_CALLBACK_URL=http://localhost:8081/auth/google/callback
```

## 🤖 AI/LLM Configuration

### OpenAI Settings

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_ORGANIZATION=org-your-organization-id
OPENAI_DEFAULT_MODEL=gpt-4
OPENAI_MAX_TOKENS=4000
OPENAI_TEMPERATURE=0.7
OPENAI_TIMEOUT=30000
```

### Anthropic Settings

```bash
# Anthropic Configuration
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key-here
ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229
ANTHROPIC_MAX_TOKENS=4000
ANTHROPIC_TEMPERATURE=0.7
ANTHROPIC_TIMEOUT=30000
```

### Local LLM Settings

```bash
# Ollama Configuration
OLLAMA_ENABLED=true
OLLAMA_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama2
OLLAMA_TIMEOUT=60000

# Custom LLM Endpoints
CUSTOM_LLM_ENABLED=false
CUSTOM_LLM_URL=http://your-llm-endpoint
CUSTOM_LLM_API_KEY=your-api-key
CUSTOM_LLM_MODEL=your-model-name
```

## 🚀 Service-Specific Configuration

### Agent Intelligence Service

```bash
# Agent Intelligence Configuration
AGENT_INTELLIGENCE_URL=http://localhost:3001
AGENT_INTELLIGENCE_MAX_CONTEXT_LENGTH=8000
AGENT_INTELLIGENCE_DEFAULT_PERSONA=helpful
AGENT_INTELLIGENCE_MEMORY_ENABLED=true
AGENT_INTELLIGENCE_LEARNING_ENABLED=true

# Context Management
CONTEXT_WINDOW_SIZE=4000
CONTEXT_OVERLAP_SIZE=200
CONTEXT_COMPRESSION_ENABLED=true
```

### Orchestration Pipeline Service

```bash
# Orchestration Configuration
ORCHESTRATION_PIPELINE_URL=http://localhost:3002
ORCHESTRATION_MAX_CONCURRENT_OPERATIONS=50
ORCHESTRATION_OPERATION_TIMEOUT=300000
ORCHESTRATION_RETRY_ATTEMPTS=3
ORCHESTRATION_RETRY_DELAY=1000

# Workflow Configuration
WORKFLOW_MAX_STEPS=100
WORKFLOW_STEP_TIMEOUT=60000
WORKFLOW_PARALLEL_EXECUTION=true
```

### Capability Registry Service

```bash
# Capability Registry Configuration
CAPABILITY_REGISTRY_URL=http://localhost:3003
CAPABILITY_REGISTRY_MAX_CONCURRENT_EXECUTIONS=20
CAPABILITY_REGISTRY_EXECUTION_TIMEOUT=300000
CAPABILITY_REGISTRY_SANDBOX_ENABLED=true

# Sandbox Configuration
SANDBOX_MEMORY_LIMIT=512MB
SANDBOX_CPU_LIMIT=1.0
SANDBOX_NETWORK_ENABLED=true
SANDBOX_PERSISTENT_STORAGE=false
SANDBOX_EXECUTION_TIMEOUT=60000

# MCP Server Configuration
MCP_SERVERS_ENABLED=true
MCP_SERVERS_PATH=/app/mcp-servers
MCP_SERVERS_TIMEOUT=30000
```

### Security Gateway Service

```bash
# Security Gateway Configuration
SECURITY_GATEWAY_URL=http://localhost:3004
SECURITY_GATEWAY_AUDIT_ENABLED=true
SECURITY_GATEWAY_APPROVAL_REQUIRED=true
SECURITY_GATEWAY_MFA_ENABLED=false

# Audit Configuration
AUDIT_LOG_RETENTION_DAYS=90
AUDIT_LOG_COMPRESSION=true
AUDIT_LOG_ENCRYPTION=true
```

### Discussion Orchestration Service

```bash
# Discussion Orchestration Configuration
DISCUSSION_ORCHESTRATION_URL=http://localhost:3005
DISCUSSION_MAX_PARTICIPANTS=50
DISCUSSION_MESSAGE_RETENTION_DAYS=30
DISCUSSION_WEBSOCKET_ENABLED=true

# WebSocket Configuration
WEBSOCKET_MAX_CONNECTIONS=1000
WEBSOCKET_HEARTBEAT_INTERVAL=30000
WEBSOCKET_MESSAGE_QUEUE_SIZE=100
```

## 🔧 Development Configuration

### Development-Specific Settings

```bash
# Development Features
ENABLE_HOT_RELOAD=true
ENABLE_DEBUG_LOGGING=true
ENABLE_API_DOCUMENTATION=true
ENABLE_CORS_ALL_ORIGINS=true

# File Watching
CHOKIDAR_USEPOLLING=true
WATCHPACK_POLLING=true
POLLING_INTERVAL=1000

# Development Tools
ENABLE_GRAPHQL_PLAYGROUND=true
ENABLE_SWAGGER_UI=true
ENABLE_PROMETHEUS_METRICS=true
```

### Testing Configuration

```bash
# Test Environment
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/uaip_test
TEST_NEO4J_URL=bolt://neo4j:password@localhost:7687
TEST_REDIS_URL=redis://localhost:6379/1

# Test Settings
TEST_TIMEOUT=30000
TEST_PARALLEL=true
TEST_COVERAGE_THRESHOLD=80
TEST_MOCK_EXTERNAL_APIS=true
```

## 🏭 Production Configuration

### Production-Specific Settings

```bash
# Production Environment
NODE_ENV=production
DEBUG=false
LOG_LEVEL=info

# Security
HELMET_ENABLED=true
RATE_LIMITING_ENABLED=true
CORS_STRICT=true
SSL_ENABLED=true

# Performance
CLUSTER_MODE=true
CLUSTER_WORKERS=4
CACHE_ENABLED=true
COMPRESSION_ENABLED=true
```

### SSL/TLS Configuration

```bash
# SSL Configuration
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
SSL_CA_PATH=/path/to/ca.pem
SSL_PASSPHRASE=your-ssl-passphrase

# TLS Settings
TLS_MIN_VERSION=1.2
TLS_CIPHERS=ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384
```

### Monitoring Configuration

```bash
# Prometheus Configuration
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9090
PROMETHEUS_METRICS_PATH=/metrics

# Grafana Configuration
GRAFANA_ENABLED=true
GRAFANA_PORT=3001
GRAFANA_ADMIN_PASSWORD=admin

# Health Check Configuration
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_INTERVAL=30000
HEALTH_CHECK_TIMEOUT=5000
```

## 🐳 Docker Configuration

### Docker Environment Variables

```bash
# Docker Configuration
DOCKER_REGISTRY=your-registry.com
DOCKER_IMAGE_TAG=latest
DOCKER_NETWORK=uaip-network

# Container Settings
CONTAINER_MEMORY_LIMIT=2g
CONTAINER_CPU_LIMIT=1.0
CONTAINER_RESTART_POLICY=unless-stopped

# Volume Configuration
DATA_VOLUME_PATH=/var/lib/uaip
LOG_VOLUME_PATH=/var/log/uaip
CONFIG_VOLUME_PATH=/etc/uaip
```

### Docker Compose Override

```yaml
# docker-compose.override.yml
version: '3.8'
services:
  agent-intelligence:
    environment:
      - LOG_LEVEL=debug
      - ENABLE_HOT_RELOAD=true
    volumes:
      - ./backend/services/agent-intelligence/src:/app/src
```

## 📝 Configuration Templates

### Development Template (.env.development)

```bash
# Development Environment
NODE_ENV=development
DEBUG=true
LOG_LEVEL=debug

# API Keys (Optional for basic functionality)
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Database URLs (Auto-configured with Docker)
POSTGRESQL_URL=postgresql://postgres:postgres@localhost:5432/uaip_dev
NEO4J_URL=bolt://neo4j:password@localhost:7687
REDIS_URL=redis://localhost:6379

# Security (Development only)
JWT_SECRET=dev-jwt-secret-not-for-production
CORS_ORIGIN=*

# Development Features
ENABLE_HOT_RELOAD=true
ENABLE_DEBUG_LOGGING=true
CHOKIDAR_USEPOLLING=true
```

### Production Template (.env.production)

```bash
# Production Environment
NODE_ENV=production
DEBUG=false
LOG_LEVEL=info

# API Keys (Required)
OPENAI_API_KEY=${OPENAI_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

# Database URLs (From environment or secrets)
POSTGRESQL_URL=${DATABASE_URL}
NEO4J_URL=${NEO4J_URL}
REDIS_URL=${REDIS_URL}

# Security (Strong secrets required)
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}
CORS_ORIGIN=${ALLOWED_ORIGINS}

# SSL Configuration
SSL_ENABLED=true
SSL_CERT_PATH=/etc/ssl/certs/uaip.crt
SSL_KEY_PATH=/etc/ssl/private/uaip.key

# Performance
CLUSTER_MODE=true
CLUSTER_WORKERS=4
CACHE_ENABLED=true
```

## 🔍 Configuration Validation

### Environment Validation Script

```bash
#!/bin/bash
# validate-env.sh

echo "Validating environment configuration..."

# Check required variables
required_vars=(
  "NODE_ENV"
  "POSTGRESQL_URL"
  "NEO4J_URL"
  "REDIS_URL"
  "JWT_SECRET"
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ Missing required variable: $var"
    exit 1
  fi
done

# Check database connections
echo "Testing database connections..."
pg_isready -d "$POSTGRESQL_URL" || exit 1
redis-cli -u "$REDIS_URL" ping || exit 1

echo "✅ Environment configuration is valid"
```

### Configuration Health Check

```typescript
// config-health.ts
export async function validateConfiguration(): Promise<boolean> {
  const requiredVars = ['NODE_ENV', 'POSTGRESQL_URL', 'NEO4J_URL', 'REDIS_URL', 'JWT_SECRET'];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      console.error(`Missing required environment variable: ${varName}`);
      return false;
    }
  }

  // Test database connections
  try {
    await testDatabaseConnections();
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}
```

## 🚨 Security Considerations

### Secrets Management

```bash
# Use environment-specific secrets
# Development: .env file (not committed)
# Production: Container secrets, vault systems, or cloud secrets

# Example with Docker Secrets
echo "your-jwt-secret" | docker secret create jwt_secret -
echo "your-db-password" | docker secret create db_password -
```

### Environment Isolation

```bash
# Separate configurations per environment
.env.development
.env.staging
.env.production

# Load appropriate configuration
NODE_ENV=development npm start
```

## 🔧 Troubleshooting

### Common Configuration Issues

#### Database Connection Failures

```bash
# Check database URLs
echo $POSTGRESQL_URL
echo $NEO4J_URL
echo $REDIS_URL

# Test connections
pg_isready -d "$POSTGRESQL_URL"
redis-cli -u "$REDIS_URL" ping
```

#### Service Communication Issues

```bash
# Check service URLs
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health

# Check network connectivity
docker network ls
docker network inspect uaip-network
```

#### Authentication Issues

```bash
# Verify JWT configuration
echo $JWT_SECRET | wc -c  # Should be at least 32 characters
echo $JWT_EXPIRES_IN

# Test authentication
curl -X POST http://localhost:8081/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

---

**Configuration Checklist**:

- [ ] All required environment variables set
- [ ] Database connections tested
- [ ] API keys configured (if using external LLMs)
- [ ] Security settings appropriate for environment
- [ ] Service URLs accessible
- [ ] Log levels appropriate for environment
