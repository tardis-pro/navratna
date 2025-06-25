# Database Architecture

## Overview

The UAIP uses a hybrid database approach combining PostgreSQL for relational data, Neo4j for graph relationships, and Redis for caching and real-time data.

## PostgreSQL Architecture

### Core Schema

#### Users and Authentication
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Operations and Execution
```sql
CREATE TABLE operations (
  id UUID PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  agent_id UUID NOT NULL,
  user_id UUID REFERENCES users(id),
  context JSONB,
  results JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE execution_steps (
  id UUID PRIMARY KEY,
  operation_id UUID REFERENCES operations(id),
  step_number INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL,
  details JSONB,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);
```

#### Audit and Logging
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes and Performance
```sql
-- User lookups
CREATE INDEX idx_users_email ON users(email);

-- Operation queries
CREATE INDEX idx_operations_status ON operations(status);
CREATE INDEX idx_operations_type ON operations(type);
CREATE INDEX idx_operations_agent ON operations(agent_id);

-- Audit trail searches
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
```

## Neo4j Architecture

### Graph Model

#### Agent Relationships
```cypher
CREATE (a:Agent {
  id: string,
  name: string,
  type: string
});

CREATE (a:Agent)-[:CAN_USE]->(t:Tool {
  id: string,
  name: string,
  capability: string
});

CREATE (a:Agent)-[:PARTICIPATES_IN]->(d:Discussion {
  id: string,
  title: string,
  status: string
});
```

#### Knowledge Graph
```cypher
CREATE (c:Concept {
  id: string,
  name: string,
  category: string
});

CREATE (c:Concept)-[:RELATES_TO {
  strength: float,
  type: string
}]->(c2:Concept);

CREATE (c:Concept)-[:APPEARS_IN]->(d:Discussion);
```

### Query Patterns

#### Agent Capability Discovery
```cypher
MATCH (a:Agent)-[:CAN_USE]->(t:Tool)
WHERE a.id = $agentId
RETURN t.id, t.name, t.capability;

MATCH (a:Agent)-[:PARTICIPATES_IN]->(d:Discussion)
WHERE d.status = 'active'
RETURN a.id, d.id, d.title;
```

#### Knowledge Navigation
```cypher
MATCH (c:Concept)-[r:RELATES_TO]->(c2:Concept)
WHERE c.id = $conceptId
RETURN c2.id, c2.name, r.strength
ORDER BY r.strength DESC
LIMIT 10;
```

## Redis Architecture

### Data Structures

#### Session Management
```typescript
interface SessionCache {
  key: `session:${string}`;  // session:userId
  value: {
    token: string;
    userData: object;
    permissions: string[];
  };
  expiry: number;  // TTL in seconds
}
```

#### Real-time State
```typescript
interface OperationState {
  key: `operation:${string}`;  // operation:operationId
  value: {
    status: string;
    progress: number;
    lastUpdate: string;
  };
  expiry: 3600;  // 1 hour TTL
}
```

### Caching Patterns

#### Request Caching
```typescript
class RequestCache {
  async getCached(key: string): Promise<any> {
    const cached = await redis.get(`cache:${key}`);
    if (cached) {
      metrics.increment('cache.hit');
      return JSON.parse(cached);
    }
    metrics.increment('cache.miss');
    return null;
  }

  async setCached(key: string, value: any, ttl: number): Promise<void> {
    await redis.set(`cache:${key}`, JSON.stringify(value), 'EX', ttl);
  }
}
```

#### Rate Limiting
```typescript
class RateLimiter {
  async checkLimit(key: string, limit: number, window: number): Promise<boolean> {
    const current = await redis.incr(`ratelimit:${key}`);
    if (current === 1) {
      await redis.expire(`ratelimit:${key}`, window);
    }
    return current <= limit;
  }
}
```

## Data Management

### Backup Strategy

#### PostgreSQL Backups
```bash
# Full backup
pg_dump -Fc -f backup.dump uaip_database

# Incremental backup
pg_dump -Fc --delta -f incremental.dump uaip_database

# Restore
pg_restore -d uaip_database backup.dump
```

#### Neo4j Backups
```bash
# Full backup
neo4j-admin backup --backup-dir=/backups --database=neo4j

# Restore
neo4j-admin restore --from=/backups --database=neo4j
```

### Data Migration

#### Schema Migrations
```typescript
interface Migration {
  id: string;
  name: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
}

class MigrationRunner {
  async runMigration(migration: Migration): Promise<void> {
    await this.beginTransaction();
    try {
      await migration.up();
      await this.commitTransaction();
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }
}
```

#### Data Transformations
```typescript
interface DataTransform {
  sourceSchema: string;
  targetSchema: string;
  transformations: {
    [key: string]: (value: any) => any;
  };
}

class DataTransformer {
  async transform(data: any[], transform: DataTransform): Promise<any[]> {
    return data.map(item => {
      const transformed = {};
      for (const [key, fn] of Object.entries(transform.transformations)) {
        transformed[key] = fn(item[key]);
      }
      return transformed;
    });
  }
}
```

## Monitoring and Maintenance

### Health Checks
```typescript
interface DatabaseHealth {
  postgres: {
    status: 'healthy' | 'degraded' | 'failed';
    connectionPool: {
      active: number;
      idle: number;
      waiting: number;
    };
    replicationLag?: number;
  };
  neo4j: {
    status: 'healthy' | 'degraded' | 'failed';
    connections: number;
    queryTime: number;
  };
  redis: {
    status: 'healthy' | 'degraded' | 'failed';
    usedMemory: number;
    hitRate: number;
  };
}
```

### Performance Monitoring
```typescript
interface DatabaseMetrics {
  queryLatency: {
    avg: number;
    p95: number;
    p99: number;
  };
  connectionPool: {
    utilization: number;
    waitTime: number;
  };
  cacheEfficiency: {
    hitRate: number;
    missRate: number;
    evictionRate: number;
  };
}
```

### Maintenance Tasks
```typescript
class DatabaseMaintenance {
  async runVacuum(): Promise<void> {
    await this.postgres.query('VACUUM ANALYZE');
  }

  async updateStatistics(): Promise<void> {
    await this.postgres.query('ANALYZE');
  }

  async compactNeo4j(): Promise<void> {
    await this.neo4j.run('CALL db.compact()');
  }

  async flushRedis(): Promise<void> {
    await this.redis.flushdb();
  }
}