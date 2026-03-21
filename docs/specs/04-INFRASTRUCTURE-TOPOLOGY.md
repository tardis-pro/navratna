---
# Infrastructure Topology — Navratna v3.0

## Document Control
- **Version**: 1.0
- **Date**: 2026-03-21
- **Purpose**: Define the multi-machine local-first infrastructure with RunPod burst

## Design Principles

1. **Own the hardware**: No vendor can shut you off. Machines are the afterlife.
2. **Local-first**: All private data stays on your devices
3. **Burst to cloud**: Only for long/critical tasks, GPU inference overflow
4. **Zero-trust networking**: Tailscale WireGuard mesh, mTLS between planes
5. **On-demand compute**: Coding sandboxes spin up when needed, hibernate when idle

## Machine Roles

### PC-A: Memory + Intelligence

The brain. Stores all knowledge, runs agent intelligence, serves local LLM inference.

```yaml
role: memory-intelligence
services:
  databases:
    - postgresql:
        version: "16-alpine"
        port: 5432
        data: /data/navratna/pg/
        memory: 256MB
        config:
          shared_buffers: 128MB
          work_mem: 4MB
          max_connections: 100

    - neo4j:
        version: "2025.04.0-community"
        ports: [7474, 7687]
        data: /data/navratna/neo4j/
        memory: 512MB (heap capped)
        config:
          dbms.memory.heap.max_size: 512m
          dbms.memory.pagecache.size: 256m

    - qdrant:
        version: "1.14.1"
        ports: [6333, 6334]
        data: /data/navratna/qdrant/
        memory: 512MB

    - redis:
        version: "8-alpine"
        port: 6379
        data: /data/navratna/redis/
        memory: 256MB
        config:
          maxmemory: 256mb
          maxmemory-policy: allkeys-lru

  application:
    - navratna-core:
        # Agent Intelligence + Discussion Orchestration +
        # Artifact Service + LLM Service (consolidated)
        port: 3001
        memory: 512MB

    - ollama:
        port: 11434
        data: /data/navratna/models/
        memory: 2-8GB (depends on loaded model)
        models:
          always_loaded: [nomic-embed-text]  # embeddings
          on_demand: [llama-3.1-70b, codestral-22b, qwen-2.5-coder-32b]

storage:
  /data/navratna/pg/:       50GB   # PostgreSQL data
  /data/navratna/neo4j/:    30GB   # Graph data
  /data/navratna/qdrant/:   20GB   # Vector indices
  /data/navratna/redis/:     5GB   # Cache + BullMQ
  /data/navratna/models/:  100GB   # Ollama model weights
  /data/navratna/backups/:  50GB   # Nightly snapshots
  # TOTAL: ~255GB → 512GB NVMe recommended

estimated_memory: 4-10GB (without GPU models loaded)
gpu: Optional — if NVIDIA GPU present, Ollama uses it for inference
```

### PC-B: Control + Compute

The dispatcher. Runs security, orchestration, and half the coding sandboxes.

```yaml
role: control-compute
services:
  application:
    - navratna-gateway:
        # Security Gateway + Orchestration Pipeline +
        # Capability Registry (consolidated)
        port: 3002
        memory: 512MB

    - nginx:
        port: 8081
        memory: 128MB

  compute:
    - openshell:
        # NVIDIA OpenShell K3s cluster
        # Hosts coding workspaces + tool sandboxes
        memory: 2-8GB (depends on active sandboxes)
        sandboxes:
          coding_workspaces: 8-10 repos
          tool_sandboxes: browser-automation, GOG, scrapers
        policy_engine: active
        privacy_router: active

storage:
  /data/repos/:        120GB   # 10 hot repos (4-12GB each)
  /data/cache/images/:  30GB   # Container image cache
  /data/cache/pnpm/:    10GB   # Shared pnpm store
  /data/cache/pip/:      5GB   # Python package cache
  /data/cache/contexts/: 5GB   # Claude Code context snapshots
  /data/scratch/:       30GB   # Temp build artifacts
  # TOTAL: ~200GB → 500GB NVMe recommended

estimated_memory: 4-12GB (depends on sandbox count)
```

### Mac: Interface + Overflow

The eyes and hands. Primary interface via Tauri Telescope. Overflow coding sandboxes.

```yaml
role: interface-overflow
services:
  interface:
    - tauri-telescope:
        # Native Tauri app wrapping Telescope UI
        port: 5173 (dev) / native (prod)
        memory: 256MB
        features:
          global_hotkey: true
          system_tray: true
          deep_links: "telescope://"
          local_mcp_sidecars: true

    - nginx:
        # Local proxy to PC-A/PC-B services
        port: 8081
        memory: 128MB

  compute:
    - openshell:
        # Secondary OpenShell K3s
        # Hosts remaining coding workspaces
        sandboxes:
          coding_workspaces: 8-10 repos
          personal_sessions: Pronit's direct Claude Code

  application:
    - artifact-service-local:
        # For low-latency artifact generation
        port: 3006
        memory: 256MB

storage:
  /data/repos/:        120GB   # 10 hot repos
  /data/cache/:         50GB   # Same cache structure as PC-B
  /data/local-work/:    50GB   # Personal coding sessions
  # TOTAL: ~220GB → 500GB SSD recommended

estimated_memory: 4-10GB (depends on sandbox count)
```

## Networking: Tailscale Mesh

### Setup
```bash
# On each machine:
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --hostname=pc-a-navratna   # PC-A
tailscale up --hostname=pc-b-navratna   # PC-B
tailscale up --hostname=mac-navratna    # Mac
```

### DNS (MagicDNS)
```
pc-a-navratna.tailnet:5432     → PostgreSQL
pc-a-navratna.tailnet:7687     → Neo4j Bolt
pc-a-navratna.tailnet:6333     → Qdrant HTTP
pc-a-navratna.tailnet:6379     → Redis
pc-a-navratna.tailnet:3001     → Navratna Core
pc-a-navratna.tailnet:11434    → Ollama
pc-b-navratna.tailnet:3002     → Navratna Gateway
pc-b-navratna.tailnet:8081     → Nginx Gateway
mac-navratna.tailnet:5173      → Telescope Dev
```

### ACLs (Tailscale Policy)
```json
{
  "acls": [
    // All local machines can reach each other
    {"action": "accept", "src": ["tag:navratna"], "dst": ["tag:navratna:*"]},

    // RunPod can reach: Gateway (auth), Core (tasks), Redis (events)
    {"action": "accept", "src": ["tag:runpod"], "dst": [
      "tag:navratna-gateway:3002",
      "tag:navratna-core:3001",
      "tag:navratna-redis:6379"
    ]},

    // RunPod CANNOT reach databases directly
    {"action": "deny", "src": ["tag:runpod"], "dst": [
      "tag:navratna-pca:5432",
      "tag:navratna-pca:7687",
      "tag:navratna-pca:6333"
    ]}
  ]
}
```

## RunPod: Burst Compute

RunPod is NOT part of the cluster. It's a mercenary. Ephemeral pods that join the Tailscale mesh, do work, and leave.

### When RunPod Activates
```yaml
burst_triggers:
  - condition: local_cpu_utilization > 85%
    action: spawn_runpod_cpu_pod
  - condition: local_memory_utilization > 80%
    action: spawn_runpod_cpu_pod
  - condition: task.priority == "critical" AND local_queue_depth > 3
    action: spawn_runpod_cpu_pod
  - condition: task.requires_gpu AND no_local_gpu
    action: spawn_runpod_gpu_pod
  - condition: task.estimated_duration > "4h"
    action: spawn_runpod_cpu_pod

never_on_runpod:
  - projects_with_trust_level: ring-0
  - tasks_involving: [credentials, auth, PII]
  - approval_membrane: always_local
```

### RunPod Pod Lifecycle
```
1. Orchestration Pipeline decides to burst
2. API call: RunPod create pod (16c/64GB CPU or A40 GPU)
3. Pod boots → installs Tailscale → joins mesh
4. Pod pulls task context from Navratna Gateway
5. Pod clones repo from GitHub (NOT from local LAN — too slow over WAN)
6. Pod installs deps from npm/pip (NOT from local cache)
7. Pod works: writes code, runs tests, creates PR
8. Pod uploads context snapshot to Qdrant (PC-A)
9. Pod signals completion to Orchestration Pipeline
10. Tailscale agent leaves mesh
11. Pod terminates (volume does NOT persist on RunPod)
```

### RunPod Pod Specs
```yaml
cpu_pod:
  gpu: 0
  vcpu: 16
  memory: 64GB
  storage: 100GB (ephemeral)
  cost: ~$0.40/hr
  estimated_monthly: ~$4-8 (10-20 hrs)

gpu_pod:
  gpu: 1x A40 (48GB VRAM)
  vcpu: 16
  memory: 64GB
  storage: 100GB (ephemeral)
  cost: ~$0.80/hr
  estimated_monthly: ~$4-8 (5-10 hrs)
```

## Task Routing Intelligence

### Affinity Rules
```yaml
routing:
  strategy: volume-affinity-first

  rules:
    # Prefer the machine that has the repo volume HOT
    - if: repo_volume_hot_on(pc-b)
      then: route_to(pc-b)

    - if: repo_volume_hot_on(mac)
      then: route_to(mac)

    # If both have capacity, prefer least loaded
    - if: both_available
      then: route_to(least_loaded)

    # If neither has the volume, clone is fast on local net
    - if: volume_cold
      then: route_to(least_loaded)
      note: "git clone + pnpm install from cache = ~2-3 min"

    # Overflow to RunPod only when local is saturated
    - if: all_local_saturated
      then: route_to(runpod)
      constraint: "trust_level != ring-0"
```

## Repo Volume Lifecycle

### States
```
HOT:    Repo with active tasks
        → Volume mounted, recent git fetch, deps installed
        → Context snapshot current
        → Ready for sandbox: ~30s

WARM:   Repo touched in last 7 days
        → Volume persists, nightly git fetch
        → Context snapshot exists but may be stale
        → Ready for sandbox: ~60s

COLD:   Repo untouched 7-30 days
        → Volume snapshotted to local backup
        → Volume released from active storage
        → Ready for sandbox: ~3-5 min (restore + fetch + install)

FROZEN: Repo untouched 30+ days
        → Snapshot archived to R2
        → Local volume fully released
        → Ready for sandbox: ~5-10 min (download from R2)
```

### Nightly Maintenance Job
```bash
# Runs on PC-B at 2AM local time
for repo in $(navratna repos list --format=json); do
  last_task=$(echo $repo | jq -r '.lastTaskDate')
  days_since=$(date_diff_days $last_task)

  if [ $days_since -le 7 ]; then
    # HOT/WARM: fetch latest
    git -C /data/repos/$repo fetch --all --prune
    status="HOT"
  elif [ $days_since -le 30 ]; then
    # COLD: snapshot and release
    tar czf /data/backups/$repo-$(date +%F).tar.gz /data/repos/$repo
    rm -rf /data/repos/$repo
    status="COLD"
  else
    # FROZEN: archive to R2
    rclone copy /data/backups/$repo-*.tar.gz r2:navratna-archive/repos/
    rm /data/backups/$repo-*.tar.gz
    status="FROZEN"
  fi

  navratna repos update $repo --status=$status
done
```

## Caching Strategy

### Container Image Cache
```
Problem: 5GB coding workspace image = 2-5 min cold start
Solution: Pre-built golden images on each machine

navratna/coding-workspace:latest (~3GB)
  ├── Node 22, Python 3.13, Rust, Go
  ├── Claude Code + OpenCode pre-installed
  ├── Playwright + browsers pre-installed
  ├── Common CLI: gh, wrangler, gog, pnpm
  └── OpenShell agent + policy engine

Pre-pull on PC-B + Mac → 0s image pull
```

### Dependency Cache (Shared)
```
/data/cache/pnpm-store/    10GB (shared pnpm content-addressable store)
/data/cache/pip-cache/      5GB (shared pip packages)
/data/cache/cargo-registry/  3GB (shared Rust crates)

Mounted read-write into every sandbox.
pnpm install: 2min → 5sec (cache hit)
pip install: 1min → 3sec (cache hit)
```

### Model Weight Cache (PC-A)
```
/data/navratna/models/
  ├── manifests/           (model metadata)
  ├── blobs/               (model weights)
  │   ├── llama-3.1-70b    (~40GB)
  │   ├── codestral-22b    (~15GB)
  │   ├── qwen-2.5-coder   (~20GB)
  │   └── nomic-embed-text (~300MB, always loaded)
  └── running/             (currently loaded models)

Model load from NVMe: ~30s (vs 10min download)
Embedding model always warm for Qdrant indexing
```

### Context Snapshot Cache
```
After each sandbox session:
  1. Export Claude Code's project understanding
  2. Store as context snapshot in Qdrant (vectorized)
  3. Next session: inject → Claude Code resumes with
     full project understanding in seconds

This is "memory that survives pod death."
Storage: /data/cache/contexts/ (~5GB)
```

## Security Between Planes

### Inter-Machine Security
```
Tailscale (WireGuard):
  - All traffic encrypted in transit
  - Machine identity verified via Tailscale auth
  - ACLs enforce which machines can reach which ports

Application Level:
  - JWT tokens for API authentication
  - Service-to-service: shared JWT secret (same Tailnet = trusted)
  - RunPod: ephemeral JWT issued by Security Gateway, 1hr expiry

Credential Management:
  - All secrets in .env files on respective machines
  - OpenShell credential injection: env vars at runtime, never on filesystem
  - Coding sandbox GitHub tokens: 1-hour expiry, auto-revoked on hibernate

Audit:
  - Every cross-machine API call logged to PostgreSQL audit table
  - Every approval/denial logged with reasoning to Neo4j
  - Every RunPod session: full event log persisted before pod termination
```

## Cost Model

### Fixed Costs (Monthly)
```
Electricity (3 machines, ~100W avg each):  ~$30-50
Tailscale (free for personal, 3 devices):   $0
Domain + DNS:                                ~$1
R2 cold storage (100GB):                     ~$2
Grafana Cloud free tier:                     $0
                                    ─────────────
                                    Total: ~$35-55
```

### Variable Costs (Monthly)
```
RunPod CPU overflow (10-20 hrs × $0.40):   ~$4-8
RunPod GPU inference (5-10 hrs × $0.80):   ~$4-8
Cloud LLM APIs (non-sensitive tasks):       ~$50-150
Free tier models (GLM, Kimi):               $0
                                    ─────────────
                                    Total: ~$58-166
```

### Total Monthly: ~$93-220

**Comparison**:
- Previous cloud-only estimate: $470-570/month (60% savings)
- One senior developer: $10-15K/month (98% savings)

## Disaster Recovery

### Backup Strategy
```
Daily (2AM local):
  PostgreSQL → pg_dump → /data/navratna/backups/pg/
  Neo4j → neo4j-admin dump → /data/navratna/backups/neo4j/
  Qdrant → snapshot API → /data/navratna/backups/qdrant/
  Redis → RDB snapshot → /data/navratna/backups/redis/

Weekly (Sunday 3AM):
  Full backup → R2 archive
  Verify restore from R2 backup

Repo volumes:
  Git history IS the backup (remote on GitHub)
  Context snapshots in Qdrant (backed up with Qdrant)
```

### Failover
```
PC-A dies (Memory):
  → System degraded: no knowledge queries, no vector search
  → Agents can still work from cached context
  → Priority: restore databases from backup

PC-B dies (Control):
  → System halted: no orchestration, no security gateway
  → Mac can run Gateway temporarily (emergency mode)
  → Priority: restore Gateway service

Mac dies (Interface):
  → System operational but no human interface
  → Agents continue autonomous work within existing approvals
  → Access via PC-B direct API or Discord/WhatsApp channels
  → Priority: restore Tauri interface

All machines die:
  → Git repos safe on GitHub
  → Database backups safe on R2
  → Restore: new machines + backup restore (~2-4 hours)
```

## Setup Checklist

### Phase 0: Initial Setup

PC-A:
- [ ] Install Docker + Docker Compose
- [ ] Install Tailscale, join network as `pc-a-navratna`
- [ ] Create /data/navratna/ directory structure
- [ ] Deploy docker-compose-pca.yml (PostgreSQL, Neo4j, Qdrant, Redis)
- [ ] Install Ollama, pull embedding model
- [ ] Deploy Navratna Core service
- [ ] Run database init scripts
- [ ] Verify all services healthy

PC-B:
- [ ] Install Docker + Docker Compose
- [ ] Install Tailscale, join network as `pc-b-navratna`
- [ ] Create /data/ directory structure
- [ ] Install NVIDIA OpenShell
- [ ] Deploy Navratna Gateway service
- [ ] Deploy Nginx gateway
- [ ] Pre-pull coding workspace golden image
- [ ] Verify connectivity to PC-A services

Mac:
- [ ] Install Docker (or OrbStack for better macOS perf)
- [ ] Install Tailscale, join network as `mac-navratna`
- [ ] Create /data/ directory structure
- [ ] Install NVIDIA OpenShell
- [ ] Install Tauri dev environment (Rust + Node)
- [ ] Clone and build Telescope frontend
- [ ] Pre-pull coding workspace golden image
- [ ] Verify connectivity to PC-A and PC-B

Verification:
- [ ] `ping pc-a-navratna.tailnet` from all machines
- [ ] `curl pc-a-navratna.tailnet:5432` responds (PostgreSQL)
- [ ] `curl pc-b-navratna.tailnet:3002/health` responds (Gateway)
- [ ] Telescope loads in Tauri on Mac
- [ ] Create test sandbox in OpenShell on PC-B
- [ ] Run Claude Code in sandbox, verify it can reach Gateway API
