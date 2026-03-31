/**
 * Shared types for the TelescopeSurface component family.
 * Single source of truth — imported by ConstellationNode, useConstellations, and TelescopeKnowledgeSurface.
 */

import type { ConstellationHealth, ConstellationItem } from '@uaip/types';
import type { MaterializableBlockData } from '@/components/MaterializableBlock/materializable_block_types';

export interface ConstellationBlockMetadata {
  constellationId: string;
  constellationName: string;
  itemCount: number;
  health: ConstellationHealth;
  tags: string[];
  isExpanded: boolean;
  items: ConstellationItem[];
  averageConfidence: number;
  description: string;
}

/**
 * Constellation block data — extends MaterializableBlockData but with typed metadata
 * instead of Record<string, unknown>.
 */
export interface ConstellationBlockData extends Omit<MaterializableBlockData, 'metadata'> {
  metadata: ConstellationBlockMetadata;
}
