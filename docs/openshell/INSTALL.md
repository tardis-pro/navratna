# OpenShell Installation Guide - Navratna Phase 0

## Overview

OpenShell provides sandboxed execution for all tools and coding agents with policy-enforced security. It is installed on PC-B and Mac as part of Phase 0 infrastructure.

## Prerequisites

- Docker 24.0+ with NVIDIA Container Toolkit (for GPU support on PC-B)
- 8GB+ RAM available for sandboxes
- 100GB+ storage for workspace volumes
- Tailscale mesh network configured

## Installation

### Step 1: Download OpenShell

```bash
curl -fsSL https://openshell.nvidia.com/install.sh | bash
```

### Step 2: Start OpenShell

```bash
openshell start
```

### Step 3: Verify Installation

```bash
openshell status
# Expected output:
# Gateway: running on :8080
# Policy Engine: active
# Active Sandboxes: 0
```

### Step 4: Configure Providers

```bash
# Configure Ollama endpoint (PC-A)
openshell provider add ollama --endpoint http://pc-a-navratna.tailnet:11434

# Configure Anthropic for cloud inference
openshell provider add anthropic --api-key ${ANTHROPIC_API_KEY}

# Configure GitHub for repository access
openshell provider add github --token ${GITHUB_TOKEN}
```

### Step 5: Configure Policies

Copy policy templates from `docs/openshell/policies/` to your policy directory:

```bash
sudo mkdir -p /data/navratna/policies
sudo cp docs/openshell/policies/*.yaml /data/navratna/policies/
sudo chown -R $(whoami) /data/navratna/policies
```

## Policy Templates

### coding-workspace.yaml
For persistent development environments with full tool access.

### tool-ephemeral.yaml
For one-off tool executions (browser automation, GOG, scrapers).

### gpu-inference.yaml
For local Ollama inference with GPU access.

## Usage

### Create a Coding Workspace

```bash
openshell sandbox create \
  --name my-project \
  --image navratna/coding-workspace:latest \
  --policy coding-workspace.yaml \
  --repo https://github.com/user/repo
```

### List Active Sandboxes

```bash
openshell sandbox list
```

### Execute in Sandbox

```bash
openshell exec --sandbox my-project -- "pnpm install && pnpm test"
```

### Destroy Sandbox

```bash
openshell sandbox destroy my-project
```

## Troubleshooting

### Gateway not responding

```bash
# Check if OpenShell gateway is running
openshell status

# Restart if needed
openshell restart
```

### GPU not available

```bash
# Verify NVIDIA Container Toolkit
docker run --rm --gpus all nvidia/cuda:12.4-runtime-ubuntu22.04 nvidia-smi

# Reinstall if needed
curl -fsSL https://nvidia.github.io/nvidia-container-toolkit/install.sh | sh
```
