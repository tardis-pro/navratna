# Migration Guide

## Overview

This guide provides detailed instructions for migrating between different versions of the UAIP platform. Each section covers the necessary steps, breaking changes, and required updates.

## Migrating to v2.0.0

### Breaking Changes

1. **Authentication System**

```typescript
// Old authentication
interface OldAuth {
  token: string;
  userId: string;
}

// New authentication
interface NewAuth {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    roles: string[];
    permissions: string[];
  };
}
```

2. **Database Schema**

```sql
-- Required schema updates
ALTER TABLE users ADD COLUMN roles JSONB;
ALTER TABLE operations ADD COLUMN metadata JSONB;
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100),
  timestamp TIMESTAMPTZ
);
```

3. **API Endpoints**

```typescript
// Updated endpoint structure
/api/2v /
  discussions / // Replaces /api/discussions
  api /
  v2 /
  agents / // Replaces /api/agents
  api /
  v2 /
  operations; // Replaces /api/operations
```

### Migration Steps

1. **Pre-migration Checklist**

```bash
# Backup databases
./scripts/backup-databases.sh

# Export current configuration
./scripts/export-config.sh

# Verify system state
./scripts/verify-system.sh
```

2. **Update Dependencies**

```json
{
  "dependencies": {
    "@uaip/core": "^2.0.0",
    "@uaip/client": "^2.0.0",
    "@uaip/database": "^2.0.0"
  }
}
```

3. **Run Migrations**

```bash
# Database migrations
npm run migrate:v2

# Data transformations
npm run transform:data

# Verify migrations
npm run verify:migrations
```

## Migrating to v1.2.0

### Breaking Changes

1. **Service Configuration**

```typescript
// Old configuration
interface OldConfig {
  port: number;
  database: string;
}

// New configuration
interface NewConfig {
  service: {
    port: number;
    env: string;
  };
  database: {
    url: string;
    pool: ConnectionPool;
  };
}
```

2. **Message Format**

```typescript
// Old format
interface OldMessage {
  text: string;
  user: string;
}

// New format
interface NewMessage {
  content: {
    text: string;
    attachments?: any[];
  };
  sender: {
    id: string;
    type: string;
  };
  metadata: MessageMetadata;
}
```

### Migration Steps

1. **Update Services**

```bash
# Stop services
docker-compose down

# Update images
docker-compose pull

# Start services
docker-compose up -d
```

2. **Data Migration**

```bash
# Run data migrations
npm run migrate:messages
npm run migrate:users

# Verify data
npm run verify:data
```

## Version-specific Updates

### v2.0.0 Updates

1. **Security Updates**

```typescript
// Implement new security middleware
app.use(
  new SecurityMiddleware({
    rbac: true,
    audit: true,
    encryption: {
      algorithm: 'aes-256-gcm',
    },
  })
);
```

2. **WebSocket Changes**

```typescript
// Update WebSocket connections
const ws = new WebSocket('ws://api.example.com/v2/discussions');
ws.addEventListener('message', (event) => {
  const { type, payload } = JSON.parse(event.data);
  // Handle new message format
});
```

### v1.2.0 Updates

1. **API Client Updates**

```typescript
// Update API client usage
const client = new UAIPClient({
  version: 'v1.2',
  baseUrl: 'https://api.example.com',
  timeout: 5000,
});
```

## Database Migrations

### Schema Updates

```sql
-- v2.0.0 Schema Updates
CREATE TABLE user_roles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  role VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- v1.2.0 Schema Updates
ALTER TABLE messages ADD COLUMN metadata JSONB;
CREATE INDEX idx_messages_metadata ON messages USING gin (metadata);
```

### Data Migrations

```typescript
// Migrate user data
async function migrateUsers() {
  const users = await db.users.findAll();
  for (const user of users) {
    await db.userRoles.create({
      userId: user.id,
      role: user.legacyRole,
    });
  }
}

// Migrate message data
async function migrateMessages() {
  const messages = await db.messages.findAll();
  for (const message of messages) {
    await db.messages.update({
      where: { id: message.id },
      data: {
        content: {
          text: message.text,
          attachments: [],
        },
        metadata: {
          migrated: true,
          originalFormat: 'v1',
        },
      },
    });
  }
}
```

## Configuration Updates

### Environment Variables

```bash
# v2.0.0 Required Variables
SECURITY_KEY=your-new-security-key
RBAC_ENABLED=true
AUDIT_ENABLED=true
ENCRYPTION_KEY=your-encryption-key

# v1.2.0 Required Variables
DB_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://localhost:6379
```

### Service Configuration

```yaml
# v2.0.0 Configuration
services:
  security:
    enabled: true
    audit: true
    rbac: true
  database:
    migration:
      auto: true
      verify: true

# v1.2.0 Configuration
database:
  url: ${DB_URL}
  pool:
    min: 5
    max: 20
```

## Rollback Procedures

### Emergency Rollback

```bash
# Stop services
docker-compose down

# Restore database
./scripts/restore-database.sh

# Restore configuration
./scripts/restore-config.sh

# Start previous version
docker-compose -f docker-compose.prev.yml up -d
```

### Verification Steps

```bash
# Verify database state
npm run verify:db

# Verify application state
npm run verify:app

# Verify API endpoints
npm run verify:api
```

## Post-migration Steps

1. **Verify System Status**

```bash
# Check service health
./scripts/check-health.sh

# Verify data integrity
./scripts/verify-data.sh

# Test functionality
npm run test:e2e
```

2. **Update Documentation**

```bash
# Update API docs
npm run docs:generate

# Update changelog
./scripts/update-changelog.sh
```

3. **Monitor System**

```bash
# Watch error rates
./scripts/monitor-errors.sh

# Check performance
./scripts/check-performance.sh
```
