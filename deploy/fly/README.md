# Navratna - Fly.io Backend Deployment

Deploy all 7 backend services to Fly.io.

---

## Quick Start

```bash
# 1. Install Fly CLI
curl -L https://fly.io/install.sh | sh

# 2. Login
fly auth login

# 3. Create apps
./deploy.sh setup

# 4. Set secrets (edit .env.fly first)
./deploy.sh secrets all

# 5. Deploy all services
./deploy.sh deploy all
```

---

## Services Deployed

| Service                  | App Name                            | Port | URL                                               |
| ------------------------ | ----------------------------------- | ---- | ------------------------------------------------- |
| Agent Intelligence       | `navratna-agent-intelligence`       | 3001 | https://navratna-agent-intelligence.fly.dev       |
| Orchestration Pipeline   | `navratna-orchestration-pipeline`   | 3002 | https://navratna-orchestration-pipeline.fly.dev   |
| Capability Registry      | `navratna-capability-registry`      | 3003 | https://navratna-capability-registry.fly.dev      |
| Security Gateway         | `navratna-security-gateway`         | 3004 | https://navratna-security-gateway.fly.dev         |
| Discussion Orchestration | `navratna-discussion-orchestration` | 3005 | https://navratna-discussion-orchestration.fly.dev |
| Artifact Service         | `navratna-artifact-service`         | 3006 | https://navratna-artifact-service.fly.dev         |
| LLM Service              | `navratna-llm-service`              | 3007 | https://navratna-llm-service.fly.dev              |

---

## Commands

```bash
# Setup
./deploy.sh setup                     # Create all Fly apps
./deploy.sh setup security-gateway    # Create one app

# Deploy
./deploy.sh deploy all                # Deploy all services
./deploy.sh deploy security-gateway   # Deploy one service

# Secrets
./deploy.sh secrets all               # Set secrets for all
./deploy.sh secrets security-gateway  # Set secrets for one

# Status
./deploy.sh status                    # Check all services

# Logs
./deploy.sh logs security-gateway     # View logs

# Scale
./deploy.sh scale security-gateway    # Show scale options
fly scale count 2 --app navratna-security-gateway
```

---

## Configuration

### 1. Create `.env.fly`

```bash
cp .env.fly.example .env.fly
# Edit with your values
```

### 2. Required Secrets

```env
# PostgreSQL (Neon)
POSTGRES_URL=postgresql://user:pass@ep-xxx.neon.tech/navratna?sslmode=require

# Neo4j (Aura)
NEO4J_URL=neo4j+s://xxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=xxx

# Redis (Upstash)
REDIS_URL=rediss://default:xxx@us1-xxx.upstash.io:6379

# RabbitMQ (CloudAMQP)
RABBITMQ_URL=amqps://user:pass@puffin.rmq2.cloudamqp.com/vhost

# Qdrant (Cloud)
QDRANT_URL=https://xxx.cloud.qdrant.io:6333
QDRANT_API_KEY=xxx

# Storage (R2)
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY=xxx
S3_SECRET_KEY=xxx
S3_BUCKET=navratna-storage-prod

# Application
JWT_SECRET=your-secret
FRONTEND_URL=https://navratna.pages.dev
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE EDGE                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │  Pages   │  │ Workers  │  │    R2    │                       │
│  │(Frontend)│  │(API GW)  │  │(Storage) │                       │
│  └──────────┘  └────┬─────┘  └──────────┘                       │
└─────────────────────┼───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                       FLY.IO                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  Agent   │ │Security  │ │Orchestr. │ │Capability│           │
│  │  Intel   │ │ Gateway  │ │ Pipeline │ │ Registry │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │Discussion│ │ Artifact │ │   LLM    │                        │
│  │  Orch    │ │ Service  │ │ Service  │                        │
│  └──────────┘ └──────────┘ └──────────┘                        │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MANAGED DATABASES                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │   Neon   │ │Neo4j Aura│ │ Upstash  │ │  Qdrant  │           │
│  │(Postgres)│ │ (Graph)  │ │ (Redis)  │ │ (Vector) │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐                                                   │
│  │CloudAMQP │                                                   │
│  │(RabbitMQ)│                                                   │
│  └──────────┘                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Costs

### Fly.io Pricing

| Resource  | Free Tier               | Paid               |
| --------- | ----------------------- | ------------------ |
| VMs       | 3 shared-cpu-1x (256MB) | $1.94/mo per 256MB |
| Bandwidth | 100GB/mo                | $0.02/GB           |
| IPv4      | $2/mo per app           | -                  |

### Estimated Cost (7 services)

| Config                     | Monthly Cost |
| -------------------------- | ------------ |
| Minimal (256MB each, Bun)  | ~$15/mo      |
| Standard (512MB each, Bun) | ~$30/mo      |
| Production (1GB + HA)      | ~$100/mo     |

**Note:** Using Bun runtime for faster startup and lower memory usage.

---

## Scaling

```bash
# Add instances
fly scale count 2 --app navratna-security-gateway

# Increase memory
fly scale memory 1024 --app navratna-security-gateway

# Change VM type
fly scale vm shared-cpu-2x --app navratna-security-gateway
```

---

## Monitoring

```bash
# View logs
fly logs --app navratna-security-gateway

# SSH into machine
fly ssh console --app navratna-security-gateway

# View metrics
fly dashboard --app navratna-security-gateway
```

---

## Custom Domains

```bash
# Add custom domain
fly certs create api.navratna.app --app navratna-security-gateway

# Then add CNAME in Cloudflare:
# api.navratna.app -> navratna-security-gateway.fly.dev
```

---

## Troubleshooting

### Service won't start

```bash
# Check logs
fly logs --app navratna-service-name

# Check machine status
fly status --app navratna-service-name

# SSH and debug
fly ssh console --app navratna-service-name
```

### Database connection issues

- Ensure secrets are set: `fly secrets list --app navratna-service-name`
- Check connection strings include `?sslmode=require`
- Verify IP allowlists on managed databases

### Out of memory

```bash
fly scale memory 1024 --app navratna-service-name
```
