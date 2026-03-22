---

# OpenShell Integration Specification — Navratna v3.0

## Document Control

- **Version**: 1.0
- **Date**: 2026-03-21
- **Purpose**: Define how NVIDIA OpenShell integrates with Navratna as the sandboxed execution layer

## Overview

NVIDIA OpenShell provides the safe, private runtime for all tool execution and coding agents in Navratna. It runs as a K3s Kubernetes cluster inside Docker, with policy-enforced security across filesystem, network, process, and inference layers.

## Integration Architecture

### OpenShell as MCP Server

Navratna's Capability Registry communicates with OpenShell via Model Context Protocol (MCP). This keeps the integration modular — OpenShell can be swapped for any sandbox runtime that speaks MCP.

```
Capability Registry (Navratna)
    │
    │ MCP Protocol
    ▼
OpenShell Gateway API
    │
    ├── create_sandbox(config) → sandbox_id
    ├── exec_in_sandbox(sandbox_id, command) → output
    ├── apply_policy(sandbox_id, policy_yaml) → status
    ├── get_sandbox_status(sandbox_id) → state
    ├── hibernate_sandbox(sandbox_id) → snapshot_id
    ├── resume_sandbox(snapshot_id) → sandbox_id
    ├── destroy_sandbox(sandbox_id) → void
    └── stream_logs(sandbox_id) → EventStream
```

### MCP Tool Definitions

```typescript
// Registered in Capability Registry as MCP tools
const openshellTools = [
  {
    name: 'openshell.create_sandbox',
    description: 'Create a new isolated sandbox environment',
    inputSchema: {
      type: 'object',
      properties: {
        image: { type: 'string', description: 'Container image' },
        project: { type: 'string', description: 'Project ID for auth scoping' },
        agent: { type: 'string', enum: ['claude-code', 'opencode'] },
        policy: { type: 'string', description: 'Path to YAML policy file' },
        providers: { type: 'array', items: { type: 'string' } },
        inferenceChain: { type: 'array', items: { type: 'string' } },
        volumeMount: { type: 'string', description: 'Persistent volume path' },
        task: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            description: { type: 'string' },
            context: { type: 'string' },
          },
        },
      },
      required: ['image', 'project', 'agent', 'policy'],
    },
  },
  {
    name: 'openshell.exec',
    description: 'Execute a command in an existing sandbox',
    inputSchema: {
      type: 'object',
      properties: {
        sandboxId: { type: 'string' },
        command: { type: 'string' },
        timeout: { type: 'number', default: 300000 },
      },
      required: ['sandboxId', 'command'],
    },
  },
  {
    name: 'openshell.hibernate',
    description: 'Hibernate a sandbox (stop container, persist volume)',
    inputSchema: {
      type: 'object',
      properties: {
        sandboxId: { type: 'string' },
        exportContext: { type: 'boolean', default: true },
      },
      required: ['sandboxId'],
    },
  },
  {
    name: 'openshell.stream_logs',
    description: 'Stream real-time logs from a sandbox',
    inputSchema: {
      type: 'object',
      properties: {
        sandboxId: { type: 'string' },
        follow: { type: 'boolean', default: true },
      },
      required: ['sandboxId'],
    },
  },
];
```

## Sandbox Types

### 1. Coding Workspace Sandbox

For persistent development work in a specific repo.

```yaml
# policies/coding-workspace.yaml
apiVersion: openshell/v1
kind: SandboxPolicy
metadata:
  name: coding-workspace
spec:
  filesystem:
    readWrite:
      - /workspace # Repo checkout
      - /home/coder # Agent home directory
      - /tmp # Temp files
    readOnly:
      - /data/cache/pnpm # Shared dependency cache
      - /data/cache/pip # Shared pip cache
    denied:
      - /etc/shadow
      - /root

  network:
    egress:
      allow:
        - 'github.com:443' # Git operations
        - 'registry.npmjs.org:443' # npm packages
        - 'pypi.org:443' # pip packages
        - '*.cloudflare.com:443' # CF deployment
        # Inference routed through Privacy Router (not direct)
      deny:
        - '*' # Block everything else

  process:
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: false
    capabilities:
      drop: [ALL]
      add: [NET_BIND_SERVICE] # For dev servers

  inference:
    # All LLM API calls intercepted and routed through Privacy Router
    router: openshell-privacy-router
    allowedModels:
      - 'claude-sonnet-4-6'
      - 'minimax-m2.5'
      - 'glm-5'
      - 'kimi-k2p5'
    # Models determined by project config, injected at sandbox creation
```

### 2. Tool Sandbox (Ephemeral)

For one-off tool executions (browser automation, email fetch, web scraping).

```yaml
# policies/tool-sandbox.yaml
apiVersion: openshell/v1
kind: SandboxPolicy
metadata:
  name: tool-ephemeral
spec:
  filesystem:
    readWrite:
      - /tmp
      - /workspace/output
    readOnly:
      - /workspace/input
    denied:
      - /etc
      - /root
      - /home

  network:
    egress:
      # Tool-specific: injected at creation time
      # e.g., GOG Gmail → allow imap.gmail.com, smtp.gmail.com
      # e.g., Browser → allow specific target URLs only
      allow: [] # Populated per-tool
      deny: ['*']

  process:
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
      drop: [ALL]

  inference:
    router: openshell-privacy-router
    allowedModels: [] # Tools don't need LLM access (usually)

  lifecycle:
    maxDuration: 300s # 5 min max for tool execution
    autoDestroy: true # Clean up after completion
```

### 3. Browser Test Sandbox

For QA/Rana agent with Playwright.

```yaml
# policies/browser-test.yaml
apiVersion: openshell/v1
kind: SandboxPolicy
metadata:
  name: browser-test
spec:
  filesystem:
    readWrite:
      - /workspace/screenshots # Evidence capture
      - /workspace/reports # Test reports
      - /tmp
    readOnly:
      - /workspace/tests # Test definitions

  network:
    egress:
      allow:
        - '*.pronitopenclaw.workers.dev:443' # Staging URLs
        - 'localhost:*' # Local dev servers
      deny: ['*']

  process:
    allowPrivilegeEscalation: false
    capabilities:
      add: [SYS_ADMIN] # Required for Chromium sandbox

  inference:
    router: openshell-privacy-router
    allowedModels: ['claude-haiku-4-5'] # Lightweight for test analysis

  lifecycle:
    maxDuration: 600s # 10 min for test suite
    autoDestroy: true
```

### 4. GPU Inference Sandbox

For local model inference on sensitive data.

```yaml
# policies/gpu-inference.yaml
apiVersion: openshell/v1
kind: SandboxPolicy
metadata:
  name: gpu-inference
spec:
  filesystem:
    readOnly:
      - /data/models # Model weights (shared volume)
      - /workspace/input # Input data
    readWrite:
      - /workspace/output # Inference results
      - /tmp

  network:
    egress:
      deny: ['*'] # ZERO network access — fully air-gapped

  process:
    allowPrivilegeEscalation: false
    capabilities:
      drop: [ALL]

  gpu:
    enabled: true
    devices: ['nvidia.com/gpu=1']
    driverCapabilities: [compute, utility]

  inference:
    router: none # Direct model access, no cloud routing
    localOnly: true

  lifecycle:
    maxDuration: 3600s # 1 hour max
    autoDestroy: true
```

## Golden Container Image

### Image: navratna/coding-workspace:latest

```dockerfile
FROM ubuntu:24.04

# System packages
RUN apt-get update && apt-get install -y \
    curl git vim wget jq \
    build-essential python3.13 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 + pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm@latest

# Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Go
RUN curl -fsSL https://go.dev/dl/go1.24.linux-amd64.tar.gz | tar -C /usr/local -xzf -

# CLI Tools
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install gh -y

# Wrangler (Cloudflare CLI)
RUN npm install -g wrangler

# Claude Code
RUN npm install -g @anthropic-ai/claude-code

# OpenCode (if available as binary)
# RUN curl -fsSL https://opencode.dev/install.sh | sh

# Playwright + browsers
RUN npx playwright install --with-deps chromium firefox

# Create non-root user
RUN useradd -m -s /bin/bash coder
USER coder
WORKDIR /workspace

# OpenShell agent (injected at runtime)
# Credentials injected as env vars (never on filesystem)
```

### Pre-pull Strategy

```bash
# On PC-B and Mac:
docker pull navratna/coding-workspace:latest

# Verify image is cached:
docker images navratna/coding-workspace
# Should show: ~3GB, cached locally
```

## Coding Workspace Lifecycle

### Full Flow

```
1. TASK ARRIVES
   Bhagwan (PM) receives task → assigns to project (e.g., orthopulse-hq)

2. RESOLVE PROJECT CONFIG
   Orchestration Pipeline reads: navratna/config/projects/orthopulse-hq.yaml
   Determines: coding_agent, sandbox_policy, providers, inference_chain, trust_level

3. CHECK SANDBOX STATE
   Query OpenShell: is there a hibernated sandbox for orthopulse-hq?

   IF HIBERNATED:
     Resume sandbox → mount volume → inject fresh credentials
     Load context snapshot from Qdrant
     Time: ~30s

   IF NO SANDBOX:
     Check volume state (HOT/WARM/COLD/FROZEN)

     IF HOT/WARM:
       Create sandbox → mount existing volume → inject credentials
       Load context snapshot from Qdrant
       Time: ~60s

     IF COLD:
       Restore volume from backup → create sandbox → git fetch
       pnpm install from cache → inject credentials
       Time: ~3-5 min

     IF FROZEN:
       Download from R2 → restore → create sandbox → git fetch
       pnpm install from cache → inject credentials
       Time: ~5-10 min

4. CLAUDE CODE BOOTS
   Receives task context:
   {
     task_id: "TASK-142",
     description: "Fix auth redirect bug on /callback route",
     project_context: <context_snapshot_from_qdrant>,
     sop: "Write code, run tests, create PR. Tests must pass.",
     repo_state: "branch: main, last_commit: abc123"
   }

5. CLAUDE CODE WORKS
   - Reads codebase (filesystem access within /workspace)
   - Writes code (filesystem write within /workspace)
   - Runs tests (process execution allowed)
   - All LLM calls routed through Privacy Router
   - All git ops use project-scoped GitHub token
   - All network calls checked against policy

   Telescope shows: Live block with progress, agent cursor on codebase

6. PR CREATED
   Claude Code: git push, gh pr create
   Sandbox signals: task_complete, pr_url

   Telescope shows: Approval interrupt (surface warms yellow)
   Pronit reviews PR → approves or requests changes

7. REVIEW + QA (if approved)
   Veda sandbox (lightweight) → code review
   Rana sandbox (browser-test) → acceptance tests
   Both signal completion → merge approval

8. HIBERNATE
   Export context snapshot → Qdrant
   Stop container (volume persists)
   Release compute resources

   Telescope shows: Block dissolves (Satisfied expression)

9. DEPLOY (if approved)
   Sharma sandbox → wrangler deploy
   Approval gate → Pronit confirms
   Deploy completes → task status: done
```

## Privacy Router Configuration

### How It Works

Every outbound LLM API call from any sandbox is intercepted by OpenShell's Privacy Router:

```yaml
# openshell-privacy-router.yaml
apiVersion: openshell/v1
kind: PrivacyRouter
metadata:
  name: navratna-inference
spec:
  # Route based on project trust level
  routes:
    - match:
        trustLevel: ring-0
      action:
        backend: ollama
        endpoint: 'http://pc-a-navratna.tailnet:11434'
        # Ring 0: local inference ONLY — no data leaves the network

    - match:
        trustLevel: ring-1
      action:
        backend: cloud
        # Ring 1: cloud OK, use project's inference chain
        # Fallback through providers in order
        providers:
          - anthropic
          - minimax
          - zai
          - google

    - match:
        trustLevel: ring-2
      action:
        backend: cloud
        # Ring 2: any provider OK, optimize for cost
        providers:
          - zai # Free tier first
          - kimi # Free tier
          - minimax # Cost-effective
          - anthropic # Premium

  # PII detection (optional, additional safety)
  piiFilter:
    enabled: true
    action: warn # Log warning if PII detected in Ring 1+ calls
    patterns:
      - email
      - phone
      - creditCard
      - ssn
```

## Monitoring in Telescope

### Sandbox as Telescope Block

Every active sandbox appears as a MaterializableBlock in the Telescope:

```typescript
interface SandboxBlock {
  type: 'sandbox';
  sandboxId: string;
  projectId: string;
  agent: 'claude-code' | 'opencode';
  state: 'warming' | 'active' | 'idle' | 'hibernating';

  // Real-time data (streamed via Socket.IO)
  currentFile?: string; // What file the agent is editing
  testResults?: TestResult[]; // Latest test run
  linesChanged?: number; // Code diff stats
  inferenceModel?: string; // Which LLM is active
  duration?: number; // Time active

  // Telescope rendering hints
  relevanceScore: number; // Drives position/visibility
  expression: TelescopeExpression; // Working, Satisfied, Strained, etc.
  breathingRate: 'slow' | 'medium' | 'fast'; // Activity indicator
}
```

### Agent Cursor on Telescope

When Claude Code is working in a sandbox, an agent cursor appears on the Telescope surface:

- Hovering near the project's knowledge cluster
- Moving when switching files
- Pulsing when running tests
- Stilling when waiting for approval

## Error Handling

### Sandbox Failures

```
Sandbox crashes:
  → Context snapshot exported (if possible)
  → Orchestration Pipeline notified
  → Task moved to "failed" with error context
  → Telescope: Alarmed expression, failure block materializes
  → Auto-retry once with fresh sandbox
  → If retry fails: escalate to Pronit

Policy violation:
  → Logged to audit trail
  → Sandbox continues (violation blocked, not sandbox killed)
  → Telescope: Warning indicator on sandbox block
  → If repeated violations: sandbox terminated, task escalated

Inference quota exceeded:
  → Fallback to next provider in chain
  → If all providers exhausted: pause sandbox, notify Pronit
  → Telescope: Strained expression, budget pressure visible

Network timeout:
  → Retry with exponential backoff (3 attempts)
  → If persistent: sandbox marked as degraded
  → Continue with cached/local resources where possible
```

## Setup Instructions

### Install OpenShell

```bash
# On PC-B and Mac:
curl -fsSL https://openshell.nvidia.com/install.sh | bash

# Start OpenShell (K3s cluster in Docker)
openshell start

# Verify
openshell status
# Should show: Gateway running, Policy Engine active

# Open terminal dashboard
openshell term
# k9s-style UI showing gateways, sandboxes, providers
```

### Register Providers

```bash
# Register LLM providers (credentials from .env)
openshell provider add anthropic --api-key $ANTHROPIC_API_KEY
openshell provider add ollama --endpoint http://pc-a-navratna.tailnet:11434

# Register GitHub credentials
openshell provider add github --token $GITHUB_TOKEN
```

### Test First Sandbox

```bash
# Create a test coding workspace
openshell sandbox create \
  --image navratna/coding-workspace:latest \
  --policy policies/coding-workspace.yaml \
  --mount /data/repos/test-repo:/workspace \
  --provider github \
  --provider anthropic

# Connect to sandbox
openshell sandbox connect <sandbox-id>

# Inside sandbox: verify Claude Code works
claude --version
gh auth status
git status
```
