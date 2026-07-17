// exec-node-mcp — entrypoint. Standalone node-agent for the Hybrid Execution
// Mesh's docker-mcp tier. Runs on the EC2 Docker host (NOT on Fly) with the
// Docker socket mounted. Connects to the SAME Redis/BullMQ bus as the rest of
// the platform via @uaip/infra (REDIS_* env). See docs/specs/11-HYBRID-EXECUTION-MESH.md.

import { EventBusService } from '@uaip/infra';
import { logger } from '@uaip/utils';
import { loadConfig } from './config.js';
import { enrollNode } from './enroll.js';
import { NodeAgent } from './node_agent.js';

async function main(): Promise<void> {
  const cfg = loadConfig();

  // BYO-node quick enrollment: if a NAVRATNA_NODE_TOKEN is present, exchange it
  // over HTTPS for our identity + node token before joining the bus. On failure
  // we bail loudly (a mis-enrolled node should not silently run unregistered).
  const enrollment = await enrollNode(cfg, logger);
  if (enrollment) {
    cfg.nodeId = enrollment.nodeId;
    cfg.tenant = enrollment.tenant ?? cfg.tenant;
    cfg.nodeToken = enrollment.nodeToken;
    cfg.runtimes = enrollment.runtimes;
    cfg.tier = enrollment.tier;
    cfg.heartbeatIntervalMs = enrollment.heartbeatIntervalMs;
  }

  const bus = EventBusService.getInstance({ serviceName: 'exec-node-mcp' }, logger);
  await bus.connect();

  const agent = new NodeAgent(bus, cfg, logger);
  await agent.start();

  const shutdown = (signal: string): void => {
    logger.info(`exec-node-mcp received ${signal}, shutting down`);
    agent
      .stop()
      .catch((err) => logger.error('Error during node-agent shutdown', { error: String(err) }))
      .finally(() => {
        bus.close().finally(() => process.exit(0));
      });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error('Failed to start exec-node-mcp', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
