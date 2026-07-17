import { logger } from '@uaip/utils';
import { loadConfig } from './config.js';
import { initJwtVerifyKey } from './auth/jwt_auth.js';
import { SessionRegistry } from './session/session_registry.js';
import { buildAgentServer } from './agent_server.js';
import { configureProviderProxyFetch } from './proxy_fetch.js';

async function main(): Promise<void> {
  configureProviderProxyFetch();
  const config = loadConfig();

  await initJwtVerifyKey(config.codingNodeJwtPublicKeyPem);

  const registry = new SessionRegistry();

  const app = buildAgentServer(config, registry);

  app.listen({ port: config.port, hostname: config.host });

  logger.info('exec-node-coding started', {
    port: config.port,
    host: config.host,
    nodeId: config.nodeId,
    sessionDir: config.sessionDir,
    replayBufferSize: config.replayBufferSize,
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`exec-node-coding received ${signal}, shutting down`);
    await app.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.error('exec-node-coding: failed to start', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
