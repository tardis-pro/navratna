/**
 * Gravity Wells — Spatial Region Assignment for Telescope Surface
 *
 * Assigns blocks to fixed screen regions (left | center | right) based on
 * block type, metadata, and intent category. This creates spatial stability
 * so users build muscle memory for where different content lives.
 *
 * Pure TypeScript utility — no React dependencies.
 */

import type { MaterializableBlockData } from '@/components/MaterializableBlock/materializable_block_types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScreenRegion = 'left' | 'center' | 'right';

export interface GravityWellConfig {
  /** Block types/categories attracted to the left region (monitoring, status) */
  left: string[];
  /** Block types/categories attracted to the center region (primary workflow) */
  center: string[];
  /** Block types/categories attracted to the right region (communication, query) */
  right: string[];
}

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

export const DEFAULT_GRAVITY: GravityWellConfig = {
  left: ['monitor', 'status', 'health', 'metrics', 'dashboard'],
  center: ['workflow', 'orchestrate', 'command', 'task', 'deployment'],
  right: ['communicate', 'query', 'chat', 'search', 'knowledge'],
};

/**
 * Maps IntentCategory values to the ScreenRegion they should bias toward.
 * When an intent category is active, blocks without a strong type match
 * can use this as a fallback signal.
 */
const INTENT_REGION_MAP: Record<string, ScreenRegion> = {
  MONITOR: 'left',
  COMMAND: 'center',
  ORCHESTRATE: 'center',
  QUERY: 'right',
  COMMUNICATE: 'right',
};

/**
 * Maps MaterializableBlockType to a default region when no keyword match
 * is found in the gravity config.
 */
const BLOCK_TYPE_REGION_MAP: Record<string, ScreenRegion> = {
  agent: 'center',
  portal: 'left',
  artifact: 'center',
  discussion: 'right',
  task: 'center',
};

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Determine which gravity-well keywords are present in a block's
 * type and metadata (title, tags, category, description).
 */
function extractKeywords(block: MaterializableBlockData): string[] {
  const keywords: string[] = [block.type];

  if (block.metadata) {
    const { title, tags, category, description, intent } = block.metadata as Record<
      string,
      unknown
    >;

    if (typeof title === 'string') keywords.push(...title.toLowerCase().split(/\s+/));
    if (typeof category === 'string') keywords.push(category.toLowerCase());
    if (typeof description === 'string') keywords.push(...description.toLowerCase().split(/\s+/));
    if (typeof intent === 'string') keywords.push(intent.toLowerCase());
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        if (typeof tag === 'string') keywords.push(tag.toLowerCase());
      }
    }
  }

  return keywords;
}

/**
 * Score how well a block's keywords match a region's gravity terms.
 */
function scoreRegion(keywords: string[], regionTerms: string[]): number {
  let score = 0;
  for (const keyword of keywords) {
    for (const term of regionTerms) {
      if (keyword === term || keyword.includes(term)) {
        score += 1;
      }
    }
  }
  return score;
}

/**
 * Assign a block to a screen region based on its type, metadata keywords,
 * and an optional active intent category.
 *
 * Resolution order:
 * 1. Keyword match against gravity config (highest score wins)
 * 2. Intent category hint (if provided and no keyword match)
 * 3. Block type fallback
 * 4. Default to 'center'
 */
export function assignRegion(
  block: MaterializableBlockData,
  intentCategory?: string,
  config: GravityWellConfig = DEFAULT_GRAVITY,
): ScreenRegion {
  const keywords = extractKeywords(block);

  const scores: Record<ScreenRegion, number> = {
    left: scoreRegion(keywords, config.left),
    center: scoreRegion(keywords, config.center),
    right: scoreRegion(keywords, config.right),
  };

  const maxScore = Math.max(scores.left, scores.center, scores.right);

  // If we have a clear keyword match, use it
  if (maxScore > 0) {
    if (scores.left === maxScore && scores.left > scores.center && scores.left > scores.right) {
      return 'left';
    }
    if (scores.right === maxScore && scores.right > scores.center && scores.right > scores.left) {
      return 'right';
    }
    if (scores.center === maxScore) {
      return 'center';
    }
    // Tie-break: prefer center, then the region matching intent
    if (intentCategory && INTENT_REGION_MAP[intentCategory]) {
      const intentRegion = INTENT_REGION_MAP[intentCategory];
      if (scores[intentRegion] === maxScore) return intentRegion;
    }
    return 'center';
  }

  // No keyword match — use intent category hint
  if (intentCategory && INTENT_REGION_MAP[intentCategory]) {
    return INTENT_REGION_MAP[intentCategory];
  }

  // Fallback to block type mapping
  return BLOCK_TYPE_REGION_MAP[block.type] ?? 'center';
}

/**
 * Partition and sort blocks into three screen regions.
 *
 * Blocks are assigned to regions via `assignRegion`, then sorted within
 * each region by descending relevance score. This function does NOT move
 * blocks between regions — it only organizes within them.
 */
export function arrangeByRegion(
  blocks: MaterializableBlockData[],
  intentCategory?: string,
  config: GravityWellConfig = DEFAULT_GRAVITY,
): {
  left: MaterializableBlockData[];
  center: MaterializableBlockData[];
  right: MaterializableBlockData[];
} {
  const result: {
    left: MaterializableBlockData[];
    center: MaterializableBlockData[];
    right: MaterializableBlockData[];
  } = {
    left: [],
    center: [],
    right: [],
  };

  for (const block of blocks) {
    const region = assignRegion(block, intentCategory, config);
    result[region].push(block);
  }

  // Sort each region by relevance (highest first)
  const byRelevance = (a: MaterializableBlockData, b: MaterializableBlockData) =>
    b.relevanceScore - a.relevanceScore;

  result.left.sort(byRelevance);
  result.center.sort(byRelevance);
  result.right.sort(byRelevance);

  return result;
}
