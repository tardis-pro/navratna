import type { MaterializableBlockData } from '@/components/MaterializableBlock/materializable_block_types';
import type {
  CompositionDefinition,
  WorkflowBlockProjection,
  WorkflowUIProjection,
  Microexpression,
} from '@uaip/types';
import { autoArrangeBlocks } from '@/components/MaterializableBlock';
import { edenRequest } from '@/api/eden';
import { createInitialBlocks } from './portal_registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DynamicRegistryConfig {
  /** IDs of stable blocks that always show (e.g., ['chat', 'agent-manager', 'dashboard']) */
  baseBlocks: string[];
}

interface FederationSubdomain {
  id: string;
  name: string;
  url: string;
  status: 'healthy' | 'degraded' | 'unreachable';
  capabilities?: string[];
}

interface CompositionsResponse {
  compositions: CompositionDefinition[];
}

interface SubdomainsResponse {
  subdomains: FederationSubdomain[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: DynamicRegistryConfig = {
  baseBlocks: ['chat', 'agent-manager', 'dashboard'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function workflowExpressionForState(
  ui: WorkflowUIProjection,
  state: 'idle' | 'running' | 'waitingApproval' | 'completed' | 'failed' = 'idle',
): Microexpression {
  return ui.expressions[state] as Microexpression;
}

function projectionToBlock(
  composition: CompositionDefinition,
  projection: WorkflowBlockProjection,
): MaterializableBlockData {
  const blockId = `wf-${composition.id}-${projection.stepId}`;

  return {
    id: blockId,
    type: 'portal',
    expression: workflowExpressionForState(composition.ui),
    relevanceScore: composition.ui.ambient.attentionWeight,
    visibility: 'visible',
    position: { x: 0, y: 0, z: 1 },
    dimensions: { width: 400, height: 500 },
    metadata: {
      title: projection.title ?? composition.name,
      workflowId: composition.id,
      stepId: projection.stepId,
      display: projection.display,
      fields: projection.fields,
      actions: projection.actions,
      category: composition.category,
      constellationIcon: composition.ui.constellation.icon,
      constellationColor: composition.ui.constellation.color,
      constellationCategory: composition.ui.constellation.category,
      isWorkflowDerived: true,
    },
  };
}

function subdomainToBlock(subdomain: FederationSubdomain): MaterializableBlockData {
  const relevance =
    subdomain.status === 'healthy'
      ? 0.7
      : subdomain.status === 'degraded'
        ? 0.4
        : 0.1;

  const expression: Microexpression =
    subdomain.status === 'healthy'
      ? 'calm'
      : subdomain.status === 'degraded'
        ? 'strained'
        : 'alarmed';

  return {
    id: `fed-${subdomain.id}`,
    type: 'portal',
    expression,
    relevanceScore: relevance,
    visibility: relevance > 0.2 ? 'visible' : 'hidden',
    position: { x: 0, y: 0, z: 1 },
    dimensions: { width: 400, height: 500 },
    metadata: {
      title: subdomain.name,
      subdomainId: subdomain.id,
      subdomainUrl: subdomain.url,
      subdomainStatus: subdomain.status,
      capabilities: subdomain.capabilities,
      isFederatedNode: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Fetch active workflows and federated subdomains, then generate
 * MaterializableBlockData for the TelescopeSurface.
 *
 * Base layer blocks from portal_registry are filtered to those in
 * config.baseBlocks (stable blocks that always appear), then merged
 * with workflow-derived and federation-derived blocks.
 */
export async function buildDynamicBlocks(
  config?: DynamicRegistryConfig,
): Promise<MaterializableBlockData[]> {
  const resolved = config ?? DEFAULT_CONFIG;

  // 1. Keep base layer blocks from portal_registry
  const allStaticBlocks = createInitialBlocks();
  const baseBlocks = allStaticBlocks.filter((b) =>
    resolved.baseBlocks.includes(b.id),
  );

  // 2 + 3. Fetch active workflow compositions and generate blocks
  let workflowBlocks: MaterializableBlockData[] = [];
  try {
    const compositionsResult = await edenRequest<CompositionsResponse>(
      '/api/v1/compositions?isActive=true',
      { method: 'GET' },
    );
    const compositions = compositionsResult?.compositions ?? [];

    workflowBlocks = compositions.flatMap((comp) =>
      (comp.ui?.blocks ?? []).map((projection) =>
        projectionToBlock(comp, projection),
      ),
    );
  } catch {
    // Workflows endpoint may not be available yet — degrade gracefully
    console.warn('[dynamic_block_registry] Failed to fetch compositions, continuing with base blocks');
  }

  // 4 + 5. Fetch federated subdomains and generate constellation nodes
  let federationBlocks: MaterializableBlockData[] = [];
  try {
    const subdomainsResult = await edenRequest<SubdomainsResponse>(
      '/api/v1/federation/subdomains?status=healthy',
      { method: 'GET' },
    );
    const subdomains = subdomainsResult?.subdomains ?? [];

    federationBlocks = subdomains.map(subdomainToBlock);
  } catch {
    // Federation endpoint may not be available yet — degrade gracefully
    console.warn('[dynamic_block_registry] Failed to fetch subdomains, continuing without federation nodes');
  }

  // 6. Merge and auto-arrange
  const merged = [...baseBlocks, ...workflowBlocks, ...federationBlocks];

  return autoArrangeBlocks(merged, {
    gridCols: 3,
    blockWidth: 400,
    blockHeight: 500,
    gap: 24,
    padding: 24,
  });
}

// ---------------------------------------------------------------------------
// Surface snapshot — debugging utility
// ---------------------------------------------------------------------------

/**
 * Capture a lightweight snapshot of the current surface state for debugging.
 */
export function captureSurfaceSnapshot(blocks: MaterializableBlockData[]): object {
  return {
    timestamp: new Date().toISOString(),
    blockCount: blocks.length,
    blocks: blocks.map((b) => ({
      id: b.id,
      type: b.type,
      relevance: b.relevanceScore,
      visibility: b.visibility,
    })),
  };
}
