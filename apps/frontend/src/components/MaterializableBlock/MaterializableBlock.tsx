'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  motion,
  AnimatePresence,
  type Variants,
  useMotionValue,
  useTransform,
  useSpring,
} from 'framer-motion';
import { Eye, Activity, AlertTriangle, HelpCircle, CheckCircle, Zap, Minus } from 'lucide-react';
import type { Microexpression } from '@uaip/types';
import type {
  MaterializableBlockData,
  MaterializableBlockProps,
  AutoArrangeConfig,
  BlockVisibility,
  WithMaterializableBlockConfig,
  MaterializableBlockContextValue,
} from './materializable_block_types';
import {
  getBlockBaseStyle,
  getExpressionColor,
  CONTAINER_STYLES,
  CONTENT_STYLES,
  EXPRESSION_INDICATOR_STYLES,
  SCORE_BADGE_STYLES,
  KEYFRAME_ANIMATIONS,
  cn,
} from './materializable_block_styles';

const MICROEXPRESSION_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.9, y: 10, filter: 'brightness(1)' },
  exit: { opacity: 0, scale: 0.9, y: 0, filter: 'brightness(1)' },
  calm: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: 'brightness(1)',
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  },
  attentive: {
    opacity: 1,
    scale: 1.005,
    y: 0,
    filter: 'brightness(1.03)',
    transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
  },
  working: {
    opacity: [1, 0.72, 1],
    scale: 1,
    y: 0,
    filter: 'brightness(1)',
    transition: {
      opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
      scale: { duration: 0.3 },
      y: { duration: 0.3 },
    },
  },
  alarmed: {
    opacity: 1,
    scale: [1, 1.018, 1],
    y: 0,
    filter: 'brightness(1.08)',
    transition: {
      scale: { duration: 0.5, repeat: Infinity, ease: 'easeInOut' },
      opacity: { duration: 0.3 },
      y: { duration: 0.3 },
    },
  },
  confused: {
    opacity: [1, 0.55, 1],
    scale: 0.997,
    y: 0,
    filter: 'brightness(0.95)',
    transition: {
      opacity: { duration: 1, repeat: Infinity, ease: 'easeInOut' },
      scale: { duration: 0.3 },
      y: { duration: 0.3 },
    },
  },
  satisfied: {
    opacity: 1,
    scale: 1.005,
    y: 0,
    filter: 'brightness(1.06)',
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  },
  strained: {
    opacity: 1,
    scale: 0.997,
    y: 0,
    filter: 'brightness(0.85)',
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  },
};

const EXPRESSION_ICONS: Record<Microexpression, React.ReactNode> = {
  calm: <Minus className="w-3 h-3" />,
  attentive: <Eye className="w-3 h-3" />,
  working: <Activity className="w-3 h-3" />,
  alarmed: <AlertTriangle className="w-3 h-3" />,
  confused: <HelpCircle className="w-3 h-3" />,
  satisfied: <CheckCircle className="w-3 h-3" />,
  strained: <Zap className="w-3 h-3" />,
};

export function MaterializableBlock({
  block,
  onPositionChange,
  onVisibilityChange: _onVisibilityChange,
  onExpressionChange: _onExpressionChange,
  isDraggable = false,
  layout = 'flow',
  children,
  className,
  style,
}: MaterializableBlockProps) {
  const [localZIndex, setLocalZIndex] = useState(block.position.z);
  const blockRef = useRef<HTMLDivElement>(null);

  const relevanceMotion = useMotionValue(block.relevanceScore);
  const springRelevance = useSpring(relevanceMotion, { stiffness: 100, damping: 18 });
  const relevanceOpacity = useTransform(springRelevance, [0, 0.5, 1], [0.9, 0.95, 1]);

  useEffect(() => {
    setLocalZIndex(block.position.z);
  }, [block.position.z]);

  useEffect(() => {
    relevanceMotion.set(block.relevanceScore);
  }, [block.relevanceScore, relevanceMotion]);

  const handleFocus = useCallback(() => {
    setLocalZIndex(999);
    onPositionChange?.(block.id, { x: block.position.x, y: block.position.y });
  }, [block.id, block.position.x, block.position.y, onPositionChange]);

  const handleMouseLeave = useCallback(() => {}, []);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number; y: number } }) => {
      onPositionChange?.(block.id, {
        x: block.position.x + info.offset.x,
        y: block.position.y + info.offset.y,
      });
    },
    [block.id, block.position.x, block.position.y, onPositionChange]
  );

  const effectiveVisibility = useMemo((): BlockVisibility => {
    return block.visibility;
  }, [block.visibility]);

  const baseStyle = useMemo(
    () => getBlockBaseStyle(block.type, block.expression, effectiveVisibility),
    [block.type, block.expression, effectiveVisibility]
  );

  const expressionColor = useMemo(() => getExpressionColor(block.expression), [block.expression]);

  const containerStyle: React.CSSProperties = useMemo(
    () =>
      layout === 'flow'
        ? {
            ...CONTAINER_STYLES,
            position: 'relative',
            width: '100%',
            minHeight: block.dimensions.height,
            zIndex: localZIndex,
            ...baseStyle,
            ...style,
          }
        : {
            ...CONTAINER_STYLES,
            width: block.dimensions.width,
            height: block.dimensions.height,
            left: block.position.x,
            top: block.position.y,
            zIndex: localZIndex,
            ...baseStyle,
            ...style,
          },
    [layout, block.dimensions.width, block.dimensions.height, block.position.x, block.position.y, localZIndex, baseStyle, style]
  );

  if (block.visibility === 'hidden') {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={block.id}
        ref={blockRef}
        layoutId={block.id}
        variants={MICROEXPRESSION_VARIANTS}
        initial="initial"
        animate={block.expression}
        exit="exit"
        drag={isDraggable}
        onDragEnd={handleDragEnd}
        whileHover={{ boxShadow: '0 4px 12px oklch(0% 0 0 / 0.12)' }}
        whileTap={{ scale: 0.98 }}
        style={{ ...containerStyle, opacity: relevanceOpacity }}
        className={cn('materializable-block', className)}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        tabIndex={0}
        role="region"
        aria-label={`${block.type} block: ${block.id}`}
      >
        <div
          style={{
            ...EXPRESSION_INDICATOR_STYLES,
            backgroundColor: expressionColor,
            boxShadow: `0 0 6px ${expressionColor}`,
          }}
          title={`${block.expression} state`}
        >
          <span style={{ opacity: 0 }}>
            {EXPRESSION_ICONS[block.expression]}
          </span>
        </div>

        <div style={CONTENT_STYLES} className="materializable-block__content">
          {children}
        </div>

        {block.relevanceScore !== undefined && (
          <div
            style={{
              ...SCORE_BADGE_STYLES,
              backgroundColor: 'var(--color-muted)',
              color: 'var(--color-muted-foreground)',
            }}
            className="materializable-block__score"
          >
            {Math.round(block.relevanceScore * 100)}%
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export function autoArrangeBlocks(
  blocks: MaterializableBlockData[],
  config: Partial<AutoArrangeConfig> = {}
): MaterializableBlockData[] {
  const { gridCols, blockWidth, blockHeight, gap, padding } = {
    gridCols: 3,
    blockWidth: 400,
    blockHeight: 300,
    gap: 20,
    padding: 40,
    ...config,
  };

  return blocks.map((block, index) => {
    const col = index % gridCols;
    const row = Math.floor(index / gridCols);

    return {
      ...block,
      position: {
        x: padding + col * (blockWidth + gap),
        y: padding + row * (blockHeight + gap),
        z: index + 1,
      },
      dimensions: {
        width: blockWidth,
        height: blockHeight,
      },
    };
  });
}

export function createBlock(
  id: string,
  type: MaterializableBlockData['type'],
  options: Partial<Omit<MaterializableBlockData, 'id' | 'type'>> = {}
): MaterializableBlockData {
  return {
    expression: 'calm',
    relevanceScore: 1,
    visibility: 'visible',
    position: { x: 0, y: 0, z: 1 },
    dimensions: { width: 400, height: 300 },
    ...options,
    id,
    type,
  };
}

export function withMaterializableBlock<P extends object>(
  Component: React.ComponentType<P>,
  blockConfig: WithMaterializableBlockConfig = {}
) {
  const WrappedComponent = (props: P & { block?: Partial<MaterializableBlockData> }) => {
    const { block: propBlock, ...componentProps } = props;

    const defaultBlock = useMemo(
      (): MaterializableBlockData => ({
        id: `block-${Date.now()}`,
        type: blockConfig.type ?? 'portal',
        expression: blockConfig.expression ?? 'calm',
        relevanceScore: blockConfig.relevanceScore ?? 1,
        visibility: blockConfig.visibility ?? 'visible',
        position: {
          x: blockConfig.position?.x ?? 0,
          y: blockConfig.position?.y ?? 0,
          z: blockConfig.position?.z ?? 1,
        },
        dimensions: {
          width: blockConfig.dimensions?.width ?? 400,
          height: blockConfig.dimensions?.height ?? 300,
        },
        metadata: blockConfig.metadata,
      }),
      []
    );

    const block = useMemo(
      (): MaterializableBlockData => ({
        ...defaultBlock,
        ...propBlock,
      }),
      [defaultBlock, propBlock]
    );

    return (
      <MaterializableBlock
        block={block}
        isDraggable={blockConfig.isDraggable}
        isResizable={blockConfig.isResizable}
      >
        <Component {...componentProps} />
      </MaterializableBlock>
    );
  };

  WrappedComponent.displayName = `withMaterializableBlock(${Component.displayName ?? Component.name ?? 'Component'})`;

  return WrappedComponent;
}

export function useMaterializableBlocks(
  initialBlocks: MaterializableBlockData[] = []
): MaterializableBlockContextValue {
  const [blocks, setBlocks] = useState<MaterializableBlockData[]>(initialBlocks);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [maxZIndex, setMaxZIndex] = useState<number>(
    Math.max(0, ...initialBlocks.map((b) => b.position.z))
  );

  const bringToFront = useCallback((id: string) => {
    setMaxZIndex((prev) => {
      const newZ = prev + 1;
      setBlocks((prevBlocks) =>
        prevBlocks.map((b) => (b.id === id ? { ...b, position: { ...b.position, z: newZ } } : b))
      );
      setFocusedBlockId(id);
      return newZ;
    });
  }, []);

  const updatePosition = useCallback((id: string, position: { x: number; y: number }) => {
    setBlocks((prevBlocks) =>
      prevBlocks.map((b) => (b.id === id ? { ...b, position: { ...b.position, ...position } } : b))
    );
  }, []);

  const updateVisibility = useCallback((id: string, visibility: BlockVisibility) => {
    setBlocks((prevBlocks) => prevBlocks.map((b) => (b.id === id ? { ...b, visibility } : b)));
  }, []);

  const updateExpression = useCallback((id: string, expression: Microexpression) => {
    setBlocks((prevBlocks) => prevBlocks.map((b) => (b.id === id ? { ...b, expression } : b)));
  }, []);

  const autoArrange = useCallback((config: Partial<AutoArrangeConfig> = {}) => {
    setBlocks((prevBlocks) => autoArrangeBlocks(prevBlocks, config));
  }, []);

  return {
    blocks,
    focusedBlockId,
    maxZIndex,
    bringToFront,
    updatePosition,
    updateVisibility,
    updateExpression,
    autoArrange,
  };
}

export function MaterializableBlockStyles() {
  return <style dangerouslySetInnerHTML={{ __html: KEYFRAME_ANIMATIONS }} />;
}

export { EXPRESSION_ICONS };
