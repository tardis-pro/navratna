# 11 — The Hybrid Execution Mesh

**Status:** Architecture proposal · **Author:** agent-drafted, 2026-07-11 · **Supersedes the in-gateway tool executor**

> Tool execution is not a function call. It is a *place*. This document turns
> Navratna's tool executor from a `switch` statement living inside the auth
> gateway into a **federation of sovereign, typed execution nodes** — the same
> composition thesis that governs the rest of TARDIS, applied to compute itself.

---

## 0. TL;DR

Today every tool — a calculator, a GitHub call, a spawned MCP server, a coding
task — runs **in-process inside `navratna-gateway`**, the machine that also
mints your JWTs. `base_tool_executor.ts` `child_process.spawn`s MCP servers
next to the auth code. That is a security, blast-radius, and scaling mistake.

The fix is not "move it to one other service." It is to recognise that
different tools want fundamentally different *runtimes*, and to make the
executor a **scheduler that dispatches each tool to the node built for it**:

| Node type | Runs | Isolation | Cost profile | Best for |
|---|---|---|---|---|
| **Worker node** (Cloudflare) | JS/WASM + `fetch` | V8 isolate | ~free, global, scale-to-zero | pure tools, HTTP/SSE MCP proxying, fan-out |
| **MCP node** (Docker on host) | any MCP server, stdio or container | container + cgroup caps | always-on host (EC2) | the MCP fleet — the real `spawn` home |
| **Coding node** (Codespaces / Fly Machine) | full repo + toolchain | dev container / microVM | per-session, per-hour | coding agents, build/test/PR |
| **Native node** (in-gateway, deprecated) | legacy `switch` tools | none | — | migration source only |

The scheduler lives in `capability-registry`, dispatches over the **existing
BullMQ/Redis bus**, and correlates results back by id. A tool declares its
`runtime`; the mesh does the rest. Phase 1 ships the **MCP node on your EC2
box** — it alone fixes the gateway-spawn problem.

---

## 1. Why (the problem, precisely)

From the current code (`apps/backend/services/capability-registry/`):

- `base_tool_executor.ts::execute()` is a `switch(toolId)`: native tools
  (`math-calculator`, `text-analysis`, `file-reader`, `web-search`…) execute
  **in the gateway's Bun process**; `mcp-*` tools call `mcp_client_service.ts`.
- `mcp_client_service.ts` `spawn`s stdio MCP servers as **child processes of
  the gateway** (`child_process.spawn`, line ~365) or dials `http` /
  `streamable-http` MCP servers.
- `tool_execution_service.ts` (shared) already fronts execution with a
  **BullMQ event** (`ToolExecutionRequestEvent`) + correlation id +
  day-bucketed idempotency — the async RPC spine already exists.
- Coding work (`coding_agent_executor_service.ts`, `dev_agent_service`,
  `/api/v1/workspaces`) is a *third* execution shape entirely.

Five concrete failures of "execute in the gateway":

1. **Auth blast radius.** A hostile or buggy MCP server shares a process and
   1 GB RAM with JWT signing, refresh rotation, and OAuth secret decryption.
   An OOM or an RCE in a tool is an OOM or RCE in your identity plane.
2. **No isolation.** `file-reader` reads the *container's* filesystem; spawned
   servers inherit the gateway's env (which holds `JWT_SECRET`,
   `ENCRYPTION_KEY`, DB creds).
3. **Ephemerality mismatch.** Fly machines redeploy/scale-to-zero; a spawned
   MCP server dies mid-session and takes its state with it.
4. **No capacity model.** Tool load and request load fight for the same CPU;
   you cannot scale "run 200 MCP calls" without scaling the auth gateway.
5. **Not composable.** A `switch` can't be extended by a running agent, can't
   be federated to a tenant's own node, can't express "this tool must run near
   the data."

The thesis of TARDIS is *sovereign, composable nodes*. Execution should be too.

---

## 2. The mesh (the shape it wants to be)

```
                          ┌──────────────────────────────────────────┐
   agent / API caller     │            CONTROL PLANE                 │
        │                 │  capability-registry (navratna-gateway)  │
        │  tool.execute   │                                          │
        ▼  (event bus)    │   Registry ── resolves tool → descriptor │
   tool_execution_service─┼─▶ Scheduler ── picks node by `runtime`   │
                          │       │         + capacity + affinity     │
                          │       │  dispatch (BullMQ queue per tier) │
                          └───────┼──────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────────────┐
        ▼                         ▼                                  ▼
 ┌─────────────┐          ┌───────────────┐                 ┌────────────────┐
 │ WORKER node │          │   MCP node     │                 │  CODING node   │
 │ CF Worker   │          │ Docker on EC2  │                 │ Codespace /    │
 │             │          │                │                 │ Fly Machine    │
 │ JS/WASM     │          │ mcp-fs  ┐      │                 │ clone → build  │
 │ fetch-tools │          │ mcp-gh  ├ cgrp │                 │ → test → PR    │
 │ HTTP-MCP    │          │ mcp-... ┘ caps │                 │ full toolchain │
 └─────────────┘          └───────────────┘                 └────────────────┘
        │                         │                                  │
        └──────────── results (correlationId) over the bus ─────────┘
```

Two planes, cleanly separated:

- **Control plane** — the Scheduler (in `capability-registry`) never *executes*
  a tool. It resolves, routes, enforces policy, tracks capacity, and correlates
  results. It stays inside `navratna-gateway` because it's cheap and stateless.
- **Data plane** — the nodes. Untrusted-ish, resource-capped, horizontally
  scalable, and *disposable*. This is where `spawn` and `fetch` and `git clone`
  actually happen.

---

## 3. Node taxonomy (what each is for, and its hard edges)

### 3.1 Worker node — Cloudflare (the light tier)
- **Runs:** pure-JS/WASM tools (`math`, `text`, `id`, `time`), `web-search` and
  any tool that is "an authenticated `fetch` + a transform", and **proxying
  `http`/`streamable-http` MCP servers**.
- **Isolation:** V8 isolate per request; no shared filesystem; no ambient creds.
- **Why it's great here:** you already run Workers (`navratna-api-gateway`).
  Global, scale-to-zero, effectively free, sub-ms cold start. Perfect for the
  90% of tool calls that are stateless transforms and remote API calls.
- **Hard edge (be honest):** Workers **cannot `spawn` a process or run a
  binary** — no stdio MCP, no arbitrary code, no filesystem. CF *Containers*
  can, but that path was deliberately retired (see spec 04). So a Worker node
  can *call* an MCP server but never *host* one.
- **Contract:** a dedicated Worker (`navratna-exec-worker`) exposing
  `POST /exec` `{toolId, params, ctx}` guarded by the `X-Edge-Auth` shared
  secret; the scheduler invokes it via service binding or the queue.

### 3.2 MCP node — Docker on host (the MCP tier; **phase 1**)
- **Runs:** **any MCP server, stdio or containerised** — one container per
  server, à la the Docker MCP Toolkit/gateway. This is the correct home for
  the `child_process.spawn` that today pollutes the gateway.
- **Isolation:** OCI container + cgroup CPU/RAM caps + seccomp + read-only
  rootfs + no host network by default + a scoped, per-tool credential injected
  at call time (never the gateway's env).
- **Host:** your always-on **EC2** box (you already run docker-compose there).
  A lightweight **node-agent** process on the host: registers with the control
  plane, pulls/starts MCP server images on demand, pools warm containers, reaps
  idle ones, and streams stdio ⇄ bus.
- **Why here:** MCP servers are long-ish lived, need real processes, and want
  strong isolation and caps — exactly what containers give and Workers can't.
- **Hard edge:** needs an always-on host and image management; a runaway server
  is capped by cgroups, not by praying. Cold image pull adds latency → warm pool.

### 3.3 Coding node — Codespaces / Fly Machine (the heavy tier)
- **Runs:** coding-agent tasks needing a **full repo + toolchain** — the
  `dev_agent` / `/api/v1/workspaces` / `setup_project_workspace_workflow` path:
  clone, install, run tests, open PRs, in genuine per-session isolation.
- **Options:**
  - **GitHub Codespaces** — richest env, native to the GitHub PR flow; ~30-60 s
    cold start, per-hour billing. Best as *one Codespace per workspace session*.
  - **Fly Machines API** — ephemeral microVMs you already have the account for;
    faster to spin, cheaper, no GitHub coupling; you supply the image.
  - **Worktree sandbox on EC2** — cheapest; a `git worktree` + firejail on the
    existing box for low-risk coding tasks.
- **Hard edge:** heavy and stateful; wrong for a per-tool-call. The scheduler
  routes only `runtime: codespace` tools here, and the node is a *session*, not
  a request.

### 3.4 Native node — in-gateway (deprecated, migration only)
- The current `switch`. Kept behind a `FEATURE_INPROC_TOOLS` flag purely so the
  mesh can be rolled out tool-by-tool without a big-bang cutover. Deleted when
  the last tool has a home.

---

## 4. The node contract (how a node joins the mesh)

Every node — Worker, MCP host, coding driver — speaks one contract, so the
scheduler treats them uniformly and new node types are additive.

```ts
interface ExecutionNode {
  id: string;                       // "mcp-ec2-sin-1", "worker-global"
  runtime: 'worker' | 'docker-mcp' | 'codespace' | 'native';
  capabilities: string[];          // tool ids / families this node can run
  capacity: { maxConcurrent: number; cpu: number; memMb: number };
  affinity?: { region?: string; tenant?: string; dataLocality?: string };
  health: 'ready' | 'degraded' | 'draining' | 'down';
}
```

- **Registration & heartbeat** over the bus (`exec.node.register`,
  `exec.node.heartbeat`) — mirrors how services already announce via
  FeatureFactory. A node that stops heart-beating is drained.
- **Execution protocol** (correlation-id RPC, reusing today's pattern):
  `exec.request.{runtime}` → node → `exec.result.{correlationId}`; streaming
  partials on `exec.stream.{correlationId}` for long tools (build logs, agent
  tokens). Idempotency keys carry over from `tool_execution_service`.
- **Credential injection:** the node never holds standing secrets. The control
  plane mints a **short-lived, tool-scoped token** (the OAuth/connector token
  for *this* call, this user) and hands it in the request envelope; the node
  uses it and forgets it. This is the single biggest security upgrade.

---

## 5. Tool → runtime routing

A tool's descriptor (already in the capability registry / `oauth_providers` /
MCP config) gains a `runtime` and a `sandbox` policy:

```jsonc
{
  "id": "mcp-filesystem",
  "runtime": "docker-mcp",
  "sandbox": { "image": "mcp/filesystem:latest", "cpu": 0.5, "memMb": 256,
               "network": "none", "readonlyRoot": true, "ttlSec": 900 },
  "transport": "stdio"
}
```

Routing precedence in the Scheduler:
1. **Explicit `runtime`** on the descriptor.
2. **Inference** from `transportType` (the field already in
   `mcp_client_service`): `http`/`streamable-http` → Worker (proxy); `stdio` →
   MCP node.
3. **Capability match + affinity** (region/tenant/data-locality) among healthy
   nodes of that runtime.
4. **Least-loaded** of the survivors; queue if all at capacity.

Fallback ladder: preferred node → same-runtime peer → degraded-but-up →
`native` (behind the flag) → typed failure. No silent success.

---

## 6. Execution lifecycle (one call, end to end)

```
1. Agent → tool_execution_service.execute(toolId, params)     [unchanged API]
2. → publish exec.request  (idempotency key, ctx, user)       [BullMQ]
3. Scheduler: resolve descriptor → route (§5) → mint scoped token
4. → enqueue on exec.request.<runtime> for the chosen node
5. Node: acquire slot (or pooled container) → run with caps + ttl
        → stream partials on exec.stream.<cid>  (optional)
6. Node → publish exec.result.<cid> {ok|error, output, metrics}
7. Scheduler: record, dedupe, release slot → resolve caller's promise
8. Timeout/crash → retry policy (§8) → typed error to caller
```

Callers (`base_tool_executor` consumers, agents) see **zero API change** — the
scheduler is a drop-in behind `tool_execution_service`. That's what makes the
migration safe.

---

## 7. Isolation & security model (the whole point)

Defense in depth, per node type:

- **Process/plane separation:** tools never run in the auth process. Full stop.
- **Container hardening (MCP node):** non-root, read-only rootfs, `--cap-drop
  ALL`, seccomp default, `--network none` unless a tool declares egress, cgroup
  CPU/RAM/PID caps, wall-clock TTL, ephemeral tmpfs workdir.
- **No standing secrets on nodes:** scoped, short-lived, per-call tokens minted
  by the control plane; nodes are credential-blind between calls.
- **Egress policy:** default-deny; a tool must declare allowed hosts, enforced
  at the node (and at the Worker via `fetch` allow-list).
- **Tenancy:** `affinity.tenant` lets a tenant pin execution to *their* node —
  the federation story (spec `FEDERATION-MCP-MANIFEST`) extended to compute:
  a subdomain can bring its own MCP node and never let a tool touch shared
  infra.
- **Audit:** every execution emits a signed record (who, tool, node, inputs
  hash, duration, exit) to the existing audit pipeline.

---

## 8. Reliability: timeouts, retries, idempotency, backpressure

- **Idempotency:** keep the day-bucketed key from `tool_execution_service`;
  the scheduler dedupes in-flight and recently-completed by key.
- **Timeouts:** per-tool wall-clock (`ttlSec`) enforced at the node *and* a
  scheduler-side deadline; whichever fires first wins, node is killed/reaped.
- **Retries:** only for *idempotent* tools and *transport* failures (node
  down, slot lost) — never blind re-run of a side-effecting tool. Reuse the
  consolidated `withRetry` from the backend cleanup (spec-cross-ref: the audit's
  `RetryManager` promotion).
- **Backpressure:** bounded per-runtime queues; when full, fail fast with
  `RESOURCE_EXHAUSTED` (or shed to a colder tier) rather than pile latency.
- **Poison control:** a tool that OOMs/crashes N times is circuit-broken and
  marked `degraded` on that node; scheduler routes around it.

---

## 9. Scaling & cost (why the tiering pays)

- **Worker tier:** scales infinitely and ~free; absorbs the long tail of cheap
  calls without touching a VM. This is where most volume should land.
- **MCP tier:** one always-on EC2 host with a warm container pool; scales
  vertically first (cgroups), then horizontally by adding node-agents on more
  hosts (each self-registers). Cost = one box you already pay for.
- **Coding tier:** pay-per-session; a Codespace/Machine exists only while a
  coding job runs, then dies. Cost tracks actual coding work, not idle capacity.
- **Net:** the auth gateway drops back to a tiny, predictable footprint; tool
  cost becomes legible and independently tunable per tier.

---

## 10. Observability

- **Per node:** heartbeat, slot utilisation, queue depth, warm-pool hit rate,
  OOM/kill counts → the existing Prometheus/Grafana.
- **Per execution:** trace spans `schedule → dispatch → run → result` with the
  correlation id as trace id; p50/p95 per tool and per node.
- **Fleet view:** a "mesh" panel — nodes, their runtime, health, live load —
  which is *also* a materializable Telescope block (`runtime: worker|docker-mcp
  |codespace`), closing the loop: the platform observes its own compute.

---

## 11. Phased rollout (ship value early, never big-bang)

**Phase 1 — MCP node on EC2 (the one that fixes the bug).**
Stand up the host node-agent + Docker MCP runner on the existing EC2. Add the
scheduler shim behind `tool_execution_service` with `runtime` inference from
`transportType`. Route all `stdio` MCP tools off the gateway to the EC2 node.
Keep everything else `native` behind the flag. *Outcome: `spawn` leaves the
auth plane; MCP servers gain caps + isolation.* Highest value, smallest surface.

**Phase 2 — Worker node (the light tier).**
Deploy `navratna-exec-worker`; route pure-JS tools and `http`/`streamable-http`
MCP proxying to it. Retire those `switch` branches. *Outcome: the gateway stops
running tool logic at all.*

**Phase 3 — Coding node.**
Wrap `dev_agent`/`workspaces` in the node contract behind a Fly-Machine (or
Codespaces) driver; sessions become first-class, disposable, isolated.
*Outcome: coding agents get real, safe environments.*

**Phase 4 — Federation & self-composition (the dream, §13).**
Tenants register their own nodes; agents provision nodes on demand; the mesh
learns its own routing.

Each phase is independently shippable and reversible (flip a tool back to
`native`).

---

## 12. Migration & compatibility

- `tool_execution_service.execute()` signature is **unchanged** — the scheduler
  hides behind it. No agent or route changes.
- Per-tool cutover via the descriptor's `runtime` field; `native` remains the
  safety net until a tool is proven on its node.
- The 3 overlapping registries (`unified`/`enterprise`/`project`) collapse into
  the one **descriptor + scheduler** the mesh needs — folding the backend-audit
  registry cleanup into this work instead of doing it twice.

---

## 13. The dream (north star — where this becomes legendary)

Strip the engineering and here is the idea: **Navratna stops having tools and
starts having a body.**

- **Self-provisioning compute.** An agent that needs a capability it can't
  reach doesn't fail — it *materialises a node*. "I need to run a Playwright
  scrape" → the mesh spins an ephemeral MCP node with the browser image, runs
  it, reaps it. Compute appears on intent, exactly like the Telescope surface
  materialises UI on intent. The `MaterializableBlock` metaphor, extended from
  pixels to processes.

- **Sovereign nodes, federated.** Every one of the 100-200 subdomains
  (`FEDERATION-MCP-MANIFEST`) can contribute a node to the mesh — their own
  MCP servers, their own data-local compute — while the control plane routes
  across all of them by capability and affinity. The platform becomes a
  *marketplace of execution*, not a monolith of functions.

- **Capability evolution.** The `capability-evolver` skill (in
  `openclaw-infra/skills`) closes the loop: the mesh observes which tools fail,
  which nodes are hot, which capabilities are missing — and *proposes new
  tools/nodes*, which agents review and admit. The substrate grows itself. This
  is the "~1,130 lines to self-building" thesis made physical: not just
  composing UI and agents, but composing its own compute.

- **Self-healing.** A node degrades → drained and replaced with no human in the
  loop; a tool poisons → circuit-broken and routed around; a whole tier
  saturates → the scheduler sheds to a colder tier or spins new capacity. The
  organism maintains homeostasis.

- **The one-sentence version.** *Every capability the system can imagine, it can
  run — somewhere, sandboxed, on the cheapest node that can hold it, minted with
  exactly the credentials it needs and nothing more, and forgotten the instant
  it's done.* Tools as ephemeral, sovereign, self-composing life.

That is the difference between an app that *calls* tools and a substrate that
*is* an execution fabric. Phase 1 is a Docker container on an EC2 box. Phase 4
is a self-composing, self-healing, federated body. Same contract, all the way up.

---

## 14. Open questions / risks

- **Codespaces as programmatic backend** is off-label (built for interactive
  dev); Fly Machines may be the pragmatic coding tier — decide in Phase 3.
- **Warm-pool sizing** on the MCP node vs cold-start latency vs idle cost —
  needs tuning against real tool-call distribution.
- **Cross-node artifact/state passing** (a coding node produces a file a Worker
  tool consumes) — needs a shared object store (R2 already bound) as the
  hand-off, not node-local disk.
- **Scoped-token minting** must be airtight — it's the new trust boundary;
  reuse the `ENCRYPTION_KEY`/JWKS machinery, don't invent crypto.
- **Scheduler is now critical path** — must be stateless + HA (it already lives
  in the min-1 gateway; keep it side-effect-free so it can scale out).

---

*Next action if approved: Phase 1 — node-agent + Docker MCP runner on EC2, and
the scheduler shim behind `tool_execution_service`, routing `stdio` MCP off the
gateway. One box, one flag, and `spawn` finally leaves your identity plane.*
