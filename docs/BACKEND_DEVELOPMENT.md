# Navratna Backend - Development & Testing Guide

## Overview

This document provides comprehensive guidance for running, testing, and securing the Navratna backend services. The platform is a production-ready infrastructure for multi-agent collaboration with enterprise-grade security features.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Docker Infrastructure](#docker-infrastructure)
3. [Backend Services](#backend-services)
4. [Running Tests](#running-tests)
5. [Security Configuration](#security-configuration)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Bun ≥ 1.1 (runtime)
- pnpm ≥ 10 (package manager)
- NX CLI (optional: `pnpm add -g nx`)
- 8GB RAM minimum (16GB recommended)

### Starting the Backend

```bash
# Clone and setup
git clone <repository-url>
cd navratna

# Install dependencies
pnpm install

# Start Docker infrastructure
docker-compose up -d postgres redis neo4j qdrant

# Start backend services (with proper environment)
export POSTGRES_URL="postgresql://uaip_user:uaip_password@localhost:5432/uaip"
export REDIS_URL="redis://:uaip_redis_password@localhost:6379"

# Or use the startup script
chmod +x scripts/start-backend.sh
./scripts/start-backend.sh
```

### Service Endpoints

| Service                  | Port | Health Check                   | Status       |
| ------------------------ | ---- | ------------------------------ | ------------ |
| **navratna-core**        | 3001 | `http://localhost:3001/health` | ⚡ v3 active |
| **navratna-gateway**     | 3002 | `http://localhost:3002/health` | ⚡ v3 active |
| **questionforge**        | 3010 | `http://localhost:3010/health` | 🆕 product   |
| **basebench-meta**       | 3009 | `http://localhost:3009/health` | 🆕 product   |
| agent-intelligence       | 3001 | `http://localhost:3001/health` | 🔄 legacy    |
| orchestration-pipeline   | 3002 | `http://localhost:3002/health` | 🔄 legacy    |
| capability-registry      | 3003 | `http://localhost:3003/health` | 🔄 legacy    |
| security-gateway         | 3004 | `http://localhost:3004/health` | 🔄 legacy    |
| discussion-orchestration | 3005 | `http://localhost:3005/health` | 🔄 legacy    |
| artifact-service         | 3006 | `http://localhost:3006/health` | 🔄 legacy    |
| llm-service              | 3007 | `http://localhost:3007/health` | 🔄 legacy    |

> v3.0 consolidation: `navratna-core` replaces agent-intelligence + discussion-orchestration + artifact-service + llm-service. `navratna-gateway` replaces security-gateway + orchestration-pipeline + capability-registry. Run the v3 services for active development.

---

## Docker Infrastructure

### Core Services

```yaml
# docker-compose.yml services
postgres: # Primary database (5432)
neo4j: # Graph database (7474/7687)
redis: # Cache + BullMQ event bus (6379)
qdrant: # Vector storage (6333/6334)
```

### Starting Infrastructure

```bash
# Start all infrastructure
docker-compose up -d

# Start specific services
docker-compose up -d postgres redis neo4j qdrant

# Check status
docker-compose ps

# View logs
docker-compose logs -f postgres
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
POSTGRES_USER=uaip_user
POSTGRES_PASSWORD=uaip_password
POSTGRES_DB=uaip

# Redis
REDIS_PASSWORD=uaip_redis_password

# Neo4j
NEO4J_USER=neo4j
NEO4J_PASSWORD=uaip_dev_password

# Security
JWT_SECRET=your-secure-jwt-secret
ENCRYPTION_KEY=your-encryption-key

# API Keys (optional)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=...
```

---

## Backend Services

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (Nginx)                       │
│                      Port 8081                              │
└─────────────────────────────────────────────────────────────┘
         │         │         │         │         │
    ┌────┴────┐ ┌──┴────┐ ┌──┴────┐ ┌──┴────┐ ┌──┴────┐
    │ Agent   │ │ Orch- │ │ Cap-  │ │ Sec-  │ │ Disc- │
    │ Intel-  │ │ estr. │ │abil.  │ │urity  │ │ ussion│
    │ ligence │ │Pipe-  │ │Reg.   │ │Gate-  │ │Orches-│
    │   3001  │ │line   │ │ 3003  │ │way    │ │tration│
    │         │ │ 3002  │ │       │ │ 3004  │ │  3005 │
    └─────────┘ └───────┘ └───────┘ └───────┘ └───────┘
         │                    │                    │
    ┌────┴────────────────────┴────────────────────┴────┐
    │              Shared Infrastructure                  │
    │  PostgreSQL │ Redis/BullMQ │ Neo4j │ Qdrant      │
    └────────────────────────────────────────────────────┘
```

### Starting Services

> **NX is the orchestrator** — all `pnpm dev*` scripts delegate to `nx run` / `nx run-many`. Use either form.

```bash
# All v3 active services (recommended)
pnpm dev:backend                          # → nx run-many -t dev --projects=tag:backend-service

# v3 consolidated services (primary targets)
nx run @uaip/navratna-core:dev            # port 3001 — consolidates agent-intelligence, discussion-orchestration, artifact-service, llm-service
nx run @uaip/navratna-gateway:dev         # port 3002 — consolidates security-gateway, orchestration-pipeline, capability-registry

# Product services
nx run @uaip/questionforge:dev            # port 3010
nx run @uaip/basebench-meta:dev           # port 3009

# pnpm --filter alias (equivalent)
pnpm --filter @uaip/navratna-core dev
pnpm --filter @uaip/navratna-gateway dev
```

### Health Checks

```bash
# Check all services
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3004/health

# Expected response
{
  "status": "healthy",
  "service": "security-gateway",
  "version": "1.0.0",
  "timestamp": "2026-01-27T18:24:20.934Z",
  "checks": {
    "database": "connected",
    "eventBus": "connected",
    "service": "healthy"
  }
}
```

---

## Running Tests

### Test Structure

```
backend/
├── services/
│   ├── security-gateway/
│   │   └── src/__tests__/
│   │       ├── integration/    # Integration tests
│   │       ├── unit/           # Unit tests
│   │       └── e2e/           # End-to-end tests
│   └── ...
└── shared/
    └── services/
        └── src/__tests__/     # Shared service tests
```

### Available Test Commands

```bash
# All tests in workspace
pnpm test

# Integration tests
pnpm test:integration
pnpm test:integration:setup
pnpm test:integration:oauth
pnpm test:integration:security
pnpm test:integration:coverage

# Service-specific tests (via NX or pnpm --filter)
nx run @uaip/security-gateway:test
pnpm --filter @uaip/security-gateway test         # All tests
pnpm --filter @uaip/security-gateway test:unit    # Unit tests only
pnpm --filter @uaip/security-gateway test:integration
pnpm --filter @uaip/security-gateway test:coverage
```

### Test Setup

```bash
# Setup test environment
pnpm test:integration:setup

# This creates:
# - Test PostgreSQL database (port 5433)
# - Test Redis instance (port 6380)
# - Test Redis/BullMQ instance (port 6380)
```

### Current Test Status

**Known Issues:**

1. **TypeScript Compilation Errors**: Some test files have type mismatches with entity definitions
2. **Jest Configuration**: ESM modules require proper Babel configuration
3. **Entity Type Definitions**: Properties like `agentId`, `expiresAt` need to be added to entity types

**Recommended Actions:**

1. Fix entity type definitions to match test expectations
2. Update Jest configuration for proper ESM support
3. Add missing properties to OAuth-related entities

---

## Security Configuration

### Fortnox-Level Security Features

Navratna implements enterprise-grade security following Swedish financial regulations (which Fortnox follows):

#### 1. Authentication & Authorization

```typescript
// JWT-based authentication with refresh tokens
interface JwtConfig {
  secret: string; // HS256/HS512 algorithm
  expiresIn: string; // Token expiration
  refreshExpiresIn: string; // Refresh token expiration
  issuer: string; // Token issuer
  audience: string; // Expected audience
}

// MFA Support
interface MFAConfig {
  enabled: boolean;
  methods: ['totp', 'sms', 'email'];
  backupCodes: number;
}
```

#### 2. OAuth 2.0 Integration

```typescript
// Supported providers
enum OAuthProviderType {
  GITHUB = 'github',
  GOOGLE = 'google',
  GITLAB = 'gitlab',
  MICROSOFT = 'microsoft',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
}

// Agent OAuth connections for tool access
interface AgentOAuthConnection {
  agentId: string;
  providerType: OAuthProviderType;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}
```

#### 3. Role-Based Access Control (RBAC)

```typescript
// Permission hierarchy
type Permission =
  | 'admin'
  | 'user'
  | 'agent'
  | 'read'
  | 'write'
  | 'delete'
  | 'execute'
  | 'manage_users'
  | 'manage_agents'
  | 'view_audit_logs';

// Role definitions
const roles: Record<Role, Permission[]> = {
  ADMIN: [
    'admin',
    'user',
    'agent',
    'read',
    'write',
    'delete',
    'execute',
    'manage_users',
    'manage_agents',
    'view_audit_logs',
  ],
  USER: ['read', 'write', 'execute'],
  AGENT: ['read', 'execute'],
};
```

#### 4. Audit Logging

```typescript
interface AuditEvent {
  eventType: AuditEventType;
  userId: string;
  agentId?: string;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  action: string;
  resource: string;
  result: 'success' | 'failure';
  details?: Record<string, any>;
}
```

#### 5. Security Levels

```typescript
enum SecurityLevel {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

// Risk-based authentication
interface RiskAssessment {
  score: number; // 0-100
  factors: {
    location: number;
    device: number;
    behavior: number;
    time: number;
  };
  recommendations: string[];
  requiredLevel: SecurityLevel;
}
```

### Security Best Practices

#### Environment Variables

```bash
# Required security variables
JWT_SECRET=<minimum-32-character-secret>
JWT_REFRESH_SECRET=<minimum-32-character-secret>
ENCRYPTION_KEY=<32-character-key>

# API keys (use secrets management in production)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=...

# Database encryption
DB_SSL=true
ENCRYPTION_ALGORITHM=aes-256-gcm
```

#### Production Security Checklist

- [ ] Enable HTTPS/TLS for all endpoints
- [ ] Use managed secrets (AWS Secrets Manager, HashiCorp Vault)
- [ ] Enable database SSL/TLS connections
- [ ] Configure CORS with specific origins
- [ ] Implement rate limiting
- [ ] Enable request validation
- [ ] Configure security headers
- [ ] Enable audit logging
- [ ] Set up intrusion detection
- [ ] Configure backup and disaster recovery

### API Security Middleware

```typescript
// Security headers configuration
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
```

---

## Troubleshooting

### Common Issues

#### 1. BullMQ/Redis Connection Issues

**Symptom:** Event bus publish/subscribe failures, timeout errors.

**Solution:**

```bash
# Check Redis connectivity
docker exec uaip-redis redis-cli ping
# Expected: PONG

# Check Redis memory usage
docker exec uaip-redis redis-cli info memory | grep used_memory_human

# Check BullMQ queues
docker exec uaip-redis redis-cli keys "bull:*" | head -20
```

#### 2. PostgreSQL Permission Errors

**Symptom:** `mkdir: cannot create directory '/var/lib/postgresql': Permission denied`

**Solution:**

```bash
# Clean up and restart
docker stop uaip-postgres
docker rm uaip-postgres
docker volume rm navratna_postgres_data

# Restart with proper permissions
docker-compose up -d postgres
```

#### 3. TypeScript Build Errors

**Symptom:** Type errors when building services

**Solution:**

```bash
# Clean NX cache and rebuild from scratch
nx reset
pnpm build:shared      # shared packages (NX handles dep ordering)
pnpm build:backend     # backend services
```

#### 4. Module Resolution Issues

**Symptom:** `Cannot find module '@uaip/...'`

**Solution:**

```bash
# Ensure correct import paths
import { Service } from '@uaip/shared-services';
import { config } from '@uaip/config';

// Check tsconfig paths
cat backend/tsconfig.json | grep paths
```

### Health Check Commands

```bash
# Check all service health
for port in 3001 3002 3003 3004 3005 3006 3007; do
  echo "Port $port: $(curl -s http://localhost:$port/health)"
done

# Check Docker services
docker-compose ps

# Check database connections
docker exec uaip-postgres pg_isready -U uaip_user
docker exec uaip-redis redis-cli ping
docker exec uaip-neo4j cypher-shell -u neo4j -p uaip_dev_password "RETURN 1"
```

---

## Documentation References

- [API Reference](../docs/API_REFERENCE.md)
- [Architecture](../docs/ARCHITECTURE.md)
- [Security Documentation](../docs/technical/SECURITY.md)
- [Testing Guide](../docs/TESTING_GUIDE.md)
- [Service Integration](../docs/SERVICE_INTEGRATION.md)

---

## Next Steps

1. **Fix Test Suite**: Resolve TypeScript compilation errors in integration tests
2. **Enhance Security**: Implement additional audit logging and compliance features
3. **CI/CD Integration**: Set up automated testing pipeline
4. **Documentation**: Complete API documentation with OpenAPI/Swagger
5. **Performance**: Optimize database queries and add caching

---

_Last Updated: January 27, 2026_
_Version: 2.1 - Enhanced Security Implementation_
