// ---------------------------------------------------------------------------
// Capability manifest — single source of truth for intent → surface mapping
//
// IntentField exposes options (STATIC_OPTIONS + PORTAL_OPTIONS + ws-N
// autocomplete suggestions) whose ids historically DID NOT match the block ids
// in BASE_SURFACE_BLOCK_CATALOG (dynamic_block_registry.ts). Selecting e.g.
// `portal-dashboard` did nothing because no block has that id (`dashboard`).
//
// This manifest reconciles the drift: it maps an intent-option id to the real
// block id it should materialize/focus on the TelescopeSurface, plus an
// optional action to route to a real handler (create agent, start discussion,
// export). Portal options and dynamic (fed-/wf-) blocks already carry real
// block ids, so they resolve by pass-through.
// ---------------------------------------------------------------------------

/** Side-effect actions routed to real handlers when an intent is selected. */
export type CapabilityAction =
  | 'create-agent'
  | 'new-discussion'
  | 'search-knowledge'
  | 'upload-knowledge'
  | 'export-data'
  | 'share';

export interface CapabilityTarget {
  /** Real surface block id to materialize/focus. */
  blockId: string;
  /** Optional side-effect action to route to a real handler. */
  action?: CapabilityAction;
}

/**
 * Explicit intent-option id → capability target.
 *
 * Keys are the non-portal STATIC_OPTIONS ids from
 * IntentField/use_intent_detection.ts. Portal option ids already equal catalog
 * block ids and are resolved by pass-through in resolveCapabilityTarget().
 */
const INTENT_TO_CAPABILITY: Record<string, CapabilityTarget> = {
  'agent-create': { blockId: 'agent-manager', action: 'create-agent' },
  'agent-manage': { blockId: 'agent-manager' },
  'portal-dashboard': { blockId: 'dashboard' },
  'portal-settings': { blockId: 'settings' },
  'portal-knowledge': { blockId: 'knowledge' },
  'portal-tools': { blockId: 'unified-tool' },
  'sop-new-discussion': { blockId: 'discussion', action: 'new-discussion' },
  'sop-search': { blockId: 'knowledge', action: 'search-knowledge' },
  'knowledge-search': { blockId: 'knowledge', action: 'search-knowledge' },
  'knowledge-upload': { blockId: 'knowledge', action: 'upload-knowledge' },
  'action-export': { blockId: 'artifacts', action: 'export-data' },
  'action-share': { blockId: 'artifacts', action: 'share' },
};

/**
 * Resolve an intent option to the block it should surface.
 *
 * Resolution order:
 *   1. Explicit manifest mapping (STATIC_OPTIONS ids that drift from block ids).
 *   2. Pass-through when the option id is already a known block id
 *      (portal options, and dynamic fed-/wf- blocks).
 * Returns null for free-text autocomplete suggestions (ws-N) that map to no
 * capability — the caller leaves the surface unchanged in that case.
 */
export function resolveCapabilityTarget(
  optionId: string,
  knownBlockIds: ReadonlySet<string>,
): CapabilityTarget | null {
  const mapped = INTENT_TO_CAPABILITY[optionId];
  if (mapped) return mapped;
  if (knownBlockIds.has(optionId)) return { blockId: optionId };
  return null;
}
