/**
 * Intent Classifier — 5-Category Intent Taxonomy
 *
 * Orthogonal to the existing IntentOption types (agent | portal | sop | knowledge | action),
 * this module classifies the USER'S INTENT into one of five categories:
 *   QUERY | COMMAND | MONITOR | ORCHESTRATE | COMMUNICATE
 *
 * This enables smarter routing and pre-rendering based on what the user
 * wants to accomplish, independent of what entity type is matched.
 */

import type { IntentOption } from './IntentField.types';

// ---------------------------------------------------------------------------
// Enums & Interfaces
// ---------------------------------------------------------------------------

export enum IntentCategory {
  QUERY = 'QUERY',
  COMMAND = 'COMMAND',
  MONITOR = 'MONITOR',
  ORCHESTRATE = 'ORCHESTRATE',
  COMMUNICATE = 'COMMUNICATE',
}

export interface IntentClassification {
  category: IntentCategory;
  confidence: number; // 0–1
  matchedPatterns: string[];
  suggestedAction?: string;
}

export interface IntentCategoryMetadata {
  label: string;
  icon: string;
  color: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Pattern Definitions
// ---------------------------------------------------------------------------

interface CategoryPatternSet {
  category: IntentCategory;
  patterns: RegExp[];
  /** Base confidence when a pattern matches. */
  baseConfidence: number;
  suggestedAction: string;
}

const CATEGORY_PATTERNS: CategoryPatternSet[] = [
  {
    category: IntentCategory.QUERY,
    patterns: [/^(what|where|who|when|why|how|show|find|search|list|get|look up|tell me about)\b/i],
    baseConfidence: 0.85,
    suggestedAction: 'Search or retrieve information',
  },
  {
    category: IntentCategory.COMMAND,
    patterns: [
      /^(create|make|add|delete|remove|run|execute|start|stop|deploy|build|generate|update|set)\b/i,
    ],
    baseConfidence: 0.9,
    suggestedAction: 'Execute an action',
  },
  {
    category: IntentCategory.MONITOR,
    patterns: [
      /^(status|check|watch|monitor|track|health|progress)\b/i,
      /^is .+ running\b/i,
      /^how is\b/i,
    ],
    baseConfidence: 0.85,
    suggestedAction: 'Observe system status',
  },
  {
    category: IntentCategory.ORCHESTRATE,
    patterns: [
      /^(set up|setup|migrate|onboard|plan|schedule|workflow|pipeline|orchestrate|automate|configure)\b/i,
    ],
    baseConfidence: 0.88,
    suggestedAction: 'Coordinate a multi-step workflow',
  },
  {
    category: IntentCategory.COMMUNICATE,
    patterns: [
      /^(discuss|ask|talk|message|brainstorm|debate|review|chat with|send)\b/i,
      /^tell .+ to\b/i,
    ],
    baseConfidence: 0.82,
    suggestedAction: 'Initiate communication',
  },
];

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

const CATEGORY_METADATA: Record<IntentCategory, IntentCategoryMetadata> = {
  [IntentCategory.QUERY]: {
    label: 'Query',
    icon: '🔍',
    color: 'oklch(0.7 0.15 230)', // cool blue — information-seeking
    description: 'Retrieve information or search for data',
  },
  [IntentCategory.COMMAND]: {
    label: 'Command',
    icon: '⚡',
    color: 'oklch(0.75 0.18 145)', // vivid green — action/execute
    description: 'Execute an action or modify state',
  },
  [IntentCategory.MONITOR]: {
    label: 'Monitor',
    icon: '📊',
    color: 'oklch(0.72 0.14 60)', // warm amber — observational
    description: 'Observe status, health, or progress',
  },
  [IntentCategory.ORCHESTRATE]: {
    label: 'Orchestrate',
    icon: '🔄',
    color: 'oklch(0.68 0.17 300)', // purple — complex coordination
    description: 'Coordinate multi-step workflows or pipelines',
  },
  [IntentCategory.COMMUNICATE]: {
    label: 'Communicate',
    icon: '💬',
    color: 'oklch(0.73 0.16 25)', // coral — human interaction
    description: 'Start a discussion, message, or brainstorm',
  },
};

// ---------------------------------------------------------------------------
// Core Classification
// ---------------------------------------------------------------------------

/**
 * Classify free-text user input into one of the five intent categories.
 *
 * The classifier evaluates every pattern set and selects the match with
 * the highest confidence. When multiple patterns within a single category
 * match, a small bonus is applied. If nothing matches, defaults to QUERY
 * with a low confidence of 0.3.
 */
export function classifyIntent(input: string): IntentClassification {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return {
      category: IntentCategory.QUERY,
      confidence: 0.3,
      matchedPatterns: [],
    };
  }

  let bestMatch: IntentClassification | null = null;

  for (const patternSet of CATEGORY_PATTERNS) {
    const matched: string[] = [];

    for (const pattern of patternSet.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        matched.push(match[0]);
      }
    }

    if (matched.length === 0) continue;

    // Award a small bonus when multiple patterns fire for the same category.
    const multiMatchBonus = Math.min((matched.length - 1) * 0.05, 0.1);
    const confidence = Math.min(patternSet.baseConfidence + multiMatchBonus, 1);

    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = {
        category: patternSet.category,
        confidence,
        matchedPatterns: matched,
        suggestedAction: patternSet.suggestedAction,
      };
    }
  }

  return (
    bestMatch ?? {
      category: IntentCategory.QUERY,
      confidence: 0.3,
      matchedPatterns: [],
    }
  );
}

// ---------------------------------------------------------------------------
// Metadata Accessor
// ---------------------------------------------------------------------------

/**
 * Return display metadata (label, icon, color, description) for a category.
 */
export function getIntentMetadata(category: IntentCategory): IntentCategoryMetadata {
  return CATEGORY_METADATA[category];
}

// ---------------------------------------------------------------------------
// Option Enhancement
// ---------------------------------------------------------------------------

/**
 * Mapping from intent category to the IntentOption types that should
 * receive a relevance boost.
 */
const CATEGORY_TYPE_BOOST: Record<IntentCategory, IntentOption['type'][]> = {
  [IntentCategory.QUERY]: ['knowledge', 'portal'],
  [IntentCategory.COMMAND]: ['action'],
  [IntentCategory.MONITOR]: ['portal'],
  [IntentCategory.ORCHESTRATE]: ['sop'],
  [IntentCategory.COMMUNICATE]: ['agent'],
};

/** Boost factor applied to the relevanceScore of matching option types. */
const BOOST_FACTOR = 1.25;

/**
 * Boost relevance scores for IntentOptions whose type aligns with the
 * classified intent category. Non-matching options are returned unchanged.
 *
 * The returned array is re-sorted by descending relevanceScore.
 */
export function enhanceIntentOptions(
  options: IntentOption[],
  classification: IntentClassification
): IntentOption[] {
  const boostedTypes = new Set(CATEGORY_TYPE_BOOST[classification.category]);

  const enhanced = options.map((option) => {
    if (!boostedTypes.has(option.type)) return option;

    const baseScore = option.relevanceScore ?? 0.5;
    const boosted = Math.min(baseScore * BOOST_FACTOR * classification.confidence, 1);

    return { ...option, relevanceScore: boosted };
  });

  return enhanced.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
}
