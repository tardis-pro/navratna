const RELOAD_MARKER = 'navratna:stale-chunk-reloaded-at';
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * A deploy replaces every content-hashed asset, so a tab opened before it asks
 * for chunk names that no longer exist. The host answers those with its SPA
 * fallback HTML, the dynamic import rejects, and the user sees "Failed to fetch
 * dynamically imported module" until they reload by hand.
 *
 * Vite emits `vite:preloadError` for exactly this. Reloading picks up the new
 * index and its current chunk names. The cooldown means a genuinely missing
 * chunk surfaces as an error instead of an endless reload loop.
 */
export function registerStaleChunkRecovery(
  reload: () => void = () => window.location.reload()
): () => void {
  const onPreloadError = (event: Event): void => {
    if (recentlyReloaded()) {
      return;
    }

    event.preventDefault();
    markReloaded();
    reload();
  };

  window.addEventListener('vite:preloadError', onPreloadError);
  return () => window.removeEventListener('vite:preloadError', onPreloadError);
}

function recentlyReloaded(): boolean {
  try {
    const last = window.sessionStorage.getItem(RELOAD_MARKER);
    if (!last) return false;
    return Date.now() - Number(last) < RELOAD_COOLDOWN_MS;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Without a
    // marker we cannot detect a loop, so decline to reload rather than risk one.
    return true;
  }
}

function markReloaded(): void {
  try {
    window.sessionStorage.setItem(RELOAD_MARKER, String(Date.now()));
  } catch {
    // Best effort only — recentlyReloaded() already fails closed.
  }
}
