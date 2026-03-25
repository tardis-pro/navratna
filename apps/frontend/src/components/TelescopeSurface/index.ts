// Original TelescopeSurface (generic block surface)
export {
  TelescopeSurface,
  TelescopeBlock,
  useTelescopeSurface,
} from './TelescopeSurface';

export type {
  TelescopeSurfaceProps,
  TelescopeBlockProps,
  UseTelescopeSurfaceReturn,
} from './TelescopeSurface';

// Telescope Knowledge Surface (constellation-based)
export { TelescopeKnowledgeSurface } from './TelescopeKnowledgeSurface';
export type { TelescopeKnowledgeSurfaceProps } from './TelescopeKnowledgeSurface';

export { ConstellationNode } from './ConstellationNode';
export type { ConstellationNodeProps } from './ConstellationNode';

export { useConstellations } from './useConstellations';
export type { ConstellationBlockData } from './useConstellations';

export { useForceLayout } from './useForceLayout';
export type { ForceNode } from './useForceLayout';

// Shared types
export type { ConstellationBlockMetadata } from './TelescopeSurface.types';
