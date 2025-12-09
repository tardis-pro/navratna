# Navratna Cloudflare Deployment

This directory contains the Cloudflare deployment configuration for Navratna.

## Infrastructure Mapping

### What Can Run on Cloudflare

| Component            | Cloudflare Service | Status | Notes                               |
| -------------------- | ------------------ | ------ | ----------------------------------- |
| **Frontend (React)** | Cloudflare Pages   | Ready  | Static site hosting with global CDN |
| **API Gateway**      | Cloudflare Workers | Ready  | Edge routing, CORS, rate limiting   |
| **Object Storage**   | Cloudflare R2      | Ready  | S3-compatible, replaces MinIO       |
| **Caching**          | Cloudflare KV      | Ready  | Edge key-value store                |
| **CDN**              | Built-in           | Ready  | Automatic with Pages/Workers        |
| **SSL/TLS**          | Built-in           | Ready  | Automatic certificates              |
| **DDoS Protection**  | Built-in           | Ready  | Automatic                           |
| **DNS**              | Cloudflare DNS     | Ready  | Free with account                   |

### What Needs Traditional Infrastructure

| Component            | Recommended Hosting      | Alternative     |
| -------------------- | ------------------------ | --------------- |
| **PostgreSQL**       | Neon, Supabase, RDS      | Self-hosted VPS |
| **Neo4j**            | Neo4j Aura               | Self-hosted VPS |
| **Redis**            | Upstash                  | Self-hosted VPS |
| **Qdrant**           | Qdrant Cloud             | Self-hosted VPS |
| **RabbitMQ**         | CloudAMQP                | Self-hosted VPS |
| **TEI Embeddings**   | GPU VPS (Lambda, RunPod) | EC2 g4dn        |
| **Backend Services** | fly.io, Railway, EC2     | Docker on VPS   |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE EDGE                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Pages     │  │   Workers   │  │     R2      │             │
│  │  (Frontend) │  │ (API GW)    │  │  (Storage)  │             │
│  └─────────────┘  └──────┬──────┘  └─────────────┘             │
│                          │                                      │
│  ┌─────────────┐  ┌──────┴──────┐                              │
│  │     KV      │  │ Rate Limit  │                              │
│  │  (Cache)    │  │   (Edge)    │                              │
│  └─────────────┘  └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND INFRASTRUCTURE                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Backend Services                          ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       ││
│  │  │  Agent   │ │Orchestr. │ │Capability│ │ Security │       ││
│  │  │  Intel   │ │ Pipeline │ │ Registry │ │ Gateway  │       ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                    ││
│  │  │Discussion│ │ Artifact │ │   LLM    │                    ││
│  │  │  Orch    │ │ Service  │ │ Service  │                    ││
│  │  └──────────┘ └──────────┘ └──────────┘                    ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                      Databases                               ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       ││
│  │  │PostgreSQL│ │  Neo4j   │ │  Redis   │ │  Qdrant  │       ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    ML/AI Services                            ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                    ││
│  │  │   TEI    │ │ Reranker │ │ RabbitMQ │                    ││
│  │  │Embeddings│ │          │ │          │                    ││
│  │  └──────────┘ └──────────┘ └──────────┘                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

1. Cloudflare account
2. Node.js 18+
3. pnpm or npm
4. Wrangler CLI

### Installation

```bash
# Install wrangler globally
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Install dependencies
cd deploy/cloudflare
pnpm install
```

### Development

```bash
# Run worker locally
pnpm dev

# Run with local bindings simulation
pnpm dev:local
```

### Deployment

```bash
# Deploy to staging
./deploy.sh staging

# Deploy to production
./deploy.sh production
```

## Configuration

### Environment Variables

Set these in Cloudflare dashboard or via `wrangler secret`:

| Variable      | Description        | Required |
| ------------- | ------------------ | -------- |
| `BACKEND_URL` | Backend API URL    | Yes      |
| `JWT_SECRET`  | JWT signing secret | Yes      |
| `API_KEY`     | Internal API key   | No       |

### Secrets

```bash
# Set secrets for production
wrangler secret put JWT_SECRET --env production
wrangler secret put API_KEY --env production
```

### DNS Configuration

Add these records in Cloudflare DNS:

| Type  | Name    | Target                           | Proxy |
| ----- | ------- | -------------------------------- | ----- |
| CNAME | @       | navratna.pages.dev               | Yes   |
| CNAME | www     | navratna.pages.dev               | Yes   |
| CNAME | api     | navratna-api-gateway.workers.dev | Yes   |
| A     | backend | <your-backend-ip>                | Yes   |

## R2 Storage

R2 replaces MinIO for object storage:

```typescript
// Upload file
await STORAGE.put('path/to/file', data, {
  httpMetadata: { contentType: 'image/png' },
});

// Get file
const object = await STORAGE.get('path/to/file');

// Delete file
await STORAGE.delete('path/to/file');
```

## KV Caching

Edge caching with KV:

```typescript
// Set cache
await CACHE.put('key', JSON.stringify(data), { expirationTtl: 3600 });

// Get cache
const cached = await CACHE.get('key', 'json');

// Delete cache
await CACHE.delete('key');
```

## Monitoring

### Logs

```bash
# Tail production logs
wrangler tail --env production

# Tail staging logs
wrangler tail --env staging
```

### Metrics

View in Cloudflare dashboard:

- Workers Analytics
- Pages Analytics
- R2 Metrics
- KV Metrics

## CI/CD Integration

See `.github/workflows/cloudflare.yml` for GitHub Actions integration.

### Required Secrets

Set in GitHub repository settings:

| Secret                  | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with Workers/Pages/R2 permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                             |

## Cost Estimation

### Free Tier Limits

| Service | Free Tier                           |
| ------- | ----------------------------------- |
| Workers | 100,000 requests/day                |
| Pages   | Unlimited                           |
| R2      | 10GB storage, 10M Class A ops/month |
| KV      | 100,000 reads/day                   |

### Paid Plans (if exceeded)

- Workers: $5/10M requests
- R2: $0.015/GB storage, $0.36/1M Class A ops
- KV: $0.50/1M reads

## Troubleshooting

### Common Issues

1. **Worker not deploying**

   ```bash
   wrangler whoami  # Check login
   wrangler deploy --dry-run  # Test without deploying
   ```

2. **KV namespace not found**
   - Ensure namespace ID is set in wrangler.toml
   - Run `wrangler kv:namespace list` to see available namespaces

3. **R2 bucket access denied**
   - Check bucket binding name matches wrangler.toml
   - Verify API token has R2 permissions

4. **CORS errors**
   - Check CORS_ORIGINS environment variable
   - Ensure origin is in allowed list

## Related Documentation

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
