import React, { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Minimize2, Move, Settings } from 'lucide-react';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export interface PortalProps {
  id: string;
  type: string; // More flexible to allow any portal type
  title: string;
  children: React.ReactNode;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  zIndex?: number;
  onClose?: () => void;
  onMaximize?: () => void;
  onMinimize?: () => void;
  onFocus?: () => void;
  className?: string;
  viewport?: ViewportSize;
}

export interface PortalState {
  position: { x: number; y: number };
  size: { width: number; height: number };
  isMaximized: boolean;
  isMinimized: boolean;
  isDragging: boolean;
  isResizing: boolean;
  isActive: boolean;
  zIndex: number;
}

const portalTypeStyles: Record<
  string,
  {
    gradient: string;
    border: string;
    glow: string;
    accent: string;
  }
> = {
  agent: {
    gradient: 'from-blue-500/20 to-cyan-500/20',
    border: 'border-blue-500/30',
    glow: 'shadow-blue-500/20',
    accent: 'text-blue-400',
  },
  tool: {
    gradient: 'from-purple-500/20 to-pink-500/20',
    border: 'border-purple-500/30',
    glow: 'shadow-purple-500/20',
    accent: 'text-purple-400',
  },
  data: {
    gradient: 'from-emerald-500/20 to-teal-500/20',
    border: 'border-emerald-500/30',
    glow: 'shadow-emerald-500/20',
    accent: 'text-emerald-400',
  },
  analysis: {
    gradient: 'from-orange-500/20 to-red-500/20',
    border: 'border-orange-500/30',
    glow: 'shadow-orange-500/20',
    accent: 'text-orange-400',
  },
  communication: {
    gradient: 'from-indigo-500/20 to-violet-500/20',
    border: 'border-indigo-500/30',
    glow: 'shadow-indigo-500/20',
    accent: 'text-indigo-400',
  },
  security: {
    gradient: 'from-red-500/20 to-orange-500/20',
    border: 'border-red-500/30',
    glow: 'shadow-red-500/20',
    accent: 'text-red-400',
  },
};

export const Portal: React.FC<PortalProps> = ({
  id,
  type,
  title,
  children,
  initialPosition = { x: 100, y: 100 },
  initialSize = { width: 400, height: 300 },
  zIndex = 1,
  onClose,
  onMaximize,
  onMinimize,
  onFocus,
  className = '',
  viewport,
}) => {
  // Default viewport if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet:
      typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  };

  const currentViewport = viewport || defaultViewport;

  const [state, setState] = useState<PortalState>({
    position: initialPosition,
    size: initialSize,
    isMaximized: false,
    isMinimized: false,
    isDragging: false,
    isResizing: false,
    isActive: false,
    zIndex: zIndex,
  });

  const constraintsRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(initialPosition.x);
  const y = useMotionValue(initialPosition.y);
  const [isDragFromHeader, setIsDragFromHeader] = useState(false);

  // Transform values for glow effects
  const glowOpacity = useTransform(x, [0, 100], [0.3, 0.8]);
  const scaleOnHover = useTransform(x, [0, 100], [1, 1.02]);

  const styles = portalTypeStyles[type] || portalTypeStyles.agent; // Fallback to agent style

  // Update zIndex when prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, zIndex }));
  }, [zIndex]);

  // Update position and size based on viewport changes
  useEffect(() => {
    if (currentViewport.isMobile && !state.isMaximized) {
      // On mobile, ensure portal stays within bounds
      const maxX = Math.max(10, currentViewport.width - state.size.width - 10);
      const maxY = Math.max(10, currentViewport.height - state.size.height - 100);

      setState((prev) => ({
        ...prev,
        position: {
          x: Math.min(prev.position.x, maxX),
          y: Math.min(prev.position.y, maxY),
        },
      }));
    }
  }, [currentViewport, state.size, state.isMaximized]);

  const handleDragStart = (event: any, info: any) => {
    setState((prev) => ({ ...prev, isDragging: true, isActive: true }));
    setIsDragFromHeader(false);
    onFocus?.();
  };

  const handleDragEnd = (event: any, info: any) => {
    setState((prev) => ({
      ...prev,
      isDragging: false,
      position: {
        x: info.point.x - info.offset.x,
        y: info.point.y - info.offset.y,
      },
    }));
    setIsDragFromHeader(false);
  };

  const handleHeaderDragStart = (event: any, info: any) => {
    setState((prev) => ({ ...prev, isDragging: true, isActive: true }));
    setIsDragFromHeader(true);
    onFocus?.();
  };

  const handleHeaderDragEnd = (event: any, info: any) => {
    setState((prev) => ({
      ...prev,
      isDragging: false,
      position: {
        x: info.point.x - info.offset.x,
        y: info.point.y - info.offset.y,
      },
    }));
    setIsDragFromHeader(false);
  };

  const handleResizeStart = () => {
    setState((prev) => ({ ...prev, isResizing: true, isActive: true }));
    onFocus?.();
  };

  const handleResizeEnd = () => {
    setState((prev) => ({ ...prev, isResizing: false }));
  };

  const handleResize = (event: any, info: any) => {
    if (!info || !info.delta) return;

    const minWidth = currentViewport.isMobile ? 300 : 350;
    const minHeight = currentViewport.isMobile ? 200 : 250;
    const maxWidth = currentViewport.width - (state.position?.x || 0) - 20;
    const maxHeight = currentViewport.height - (state.position?.y || 0) - 20;

    const newWidth = Math.max(
      minWidth,
      Math.min(maxWidth, (state.size?.width || 400) + info.delta.x)
    );
    const newHeight = Math.max(
      minHeight,
      Math.min(maxHeight, (state.size?.height || 300) + info.delta.y)
    );

    setState((prev) => ({
      ...prev,
      size: {
        width: newWidth,
        height: newHeight,
      },
    }));
  };

  const handleMaximize = () => {
    const padding = currentViewport.isMobile ? 10 : 50;
    setState((prev) => ({
      ...prev,
      isMaximized: !prev.isMaximized,
      position: prev.isMaximized ? initialPosition : { x: padding, y: padding },
      size: prev.isMaximized
        ? initialSize
        : {
            width: currentViewport.width - padding * 2,
            height: currentViewport.height - (currentViewport.isMobile ? 120 : 150),
          },
    }));
    onMaximize?.();
  };

  const handleMinimize = () => {
    setState((prev) => ({ ...prev, isMinimized: !prev.isMinimized }));
    onMinimize?.();
  };

  const handlePortalFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    setState((prev) => ({ ...prev, isActive: true }));
    onFocus?.();
  };

  const handlePortalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setState((prev) => ({ ...prev, isActive: true }));
    onFocus?.();
  };

  const handleBlur = () => {
    setState((prev) => ({ ...prev, isActive: false }));
  };

  const handleDoubleClick = () => {
    handleMaximize();
  };

  // Disable drag on mobile to prevent conflicts with scrolling
  const isDragEnabled = !currentViewport.isMobile;

  return (
    <div ref={constraintsRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
      <motion.div
        initial={{
          x: initialPosition.x,
          y: initialPosition.y,
          scale: 0.8,
          opacity: 0,
        }}
        animate={{
          x: state.position.x,
          y: state.position.y,
          scale: state.isMinimized ? 0.1 : 1,
          opacity: state.isMinimized ? 0.5 : 1,
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
        }}
        style={{
          zIndex: state.zIndex,
          position: 'fixed',
          pointerEvents: 'auto',
        }}
        className={`
          ${state.isMaximized ? 'inset-0' : ''}
          ${className}
        `}
        onClick={handlePortalClick}
        onMouseDown={handlePortalFocus}
      >
        {/*  Pulse Effect */}
        <AnimatePresence>
          {state.isActive && (
            <motion.div
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{ scale: 1.1, opacity: 0 }}
              exit={{ scale: 1, opacity: 0 }}
              transition={{ duration: 1, repeat: Infinity }}
              className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${styles.gradient} ${styles.border} border blur-sm`}
            />
          )}
        </AnimatePresence>

        {/* Portal Container */}
        <motion.div
          className={`
            relative flex flex-col
            bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-xl
            rounded-2xl border ${styles.border}
            shadow-2xl ${styles.glow}
            overflow-hidden
            ${state.isDragging ? 'cursor-grabbing' : state.isResizing ? 'cursor-nw-resize' : 'cursor-auto'}
            ${state.isActive ? 'ring-2 ring-blue-500/50' : ''}
          `}
          style={{
            width: state.size.width,
            height: state.size.height,
            minWidth: currentViewport.isMobile ? 300 : 350,
            minHeight: currentViewport.isMobile ? 200 : 250,
            filter: state.isActive ? 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.5))' : 'none',
          }}
          onDoubleClick={handleDoubleClick}
          whileHover={{
            scale: state.isMinimized ? 0.1 : currentViewport.isMobile ? 1 : 1.01,
            transition: { duration: 0.2 },
          }}
        >
          {/* Portal Header */}
          <motion.div
            className={`
              portal-header
              flex items-center justify-between flex-shrink-0
              px-4 md:px-6 py-3 md:py-4
              bg-gradient-to-r ${styles.gradient}
              border-b ${styles.border}
              ${isDragEnabled && !state.isResizing ? 'cursor-grab active:cursor-grabbing' : 'cursor-auto'}
              select-none
            `}
            drag={isDragEnabled && !state.isResizing}
            dragMomentum={false}
            dragConstraints={constraintsRef}
            dragElastic={0}
            dragPropagation={true}
            onDragStart={handleHeaderDragStart}
            onDragEnd={handleHeaderDragEnd}
            onDrag={(event, info) => {
              if (!info || !info.point || !info.offset) return;
              setState((prev) => ({
                ...prev,
                position: {
                  x: info.point.x - info.offset.x,
                  y: info.point.y - info.offset.y,
                },
              }));
            }}
          >
            <div className="flex items-center gap-3">
              <motion.div
                className={`w-3 h-3 rounded-full bg-gradient-to-r ${styles.gradient} ${styles.border} border`}
                animate={{
                  scale: state.isActive ? [1, 1.2, 1] : 1,
                  opacity: state.isActive ? [0.7, 1, 0.7] : 0.7,
                }}
                transition={{ duration: 2, repeat: state.isActive ? Infinity : 0 }}
              />
              <h3
                className={`font-semibold ${styles.accent} ${currentViewport.isMobile ? 'text-sm' : 'text-base'}`}
              >
                {title}
                {process.env.NODE_ENV === 'development' && (
                  <span className="ml-2 text-xs text-slate-500 bg-slate-800 px-1 rounded">
                    z:{state.zIndex}
                  </span>
                )}
              </h3>
              {(state.isDragging || state.isResizing) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 text-xs text-slate-400"
                >
                  <Move className="w-3 h-3" />
                  <span className="hidden sm:inline">
                    {state.isDragging ? 'Dragging' : 'Resizing'}
                  </span>
                </motion.div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Minimize Button */}
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMinimize();
                }}
                className={`
                  w-6 h-6 md:w-8 md:h-8 rounded-lg
                  bg-slate-700/50 hover:bg-slate-600/50
                  border border-slate-600/50 hover:border-slate-500/50
                  flex items-center justify-center
                  transition-all duration-200
                  ${styles.accent}
                  z-10 relative
                `}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Minimize"
              >
                <Minimize2 className="w-3 h-3 md:w-4 md:h-4" />
              </motion.button>

              {/* Maximize Button */}
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMaximize();
                }}
                className={`
                  w-6 h-6 md:w-8 md:h-8 rounded-lg
                  bg-slate-700/50 hover:bg-slate-600/50
                  border border-slate-600/50 hover:border-slate-500/50
                  flex items-center justify-center
                  transition-all duration-200
                  ${styles.accent}
                  z-10 relative
                `}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title={state.isMaximized ? 'Restore' : 'Maximize'}
              >
                <Maximize2 className="w-3 h-3 md:w-4 md:h-4" />
              </motion.button>

              {/* Close Button */}
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.();
                }}
                className="
                  w-6 h-6 md:w-8 md:h-8 rounded-lg
                  bg-red-500/20 hover:bg-red-500/30
                  border border-red-500/30 hover:border-red-500/50
                  flex items-center justify-center
                  transition-all duration-200
                  text-red-400 hover:text-red-300
                  z-10 relative
                "
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Close"
              >
                <X className="w-3 h-3 md:w-4 md:h-4" />
              </motion.button>
            </div>
          </motion.div>

          {/* Portal Content */}
          <div
            className={`
            relative flex-1 overflow-hidden
            ${currentViewport.isMobile ? 'pb-4' : 'pb-6'}
          `}
          >
            <div
              className="h-full overflow-auto p-4 md:p-6"
              onClick={(e) => {
                e.stopPropagation();
                handlePortalFocus(e as any);
              }}
            >
              {children}
            </div>
          </div>

          {/* Enhanced Resize Handle (Desktop only) */}
          {!currentViewport.isMobile && !state.isMaximized && (
            <motion.div
              drag
              dragMomentum={false}
              dragConstraints={false}
              dragElastic={0}
              onDragStart={handleResizeStart}
              onDragEnd={handleResizeEnd}
              onDrag={handleResize}
              className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize z-20 group"
              whileHover={{ scale: 1.15 }}
              style={{ touchAction: 'none' }}
            >
              <div
                className={`w-full h-full bg-gradient-to-br ${styles.gradient} rounded-tl-xl opacity-60 group-hover:opacity-90 transition-all duration-200 flex items-center justify-center border-t border-l ${styles.border} shadow-xl backdrop-blur-sm`}
              >
                <div className="flex flex-col items-center justify-center space-y-0.5">
                  <div className="flex space-x-0.5">
                    <div className="w-0.5 h-0.5 bg-white/80 rounded-full" />
                    <div className="w-0.5 h-0.5 bg-white/80 rounded-full" />
                  </div>
                  <div className="flex space-x-0.5">
                    <div className="w-0.5 h-0.5 bg-white/80 rounded-full" />
                    <div className="w-0.5 h-0.5 bg-white/80 rounded-full" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Additional Resize Handles for better UX */}
          {!currentViewport.isMobile && !state.isMaximized && (
            <>
              {/* Right edge resize handle */}
              <motion.div
                drag="x"
                dragMomentum={false}
                dragConstraints={false}
                dragElastic={0}
                onDragStart={handleResizeStart}
                onDragEnd={handleResizeEnd}
                onDrag={(event: any, info: any) => {
                  if (!info || !info.delta) return;
                  const minWidth = 350;
                  const maxWidth = currentViewport.width - (state.position?.x || 0) - 20;
                  const newWidth = Math.max(
                    minWidth,
                    Math.min(maxWidth, (state.size?.width || 400) + info.delta.x)
                  );
                  setState((prev) => ({
                    ...prev,
                    size: { ...prev.size, width: newWidth },
                  }));
                }}
                className="absolute top-4 right-0 bottom-4 w-4 cursor-ew-resize z-10 group"
                style={{ touchAction: 'none' }}
              >
                <div className="w-full h-full bg-white/20 group-hover:bg-blue-500/60 transition-all duration-200 border-r-2 border-white/40 shadow-md backdrop-blur-sm rounded-l-sm" />
              </motion.div>

              {/* Bottom edge resize handle */}
              <motion.div
                drag="y"
                dragMomentum={false}
                dragConstraints={false}
                dragElastic={0}
                onDragStart={handleResizeStart}
                onDragEnd={handleResizeEnd}
                onDrag={(event: any, info: any) => {
                  if (!info || !info.delta) return;
                  const minHeight = 250;
                  const maxHeight = currentViewport.height - (state.position?.y || 0) - 20;
                  const newHeight = Math.max(
                    minHeight,
                    Math.min(maxHeight, (state.size?.height || 300) + info.delta.y)
                  );
                  setState((prev) => ({
                    ...prev,
                    size: { ...prev.size, height: newHeight },
                  }));
                }}
                className="absolute bottom-0 left-4 right-4 h-4 cursor-ns-resize z-10 group"
                style={{ touchAction: 'none' }}
              >
                <div className="w-full h-full bg-white/20 group-hover:bg-blue-500/60 transition-all duration-200 border-b-2 border-white/40 shadow-md backdrop-blur-sm rounded-t-sm" />
              </motion.div>

              {/* Additional corner resize handles */}
              {/* Top-right corner */}
              <motion.div
                drag
                dragMomentum={false}
                dragConstraints={false}
                dragElastic={0}
                onDragStart={handleResizeStart}
                onDragEnd={handleResizeEnd}
                onDrag={(event: any, info: any) => {
                  if (!info || !info.delta) return;
                  const minWidth = 350;
                  const minHeight = 250;
                  const maxWidth = currentViewport.width - (state.position?.x || 0) - 20;
                  const newWidth = Math.max(
                    minWidth,
                    Math.min(maxWidth, (state.size?.width || 400) + info.delta.x)
                  );
                  const newHeight = Math.max(minHeight, (state.size?.height || 300) - info.delta.y);

                  setState((prev) => ({
                    ...prev,
                    size: { width: newWidth, height: newHeight },
                    position: { ...prev.position, y: (prev.position?.y || 0) + info.delta.y },
                  }));
                }}
                className="absolute top-0 right-0 w-5 h-5 cursor-ne-resize z-15 group"
                style={{ touchAction: 'none' }}
              >
                <div className="w-full h-full bg-white/25 group-hover:bg-blue-500/50 transition-all duration-200 rounded-bl-lg border-2 border-white/40 shadow-md backdrop-blur-sm" />
              </motion.div>

              {/* Bottom-left corner */}
              <motion.div
                drag
                dragMomentum={false}
                dragConstraints={false}
                dragElastic={0}
                onDragStart={handleResizeStart}
                onDragEnd={handleResizeEnd}
                onDrag={(event: any, info: any) => {
                  if (!info || !info.delta) return;
                  const minWidth = 350;
                  const minHeight = 250;
                  const maxHeight = currentViewport.height - (state.position?.y || 0) - 20;
                  const newWidth = Math.max(minWidth, (state.size?.width || 400) - info.delta.x);
                  const newHeight = Math.max(
                    minHeight,
                    Math.min(maxHeight, (state.size?.height || 300) + info.delta.y)
                  );

                  setState((prev) => ({
                    ...prev,
                    size: { width: newWidth, height: newHeight },
                    position: { ...prev.position, x: (prev.position?.x || 0) + info.delta.x },
                  }));
                }}
                className="absolute bottom-0 left-0 w-5 h-5 cursor-sw-resize z-15 group"
                style={{ touchAction: 'none' }}
              >
                <div className="w-full h-full bg-white/25 group-hover:bg-blue-500/50 transition-all duration-200 rounded-tr-lg border-2 border-white/40 shadow-md backdrop-blur-sm" />
              </motion.div>

              {/* Top-left corner */}
              <motion.div
                drag
                dragMomentum={false}
                dragConstraints={false}
                dragElastic={0}
                onDragStart={handleResizeStart}
                onDragEnd={handleResizeEnd}
                onDrag={(event: any, info: any) => {
                  if (!info || !info.delta) return;
                  const minWidth = 350;
                  const minHeight = 250;
                  const newWidth = Math.max(minWidth, (state.size?.width || 400) - info.delta.x);
                  const newHeight = Math.max(minHeight, (state.size?.height || 300) - info.delta.y);

                  setState((prev) => ({
                    ...prev,
                    size: { width: newWidth, height: newHeight },
                    position: {
                      x: (prev.position?.x || 0) + info.delta.x,
                      y: (prev.position?.y || 0) + info.delta.y,
                    },
                  }));
                }}
                className="absolute top-0 left-0 w-5 h-5 cursor-nw-resize z-15 group"
                style={{ touchAction: 'none' }}
              >
                <div className="w-full h-full bg-white/25 group-hover:bg-blue-500/50 transition-all duration-200 rounded-br-lg border-2 border-white/40 shadow-md backdrop-blur-sm" />
              </motion.div>

              {/* Left edge resize handle */}
              <motion.div
                drag="x"
                dragMomentum={false}
                dragConstraints={false}
                dragElastic={0}
                onDragStart={handleResizeStart}
                onDragEnd={handleResizeEnd}
                onDrag={(event: any, info: any) => {
                  if (!info || !info.delta) return;
                  const minWidth = 350;
                  const newWidth = Math.max(minWidth, (state.size?.width || 400) - info.delta.x);
                  setState((prev) => ({
                    ...prev,
                    size: { ...prev.size, width: newWidth },
                    position: { ...prev.position, x: (prev.position?.x || 0) + info.delta.x },
                  }));
                }}
                className="absolute top-4 left-0 bottom-4 w-3 cursor-ew-resize z-10 group"
                style={{ touchAction: 'none' }}
              >
                <div className="w-full h-full bg-white/15 group-hover:bg-blue-500/40 transition-all duration-200 border-l-2 border-white/30 shadow-sm backdrop-blur-sm rounded-r-sm" />
              </motion.div>

              {/* Top edge resize handle */}
              <motion.div
                drag="y"
                dragMomentum={false}
                dragConstraints={false}
                dragElastic={0}
                onDragStart={handleResizeStart}
                onDragEnd={handleResizeEnd}
                onDrag={(event: any, info: any) => {
                  if (!info || !info.delta) return;
                  const minHeight = 250;
                  const newHeight = Math.max(minHeight, (state.size?.height || 300) - info.delta.y);
                  setState((prev) => ({
                    ...prev,
                    size: { ...prev.size, height: newHeight },
                    position: { ...prev.position, y: (prev.position?.y || 0) + info.delta.y },
                  }));
                }}
                className="absolute top-0 left-4 right-4 h-3 cursor-ns-resize z-10 group"
                style={{ touchAction: 'none' }}
              >
                <div className="w-full h-full bg-white/15 group-hover:bg-blue-500/40 transition-all duration-200 border-t-2 border-white/30 shadow-sm backdrop-blur-sm rounded-b-sm" />
              </motion.div>
            </>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
};
