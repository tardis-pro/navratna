// Egress — trusted CONNECT proxy + admin /phase listener.
//
// Two children of UID1002 (the trusted `egress` user):
//   - ConnectProxy  on 127.0.0.1:15443 (loopback only, used by UID1001)
//   - Admin listener on [::]:15444 (Fly 6PN-only — kernel rejects non-6PN)
//
// UID1001 cannot reach port 15444 directly because its UID is not allowed
// by nftables to send non-loopback traffic. The gateway must dial the
// machine's 6PN address to reach :15444 with an RS256 token.
//
// This file is the entry used by the root entrypoint supervisor — it boots
// both listeners and resolves when both are listening, after which the
// entrypoint drops to UID1001 with the proxy already running.

import * as net from 'node:net';
import { ConnectProxy } from './connect_proxy.js';
import { PhaseStore } from './phase_store.js';
import { createAdminListener, loadAdminVerifyKey } from './admin_listener.js';

export interface EgressServiceOptions {
  /** Public-key PEM the gateway signer used to mint RS256 tokens. */
  codingNodePublicKeyPem: string;
  /** Returns the current machine session id, used by admin /phase. */
  getCurrentSessionId: () => string | undefined;
  /** Loopback port for the CONNECT proxy (default 15443). */
  proxyPort?: number;
  /** Port for the admin listener (default 15444). */
  adminPort?: number;
  /**
   * If provided, the admin listener is NOT started. Used by integration
   * tests that don't need network admin coordination.
   */
  skipAdmin?: boolean;
}

export interface EgressService {
  close(): Promise<void>;
  phaseStore: PhaseStore;
  proxy: ConnectProxy;
}

export async function startEgressService(opts: EgressServiceOptions): Promise<EgressService> {
  const proxyPort = opts.proxyPort ?? 15443;
  // Only allow localhost binds; bind address 127.0.0.1 is hardcoded.
  const phaseStore = new PhaseStore();
  await loadAdminVerifyKey(opts.codingNodePublicKeyPem);

  const proxy = new ConnectProxy({
    requiredPort: 443,
    allowedHostsProvider: () => phaseStore.allowedHosts(),
  });

  const proxyServer = await proxy.listen(proxyPort, '127.0.0.1');
  proxyServer.on('connection', (sock: net.Socket) => {
    sock.setNoDelay(true);
    sock.setKeepAlive(true, 30_000);
  });

  let adminListener: ReturnType<typeof createAdminListener> | null = null;
  if (!opts.skipAdmin) {
    adminListener = createAdminListener({
      phaseStore,
      getCurrentSessionId: opts.getCurrentSessionId,
      port: opts.adminPort ?? 15444,
    });
    await adminListener.listen();
  }

  return {
    phaseStore,
    proxy,
    async close(): Promise<void> {
      await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
      if (adminListener) await adminListener.close();
    },
  };
}
