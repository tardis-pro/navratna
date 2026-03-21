# Docker Version Compatibility Guide - Navratna Phase 0

## Version Requirements

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| Docker Engine | 24.0 | 27.0+ | Required for containerd 1.7+ |
| Docker Compose | 2.24 | 2.30+ | V2 plugin recommended |
| Compose Specification | 2024.04 | Latest | Use `docker compose` (V2) |

## Common Issues and Fixes

### Issue 1: "network mode not supported"
**Solution:** Use `bridge` network driver explicitly in compose files.

```yaml
networks:
  my-network:
    driver: bridge
```

### Issue 2: "version is obsolete"
**Solution:** Remove `version:` field from compose files. Compose V2 auto-detects specification version.

```yaml
# REMOVE this line:
# version: '3.8'

services:
  my-service:
    # ...
```

### Issue 3: GPU access denied
**Solution:** Ensure NVIDIA Container Toolkit is installed.

```bash
# Detect distribution
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)

# Add NVIDIA repository
curl -fsSL https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L "https://nvidia.github.io/nvidia-docker/${distribution}/nvidia-docker.list" | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list

# Install toolkit
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Restart Docker
sudo systemctl restart docker
```

### Issue 4: `docker compose` vs `docker-compose`
Both V1 and V2 commands work with Navratna compose files:

```bash
# V2 (Docker Compose plugin)
docker compose -f docker-compose.yml up -d

# V1 (standalone)
docker-compose -f docker-compose.yml up -d
```

## Verification Commands

```bash
# Check Docker version
docker version --format '{{.Server.Version}}'
# Expected: >= 24.0

# Check Compose version (V2)
docker compose version
# Expected: >= 2.24

# Check Compose version (V1)
docker-compose version
# Expected: >= 2.24

# Test GPU access
docker run --rm --gpus all nvidia/cuda:12.4-runtime-ubuntu22.04 nvidia-smi
```

## Docker Desktop vs OrbStack (macOS)

For macOS development, either works:

| | Docker Desktop | OrbStack |
|---|---|---|
| RAM usage | 6GB+ idle | ~1GB idle |
| GPU pass-through | Limited | None |
| Performance | Good | Excellent |
| Cost | Free (personal) | Free (personal) |

### OrbStack Note
OrbStack does not support GPU pass-through. For Ollama with GPU inference, use Docker Desktop or run Ollama natively on the host.

## Service Port Reference

| Service | Port | Protocol |
|---------|------|----------|
| PostgreSQL | 5432 | TCP |
| Neo4j HTTP | 7474 | HTTP |
| Neo4j Bolt | 7687 | Bolt |
| Redis | 6379 | TCP |
| Qdrant HTTP | 6333 | HTTP |
| Qdrant gRPC | 6334 | gRPC |
| Ollama | 11434 | HTTP |
| Navratna Core | 3001 | HTTP |
| Navratna Gateway | 3002 | HTTP |
| Nginx | 8081 | HTTP |
| Telescope | 5173 | HTTP |
