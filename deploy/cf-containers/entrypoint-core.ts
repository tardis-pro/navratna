/**
 * Diagnostic entrypoint for navratna-core on CF Containers.
 *
 * 1. Binds port 8080 IMMEDIATELY — satisfies CF's port-ready deadline.
 * 2. Posts env diagnostics to BOOT_SINK_URL.
 * 3. Dynamically imports the real app (which will take over the port).
 *    If the import throws (ESM evaluation crash), reports the error.
 */

export {}; // make this a module for top-level await

const PORT = parseInt(process.env.NAVRATNA_CORE_PORT || '8080', 10);
const sink = process.env.BOOT_SINK_URL;

const post = async (phase: string, extra?: string): Promise<void> => {
  if (!sink) return;
  try {
    await fetch(sink, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ svc: 'core-entry', phase, extra, t: Date.now() }),
    });
  } catch (_) { /* best-effort */ }
};

// Env diagnostics: key=len (never values)
const envReport = Object.entries(process.env)
  .filter(([k]) => !k.startsWith('_') && !k.startsWith('npm_') && !k.startsWith('PNPM'))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k}=${v ? v.length : 0}`)
  .join(', ');

await post('env-check', envReport);

// Bind port FIRST so CF doesn't kill us
let earlyServer: ReturnType<typeof Bun.serve> | undefined;
try {
  earlyServer = Bun.serve({
    port: PORT,
    fetch() {
      return new Response(JSON.stringify({ status: 'booting', phase: 'pre-import' }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  await post('port-bound', `port=${PORT}`);
} catch (err) {
  await post('port-bind-failed', String(err));
}

// Now dynamically import the real app — captures ESM eval crashes
try {
  await post('importing-app');

  // Stop early server so the real app can bind the same port
  if (earlyServer) {
    earlyServer.stop(true);
    earlyServer = undefined;
    // Small delay to release the port
    await new Promise((r) => setTimeout(r, 200));
  }

  await import('../../apps/backend/services/navratna-core/dist/navratna-core/src/index.js');
  await post('import-done');
} catch (err) {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  await post('import-failed', msg);
  console.error('ENTRYPOINT: app import failed:', msg);

  // Re-bind port so CF keeps us alive for diagnostics
  Bun.serve({
    port: PORT,
    fetch() {
      return new Response(JSON.stringify({ status: 'boot-failed', error: msg }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
}

// Keep alive
setInterval(() => {}, 1 << 30);
