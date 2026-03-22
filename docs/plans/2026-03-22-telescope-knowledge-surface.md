# Telescope Knowledge Surface Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the complete Telescope Knowledge Surface — the first Telescope-native UI that replaces the static knowledge graph with a relevance-driven, intent-responsive constellation surface, wires orphaned components (WhisperLine, AttentionBudget, CrystallizationEffect) into the live UI, and closes the Jira outcome feedback loop.

**Architecture:** The frontend is a single `TelescopeKnowledgeSurface` component that composes IntentField + force-directed constellation layout + MaterializableBlock + AttentionBudget + WhisperLine + CrystallizationEffect + Microexpressions. A new backend endpoint `/api/v1/knowledge/constellations` clusters knowledge items via Qdrant vector proximity and returns constellation groups. The Jira adapter publishes operation outcomes to the EventBus, which the AgentLearningService already listens to.

**Tech Stack:** React 18, TypeScript (strict, no `any`/`unknown`), Framer Motion (spring physics), @xyflow/react (custom layout), Qdrant (vector clustering), Neo4j (graph relationships), Vitest + Testing Library (tests), oxlint (linting).

**Constraints:** No `any` or `unknown` types. All types must be properly defined. Use oxlint to verify. Don't stash or remove files — only create/update. Use shared interfaces from `@uaip/types` and existing component APIs.

---

## Task 1: Constellation Types & Shared Interfaces

**Files:**
- Create: `packages/shared-types/src/telescope.ts`
- Modify: `packages/shared-types/src/index.ts` — add re-export

**Step 1: Create telescope types**

```typescript
// packages/shared-types/src/telescope.ts
import { KnowledgeType, SourceType } from './knowledge-graph';

/** A constellation is a group of semantically related knowledge items */
export interface Constellation {
  id: string;
  name: string;
  description: string;
  knowledgeType: KnowledgeType;
  items: ConstellationItem[];
  relevanceScore: number;
  confidence: number;
  tags: string[];
  health: ConstellationHealth;
  metadata: ConstellationMetadata;
}

export interface ConstellationItem {
  id: string;
  title: string;
  content: string;
  knowledgeType: KnowledgeType;
  sourceType: SourceType;
  confidence: number;
  tags: string[];
  relevanceScore: number;
  createdAt: string;
  updatedAt: string;
}

export type ConstellationHealth =
  | 'stable'       // All items current, no conflicts
  | 'active'       // Matches current intent
  | 'processing'   // Agent actively working on items
  | 'conflicted'   // Conflicting information detected
  | 'ambiguous'    // Needs clarification
  | 'validated'    // Recently validated, high confidence
  | 'stale';       // Heavily connected but possibly outdated

export interface ConstellationMetadata {
  itemCount: number;
  averageConfidence: number;
  dominantSourceType: SourceType;
  lastUpdated: string;
  clusterSimilarity: number;
}

export interface ConstellationRequest {
  query?: string;
  limit?: number;
  minSimilarity?: number;
  includeItems?: boolean;
}

export interface ConstellationResponse {
  constellations: Constellation[];
  totalItems: number;
  query: string;
  clusteredAt: string;
}

/** Maps constellation health to microexpression states */
export const CONSTELLATION_HEALTH_EXPRESSION_MAP: Record<ConstellationHealth, string> = {
  stable: 'calm',
  active: 'attentive',
  processing: 'working',
  conflicted: 'alarmed',
  ambiguous: 'confused',
  validated: 'satisfied',
  stale: 'strained',
} as const;

/** Force layout configuration for the telescope surface */
export interface ForceLayoutConfig {
  gravity: number;       // Pull toward center for relevant items (0-1)
  springStrength: number; // Relationship edge spring force (0-1)
  repulsion: number;     // Repulsion to prevent overlap (0-1)
  friction: number;      // Damping to prevent jitter (0-1)
  centerX: number;
  centerY: number;
}

export const DEFAULT_FORCE_LAYOUT_CONFIG: ForceLayoutConfig = {
  gravity: 0.3,
  springStrength: 0.5,
  repulsion: 0.8,
  friction: 0.85,
  centerX: 0,
  centerY: 0,
};

/** Jira outcome event payload for the feedback loop */
export interface JiraOutcomeEvent {
  issueKey: string;
  issueId: string;
  projectKey: string;
  transitionName: string;
  fromStatus: string;
  toStatus: string;
  operationId: string;
  agentId: string;
  timestamp: string;
  metadata: Record<string, string>;
}
```

**Step 2: Add re-export to shared-types index**

Find the index.ts in `packages/shared-types/src/` and add:
```typescript
export * from './telescope';
```

**Step 3: Build shared packages**

Run: `cd /home/pronit/workspace/tardis/bmad-navratna/navratna && pnpm build:shared`
Expected: Clean build, no errors.

**Step 4: Verify with oxlint**

Run: `cd /home/pronit/workspace/tardis/bmad-navratna/navratna && npx oxlint packages/shared-types/src/telescope.ts`
Expected: No errors.

---

## Task 2: Backend — Constellation Clustering Endpoint

**Files:**
- Create: `backend/services/agent-intelligence/src/services/constellation.service.ts`
- Create: `backend/services/agent-intelligence/src/routes/constellation.routes.ts`
- Modify: `backend/services/agent-intelligence/src/routes/agent.routes.ts` — mount constellation routes

**Step 1: Create constellation service**

This service wraps `KnowledgeClusteringService` and the existing relevance engine to produce `Constellation[]` from raw Qdrant clusters. It:

1. Calls `KnowledgeClusteringService.clusterSimilarKnowledge()` with lower thresholds (minClusterSize=2, similarityThreshold=0.6) suitable for UI display
2. Maps each `KnowledgeCluster` to a `Constellation` with auto-generated name from dominant topic
3. If a query is provided, scores each constellation against the relevance engine
4. Determines `ConstellationHealth` from item staleness, conflict detection, and processing state

```typescript
// backend/services/agent-intelligence/src/services/constellation.service.ts
import { KnowledgeClusteringService, KnowledgeCluster, QdrantPoint } from '@uaip/shared-services/knowledge-graph/knowledge-clustering.service';
import { QdrantService } from '@uaip/shared-services/qdrant.service';
import { SmartEmbeddingService } from '@uaip/shared-services/knowledge-graph/smart-embedding.service';
import {
  Constellation,
  ConstellationItem,
  ConstellationHealth,
  ConstellationMetadata,
  ConstellationRequest,
  ConstellationResponse,
} from '@uaip/types';
import { KnowledgeType, SourceType } from '@uaip/types';
import { relevance, RelevanceInput } from './relevance';

const MIN_CLUSTER_SIZE = 2;
const DEFAULT_SIMILARITY_THRESHOLD = 0.6;
const DEFAULT_LIMIT = 12;
const STALE_THRESHOLD_DAYS = 30;

export class ConstellationService {
  private clusteringService: KnowledgeClusteringService;

  constructor(
    private readonly qdrantService: QdrantService,
    private readonly embeddingService: SmartEmbeddingService,
  ) {
    this.clusteringService = new KnowledgeClusteringService(qdrantService, embeddingService);
  }

  async getConstellations(request: ConstellationRequest): Promise<ConstellationResponse> {
    const {
      query = '',
      limit = DEFAULT_LIMIT,
      minSimilarity = DEFAULT_SIMILARITY_THRESHOLD,
      includeItems = true,
    } = request;

    // Get raw clusters from Qdrant
    const clusteringResult = await this.clusteringService.clusterSimilarKnowledge(
      MIN_CLUSTER_SIZE,
      minSimilarity,
    );

    // Map clusters to constellations
    let constellations = clusteringResult.clusters.map((cluster) =>
      this.mapClusterToConstellation(cluster, includeItems),
    );

    // Score against intent if query provided
    if (query.length > 0) {
      constellations = await this.scoreConstellations(constellations, query);
    }

    // Sort by relevance and limit
    constellations.sort((a, b) => b.relevanceScore - a.relevanceScore);
    constellations = constellations.slice(0, limit);

    return {
      constellations,
      totalItems: clusteringResult.totalOriginalItems,
      query,
      clusteredAt: new Date().toISOString(),
    };
  }

  private mapClusterToConstellation(
    cluster: KnowledgeCluster,
    includeItems: boolean,
  ): Constellation {
    const name = this.generateConstellationName(cluster);
    const items = includeItems
      ? cluster.similarChunks.map((point) => this.mapPointToItem(point))
      : [];
    const health = this.assessHealth(cluster);

    const metadata: ConstellationMetadata = {
      itemCount: cluster.similarChunks.length,
      averageConfidence: cluster.averageConfidence,
      dominantSourceType: this.getDominantSourceType(cluster.similarChunks),
      lastUpdated: new Date().toISOString(),
      clusterSimilarity: cluster.confidence,
    };

    return {
      id: cluster.clusterId,
      name,
      description: cluster.consolidatedContent.slice(0, 200),
      knowledgeType: cluster.consolidatedType,
      items,
      relevanceScore: cluster.averageConfidence,
      confidence: cluster.confidence,
      tags: cluster.consolidatedTags,
      health,
      metadata,
    };
  }

  private mapPointToItem(point: QdrantPoint): ConstellationItem {
    return {
      id: point.id,
      title: this.extractTitle(point.payload.content),
      content: point.payload.content,
      knowledgeType: point.payload.knowledgeType,
      sourceType: (point.payload.sourceType as SourceType) || SourceType.MANUAL,
      confidence: point.payload.confidence,
      tags: point.payload.tags,
      relevanceScore: point.payload.confidence,
      createdAt: (point.payload.originalMetadata?.createdAt as string) || new Date().toISOString(),
      updatedAt: (point.payload.originalMetadata?.updatedAt as string) || new Date().toISOString(),
    };
  }

  private generateConstellationName(cluster: KnowledgeCluster): string {
    // Use the most frequent tags as the name
    const tagCounts = new Map<string, number>();
    for (const chunk of cluster.similarChunks) {
      for (const tag of chunk.payload.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    const sortedTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag);

    if (sortedTags.length > 0) {
      return sortedTags.join(' · ');
    }

    // Fallback: use knowledge type
    return `${cluster.consolidatedType} Knowledge`;
  }

  private extractTitle(content: string): string {
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.length <= 80) return firstLine;
    return `${firstLine.slice(0, 77)}...`;
  }

  private assessHealth(cluster: KnowledgeCluster): ConstellationHealth {
    if (cluster.averageConfidence < 0.3) return 'ambiguous';
    if (cluster.averageConfidence < 0.5) return 'stale';

    // Check for conflicting types within cluster
    const types = new Set(cluster.similarChunks.map((c) => c.payload.knowledgeType));
    if (types.size > 3) return 'conflicted';

    if (cluster.averageConfidence > 0.8) return 'validated';

    return 'stable';
  }

  private getDominantSourceType(chunks: QdrantPoint[]): SourceType {
    const counts = new Map<string, number>();
    for (const chunk of chunks) {
      const st = chunk.payload.sourceType || 'MANUAL';
      counts.set(st, (counts.get(st) || 0) + 1);
    }
    let dominant = 'MANUAL';
    let max = 0;
    for (const [type, count] of counts) {
      if (count > max) {
        max = count;
        dominant = type;
      }
    }
    return dominant as SourceType;
  }

  private async scoreConstellations(
    constellations: Constellation[],
    query: string,
  ): Promise<Constellation[]> {
    try {
      const candidates = constellations.map((c) => ({
        id: c.id,
        type: 'knowledge' as const,
        metadata: {
          name: c.name,
          description: c.description,
          tags: c.tags.join(', '),
          keywords: c.tags.join(', '),
        },
      }));

      const input: RelevanceInput = {
        query,
        candidates,
        limit: constellations.length,
      };

      const results = await relevance(input);
      const scoreMap = new Map(results.map((r) => [r.id, r.score]));

      return constellations.map((c) => ({
        ...c,
        relevanceScore: scoreMap.get(c.id) ?? c.relevanceScore,
        health: scoreMap.has(c.id) && (scoreMap.get(c.id) ?? 0) > 0.5
          ? 'active' as ConstellationHealth
          : c.health,
      }));
    } catch {
      // Relevance scoring is best-effort
      return constellations;
    }
  }
}
```

**Step 2: Create constellation routes**

```typescript
// backend/services/agent-intelligence/src/routes/constellation.routes.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ConstellationService } from '../services/constellation.service';
import { QdrantService } from '@uaip/shared-services/qdrant.service';
import { SmartEmbeddingService } from '@uaip/shared-services/knowledge-graph/smart-embedding.service';

const constellationRequestSchema = z.object({
  query: z.string().optional().default(''),
  limit: z.number().int().positive().max(50).optional().default(12),
  minSimilarity: z.number().min(0).max(1).optional().default(0.6),
  includeItems: z.boolean().optional().default(true),
});

export function createConstellationRoutes(): Router {
  const router = Router();
  let service: ConstellationService | null = null;

  function getService(): ConstellationService {
    if (!service) {
      const qdrant = new QdrantService();
      const embedding = new SmartEmbeddingService();
      service = new ConstellationService(qdrant, embedding);
    }
    return service;
  }

  router.post('/constellations', async (req: Request, res: Response) => {
    try {
      const parsed = constellationRequestSchema.parse(req.body);
      const result = await getService().getConstellations(parsed);
      res.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }
      console.error('Constellation endpoint error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate constellations',
      });
    }
  });

  return router;
}
```

**Step 3: Mount constellation routes in agent routes**

In `backend/services/agent-intelligence/src/routes/agent.routes.ts`, import and mount:
```typescript
import { createConstellationRoutes } from './constellation.routes';
// ... inside route setup:
router.use('/knowledge', createConstellationRoutes());
```

This gives endpoint: `POST /api/v1/knowledge/constellations`

**Step 4: Build and verify**

Run: `cd /home/pronit/workspace/tardis/bmad-navratna/navratna && pnpm build:backend`
Expected: Clean build.

---

## Task 3: Frontend — Constellation API Client

**Files:**
- Create: `apps/frontend/src/api/constellation.api.ts`
- Modify: `apps/frontend/src/api/index.ts` — add re-export

**Step 1: Create constellation API client**

```typescript
// apps/frontend/src/api/constellation.api.ts
import { APIClient } from './client';
import type {
  ConstellationRequest,
  ConstellationResponse,
} from '@uaip/types';

const client = new APIClient();

export const constellationAPI = {
  getConstellations: async (request: ConstellationRequest): Promise<ConstellationResponse> => {
    const response = await client.post<{ success: boolean; data: ConstellationResponse }>(
      '/api/v1/knowledge/constellations',
      request,
    );
    return response.data;
  },
};
```

**Step 2: Add to API index**

Add to `apps/frontend/src/api/index.ts`:
```typescript
export * from './constellation.api';
```

And add `constellation: constellationAPI` to the `api` namespace object.

**Step 3: Verify with oxlint**

Run: `npx oxlint apps/frontend/src/api/constellation.api.ts`
Expected: No errors.

---

## Task 4: Frontend — useForceLayout Hook (Physics Simulation)

**Files:**
- Create: `apps/frontend/src/components/TelescopeSurface/useForceLayout.ts`

This hook replaces the Dagre hierarchical layout with a force-directed physics simulation using Framer Motion spring values. No d3-force dependency needed — we implement the 4-force model directly with `requestAnimationFrame`.

**Step 1: Create the force layout hook**

```typescript
// apps/frontend/src/components/TelescopeSurface/useForceLayout.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import type { ForceLayoutConfig } from '@uaip/types';
import { DEFAULT_FORCE_LAYOUT_CONFIG } from '@uaip/types';

export interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  relevanceScore: number;
  radius: number;
  /** IDs of connected nodes (spring force targets) */
  connections: string[];
  /** Whether this node is pinned (no physics) */
  pinned: boolean;
}

export interface UseForceLayoutOptions {
  config?: Partial<ForceLayoutConfig>;
  width: number;
  height: number;
  enabled?: boolean;
}

export interface UseForceLayoutReturn {
  positions: Map<string, { x: number; y: number }>;
  setNodes: (nodes: ForceNode[]) => void;
  updateRelevance: (id: string, score: number) => void;
  setIntentCenter: (x: number, y: number) => void;
  isSimulating: boolean;
}

const VELOCITY_THRESHOLD = 0.01;
const MAX_ITERATIONS_PER_FRAME = 1;
const TIME_STEP = 0.016; // ~60fps

export function useForceLayout(options: UseForceLayoutOptions): UseForceLayoutReturn {
  const { config: configOverride, width, height, enabled = true } = options;
  const config: ForceLayoutConfig = { ...DEFAULT_FORCE_LAYOUT_CONFIG, ...configOverride };

  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [isSimulating, setIsSimulating] = useState(false);

  const nodesRef = useRef<ForceNode[]>([]);
  const nodeMapRef = useRef<Map<string, ForceNode>>(new Map());
  const rafRef = useRef<number>(0);
  const intentCenterRef = useRef({ x: width / 2, y: height / 2 });
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Intent gravity: pulls relevant nodes toward center
  const applyGravity = useCallback((nodes: ForceNode[]) => {
    const cx = intentCenterRef.current.x;
    const cy = intentCenterRef.current.y;

    for (const node of nodes) {
      if (node.pinned) continue;
      const dx = cx - node.x;
      const dy = cy - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      // Higher relevance = stronger pull toward center
      const force = config.gravity * node.relevanceScore;
      node.vx += (dx / distance) * force;
      node.vy += (dy / distance) * force;
    }
  }, [config.gravity]);

  // Spring force: keeps connected nodes close
  const applySprings = useCallback((nodes: ForceNode[], nodeMap: Map<string, ForceNode>) => {
    for (const node of nodes) {
      if (node.pinned) continue;
      for (const connId of node.connections) {
        const other = nodeMap.get(connId);
        if (!other) continue;

        const dx = other.x - node.x;
        const dy = other.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = node.radius + other.radius + 40;
        const displacement = distance - targetDist;
        const force = config.springStrength * displacement * 0.01;

        node.vx += (dx / distance) * force;
        node.vy += (dy / distance) * force;
      }
    }
  }, [config.springStrength]);

  // Repulsion: prevents overlap
  const applyRepulsion = useCallback((nodes: ForceNode[]) => {
    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i];
      if (nodeA.pinned) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB = nodes[j];
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distSq = dx * dx + dy * dy || 1;
        const minDist = nodeA.radius + nodeB.radius + 20;

        if (distSq < minDist * minDist) {
          const distance = Math.sqrt(distSq);
          const force = config.repulsion * (minDist - distance) / distance;

          if (!nodeA.pinned) {
            nodeA.vx -= dx * force * 0.5;
            nodeA.vy -= dy * force * 0.5;
          }
          if (!nodeB.pinned) {
            nodeB.vx += dx * force * 0.5;
            nodeB.vy += dy * force * 0.5;
          }
        }
      }
    }
  }, [config.repulsion]);

  // Friction: damping
  const applyFriction = useCallback((nodes: ForceNode[]) => {
    for (const node of nodes) {
      node.vx *= config.friction;
      node.vy *= config.friction;
    }
  }, [config.friction]);

  // Boundary clamping
  const clampToBounds = useCallback((nodes: ForceNode[]) => {
    const padding = 40;
    for (const node of nodes) {
      node.x = Math.max(padding + node.radius, Math.min(width - padding - node.radius, node.x));
      node.y = Math.max(padding + node.radius, Math.min(height - padding - node.radius, node.y));
    }
  }, [width, height]);

  const simulate = useCallback(() => {
    if (!enabledRef.current) return;

    const nodes = nodesRef.current;
    const nodeMap = nodeMapRef.current;
    if (nodes.length === 0) {
      setIsSimulating(false);
      return;
    }

    for (let iter = 0; iter < MAX_ITERATIONS_PER_FRAME; iter++) {
      applyGravity(nodes);
      applySprings(nodes, nodeMap);
      applyRepulsion(nodes);
      applyFriction(nodes);

      // Integrate velocities
      let totalKineticEnergy = 0;
      for (const node of nodes) {
        if (node.pinned) continue;
        node.x += node.vx * TIME_STEP * 60;
        node.y += node.vy * TIME_STEP * 60;
        totalKineticEnergy += node.vx * node.vx + node.vy * node.vy;
      }

      clampToBounds(nodes);

      // Stop if settled
      if (totalKineticEnergy < VELOCITY_THRESHOLD * nodes.length) {
        setIsSimulating(false);
        // Final position update
        const newPositions = new Map<string, { x: number; y: number }>();
        for (const node of nodes) {
          newPositions.set(node.id, { x: node.x, y: node.y });
        }
        setPositions(newPositions);
        return;
      }
    }

    // Update positions for render
    const newPositions = new Map<string, { x: number; y: number }>();
    for (const node of nodes) {
      newPositions.set(node.id, { x: node.x, y: node.y });
    }
    setPositions(newPositions);

    rafRef.current = requestAnimationFrame(simulate);
  }, [applyGravity, applySprings, applyRepulsion, applyFriction, clampToBounds]);

  const setNodes = useCallback((nodes: ForceNode[]) => {
    nodesRef.current = nodes;
    const map = new Map<string, ForceNode>();
    for (const node of nodes) {
      map.set(node.id, node);
    }
    nodeMapRef.current = map;

    // Kick off simulation
    cancelAnimationFrame(rafRef.current);
    setIsSimulating(true);
    rafRef.current = requestAnimationFrame(simulate);
  }, [simulate]);

  const updateRelevance = useCallback((id: string, score: number) => {
    const node = nodeMapRef.current.get(id);
    if (node) {
      node.relevanceScore = Math.max(0, Math.min(1, score));
      // Restart simulation
      cancelAnimationFrame(rafRef.current);
      setIsSimulating(true);
      rafRef.current = requestAnimationFrame(simulate);
    }
  }, [simulate]);

  const setIntentCenter = useCallback((x: number, y: number) => {
    intentCenterRef.current = { x, y };
    // Restart simulation for new gravity center
    if (nodesRef.current.length > 0) {
      cancelAnimationFrame(rafRef.current);
      setIsSimulating(true);
      rafRef.current = requestAnimationFrame(simulate);
    }
  }, [simulate]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { positions, setNodes, updateRelevance, setIntentCenter, isSimulating };
}
```

**Step 2: Verify with oxlint**

Run: `npx oxlint apps/frontend/src/components/TelescopeSurface/useForceLayout.ts`
Expected: No errors.

---

## Task 5: Frontend — useConstellations Hook (Data Fetching + State)

**Files:**
- Create: `apps/frontend/src/components/TelescopeSurface/useConstellations.ts`

This hook fetches constellations from the backend, maps them to MaterializableBlockData for rendering, and integrates with the IntentField search signal.

**Step 1: Create the hook**

```typescript
// apps/frontend/src/components/TelescopeSurface/useConstellations.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { constellationAPI } from '@/api/constellation.api';
import type {
  Constellation,
  ConstellationHealth,
  ConstellationRequest,
} from '@uaip/types';
import { CONSTELLATION_HEALTH_EXPRESSION_MAP } from '@uaip/types';
import type {
  MaterializableBlockData,
  MaterializableBlockType,
} from '@/components/MaterializableBlock/MaterializableBlock.types';
import type { Microexpression } from '@/types/microexpression';

const DEBOUNCE_MS = 300;
const DEFAULT_MAX_CONSTELLATIONS = 12;

export interface ConstellationBlockData extends MaterializableBlockData {
  metadata: {
    constellationId: string;
    constellationName: string;
    itemCount: number;
    health: ConstellationHealth;
    tags: string[];
    isExpanded: boolean;
    items: Constellation['items'];
    averageConfidence: number;
    description: string;
  };
}

export interface UseConstellationsOptions {
  maxConstellations?: number;
  autoRefreshMs?: number;
}

export interface UseConstellationsReturn {
  constellations: ConstellationBlockData[];
  isLoading: boolean;
  error: string | null;
  search: (query: string) => void;
  refresh: () => void;
  toggleExpand: (constellationId: string) => void;
  totalItems: number;
}

function healthToExpression(health: ConstellationHealth): Microexpression {
  return CONSTELLATION_HEALTH_EXPRESSION_MAP[health] as Microexpression;
}

function constellationToBlock(
  constellation: Constellation,
  index: number,
): ConstellationBlockData {
  const expression = healthToExpression(constellation.health);

  return {
    id: constellation.id,
    type: 'artifact' as MaterializableBlockType, // Knowledge constellations render as artifact blocks
    expression,
    relevanceScore: constellation.relevanceScore,
    visibility: 'visible',
    position: { x: 0, y: 0, z: index + 1 },
    dimensions: { width: 320, height: 240 },
    metadata: {
      constellationId: constellation.id,
      constellationName: constellation.name,
      itemCount: constellation.items.length,
      health: constellation.health,
      tags: constellation.tags,
      isExpanded: false,
      items: constellation.items,
      averageConfidence: constellation.metadata.averageConfidence,
      description: constellation.description,
    },
  };
}

export function useConstellations(
  options: UseConstellationsOptions = {},
): UseConstellationsReturn {
  const {
    maxConstellations = DEFAULT_MAX_CONSTELLATIONS,
    autoRefreshMs = 30_000,
  } = options;

  const [constellations, setConstellations] = useState<ConstellationBlockData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalItems, setTotalItems] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef('');
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchConstellations = useCallback(async (query: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const request: ConstellationRequest = {
        query,
        limit: maxConstellations,
        includeItems: true,
      };

      const response = await constellationAPI.getConstellations(request);
      const blocks = response.constellations.map((c, i) =>
        constellationToBlock(c, i),
      );
      setConstellations(blocks);
      setTotalItems(response.totalItems);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load constellations';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [maxConstellations]);

  const search = useCallback((query: string) => {
    lastQueryRef.current = query;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      void fetchConstellations(query);
    }, DEBOUNCE_MS);
  }, [fetchConstellations]);

  const refresh = useCallback(() => {
    void fetchConstellations(lastQueryRef.current);
  }, [fetchConstellations]);

  const toggleExpand = useCallback((constellationId: string) => {
    setConstellations((prev) =>
      prev.map((block) => {
        if (block.id !== constellationId) return block;
        return {
          ...block,
          metadata: {
            ...block.metadata,
            isExpanded: !block.metadata.isExpanded,
          },
        };
      }),
    );
  }, []);

  // Initial load
  useEffect(() => {
    void fetchConstellations('');
  }, [fetchConstellations]);

  // Auto-refresh
  useEffect(() => {
    autoRefreshRef.current = setInterval(() => {
      void fetchConstellations(lastQueryRef.current);
    }, autoRefreshMs);

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [autoRefreshMs, fetchConstellations]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    constellations,
    isLoading,
    error,
    search,
    refresh,
    toggleExpand,
    totalItems,
  };
}
```

**Step 2: Verify with oxlint**

Run: `npx oxlint apps/frontend/src/components/TelescopeSurface/useConstellations.ts`
Expected: No errors.

---

## Task 6: Frontend — useKnowledgeMicroexpression Hook

**Files:**
- Create: `apps/frontend/src/hooks/useKnowledgeMicroexpression.ts`

Maps constellation health states to microexpression visual states, complementing the existing `useAgentMicroexpression` which maps agent activity.

**Step 1: Create the hook**

```typescript
// apps/frontend/src/hooks/useKnowledgeMicroexpression.ts
import { useMemo } from 'react';
import type { Microexpression } from '@/types/microexpression';
import type { ConstellationHealth } from '@uaip/types';
import { CONSTELLATION_HEALTH_EXPRESSION_MAP } from '@uaip/types';

export interface KnowledgeMicroexpressionInput {
  health: ConstellationHealth;
  relevanceScore: number;
  isProcessing: boolean;
  hasConflicts: boolean;
}

export interface KnowledgeMicroexpressionResult {
  expression: Microexpression;
  label: string;
  isActive: boolean;
}

const HEALTH_LABELS: Record<ConstellationHealth, string> = {
  stable: 'Stable, not currently relevant',
  active: 'Matches current intent',
  processing: 'Agent actively processing',
  conflicted: 'Conflicting information detected',
  ambiguous: 'Ambiguous, needs clarification',
  validated: 'Recently validated, high confidence',
  stale: 'Heavily connected but possibly outdated',
};

export function useKnowledgeMicroexpression(
  input: KnowledgeMicroexpressionInput,
): KnowledgeMicroexpressionResult {
  const { health, relevanceScore, isProcessing, hasConflicts } = input;

  return useMemo(() => {
    // Override health-based expression with real-time signals
    let effectiveHealth: ConstellationHealth = health;

    if (isProcessing) {
      effectiveHealth = 'processing';
    } else if (hasConflicts) {
      effectiveHealth = 'conflicted';
    } else if (relevanceScore > 0.7) {
      effectiveHealth = 'active';
    }

    const expression = CONSTELLATION_HEALTH_EXPRESSION_MAP[effectiveHealth] as Microexpression;
    const label = HEALTH_LABELS[effectiveHealth];
    const isActive = effectiveHealth !== 'stable' && effectiveHealth !== 'stale';

    return { expression, label, isActive };
  }, [health, relevanceScore, isProcessing, hasConflicts]);
}
```

**Step 2: Verify with oxlint**

Run: `npx oxlint apps/frontend/src/hooks/useKnowledgeMicroexpression.ts`
Expected: No errors.

---

## Task 7: Frontend — ConstellationNode Component

**Files:**
- Create: `apps/frontend/src/components/TelescopeSurface/ConstellationNode.tsx`

This is a single constellation rendered as a MaterializableBlock with microexpression, relevance-driven sizing, blur crystallization, and expand/collapse.

**Step 1: Create the component**

```typescript
// apps/frontend/src/components/TelescopeSurface/ConstellationNode.tsx
'use client';

import { useMemo, type ReactNode } from 'react';
import { motion, type Transition } from 'framer-motion';
import { Layers, ChevronDown, ChevronRight, Tag } from 'lucide-react';
import { MicroexpressionIndicator } from '@/components/Microexpression/Microexpression';
import { useKnowledgeMicroexpression } from '@/hooks/useKnowledgeMicroexpression';
import { cn } from '@/lib/utils';
import type { ConstellationBlockData } from './useConstellations';
import type { BlockVisibility } from '@/components/MaterializableBlock/MaterializableBlock.types';

export interface ConstellationNodeProps {
  block: ConstellationBlockData;
  visibility: BlockVisibility;
  onClick?: (id: string) => void;
  onExpand?: (id: string) => void;
  className?: string;
}

const SPRING_TRANSITION: Transition = {
  type: 'spring',
  damping: 25,
  stiffness: 120,
};

const VISIBILITY_OPACITY: Record<BlockVisibility, number> = {
  visible: 1,
  faded: 0.4,
  hidden: 0,
};

// Relevance-driven scaling: 0.3x to 1.5x
function getRelevanceScale(score: number): number {
  return 0.3 + score * 1.2;
}

// Relevance-driven blur: 0px (high) to 4px (low)
function getRelevanceBlur(score: number): number {
  return Math.max(0, (1 - score) * 4);
}

export function ConstellationNode({
  block,
  visibility,
  onClick,
  onExpand,
  className,
}: ConstellationNodeProps): ReactNode {
  const { metadata, relevanceScore } = block;

  const microexpressionInput = useMemo(() => ({
    health: metadata.health,
    relevanceScore,
    isProcessing: metadata.health === 'processing',
    hasConflicts: metadata.health === 'conflicted',
  }), [metadata.health, relevanceScore]);

  const { expression, label: expressionLabel } = useKnowledgeMicroexpression(microexpressionInput);

  const scale = useMemo(() => getRelevanceScale(relevanceScore), [relevanceScore]);
  const blur = useMemo(() => getRelevanceBlur(relevanceScore), [relevanceScore]);
  const opacity = VISIBILITY_OPACITY[visibility];

  if (visibility === 'hidden') return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8, filter: 'blur(8px)' }}
      animate={{
        opacity,
        scale,
        filter: `blur(${blur}px)`,
      }}
      exit={{ opacity: 0, scale: 0.8, filter: 'blur(8px)' }}
      transition={SPRING_TRANSITION}
      className={cn(
        'relative rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm',
        'cursor-pointer select-none overflow-hidden',
        'hover:border-white/20 hover:bg-white/8',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
        className,
      )}
      onClick={() => onClick?.(block.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(block.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${metadata.constellationName} constellation, ${metadata.itemCount} items, ${Math.round(relevanceScore * 100)}% relevance`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <MicroexpressionIndicator expression={expression} size="sm" />
          <Layers className="w-4 h-4 shrink-0" style={{ color: 'oklch(75% 0.1 264)' }} />
          <span className="text-sm font-medium text-white/90 truncate">
            {metadata.constellationName}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{ background: 'oklch(30% 0.05 264)', color: 'oklch(80% 0.1 264)' }}
          >
            {Math.round(relevanceScore * 100)}%
          </span>
          <span className="text-xs text-white/50">
            {metadata.itemCount}
          </span>
        </div>
      </div>

      {/* Description */}
      <div className="px-3 pb-2">
        <p className="text-xs text-white/50 line-clamp-2">
          {metadata.description}
        </p>
      </div>

      {/* Tags */}
      {metadata.tags.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {metadata.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full text-white/40"
              style={{ background: 'oklch(20% 0.02 264)' }}
            >
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
          {metadata.tags.length > 4 && (
            <span className="text-[10px] text-white/30">
              +{metadata.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Expand toggle */}
      {metadata.itemCount > 0 && (
        <button
          className="flex items-center gap-1 px-3 py-1.5 w-full text-xs text-white/40 hover:text-white/60 transition-colors border-t border-white/5"
          onClick={(e) => {
            e.stopPropagation();
            onExpand?.(block.id);
          }}
          aria-expanded={metadata.isExpanded}
          aria-label={`${metadata.isExpanded ? 'Collapse' : 'Expand'} ${metadata.constellationName}`}
        >
          {metadata.isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          {metadata.isExpanded ? 'Collapse' : `${metadata.itemCount} items`}
        </button>
      )}

      {/* Expanded items */}
      {metadata.isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={SPRING_TRANSITION}
          className="border-t border-white/5"
        >
          <div className="max-h-48 overflow-y-auto p-2 space-y-1">
            {metadata.items.map((item) => (
              <div
                key={item.id}
                className="text-xs p-2 rounded-lg bg-white/3 text-white/60"
              >
                <span className="font-medium text-white/80">{item.title}</span>
                <p className="text-white/40 line-clamp-1 mt-0.5">{item.content}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Expression label (subtle) */}
      <div
        className="absolute bottom-0 right-0 px-2 py-0.5 text-[9px] text-white/25 rounded-tl"
        aria-hidden
      >
        {expressionLabel}
      </div>
    </motion.div>
  );
}
```

**Step 2: Verify with oxlint**

Run: `npx oxlint apps/frontend/src/components/TelescopeSurface/ConstellationNode.tsx`
Expected: No errors.

---

## Task 8: Frontend — TelescopeKnowledgeSurface (Main Composition)

**Files:**
- Create: `apps/frontend/src/components/TelescopeSurface/TelescopeKnowledgeSurface.tsx`
- Modify: `apps/frontend/src/components/TelescopeSurface/index.ts` — add exports

This is the main component that composes: IntentField + ConstellationNode + ForceLayout + AttentionBudget + WhisperLine + CrystallizationEffect.

**Step 1: Create the main surface component**

```typescript
// apps/frontend/src/components/TelescopeSurface/TelescopeKnowledgeSurface.tsx
'use client';

import { useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IntentField } from '@/components/IntentField';
import { WhisperLine } from '@/components/AmbientIntelligence';
import { AttentionBudget, useAttentionBudget } from '@/components/AttentionBudget';
import { CrystallizationEffect } from '@/components/PredictiveIntent';
import { ConstellationNode } from './ConstellationNode';
import { useConstellations } from './useConstellations';
import { useForceLayout } from './useForceLayout';
import type { ForceNode } from './useForceLayout';
import type { ConstellationBlockData } from './useConstellations';
import type { BlockVisibility } from '@/components/MaterializableBlock/MaterializableBlock.types';
import type { AttentionItem } from '@/components/AttentionBudget';
import { cn } from '@/lib/utils';

export interface TelescopeKnowledgeSurfaceProps {
  className?: string;
  onConstellationSelect?: (id: string) => void;
}

const MAX_VISIBLE = 4;
const SURFACE_PADDING = 24;

interface WhisperState {
  message: string;
  context: string;
  relevanceScore: number;
}

function deriveVisibility(
  score: number,
  index: number,
): BlockVisibility {
  if (index >= MAX_VISIBLE) return 'hidden';
  if (score < 0.2) return 'hidden';
  if (score < 0.5) return 'faded';
  return 'visible';
}

export function TelescopeKnowledgeSurface({
  className,
  onConstellationSelect,
}: TelescopeKnowledgeSurfaceProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [intentQuery, setIntentQuery] = useState('');
  const [whisper, setWhisper] = useState<WhisperState | null>(null);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Constellation data
  const {
    constellations,
    isLoading,
    error,
    search,
    refresh,
    toggleExpand,
    totalItems,
  } = useConstellations({ maxConstellations: 12 });

  // Attention budget
  const {
    activeCount,
    isAtCapacity,
  } = useAttentionBudget({ maxBudget: MAX_VISIBLE });

  // Sort by relevance and assign visibility
  const processedConstellations = useMemo(() => {
    const sorted = [...constellations].sort(
      (a, b) => b.relevanceScore - a.relevanceScore,
    );
    return sorted.map((block, index) => ({
      ...block,
      visibility: deriveVisibility(block.relevanceScore, index),
    }));
  }, [constellations]);

  const visibleConstellations = useMemo(
    () => processedConstellations.filter((c) => c.visibility !== 'hidden'),
    [processedConstellations],
  );

  // Force layout
  const {
    positions,
    setNodes: setForceNodes,
    setIntentCenter,
    isSimulating,
  } = useForceLayout({
    width: dimensions.width - SURFACE_PADDING * 2,
    height: dimensions.height - SURFACE_PADDING * 2 - 80, // Account for IntentField + WhisperLine
    enabled: visibleConstellations.length > 0,
  });

  // Update force layout nodes when constellations change
  useEffect(() => {
    const forceNodes: ForceNode[] = visibleConstellations.map((c) => ({
      id: c.id,
      x: dimensions.width / 2 + (Math.random() - 0.5) * 200,
      y: dimensions.height / 2 + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0,
      relevanceScore: c.relevanceScore,
      radius: 80 + c.relevanceScore * 80, // 80px to 160px
      connections: [], // TODO: wire from Neo4j relationships
      pinned: false,
    }));
    setForceNodes(forceNodes);
  }, [visibleConstellations, dimensions, setForceNodes]);

  // Intent handling
  const handleIntentSearch = useCallback((query: string) => {
    setIntentQuery(query);
    search(query);

    // Update intent gravity center
    setIntentCenter(dimensions.width / 2, dimensions.height / 3);

    // Update whisper
    if (query.length > 0) {
      setWhisper({
        message: `Reorganizing around "${query}"`,
        context: `${visibleConstellations.length} constellations, ${totalItems} total items`,
        relevanceScore: visibleConstellations.length > 0
          ? visibleConstellations[0].relevanceScore
          : 0,
      });
    } else {
      setWhisper(null);
    }
  }, [search, setIntentCenter, dimensions, visibleConstellations, totalItems]);

  const handleConstellationClick = useCallback((id: string) => {
    onConstellationSelect?.(id);
  }, [onConstellationSelect]);

  // Attention items for the gauge
  const attentionItems: AttentionItem[] = useMemo(() =>
    visibleConstellations.map((c) => ({
      id: c.id,
      label: c.metadata.constellationName,
      type: 'knowledge',
    })),
  [visibleConstellations]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full h-full min-h-[400px] overflow-hidden',
        'bg-gradient-to-b from-black/95 to-black/98',
        className,
      )}
      role="region"
      aria-label="Telescope Knowledge Surface"
    >
      {/* IntentField at top */}
      <div className="relative z-20 p-4 pb-0">
        <IntentField
          showTrigger={false}
          placeholder="What are you looking for..."
          onSelect={(option) => handleIntentSearch(option.title)}
        />
      </div>

      {/* WhisperLine */}
      <AnimatePresence>
        {whisper && (
          <div className="relative z-10 px-4">
            <WhisperLine
              message={whisper.message}
              context={whisper.context}
              relevanceScore={whisper.relevanceScore}
              onDismiss={() => setWhisper(null)}
              position="top"
            />
          </div>
        )}
      </AnimatePresence>

      {/* Main constellation surface */}
      <CrystallizationEffect isLoading={isLoading} showShimmer>
        <div
          className="relative w-full flex-1"
          style={{
            height: dimensions.height - 120,
            padding: SURFACE_PADDING,
          }}
        >
          <AnimatePresence mode="popLayout">
            {visibleConstellations.map((constellation) => {
              const pos = positions.get(constellation.id);
              const x = pos ? pos.x : dimensions.width / 2;
              const y = pos ? pos.y : dimensions.height / 2;

              return (
                <motion.div
                  key={constellation.id}
                  layout
                  style={{
                    position: 'absolute',
                    left: x - 160,
                    top: y - 120,
                    width: 320,
                  }}
                  animate={{
                    left: x - 160,
                    top: y - 120,
                  }}
                  transition={{
                    type: 'spring',
                    damping: 25,
                    stiffness: 120,
                  }}
                >
                  <ConstellationNode
                    block={constellation}
                    visibility={constellation.visibility}
                    onClick={handleConstellationClick}
                    onExpand={toggleExpand}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Empty state */}
          {!isLoading && visibleConstellations.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white/30 space-y-2">
                <p className="text-sm">No constellations materialized</p>
                {error ? (
                  <p className="text-xs text-red-400/60">{error}</p>
                ) : (
                  <p className="text-xs">Add knowledge or type an intent to begin</p>
                )}
              </div>
            </div>
          )}
        </div>
      </CrystallizationEffect>

      {/* Attention Budget gauge */}
      <AttentionBudget
        activeCount={visibleConstellations.length}
        maxBudget={MAX_VISIBLE}
        items={attentionItems}
        position="right"
      />

      {/* Simulation indicator */}
      {isSimulating && (
        <div
          className="absolute bottom-2 left-2 text-[9px] text-white/15"
          aria-hidden
        >
          settling...
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update index.ts**

Add to `apps/frontend/src/components/TelescopeSurface/index.ts`:
```typescript
export { TelescopeKnowledgeSurface } from './TelescopeKnowledgeSurface';
export type { TelescopeKnowledgeSurfaceProps } from './TelescopeKnowledgeSurface';
export { ConstellationNode } from './ConstellationNode';
export type { ConstellationNodeProps } from './ConstellationNode';
export { useConstellations } from './useConstellations';
export type { ConstellationBlockData, UseConstellationsReturn } from './useConstellations';
export { useForceLayout } from './useForceLayout';
export type { ForceNode, UseForceLayoutReturn } from './useForceLayout';
```

**Step 3: Verify with oxlint**

Run: `npx oxlint apps/frontend/src/components/TelescopeSurface/TelescopeKnowledgeSurface.tsx`
Expected: No errors.

---

## Task 9: Frontend — Mount TelescopeKnowledgeSurface in DesktopUnified

**Files:**
- Modify: `apps/frontend/src/components/DesktopUnified.tsx`

**Step 1: Add feature-flagged Telescope surface**

At the top of DesktopUnified.tsx, add the lazy import:
```typescript
const TelescopeKnowledgeSurface = React.lazy(() =>
  import('./TelescopeSurface/TelescopeKnowledgeSurface').then((m) => ({
    default: m.TelescopeKnowledgeSurface,
  })),
);
```

Import `isTelescopeEnabled` from `./TelescopeSurface`:
```typescript
import { isTelescopeEnabled } from './TelescopeSurface';
```

**Step 2: Add telescope mode state**

In the `Desktop` component, add:
```typescript
const [telescopeMode, setTelescopeMode] = useState(() => isTelescopeEnabled());
```

**Step 3: Conditional render**

Before the existing desktop grid/window rendering, add:
```typescript
{telescopeMode && (
  <Suspense fallback={<div className="w-full h-full bg-black" />}>
    <TelescopeKnowledgeSurface
      className="absolute inset-0 z-10"
      onConstellationSelect={(id) => {
        // Open knowledge portal with the selected constellation
        const knowledgeApp = APPLICATIONS.find((app) => app.id === 'knowledge');
        if (knowledgeApp) {
          openApplication(knowledgeApp);
        }
      }}
    />
  </Suspense>
)}
```

**Step 4: Add keyboard shortcut to toggle**

In the keyboard handler, add `Ctrl+Shift+T` to toggle telescope mode:
```typescript
if (e.ctrlKey && e.shiftKey && e.key === 'T') {
  e.preventDefault();
  setTelescopeMode((prev) => {
    const next = !prev;
    localStorage.setItem('telescope_enabled', String(next));
    return next;
  });
}
```

**Step 5: Verify with oxlint**

Run: `npx oxlint apps/frontend/src/components/DesktopUnified.tsx`
Expected: No new errors introduced.

---

## Task 10: Backend — Jira Outcome Feedback Loop

**Files:**
- Create: `backend/services/capability-registry/src/services/jira-outcome-bridge.service.ts`
- Modify: `backend/services/capability-registry/src/adapters/jira-adapter.ts` — emit events after operations

**Step 1: Create the Jira outcome bridge**

This service listens for Jira operation events on the EventBus and forwards outcomes to the agent learning service channel.

```typescript
// backend/services/capability-registry/src/services/jira-outcome-bridge.service.ts
import { EventBusService } from '@uaip/shared-services';

export interface JiraOperationOutcome {
  operationType: string;
  issueKey: string;
  issueId: string;
  projectKey: string;
  status: 'success' | 'failure';
  agentId: string;
  operationId: string;
  result: Record<string, string | number | boolean>;
  timestamp: string;
}

const JIRA_OPERATION_EVENT = 'jira.operation.completed';
const LEARNING_OPERATION_EVENT = 'agent.learning.operation';

export class JiraOutcomeBridgeService {
  constructor(private readonly eventBus: EventBusService) {}

  async initialize(): Promise<void> {
    await this.eventBus.subscribe(
      JIRA_OPERATION_EVENT,
      async (message) => {
        const outcome = message.data as JiraOperationOutcome;
        await this.forwardToLearningService(outcome);
      },
      { queue: 'capability-registry.jira-outcome-bridge' },
    );
  }

  private async forwardToLearningService(outcome: JiraOperationOutcome): Promise<void> {
    try {
      await this.eventBus.publish(LEARNING_OPERATION_EVENT, {
        agentId: outcome.agentId,
        operationId: outcome.operationId,
        outcomes: {
          jiraIssueKey: outcome.issueKey,
          jiraStatus: outcome.status,
          operationType: outcome.operationType,
          result: outcome.result,
        },
        feedback: {
          source: 'jira-adapter',
          type: outcome.status === 'success' ? 'positive' : 'negative',
          timestamp: outcome.timestamp,
        },
      });
    } catch (error) {
      console.error('Failed to forward Jira outcome to learning service:', error);
    }
  }
}
```

**Step 2: Add event emission to Jira adapter**

In `jira-adapter.ts`, after each successful operation in `execute()`, publish the outcome event. Add to the adapter class:

```typescript
// Add to the JiraAdapter class
private async emitOperationOutcome(
  operationType: string,
  result: Record<string, string | number | boolean>,
  agentId: string = 'system',
  operationId: string = '',
): Promise<void> {
  try {
    const eventBus = EventBusService.getInstance();
    await eventBus.publish('jira.operation.completed', {
      operationType,
      issueKey: (result.key as string) || '',
      issueId: (result.id as string) || '',
      projectKey: '',
      status: 'success',
      agentId,
      operationId,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Event emission is best-effort
  }
}
```

Then in each operation method (`createIssue`, `updateIssue`, `searchIssues`, `addComment`), call `this.emitOperationOutcome(...)` after the successful API response.

**Step 3: Build and verify**

Run: `cd /home/pronit/workspace/tardis/bmad-navratna/navratna && pnpm build:backend`
Expected: Clean build.

---

## Task 11: Verification — oxlint Pass on All New Files

**Step 1: Run oxlint on all new/modified files**

```bash
cd /home/pronit/workspace/tardis/bmad-navratna/navratna

# Shared types
npx oxlint packages/shared-types/src/telescope.ts

# Backend
npx oxlint backend/services/agent-intelligence/src/services/constellation.service.ts
npx oxlint backend/services/agent-intelligence/src/routes/constellation.routes.ts
npx oxlint backend/services/capability-registry/src/services/jira-outcome-bridge.service.ts

# Frontend
npx oxlint apps/frontend/src/api/constellation.api.ts
npx oxlint apps/frontend/src/components/TelescopeSurface/useForceLayout.ts
npx oxlint apps/frontend/src/components/TelescopeSurface/useConstellations.ts
npx oxlint apps/frontend/src/components/TelescopeSurface/ConstellationNode.tsx
npx oxlint apps/frontend/src/components/TelescopeSurface/TelescopeKnowledgeSurface.tsx
npx oxlint apps/frontend/src/hooks/useKnowledgeMicroexpression.ts
```

Expected: All clean, no any/unknown types, no errors.

**Step 2: Build everything**

```bash
pnpm build
```

Expected: Clean build across all packages.

---

## Summary of Deliverables

| Task | What | PRD Section |
|------|------|-------------|
| 1 | Shared types for Constellation, ForceLayout, JiraOutcome | Foundation |
| 2 | Backend constellation clustering endpoint | §4.1 Constellation Clustering |
| 3 | Frontend API client for constellations | §4.1 |
| 4 | Force-directed layout hook with 4 forces | §4.2 Force-Directed Layout |
| 5 | Constellation data fetching hook with debounce | §4.1 + §4.4 |
| 6 | Knowledge microexpression mapping hook | §4.7 Microexpression Mapping |
| 7 | ConstellationNode with relevance-driven size/blur/opacity | §4.4 Relevance-Driven Rendering |
| 8 | Main composition: IntentField + Constellations + WhisperLine + AttentionBudget + Crystallization | §4.3 + §4.5 + §4.6 + all |
| 9 | Feature-flagged mount in DesktopUnified | §TelescopeSurface container |
| 10 | Jira outcome feedback loop bridge | §Value Leak Closure |
| 11 | Full oxlint verification pass | Quality gate |
