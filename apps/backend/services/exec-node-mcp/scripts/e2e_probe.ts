// e2e_probe.ts — proves the docker-mcp mesh path end-to-end against LOCAL Redis+Docker.
//
// It plays the CONTROL PLANE's role exactly as ExecutionScheduler.dispatchRemote does:
// build an ExecutionRequestEnvelope and call
//   eventBus.publishAndWaitForResponse('exec.request.docker-mcp', envelope, deadlineMs)
// A running exec-node-mcp NodeAgent (separate process) must pick it up, spawn the
// hardened MCP container, run tools/call, and reply on rpc.replies by correlationId.
//
// Usage:
//   RED   (no node-agent running)  -> expect RPC_TIMEOUT
//   GREEN (node-agent running)     -> expect ok:true with a real MCP tool result
//
// Run: bun scripts/e2e_probe.ts <toolId> <jsonParams>

import { randomUUID } from 'node:crypto';
import { EventBusService } from '@uaip/infra';
import { logger } from '@uaip/utils';
import { execRequestSubject } from '@uaip/types';
import type { ExecutionRequestEnvelope, ExecutionResultEnvelope } from '@uaip/types';

async function main(): Promise<void> {
  const toolId = process.argv[2] ?? 'mcp-filesystem-list_allowed_directories';
  const paramsJson = process.argv[3] ?? '{}';
  const deadlineMs = Number(process.env.PROBE_DEADLINE_MS ?? 20000);

  const params = JSON.parse(paramsJson) as Record<string, unknown>;

  const bus = EventBusService.getInstance({ serviceName: 'e2e-probe' }, logger);
  await bus.connect();

  // The descriptor the control plane would resolve for a stdio MCP tool.
  // image/args mirror what resolveToolDescriptor + getMeshServerConfig would supply.
  const envelope: ExecutionRequestEnvelope = {
    correlationId: `corr_${Date.now()}_${randomUUID().slice(0, 8)}`,
    toolId,
    params,
    ctx: { userId: 'system', scopedToken: 'system' },
    runtime: 'docker-mcp',
    sandbox: {
      image: 'mcp/filesystem',
      args: ['/work'],
      network: 'none',
      readonlyRoot: true,
      cpu: 0.5,
      memMb: 256,
      ttlSec: 300,
    },
    deadlineMs,
    idempotencyKey: `${toolId}_${Date.now()}`,
  };

  const startedAt = Date.now();
  console.log(`[probe] dispatching ${toolId} -> ${execRequestSubject('docker-mcp')} (deadline ${deadlineMs}ms)`);
  try {
    const result = await bus.publishAndWaitForResponse<ExecutionResultEnvelope>(
      execRequestSubject('docker-mcp'),
      envelope,
      deadlineMs
    );
    console.log(`[probe] RESULT in ${Date.now() - startedAt}ms:`);
    console.log(JSON.stringify(result, null, 2));
    await bus.close();
    process.exit(result.ok ? 0 : 2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[probe] NO RESULT in ${Date.now() - startedAt}ms: ${msg}`);
    await bus.close();
    process.exit(3);
  }
}

main().catch((e) => {
  console.error('[probe] fatal', e);
  process.exit(1);
});
