/**
 * Change Budget — Spatial Stability Governor for Telescope Surface
 *
 * Prevents disorienting simultaneous block changes by limiting how many
 * position/visibility mutations can occur per frame, protecting recently
 * accessed blocks, and suppressing all movement while the pointer is
 * inside the grid area.
 *
 * Pure TypeScript utility — no React dependencies.
 */

import type { MaterializableBlockData } from '@/components/MaterializableBlock/materializable_block_types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChangeBudgetConfig {
  /** Maximum number of block changes applied in one frame. Default: 2 */
  maxChangesPerFrame: number;
  /** Delay between staggered change batches in ms. Default: 300 */
  staggerIntervalMs: number;
  /** Blocks accessed within this window (ms) are protected from removal/move. Default: 300000 (5 min) */
  recencyProtectionMs: number;
  /** When true, suppress all changes while pointer is inside the grid. Default: true */
  suppressDuringInteraction: boolean;
}

export interface BudgetResult {
  /** Blocks to apply immediately (up to maxChangesPerFrame changes from current state) */
  immediate: MaterializableBlockData[];
  /** Remaining changes, each with a stagger delay */
  queued: Array<{ block: MaterializableBlockData; delayMs: number }>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ChangeBudgetConfig = {
  maxChangesPerFrame: 2,
  staggerIntervalMs: 300,
  recencyProtectionMs: 300_000, // 5 minutes
  suppressDuringInteraction: true,
};

// ---------------------------------------------------------------------------
// Change Detection Helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether a block changed between two snapshots.
 * A "change" is any of: visibility change, position change, or
 * presence/absence (added/removed).
 */
function blockChanged(
  current: MaterializableBlockData | undefined,
  proposed: MaterializableBlockData,
): boolean {
  if (!current) return true; // new block = change
  if (current.visibility !== proposed.visibility) return true;
  if (
    current.position.x !== proposed.position.x ||
    current.position.y !== proposed.position.y ||
    current.position.z !== proposed.position.z
  ) {
    return true;
  }
  return false;
}

/**
 * Build a lookup map keyed by block ID for O(1) access.
 */
function toMap(blocks: MaterializableBlockData[]): Map<string, MaterializableBlockData> {
  const map = new Map<string, MaterializableBlockData>();
  for (const block of blocks) {
    map.set(block.id, block);
  }
  return map;
}

// ---------------------------------------------------------------------------
// ChangeBudgetManager
// ---------------------------------------------------------------------------

export class ChangeBudgetManager {
  private recentlyAccessed: Map<string, number> = new Map(); // blockId -> timestamp
  private pointerInGrid = false;
  private config: ChangeBudgetConfig;

  constructor(config: Partial<ChangeBudgetConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Interaction Tracking
  // -----------------------------------------------------------------------

  /**
   * Record that the user interacted with a block (click, hover, focus, etc.).
   * Protected blocks will not be hidden or moved within the recency window.
   */
  recordAccess(blockId: string): void {
    this.recentlyAccessed.set(blockId, Date.now());
  }

  /**
   * Track whether the pointer is currently inside the block grid area.
   * When true (and suppressDuringInteraction is enabled), all changes are
   * deferred until the pointer leaves.
   */
  setPointerInGrid(inGrid: boolean): void {
    this.pointerInGrid = inGrid;
  }

  /**
   * Check whether a given block is protected by recency.
   */
  isProtected(blockId: string, now: number = Date.now()): boolean {
    const lastAccess = this.recentlyAccessed.get(blockId);
    if (lastAccess === undefined) return false;
    return now - lastAccess < this.config.recencyProtectionMs;
  }

  // -----------------------------------------------------------------------
  // Budget Enforcement
  // -----------------------------------------------------------------------

  /**
   * Given the current block arrangement and a proposed new arrangement,
   * enforce the change budget:
   *
   * 1. If pointer is in grid and suppression is on, return current state
   *    unchanged (all proposed changes queued).
   * 2. Protected blocks (accessed within recencyProtectionMs) keep their
   *    current visibility and position — proposed changes to them are dropped.
   * 3. At most maxChangesPerFrame changes are applied immediately.
   * 4. Remaining changes are queued with staggerIntervalMs spacing.
   */
  applyBudget(
    currentBlocks: MaterializableBlockData[],
    proposedBlocks: MaterializableBlockData[],
  ): BudgetResult {
    const now = Date.now();
    this.pruneStaleEntries(now);

    const currentMap = toMap(currentBlocks);
    const proposedMap = toMap(proposedBlocks);

    // ----- Pointer suppression -----
    if (this.config.suppressDuringInteraction && this.pointerInGrid) {
      // Return current state as immediate; queue all proposed changes
      const queued = proposedBlocks
        .filter((pb) => blockChanged(currentMap.get(pb.id), pb))
        .map((block, i) => ({
          block,
          delayMs: this.config.staggerIntervalMs * (i + 1),
        }));

      return { immediate: currentBlocks, queued };
    }

    // ----- Classify each proposed block -----
    const unchanged: MaterializableBlockData[] = [];
    const changed: MaterializableBlockData[] = [];

    for (const proposed of proposedBlocks) {
      const current = currentMap.get(proposed.id);

      // Recency protection: keep current state for protected blocks
      if (this.isProtected(proposed.id, now) && current) {
        // Preserve the block but allow non-positional metadata updates
        unchanged.push({
          ...proposed,
          visibility: current.visibility,
          position: current.position,
        });
        continue;
      }

      if (blockChanged(current, proposed)) {
        changed.push(proposed);
      } else {
        unchanged.push(proposed);
      }
    }

    // Also include blocks that exist in current but are absent from proposed,
    // IF they are protected by recency
    for (const current of currentBlocks) {
      if (!proposedMap.has(current.id) && this.isProtected(current.id, now)) {
        unchanged.push(current);
      }
    }

    // ----- Apply budget -----
    const immediateChanges = changed.slice(0, this.config.maxChangesPerFrame);
    const deferredChanges = changed.slice(this.config.maxChangesPerFrame);

    const immediate = [...unchanged, ...immediateChanges];

    const queued = deferredChanges.map((block, i) => ({
      block,
      delayMs: this.config.staggerIntervalMs * (i + 1),
    }));

    return { immediate, queued };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Remove entries older than the recency protection window.
   */
  private pruneStaleEntries(now: number): void {
    for (const [blockId, timestamp] of this.recentlyAccessed) {
      if (now - timestamp >= this.config.recencyProtectionMs) {
        this.recentlyAccessed.delete(blockId);
      }
    }
  }
}
