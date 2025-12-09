# Navratna - Cloudflare Dashboard Deployment Guide

Deploy directly from Cloudflare Dashboard without GitHub Actions.

---

## 1. Frontend - Cloudflare Pages

### Setup (One-time)

1. Go to **Cloudflare Dashboard** → **Pages**
2. Click **Create a project** → **Connect to Git**
3. Select your repository: `navratna`
4. Configure build settings:

| Setting | Value |
|---------|-------|
| **Project name** | `navratna` |
| **Production branch** | `main` |
| **Framework preset** | `Vite` |
| **Build command** | `pnpm install && pnpm run build:frontend` |
| **Build output directory** | `apps/frontend/dist` |
| **Root directory** | `/` |

5. Add **Environment variables**:

| Variable | Production | Preview |
|----------|------------|---------|
| `NODE_VERSION` | `18` | `18` |
| `VITE_API_URL` | `https://api.navratna.app` | `https://api-staging.navratna.app` |

6. Click **Save and Deploy**

### Auto-Deploy Triggers
- Push to `main` → Production deploy
- Push to other branches → Preview deploy
- Pull requests → Preview deploy with comment

---

## 2. R2 Storage Bucket

### Setup (One-time)

1. Go to **Cloudflare Dashboard** → **R2**
2. Click **Create bucket**
3. Create buckets:

| Bucket Name | Purpose |
|-------------|---------|
| `navratna-storage-prod` | Production file storage |
| `navratna-storage-staging` | Staging file storage |

4. For each bucket, configure:
   - **CORS Policy** (click bucket → Settings → CORS):
   ```json
   [
     {
       "AllowedOrigins": ["https://navratna.app", "https://*.navratna.app"],
       "AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. Create **R2 API Token** for backend access:
   - Go to **R2** → **Manage R2 API Tokens**
   - Create token with read/write permissions
   - Save the credentials for backend `.env`

---

## 3. Workers (API Gateway) - Optional

If you want edge routing/caching:

### Setup via Dashboard

1. Go to **Cloudflare Dashboard** → **Workers & Pages**
2. Click **Create application** → **Create Worker**
3. Name it: `navratna-api-gateway`
4. Paste the worker code from `deploy/cloudflare/src/worker.ts`
5. Configure:
   - **Routes**: `api.navratna.app/*`
   - **Environment Variables**:
     | Variable | Value |
     |----------|-------|
     | `BACKEND_URL` | `https://backend.navratna.app` |
     | `CORS_ORIGINS` | `https://navratna.app` |
     | `ENVIRONMENT` | `production` |

### Or Deploy via CLI (simpler)

```bash
cd deploy/cloudflare
pnpm install
wrangler login
wrangler deploy --env production
```

---

## 4. DNS Configuration

Go to **Cloudflare Dashboard** → **DNS**:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| `CNAME` | `@` | `navratna.pages.dev` | ✅ Proxied |
| `CNAME` | `www` | `navratna.pages.dev` | ✅ Proxied |
| `A` | `backend` | `<your-ec2-ip>` | ✅ Proxied |
| `A` | `api` | `<your-ec2-ip>` | ✅ Proxied |

---

## 5. SSL/TLS Settings

Go to **Cloudflare Dashboard** → **SSL/TLS**:

1. **Overview**: Set to **Full (strict)**
2. **Edge Certificates**: Enable **Always Use HTTPS**
3. **Origin Server**: Create origin certificate for backend

---

## 6. Backend Services (NOT on Cloudflare)

These need traditional hosting. Quick alternatives:

| Service | Cloud Alternative | Self-Hosted |
|---------|------------------|-------------|
| **PostgreSQL** | [Neon](https://neon.tech) (free tier) | EC2/VPS |
| **Neo4j** | [Neo4j Aura](https://neo4j.com/aura) (free tier) | EC2/VPS |
| **Redis** | [Upstash](https://upstash.com) (free tier) | EC2/VPS |
| **Qdrant** | [Qdrant Cloud](https://cloud.qdrant.io) | EC2/VPS |
| **RabbitMQ** | [CloudAMQP](https://cloudamqp.com) (free tier) | EC2/VPS |
| **Backend Services** | [Railway](https://railway.app) / [Fly.io](https://fly.io) | EC2/Docker |

---

## Quick Deploy Checklist

```
☐ 1. Create Cloudflare account
☐ 2. Add domain to Cloudflare
☐ 3. Create Pages project (connect to Git)
☐ 4. Create R2 buckets
☐ 5. Configure DNS records
☐ 6. Set SSL to Full (strict)
☐ 7. Deploy backend to EC2/Railway
☐ 8. Update VITE_API_URL in Pages settings
☐ 9. Test deployment
```

---

## Environment Variables Reference

### Cloudflare Pages (Frontend)

Set in **Pages** → **Settings** → **Environment variables**:

```
NODE_VERSION=18
VITE_API_URL=https://api.navratna.app
```

### Backend (.env) - R2 Access

```env
# R2 Storage (replaces MinIO)
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=navratna-storage-prod
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
```

---

## Manual Deploy (No Git Integration)

If you prefer manual deploys:

```bash
# Build frontend locally
pnpm run build:frontend

# Deploy to Pages via CLI
npx wrangler pages deploy apps/frontend/dist --project-name=navratna
```
