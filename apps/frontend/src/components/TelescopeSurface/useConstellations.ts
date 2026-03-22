/**
 * useConstellations
 * Fetches constellations, maps them to MaterializableBlockData with typed metadata,
 * supports debounced search and auto-refresh.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { constellationAPI } from '@/api/constellation.api';
import type { Constellation, ConstellationHealth } from '@uaip/types';
import { CONSTELLATION_HEALTH_EXPRESSION_MAP } from '@uaip/types';
import type {
  MaterializableBlockType,
  BlockVisibility,
} from '@/components/MaterializableBlock/MaterializableBlock.types';
import type { Microexpression } from '@/types/microexpression';
import type { ConstellationBlockData } from './TelescopeSurface.types';

export type { ConstellationBlockData } from './TelescopeSurface.types';

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
        setBlocks(mapped);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch constellations';
        setError(message);
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
