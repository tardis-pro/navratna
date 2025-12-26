# Getting Started

Local setup and the standard dev workflow.

## Prerequisites

- Node.js 18+
- pnpm 8+
- Docker + Docker Compose
- Git

## Setup

```bash
git clone <repository-url>
cd navratna
pnpm install
cp sample.env .env
```

Update `.env` with any required API keys. Use `ENVIRONMENT_CONFIG.md` for the full reference.

## Run Locally

```bash
pnpm dev
```

Targeted runs:

```bash
pnpm dev:frontend
pnpm dev:backend
```

If services depend on infrastructure, start them with `docker-compose up -d` using the repo compose files.

## Verify

- Frontend: http://localhost:3000
- API Gateway: http://localhost:8081
- API Docs: http://localhost:8081/docs
- Health: http://localhost:8081/health

## Common Checks

```bash
pnpm lint
pnpm test
pnpm test:integration
```
