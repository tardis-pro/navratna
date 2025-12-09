# Navratna - Infrastructure Alternatives

Cloud alternatives for each Docker service.

---

## Quick Reference

| Docker Service     | Cloudflare        | Managed Cloud          | Self-Hosted  |
| ------------------ | ----------------- | ---------------------- | ------------ |
| **Frontend**       | ✅ Pages          | Vercel, Netlify        | Nginx        |
| **nginx (API GW)** | ✅ Workers        | -                      | Nginx, Caddy |
| **PostgreSQL**     | ❌                | Neon, Supabase, RDS    | VPS          |
| **Neo4j**          | ❌                | Neo4j Aura             | VPS          |
| **Redis**          | 🔶 KV (partial)   | Upstash, ElastiCache   | VPS          |
| **Qdrant**         | ❌                | Qdrant Cloud           | VPS          |
| **RabbitMQ**       | 🔶 Queues (basic) | CloudAMQP              | VPS          |
| **MinIO**          | ✅ R2             | S3, Backblaze B2       | VPS          |
| **TEI Embeddings** | ❌                | Hugging Face Inference | GPU VPS      |
| **Prometheus**     | ❌                | Grafana Cloud          | VPS          |
| **Grafana**        | ❌                | Grafana Cloud          | VPS          |

---

## Detailed Alternatives

### 1. PostgreSQL

**Docker**: `postgres:17.5-bullseye`

| Provider                                   | Free Tier            | Paid        | Best For              |
| ------------------------------------------ | -------------------- | ----------- | --------------------- |
| **[Neon](https://neon.tech)**              | 0.5GB, branching     | $19/mo      | Serverless, branching |
| **[Supabase](https://supabase.com)**       | 500MB, 2 projects    | $25/mo      | Full BaaS             |
| **[Railway](https://railway.app)**         | $5 credit/mo         | Usage-based | Quick setup           |
| **[AWS RDS](https://aws.amazon.com/rds/)** | 750hrs/mo (t2.micro) | ~$15/mo     | Enterprise            |
| **[PlanetScale](https://planetscale.com)** | 5GB (MySQL)          | $29/mo      | MySQL-compatible      |

**Recommended**: **Neon** (serverless, auto-scaling, branching for dev)

```env
# Neon connection
POSTGRES_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/navratna?sslmode=require
```

---

### 2. Neo4j

**Docker**: `neo4j:2025.04.0-community-bullseye`

| Provider                                        | Free Tier             | Paid     | Best For          |
| ----------------------------------------------- | --------------------- | -------- | ----------------- |
| **[Neo4j Aura](https://neo4j.com/cloud/aura/)** | 200K nodes, 400K rels | $65/mo   | Official, managed |
| **[Memgraph Cloud](https://memgraph.com)**      | 1GB                   | $30/mo   | Cypher-compatible |
| Self-hosted                                     | -                     | VPS cost | Full control      |

**Recommended**: **Neo4j Aura Free** (official, good free tier)

```env
# Neo4j Aura connection
NEO4J_URL=neo4j+s://xxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
```

---

### 3. Redis

**Docker**: `redis:8-alpine`

| Provider                                                   | Free Tier    | Paid      | Best For           |
| ---------------------------------------------------------- | ------------ | --------- | ------------------ |
| **[Upstash](https://upstash.com)**                         | 10K cmds/day | $0.2/100K | Serverless, global |
| **[Redis Cloud](https://redis.com/cloud/)**                | 30MB         | $7/mo     | Official Redis     |
| **[Railway](https://railway.app)**                         | $5 credit    | Usage     | Quick setup        |
| **[AWS ElastiCache](https://aws.amazon.com/elasticache/)** | -            | ~$12/mo   | Enterprise         |

**Recommended**: **Upstash** (serverless, REST API, global replication)

```env
# Upstash Redis
REDIS_URL=rediss://default:xxx@us1-xxx.upstash.io:6379
```

---

### 4. Qdrant (Vector DB)

**Docker**: `qdrant/qdrant:v1.14.1`

| Provider                                    | Free Tier       | Paid     | Best For      |
| ------------------------------------------- | --------------- | -------- | ------------- |
| **[Qdrant Cloud](https://cloud.qdrant.io)** | 1GB, 1M vectors | $25/mo   | Official      |
| **[Pinecone](https://pinecone.io)**         | 100K vectors    | $70/mo   | Serverless    |
| **[Weaviate Cloud](https://weaviate.io)**   | 14-day trial    | $25/mo   | Hybrid search |
| Self-hosted                                 | -               | VPS cost | Full control  |

**Recommended**: **Qdrant Cloud** (same API as self-hosted)

```env
# Qdrant Cloud
QDRANT_URL=https://xxx.us-east4-0.gcp.cloud.qdrant.io:6333
QDRANT_API_KEY=your-api-key
```

---

### 5. RabbitMQ

**Docker**: `rabbitmq:4.1.0-management-alpine`

| Provider                                           | Free Tier              | Paid     | Best For        |
| -------------------------------------------------- | ---------------------- | -------- | --------------- |
| **[CloudAMQP](https://cloudamqp.com)**             | 1M msgs/mo, 100 queues | $19/mo   | Full RabbitMQ   |
| **[Amazon MQ](https://aws.amazon.com/amazon-mq/)** | -                      | ~$30/mo  | AWS integration |
| **Cloudflare Queues**                              | 1M/mo                  | $0.40/M  | Simple queuing  |
| Self-hosted                                        | -                      | VPS cost | Full control    |

**Recommended**: **CloudAMQP** (managed RabbitMQ, good free tier)

```env
# CloudAMQP
RABBITMQ_URL=amqps://user:pass@puffin.rmq2.cloudamqp.com/vhost
```

---

### 6. MinIO → R2

**Docker**: `minio/minio:latest`

| Provider                                       | Free Tier     | Paid      | Best For                 |
| ---------------------------------------------- | ------------- | --------- | ------------------------ |
| **[Cloudflare R2](https://cloudflare.com/r2)** | 10GB, 10M ops | $0.015/GB | S3-compatible, no egress |
| **[AWS S3](https://aws.amazon.com/s3/)**       | 5GB, 12mo     | $0.023/GB | Standard                 |
| **[Backblaze B2](https://backblaze.com/b2)**   | 10GB          | $0.005/GB | Cheapest                 |

**Recommended**: **Cloudflare R2** (no egress fees, S3-compatible)

```env
# R2 (S3-compatible)
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_BUCKET=navratna-storage-prod
S3_REGION=auto
```

---

### 7. TEI Embeddings

**Docker**: `ghcr.io/huggingface/text-embeddings-inference:1.7`

| Provider                                                           | Free Tier     | Paid              | Best For         |
| ------------------------------------------------------------------ | ------------- | ----------------- | ---------------- |
| **[Hugging Face Inference](https://huggingface.co/inference-api)** | Rate limited  | $0.06/1K tokens   | Hosted models    |
| **[OpenAI Embeddings](https://openai.com)**                        | -             | $0.0001/1K tokens | text-embedding-3 |
| **[Voyage AI](https://voyageai.com)**                              | 50M tokens/mo | $0.10/M           | High quality     |
| **GPU VPS**                                                        | -             | $0.50/hr          | Self-hosted TEI  |

**Recommended**: **OpenAI** for simplicity, **GPU VPS** for cost at scale

```env
# OpenAI Embeddings
OPENAI_API_KEY=sk-xxx
EMBEDDING_MODEL=text-embedding-3-small

# Or TEI on GPU VPS
TEI_EMBEDDING_URL=http://your-gpu-vps:8080
```

---

### 8. Prometheus + Grafana

**Docker**: `prom/prometheus`, `grafana/grafana`

| Provider                                       | Free Tier              | Paid     | Best For     |
| ---------------------------------------------- | ---------------------- | -------- | ------------ |
| **[Grafana Cloud](https://grafana.com/cloud)** | 10K metrics, 50GB logs | $49/mo   | Full stack   |
| **[New Relic](https://newrelic.com)**          | 100GB/mo               | Usage    | APM + infra  |
| **[Datadog](https://datadoghq.com)**           | 14-day trial           | $15/host | Enterprise   |
| Self-hosted                                    | -                      | VPS cost | Full control |

**Recommended**: **Grafana Cloud Free** (integrates with existing dashboards)

---

## Deployment Combinations

### Option A: Fully Managed (Recommended for MVP)

```
Frontend      → Cloudflare Pages (free)
API Gateway   → Cloudflare Workers (free)
Storage       → Cloudflare R2 (free tier)
PostgreSQL    → Neon (free tier)
Neo4j         → Neo4j Aura (free tier)
Redis         → Upstash (free tier)
Qdrant        → Qdrant Cloud (free tier)
RabbitMQ      → CloudAMQP (free tier)
Embeddings    → OpenAI API
Monitoring    → Grafana Cloud (free tier)
Backend       → Railway ($5/mo) or Fly.io (free tier)

Estimated Cost: $0-20/month
```

### Option B: Hybrid (Best Balance)

```
Frontend      → Cloudflare Pages
API Gateway   → Cloudflare Workers
Storage       → Cloudflare R2
Backend + DBs → Single EC2 t3.medium with Docker Compose

Estimated Cost: ~$35/month (EC2 + domains)
```

### Option C: Self-Hosted (Full Control)

```
Everything on EC2/VPS with Docker Compose
- t3.xlarge for all services
- Optional: g4dn.xlarge for GPU embeddings

Estimated Cost: ~$100-200/month
```

---

## Migration Path

### From Docker to Managed Services

1. **Phase 1**: Move frontend to Cloudflare Pages
2. **Phase 2**: Move storage to R2
3. **Phase 3**: Move databases to managed (Neon, Neo4j Aura, etc.)
4. **Phase 4**: Move backend to Railway/Fly.io
5. **Phase 5**: Set up monitoring with Grafana Cloud

### Environment Variables Template

```env
# =============================================================================
# Navratna - Cloud Deployment Environment
# =============================================================================

# Frontend (Cloudflare Pages - set in dashboard)
VITE_API_URL=https://api.navratna.app

# PostgreSQL (Neon)
POSTGRES_URL=postgresql://user:pass@ep-xxx.neon.tech/navratna?sslmode=require

# Neo4j (Aura)
NEO4J_URL=neo4j+s://xxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=xxx

# Redis (Upstash)
REDIS_URL=rediss://default:xxx@us1-xxx.upstash.io:6379

# Qdrant (Cloud)
QDRANT_URL=https://xxx.cloud.qdrant.io:6333
QDRANT_API_KEY=xxx

# RabbitMQ (CloudAMQP)
RABBITMQ_URL=amqps://user:pass@puffin.rmq2.cloudamqp.com/vhost

# Storage (R2)
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY=xxx
S3_SECRET_KEY=xxx
S3_BUCKET=navratna-storage-prod

# Embeddings (OpenAI or self-hosted)
OPENAI_API_KEY=sk-xxx
# or TEI_EMBEDDING_URL=http://gpu-vps:8080

# Application
JWT_SECRET=xxx
NODE_ENV=production
```
