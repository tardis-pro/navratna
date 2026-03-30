/**
 * useConstellations
 * Fetches constellations, maps them to MaterializableBlockData with typed metadata,
 * supports debounced search and auto-refresh.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { constellationAPI } from '@/api/constellation_api';
import type { Constellation, ConstellationHealth } from '@uaip/types';
import { CONSTELLATION_HEALTH_EXPRESSION_MAP } from '@uaip/types';
import type {
  MaterializableBlockType,
  BlockVisibility,
} from '@/components/MaterializableBlock/materializable_block_types';
import type { Microexpression } from '@uaip/types';
import type { ConstellationBlockData, ConstellationBlockMetadata } from './telescope_surface_types';

const WELCOME_CONSTELLATIONS: ConstellationBlockData[] = [
  {
    id: 'welcome-intent',
    type: 'artifact' as MaterializableBlockType,
    expression: 'attentive' as Microexpression,
    relevanceScore: 0.95,
    visibility: 'visible' as BlockVisibility,
    position: { x: 0, y: 0, z: 1 },
    dimensions: { width: 288, height: 200 },
    metadata: {
      constellationId: 'welcome-intent',
      constellationName: 'Start here',
      itemCount: 0,
      health: 'active' as ConstellationHealth,
      tags: ['onboarding', 'intent'],
      isExpanded: false,
      items: [],
      averageConfidence: 1,
      description: 'Type anything in the field above. The surface reorganizes around your intent in real time.',
    } satisfies ConstellationBlockMetadata,
  },
  {
    id: 'welcome-knowledge',
    type: 'artifact' as MaterializableBlockType,
    expression: 'calm' as Microexpression,
    relevanceScore: 0.85,
    visibility: 'visible' as BlockVisibility,
    position: { x: 0, y: 0, z: 1 },
    dimensions: { width: 288, height: 200 },
    metadata: {
      constellationId: 'welcome-knowledge',
      constellationName: 'Add knowledge',
      itemCount: 0,
      health: 'stable' as ConstellationHealth,
      tags: ['knowledge', 'ingestion'],
      isExpanded: false,
      items: [],
      averageConfidence: 1,
      description: 'Upload documents, paste text, or connect a data source. Constellations form automatically as items cluster.',
    } satisfies ConstellationBlockMetadata,
  },
  {
    id: 'welcome-agents',
    type: 'artifact' as MaterializableBlockType,
    expression: 'calm' as Microexpression,
    relevanceScore: 0.78,
    visibility: 'visible' as BlockVisibility,
    position: { x: 0, y: 0, z: 1 },
    dimensions: { width: 288, height: 200 },
    metadata: {
      constellationId: 'welcome-agents',
      constellationName: 'Agents are ready',
      itemCount: 0,
      health: 'validated' as ConstellationHealth,
      tags: ['agents', 'intelligence'],
      isExpanded: false,
      items: [],
      averageConfidence: 0.9,
      description: 'Agents are online and monitoring for patterns. They will surface relevant constellations as context builds.',
    } satisfies ConstellationBlockMetadata,
  },
  {
    id: 'welcome-discuss',
    type: 'artifact' as MaterializableBlockType,
    expression: 'calm' as Microexpression,
    relevanceScore: 0.70,
    visibility: 'faded' as BlockVisibility,
    position: { x: 0, y: 0, z: 1 },
    dimensions: { width: 288, height: 200 },
    metadata: {
      constellationId: 'welcome-discuss',
      constellationName: 'Start a discussion',
      itemCount: 0,
      health: 'stable' as ConstellationHealth,
      tags: ['discussion', 'collaboration'],
      isExpanded: false,
      items: [],
      averageConfidence: 0.85,
      description: 'Invite agents into a structured discussion. Their reasoning and outputs feed directly into this surface.',
    } satisfies ConstellationBlockMetadata,
  },
];

export type { ConstellationBlockData } from './telescope_surface_types';

// ─── Hook Options ────────────────────────────────────────────────────

interface UseConstellationsOptions {
  initialQuery?: string;
  limit?: number;
  autoRefreshMs?: number;
}

const DEBOUNCE_MS = 300;
const DEFAULT_AUTO_REFRESH_MS = 30_000;

function healthToExpression(health: ConstellationHealth): Microexpression {
  return CONSTELLATION_HEALTH_EXPRESSION_MAP[health];
}

function mapConstellationToBlock(
  constellation: Constellation,
  index: number,
  expandedIds: Set<string>
): ConstellationBlockData {
  const blockType: MaterializableBlockType = 'artifact';
  const visibility: BlockVisibility = constellation.relevanceScore > 0.3 ? 'visible' : 'faded';

  return {
    id: constellation.id,
    type: blockType,
    expression: healthToExpression(constellation.health),
    relevanceScore: constellation.relevanceScore,
    visibility,
    position: {
      x: (index % 3) * 420,
      y: Math.floor(index / 3) * 320,
      z: 0,
    },
    dimensions: {
      width: 400,
      height: 300,
    },
    metadata: {
      constellationId: constellation.id,
      constellationName: constellation.name,
      itemCount: constellation.items.length,
      health: constellation.health,
      tags: constellation.tags,
      isExpanded: expandedIds.has(constellation.id),
      items: constellation.items,
      averageConfidence: constellation.metadata.averageConfidence,
      description: constellation.description,
    },
  };
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useConstellations(options: UseConstellationsOptions = {}) {
  const { initialQuery = '', limit = 20, autoRefreshMs = DEFAULT_AUTO_REFRESH_MS } = options;

  const [blocks, setBlocks] = useState<ConstellationBlockData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expandedIdsRef = useRef(expandedIds);
  expandedIdsRef.current = expandedIds;

  const fetchConstellations = useCallback(
    async (query: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await constellationAPI.getConstellations({
          query: query || undefined,
          limit,
          includeItems: true,
        });

        const mapped = response.constellations.map((c, i) =>
          mapConstellationToBlock(c, i, expandedIdsRef.current)
        );
        setBlocks(mapped.length > 0 || query ? mapped : WELCOME_CONSTELLATIONS);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch constellations';
        setError(message);
        setBlocks(WELCOME_CONSTELLATIONS);
      } finally {
        setIsLoading(false);
      }
    },
    [limit]
  );

  // Debounced search
  const search = useCallback(
    (query: string) => {
      setSearchQuery(query);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        fetchConstellations(query);
      }, DEBOUNCE_MS);
    },
    [fetchConstellations]
  );

  // Toggle expand/collapse for a constellation
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

    // Update the specific block's metadata without refetching
    setBlocks((prev) =>
      prev.map((block) => {
        if (block.id === id) {
          return {
            ...block,
            metadata: {
              ...block.metadata,
              isExpanded: !block.metadata.isExpanded,
            },
          };
        }
        return block;
      })
    );
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchConstellations(searchQuery);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      fetchConstellations(searchQuery);
    }, autoRefreshMs);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [fetchConstellations, searchQuery, autoRefreshMs]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const constellationCount = useMemo(() => blocks.length, [blocks]);

  return {
    blocks,
    isLoading,
    error,
    searchQuery,
    search,
    toggleExpand,
    constellationCount,
    refresh: () => fetchConstellations(searchQuery),
  };
}
