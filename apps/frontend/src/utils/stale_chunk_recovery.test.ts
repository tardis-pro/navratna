import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerStaleChunkRecovery } from './stale_chunk_recovery';

function firePreloadError(): Event {
  const event = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

let dispose: () => void = () => {};

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  dispose();
});

describe('stale chunk recovery', () => {
  it('reloads when a chunk from a superseded deploy fails to load', () => {
    const reload = vi.fn();
    dispose = registerStaleChunkRecovery(reload);

    firePreloadError();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload twice within the cooldown, so a missing chunk cannot loop', () => {
    const reload = vi.fn();
    dispose = registerStaleChunkRecovery(reload);

    firePreloadError();
    firePreloadError();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again once the cooldown has passed', () => {
    const reload = vi.fn();
    dispose = registerStaleChunkRecovery(reload);

    firePreloadError();
    window.sessionStorage.setItem(
      'navratna:stale-chunk-reloaded-at',
      String(Date.now() - 60_000)
    );
    firePreloadError();

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('suppresses the default handler only when it actually reloads', () => {
    const reload = vi.fn();
    dispose = registerStaleChunkRecovery(reload);

    expect(firePreloadError().defaultPrevented).toBe(true);
    expect(firePreloadError().defaultPrevented).toBe(false);
  });
});
