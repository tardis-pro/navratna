// Egress helper — Bun entry for the UID1002 userland egress service.
//
// Reads CODING_NODE_JWT_PUBLIC_KEY_PEM from env, reads CODING_SESSION_ID,
// waits for both 15443 (loopback CONNECT) and 15444 (admin /phase, 6PN-only)
// listeners to be ready, then blocks. The root entrypoint supervisor
// monitors this process for the lifetime of the machine.
//
// No HTTP frameworks, no Express. Pure Node `http` + `net`.

import { startEgressService } from './egress/index.js';
import { logger } from '@uaip/utils';

async function main(): Promise<void> {
  const publicPem = process.env['CODING_NODE_JWT_PUBLIC_KEY_PEM'] ?? '';
  if (!publicPem || !publicPem.includes('-----BEGIN PUBLIC KEY-----')) {
    throw new Error('CODING_NODE_JWT_PUBLIC_KEY_PEM is required');
  }

  const getCurrentSessionId = (): string | undefined => {
    return process.env['CODING_SESSION_ID'] || undefined;
  };

  const service = await startEgressService({
    codingNodePublicKeyPem: publicPem,
    getCurrentSessionId,
  });

  logger.info('egress: service ready', { proxyPort: 15443, adminPort: 15444 });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`egress: received ${signal}, shutting down`);
    await service.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  // oxlint-disable-next-line no-console -- last-resort error path before init
  console.error('egress: fatal', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
