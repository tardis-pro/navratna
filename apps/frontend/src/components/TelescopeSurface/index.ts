// Original TelescopeSurface (generic block surface)
export { TelescopeSurface, TelescopeBlock, useTelescopeSurface } from './TelescopeSurface';

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

export { useConstellations } from './use_constellations';
export type { ConstellationBlockData } from './use_constellations';

export { useForceLayout } from './use_force_layout';
export type { ForceNode } from './use_force_layout';

// Shared types
export type { ConstellationBlockMetadata } from './telescope_surface_types';
