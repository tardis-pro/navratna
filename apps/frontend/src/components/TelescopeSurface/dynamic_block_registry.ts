import type { MaterializableBlockData } from '@/components/MaterializableBlock/materializable_block_types';
import type {
  CompositionDefinition,
  WorkflowBlockProjection,
  WorkflowUIProjection,
  Microexpression,
} from '@uaip/types';
import { autoArrangeBlocks } from '@/components/MaterializableBlock';
import { edenRequest } from '@/api/eden';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DynamicRegistryConfig {
  /** IDs of stable blocks that always show (e.g., ['chat', 'agent-manager', 'dashboard']) */
  baseBlocks: string[];
}

type BaseBlockSpec = Omit<MaterializableBlockData, 'position' | 'dimensions'>;

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
// Base surface block catalog
//
// Self-contained replacement for portal_registry.createInitialBlocks().
// Allows dynamic_block_registry to be fully independent of portal_registry so
// portal_registry can be deleted once the portal migration is complete (Epic 32).
//
// Scores mirror the legacy portal_registry values:
//   0.9  → chat, agent-manager, dashboard          (visible, high-priority)
//   0.8  → discussion family, user-chat            (visible)
//   0.75 → knowledge, artifacts, project-mgmt, intelligence, insights
//   0.7  → operations-monitor
//   0.65 → event-stream, security-gateway, workflow-studio
//   0.6  → settings tier (security, providers, tools, general-settings, etc.)
//   0.55 → atomic-knowledge
//   0.5  → mind-map, multi-chat
//   0.45 → project-onboarding
//   0.4  → system-config, mini-browser             (hidden)
// ---------------------------------------------------------------------------

const BASE_SURFACE_BLOCK_CATALOG: Record<string, BaseBlockSpec> = {
  chat: {
    id: 'chat',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.9,
    visibility: 'visible',
    metadata: { title: 'Chat' },
  },
  'agent-manager': {
    id: 'agent-manager',
    type: 'portal',
    expression: 'attentive',
    relevanceScore: 0.9,
    visibility: 'visible',
    metadata: { title: 'Agent Manager' },
  },
  dashboard: {
    id: 'dashboard',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.9,
    visibility: 'visible',
    metadata: { title: 'Dashboard' },
  },
  discussion: {
    id: 'discussion',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.8,
    visibility: 'visible',
    metadata: { title: 'Discussion' },
  },
  'discussion-log': {
    id: 'discussion-log',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.8,
    visibility: 'faded',
    metadata: { title: 'Discussion Log' },
  },
  'discussion-controls': {
    id: 'discussion-controls',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.8,
    visibility: 'faded',
    metadata: { title: 'Discussion Controls' },
  },
  knowledge: {
    id: 'knowledge',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.75,
    visibility: 'visible',
    metadata: { title: 'Knowledge' },
  },
  artifacts: {
    id: 'artifacts',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.75,
    visibility: 'visible',
    metadata: { title: 'Artifacts' },
  },
  'project-management': {
    id: 'project-management',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.75,
    visibility: 'visible',
    metadata: { title: 'Projects' },
  },
  'intelligence-panel': {
    id: 'intelligence-panel',
    type: 'portal',
    expression: 'attentive',
    relevanceScore: 0.75,
    visibility: 'visible',
    metadata: { title: 'Intelligence' },
  },
  'insights-panel': {
    id: 'insights-panel',
    type: 'portal',
    expression: 'attentive',
    relevanceScore: 0.75,
    visibility: 'visible',
    metadata: { title: 'Insights' },
  },
  'operations-monitor': {
    id: 'operations-monitor',
    type: 'portal',
    expression: 'working',
    relevanceScore: 0.7,
    visibility: 'faded',
    metadata: { title: 'Operations' },
  },
  'event-stream': {
    id: 'event-stream',
    type: 'portal',
    expression: 'working',
    relevanceScore: 0.65,
    visibility: 'faded',
    metadata: { title: 'Event Stream' },
  },
  'security-gateway': {
    id: 'security-gateway',
    type: 'portal',
    expression: 'attentive',
    relevanceScore: 0.65,
    visibility: 'faded',
    metadata: { title: 'Security Gateway' },
  },
  'workflow-studio': {
    id: 'workflow-studio',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.65,
    visibility: 'faded',
    metadata: { title: 'Workflow Studio' },
  },
  settings: {
    id: 'settings',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.6,
    visibility: 'faded',
    metadata: { title: 'Settings' },
  },
  security: {
    id: 'security',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.6,
    visibility: 'faded',
    metadata: { title: 'Security' },
  },
  'unified-tool': {
    id: 'unified-tool',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.6,
    visibility: 'faded',
    metadata: { title: 'Unified Tools' },
  },
  'capability-registry': {
    id: 'capability-registry',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.6,
    visibility: 'faded',
    metadata: { title: 'Capabilities' },
  },
  'knowledge-graph': {
    id: 'knowledge-graph',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.6,
    visibility: 'faded',
    metadata: { title: 'Knowledge Graph' },
  },
  'atomic-knowledge': {
    id: 'atomic-knowledge',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.55,
    visibility: 'faded',
    metadata: { title: 'Knowledge Viewer' },
  },
  'mind-map': {
    id: 'mind-map',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.5,
    visibility: 'faded',
    metadata: { title: 'Mind Map' },
  },
  'multi-chat': {
    id: 'multi-chat',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.5,
    visibility: 'faded',
    metadata: { title: 'Multi Chat' },
  },
  'project-onboarding': {
    id: 'project-onboarding',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.45,
    visibility: 'hidden',
    metadata: { title: 'Project Setup' },
  },
  'mini-browser': {
    id: 'mini-browser',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.4,
    visibility: 'hidden',
    metadata: { title: 'Mini Browser' },
  },
  whatsapp: {
    id: 'whatsapp',
    type: 'portal',
    expression: 'calm',
    relevanceScore: 0.6,
    visibility: 'faded',
    metadata: { title: 'WhatsApp' },
  },
};

// ---------------------------------------------------------------------------
// Portal search options (consumed by IntentField)
// ---------------------------------------------------------------------------

export interface PortalSearchOption {
  id: string;
  title: string;
  keywords: string[];
}

const PORTAL_KEYWORDS: Record<string, string[]> = {
  chat: ['chat', 'talk', 'message', 'ask', 'converse'],
  'agent-manager': ['agent', 'agents', 'manage', 'bot', 'assistant', 'roster'],
  dashboard: ['dashboard', 'home', 'overview', 'summary', 'status'],
  discussion: ['discussion', 'debate', 'thread', 'multi-agent'],
  'discussion-log': ['discussion', 'log', 'history', 'transcript'],
  'discussion-controls': ['discussion', 'controls', 'turn', 'moderation'],
  knowledge: ['knowledge', 'docs', 'documents', 'notes', 'memory'],
  artifacts: ['artifacts', 'files', 'outputs', 'generated', 'code'],
  'project-management': ['project', 'projects', 'tasks', 'planning', 'kanban'],
  'intelligence-panel': ['intelligence', 'insights', 'analysis', 'metrics'],
  'insights-panel': ['insights', 'analytics', 'trends', 'signals'],
  'operations-monitor': ['operations', 'ops', 'monitor', 'health', 'runtime'],
  'event-stream': ['events', 'stream', 'activity', 'feed', 'logs'],
  'security-gateway': ['security', 'gateway', 'auth', 'access', 'policy'],
  'workflow-studio': ['workflow', 'studio', 'automation', 'pipeline', 'compose'],
  settings: [
    'settings',
    'config',
    'configuration',
    'preferences',
    'options',
    'general',
    'provider',
    'providers',
    'llm',
    'model',
    'models',
    'api key',
    'apikey',
    'openai',
    'anthropic',
    'ollama',
    'system',
    'system config',
    'advanced',
  ],
  security: ['security', 'auth', 'permissions', 'access', 'mfa'],
  'unified-tool': [
    'tools',
    'tool',
    'unified',
    'integrations',
    'capabilities',
    'management',
    'mcp',
  ],
  'capability-registry': ['capability', 'capabilities', 'registry', 'skills'],
  'knowledge-graph': ['knowledge', 'graph', 'relationships', 'nodes', 'links'],
  'atomic-knowledge': ['knowledge', 'viewer', 'atomic', 'item', 'reader'],
  'mind-map': ['mind map', 'mindmap', 'map', 'brainstorm', 'visual'],
  'multi-chat': ['multi', 'chat', 'parallel', 'group'],
  'project-onboarding': ['onboarding', 'setup', 'project', 'wizard', 'getting started'],
  'mini-browser': ['browser', 'web', 'preview', 'url'],
  whatsapp: ['whatsapp', 'whats app', 'qr', 'phone', 'mobile', 'messaging', 'wa', 'link device'],
};

export function getPortalSearchOptions(): PortalSearchOption[] {
  return Object.values(BASE_SURFACE_BLOCK_CATALOG).map((spec) => {
    const title = (spec.metadata?.title as string | undefined) ?? spec.id;
    const derived = title.toLowerCase().split(/\s+/).filter(Boolean);
    const extra = PORTAL_KEYWORDS[spec.id] ?? [];
    const keywords = Array.from(new Set([...derived, ...extra, spec.id]));
    return { id: spec.id, title, keywords };
  });
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: DynamicRegistryConfig = {
  baseBlocks: ['chat', 'agent-manager', 'dashboard'],
};

const BLOCK_LAYOUT_DEFAULTS = {
  position: { x: 0, y: 0, z: 1 } as const,
  dimensions: { width: 400, height: 500 } as const,
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
    type: 'workflow',
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

function resolveBaseBlocks(ids: string[]): MaterializableBlockData[] {
  return ids.reduce<MaterializableBlockData[]>((acc, id) => {
    const spec = BASE_SURFACE_BLOCK_CATALOG[id];
    if (!spec) {
      console.warn(`[dynamic_block_registry] Unknown base block id "${id}" — not in catalog, skipping`);
      return acc;
    }
    acc.push({ ...spec, ...BLOCK_LAYOUT_DEFAULTS });
    return acc;
  }, []);
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Fetch active workflows and federated subdomains, then generate
 * MaterializableBlockData for the TelescopeSurface.
 *
 * Base layer blocks are resolved from BASE_SURFACE_BLOCK_CATALOG (no dependency
 * on portal_registry). They are filtered to those in config.baseBlocks (stable
 * blocks that always appear), then merged with workflow-derived and
 * federation-derived blocks.
 */
export async function buildDynamicBlocks(
  config?: DynamicRegistryConfig,
): Promise<MaterializableBlockData[]> {
  const resolved = config ?? DEFAULT_CONFIG;

  // 1. Resolve base blocks from internal catalog — no portal_registry dependency
  const baseBlocks = resolveBaseBlocks(resolved.baseBlocks);

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
// createInitialBlocks — full surface initializer
//
// Replaces portal_registry.createInitialBlocks(). Generates the full initial
// MaterializableBlockData array for TelescopeSurface using BASE_SURFACE_BLOCK_CATALOG.
// ---------------------------------------------------------------------------

export function createInitialBlocks(): MaterializableBlockData[] {
  const all = Object.values(BASE_SURFACE_BLOCK_CATALOG).map((spec) => ({
    ...spec,
    ...BLOCK_LAYOUT_DEFAULTS,
  }));

  return autoArrangeBlocks(all, {
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
