# Managed Services Setup Guide

What you need from each managed service for Navratna.

---

## 1. PostgreSQL (Neon)

### What You Need

| Item | Value | Where to Find |
|------|-------|---------------|
| **Connection String** | `postgresql://user:pass@ep-xxx.neon.tech/navratna?sslmode=require` | Dashboard → Connection Details |
| **Database Name** | `navratna` | Create in dashboard |
| **SSL Mode** | `require` | Always use SSL |

### Setup Steps

1. Go to [neon.tech](https://neon.tech) → Sign up
2. Create project: `navratna`
3. Create database: `navratna`
4. Copy connection string from dashboard

### Environment Variable

```env
POSTGRES_URL=postgresql://neondb_owner:xxx@ep-xxx-xxx.us-east-1.aws.neon.tech/navratna?sslmode=require
```

### Features Used

- ✅ TypeORM connections
- ✅ Migrations
- ✅ Connection pooling (built-in)
- ✅ Branching (for dev/staging)

---

## 2. Neo4j (Aura)

### What You Need

| Item | Value | Where to Find |
|------|-------|---------------|
| **Bolt URL** | `neo4j+s://xxx.databases.neo4j.io` | Instance details |
| **Username** | `neo4j` | Default |
| **Password** | Generated on creation | Save immediately! |

### Setup Steps

1. Go to [console.neo4j.io](https://console.neo4j.io) → Sign up
2. Create instance: **AuraDB Free**
3. Name: `navratna`
4. **SAVE THE PASSWORD** - shown only once!
5. Wait for instance to start (~2 min)

### Environment Variables

```env
NEO4J_URL=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-generated-password
```

### Features Used

- ✅ Cypher queries
- ✅ APOC (pre-installed on Aura)
- ✅ Graph Data Science (if enabled)
- ✅ Knowledge graph relationships

### Connection Code Update

```typescript
// Update neo4j driver for Aura
const driver = neo4j.driver(
  process.env.NEO4J_URL,  // neo4j+s:// protocol for Aura
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);
```

---

## 3. RabbitMQ (CloudAMQP)

### What You Need

| Item | Value | Where to Find |
|------|-------|---------------|
| **AMQP URL** | `amqps://user:pass@host/vhost` | Instance details |
| **Management URL** | `https://xxx.cloudamqp.com` | For web UI |
| **Virtual Host** | Auto-created | Part of URL |

### Setup Steps

1. Go to [cloudamqp.com](https://cloudamqp.com) → Sign up
2. Create instance: **Little Lemur (Free)**
3. Name: `navratna`
4. Region: Same as your backend
5. Copy AMQP URL

### Environment Variable

```env
RABBITMQ_URL=amqps://username:password@puffin.rmq2.cloudamqp.com/username
```

### Features Used

- ✅ Message queues
- ✅ Event-driven communication
- ✅ Management UI (web)
- ✅ AMQPS (TLS)

### Free Tier Limits

- 1M messages/month
- 100 queues
- 20 connections
- Shared instance

---

## 4. Redis (Upstash)

### What You Need

| Item | Value | Where to Find |
|------|-------|---------------|
| **Redis URL** | `rediss://default:xxx@xxx.upstash.io:6379` | Database details |
| **REST URL** | `https://xxx.upstash.io` | For REST API |
| **REST Token** | `AXxxxx` | For REST API |

### Setup Steps

1. Go to [upstash.com](https://upstash.com) → Sign up
2. Create database
3. Name: `navratna`
4. Region: Same as backend
5. Copy Redis URL

### Environment Variable

```env
REDIS_URL=rediss://default:AXxxx@us1-xxx-xxx.upstash.io:6379
```

### Features Used

- ✅ Caching
- ✅ Sessions
- ✅ Pub/Sub (for real-time)
- ✅ Rate limiting

---

## 5. Qdrant (Qdrant Cloud)

### What You Need

| Item | Value | Where to Find |
|------|-------|---------------|
| **Cluster URL** | `https://xxx.cloud.qdrant.io:6333` | Cluster details |
| **API Key** | `xxx` | Access Management |

### Setup Steps

1. Go to [cloud.qdrant.io](https://cloud.qdrant.io) → Sign up
2. Create cluster: **Free Tier**
3. Name: `navratna`
4. Copy URL and create API key

### Environment Variables

```env
QDRANT_URL=https://xxx-xxx.us-east4-0.gcp.cloud.qdrant.io:6333
QDRANT_API_KEY=your-api-key
```

### Features Used

- ✅ Vector storage
- ✅ Semantic search
- ✅ Collections (knowledge, agents)
- ✅ Filtering

---

## 6. Object Storage (Cloudflare R2)

### What You Need

| Item | Value | Where to Find |
|------|-------|---------------|
| **Account ID** | `xxx` | Dashboard URL |
| **Bucket Name** | `navratna-storage-prod` | R2 section |
| **Access Key ID** | `xxx` | R2 API Tokens |
| **Secret Access Key** | `xxx` | R2 API Tokens |
| **Endpoint** | `https://<account-id>.r2.cloudflarestorage.com` | Derived |

### Setup Steps

1. Go to Cloudflare Dashboard → R2
2. Create bucket: `navratna-storage-prod`
3. Create API token (Manage R2 API Tokens)
4. Save credentials

### Environment Variables

```env
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
S3_ACCESS_KEY=your-access-key-id
S3_SECRET_KEY=your-secret-access-key
S3_BUCKET=navratna-storage-prod
S3_REGION=auto
```

---

## Complete .env Template

```env
# =============================================================================
# Navratna - Managed Services Configuration
# =============================================================================

# Application
NODE_ENV=production
PORT=3000
JWT_SECRET=generate-a-secure-secret-here

# PostgreSQL (Neon)
POSTGRES_URL=postgresql://user:pass@ep-xxx.neon.tech/navratna?sslmode=require

# Neo4j (Aura)
NEO4J_URL=neo4j+s://xxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password

# Redis (Upstash)
REDIS_URL=rediss://default:xxx@us1-xxx.upstash.io:6379

# RabbitMQ (CloudAMQP)
RABBITMQ_URL=amqps://user:pass@puffin.rmq2.cloudamqp.com/vhost

# Qdrant (Cloud)
QDRANT_URL=https://xxx.cloud.qdrant.io:6333
QDRANT_API_KEY=your-api-key

# Storage (R2)
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY=xxx
S3_SECRET_KEY=xxx
S3_BUCKET=navratna-storage-prod
S3_REGION=auto

# Embeddings (choose one)
# Option A: OpenAI
OPENAI_API_KEY=sk-xxx
EMBEDDING_MODEL=text-embedding-3-small

# Option B: Self-hosted TEI
# TEI_EMBEDDING_URL=http://your-gpu-server:8080

# Frontend URL (for CORS)
FRONTEND_URL=https://navratna.app
CORS_ORIGINS=https://navratna.app,https://www.navratna.app
```

---

## Service Signup Links

| Service | Link | Free Tier |
|---------|------|-----------|
| **Neon (PostgreSQL)** | [neon.tech](https://neon.tech) | 0.5GB |
| **Neo4j Aura** | [console.neo4j.io](https://console.neo4j.io) | 200K nodes |
| **CloudAMQP** | [cloudamqp.com](https://cloudamqp.com) | 1M msgs/mo |
| **Upstash (Redis)** | [upstash.com](https://upstash.com) | 10K cmds/day |
| **Qdrant Cloud** | [cloud.qdrant.io](https://cloud.qdrant.io) | 1GB |
| **Cloudflare R2** | [cloudflare.com/r2](https://cloudflare.com/r2) | 10GB |

---

## Code Changes Required

### 1. Neo4j Connection (Aura uses `neo4j+s://`)

```typescript
// backend/shared/services/src/neo4jService.ts
const driver = neo4j.driver(
  process.env.NEO4J_URL,  // neo4j+s://xxx.databases.neo4j.io
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD
  ),
  {
    encrypted: true,  // Required for Aura
    trust: 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES'
  }
);
```

### 2. Redis (Upstash uses `rediss://`)

```typescript
// Already compatible - just use the rediss:// URL
// ioredis handles TLS automatically with rediss:// protocol
```

### 3. RabbitMQ (CloudAMQP uses `amqps://`)

```typescript
// Already compatible - just use the amqps:// URL
// amqplib handles TLS automatically with amqps:// protocol
```

### 4. S3/R2 Storage

```typescript
// backend/shared/services/src/storageService.ts
import { S3Client } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
```
