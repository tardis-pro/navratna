import type { ReactNode } from 'react';
import type { Microexpression } from '@uaip/types';

/**
 * Block types that can be materialized on TelescopeSurface
 */
export type MaterializableBlockType = 'agent' | 'portal' | 'artifact' | 'discussion' | 'task';

/**
 * Visibility states for materializable blocks
 */
export type BlockVisibility = 'visible' | 'faded' | 'hidden';

/**
 * Position in 3D space (z for layering)
 */
export interface BlockPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Block dimensions
 */
export interface BlockDimensions {
  width: number;
  height: number;
}

/**
 * Core data structure for a materializable block
 */
export interface MaterializableBlockData {
  /** Unique identifier */
  id: string;
  /** Type of block content */
  type: MaterializableBlockType;
  /** Current expression state driving visual appearance */
  expression: Microexpression;
  /** Relevance score (0-1) for auto-fading less relevant blocks */
  relevanceScore: number;
  /** Current visibility state */
  visibility: BlockVisibility;
  /** Position on the surface */
  position: BlockPosition;
  /** Block dimensions */
  dimensions: BlockDimensions;
  /** Optional metadata for custom use */
  metadata?: Record<string, unknown>;
}

/**
 * Props for the MaterializableBlock component
 */
export interface MaterializableBlockProps {
  /** Block configuration data */
  block: MaterializableBlockData;
  /** Callback when position changes */
  onPositionChange?: (id: string, position: { x: number; y: number }) => void;
  /** Callback when visibility changes */
  onVisibilityChange?: (id: string, visibility: BlockVisibility) => void;
  /** Callback when expression changes */
  onExpressionChange?: (id: string, expression: Microexpression) => void;
  /** Whether the block can be dragged */
  isDraggable?: boolean;
  /** Whether the block can be resized */
  isResizable?: boolean;
  /** Child content to render inside the block */
  children: ReactNode;
  /** Additional CSS class names */
  className?: string;
  /** Custom styles to apply */
  style?: React.CSSProperties;
}

/**
 * Props for blocks arranged via auto-layout
 */
export interface AutoArrangeConfig {
  /** Number of columns in the grid */
  gridCols: number;
  /** Default block width */
  blockWidth: number;
  /** Default block height */
  blockHeight: number;
  /** Gap between blocks in pixels */
  gap: number;
  /** Padding from container edges */
  padding: number;
}

/**
 * Default auto-arrange configuration
 */
export const DEFAULT_AUTO_ARRANGE_CONFIG: AutoArrangeConfig = {
  gridCols: 3,
  blockWidth: 400,
  blockHeight: 300,
  gap: 20,
  padding: 40,
};

/**
 * Context value for MaterializableBlockProvider
 */
export interface MaterializableBlockContextValue {
  /** All active blocks */
  blocks: MaterializableBlockData[];
  /** Currently focused block ID */
  focusedBlockId: string | null;
  /** Maximum z-index currently in use */
  maxZIndex: number;
  /** Bring a block to front */
  bringToFront: (id: string) => void;
  /** Update block position */
  updatePosition: (id: string, position: { x: number; y: number }) => void;
  /** Update block visibility */
  updateVisibility: (id: string, visibility: BlockVisibility) => void;
  /** Update block expression */
  updateExpression: (id: string, expression: Microexpression) => void;
  /** Auto-arrange all blocks */
  autoArrange: (config?: Partial<AutoArrangeConfig>) => void;
}

/**
 * HOC configuration for wrapping components
 */
export interface WithMaterializableBlockConfig {
  /** Default block type */
  type?: MaterializableBlockType;
  /** Default expression */
  expression?: Microexpression;
  /** Default visibility */
  visibility?: BlockVisibility;
  /** Initial position */
  position?: Partial<BlockPosition>;
  /** Initial dimensions */
  dimensions?: Partial<BlockDimensions>;
  /** Initial relevance score */
  relevanceScore?: number;
  /** Whether draggable by default */
  isDraggable?: boolean;
  /** Whether resizable by default */
  isResizable?: boolean;
  /** Metadata */
  metadata?: Record<string, unknown>;
}
