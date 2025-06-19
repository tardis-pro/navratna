import React, { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Minimize2, Move, Settings } from 'lucide-react';

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
}

export interface PortalState {
  position: { x: number; y: number };
  size: { width: number; height: number };
  isMaximized: boolean;
  isMinimized: boolean;
  isDragging: boolean;
  isActive: boolean;
  zIndex: number;
}

const portalTypeStyles: Record<string, {
  gradient: string;
  border: string;
  glow: string;
  accent: string;
}> = {
  agent: {
    gradient: 'from-blue-500/20 to-cyan-500/20',
    border: 'border-blue-500/30',
    glow: 'shadow-blue-500/20',
    accent: 'text-blue-400'
  },
  tool: {
    gradient: 'from-purple-500/20 to-pink-500/20',
    border: 'border-purple-500/30',
    glow: 'shadow-purple-500/20',
    accent: 'text-purple-400'
  },
  data: {
    gradient: 'from-emerald-500/20 to-teal-500/20',
    border: 'border-emerald-500/30',
    glow: 'shadow-emerald-500/20',
    accent: 'text-emerald-400'
  },
  analysis: {
    gradient: 'from-orange-500/20 to-red-500/20',
    border: 'border-orange-500/30',
    glow: 'shadow-orange-500/20',
    accent: 'text-orange-400'
  },
  communication: {
    gradient: 'from-indigo-500/20 to-violet-500/20',
    border: 'border-indigo-500/30',
    glow: 'shadow-indigo-500/20',
    accent: 'text-indigo-400'
  }
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
  className = ''
}) => {
  const [state, setState] = useState<PortalState>({
    position: initialPosition,
    size: initialSize,
    isMaximized: false,
    isMinimized: false,
    isDragging: false,
    isActive: false,
    zIndex: zIndex
  });

  const constraintsRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(initialPosition.x);
  const y = useMotionValue(initialPosition.y);
  
  // Transform values for glow effects
  const glowOpacity = useTransform(x, [0, 100], [0.3, 0.8]);
  const scaleOnHover = useTransform(x, [0, 100], [1, 1.02]);

  const styles = portalTypeStyles[type] || portalTypeStyles.agent; // Fallback to agent style

  // Update zIndex when prop changes
  useEffect(() => {
    setState(prev => ({ ...prev, zIndex }));
  }, [zIndex]);

  const handleDragStart = () => {
    setState(prev => ({ ...prev, isDragging: true, isActive: true }));
    onFocus?.();
  };

  const handleDragEnd = () => {
    setState(prev => ({ ...prev, isDragging: false }));
  };

  const handleMaximize = () => {
    setState(prev => ({
      ...prev,
      isMaximized: !prev.isMaximized,
      position: prev.isMaximized ? initialPosition : { x: 0, y: 0 },
      size: prev.isMaximized ? initialSize : { width: window.innerWidth - 100, height: window.innerHeight - 100 }
    }));
    onMaximize?.();
  };

  const handleMinimize = () => {
    setState(prev => ({ ...prev, isMinimized: !prev.isMinimized }));
    onMinimize?.();
  };

  const handlePortalFocus = () => {
    setState(prev => ({ ...prev, isActive: true }));
    onFocus?.();
  };

  const handleBlur = () => {
    setState(prev => ({ ...prev, isActive: false }));
  };

  const handleDoubleClick = () => {
    handleMaximize();
  };

  return (
    <div ref={constraintsRef} className="fixed inset-0 pointer-events-none">
      <motion.div
        drag
        dragMomentum={false}
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onFocus={handlePortalFocus}
        onBlur={handleBlur}
        initial={{ 
          x: initialPosition.x, 
          y: initialPosition.y,
          scale: 0.8,
          opacity: 0
        }}
        animate={{ 
          x: state.position.x,
          y: state.position.y,
          width: state.size.width,
          height: state.size.height,
          scale: state.isMinimized ? 0.1 : 1,
          opacity: state.isMinimized ? 0.5 : 1
        }}
        whileHover={{ 
          scale: state.isMinimized ? 0.1 : 1.02,
          transition: { duration: 0.2 }
        }}
        whileTap={{ scale: 0.98 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30
        }}
        style={{ 
          zIndex: state.zIndex,
          filter: state.isActive ? 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.5))' : 'none'
        }}
        className={`
          pointer-events-auto
          ${state.isMaximized ? 'fixed inset-0' : 'absolute'}
          ${className}
        `}
        onClick={handlePortalFocus}
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

        {/* Main Portal Frame */}
        <motion.div
          className={`
            relative w-full h-full
            bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95
            backdrop-blur-xl
            border ${styles.border}
            rounded-2xl
            shadow-2xl ${styles.glow}
            overflow-hidden
            transition-all duration-300
          `}
          style={{
            boxShadow: state.isActive 
              ? `0 25px 50px -12px ${styles.glow.replace('shadow-', 'rgba(').replace('/20', ', 0.4)')}`
              : '0 10px 25px -5px rgba(0, 0, 0, 0.25)'
          }}
        >
          {/* Portal Header */}
          <motion.div
            className={`
              relative px-6 py-4 border-b ${styles.border}
              bg-gradient-to-r ${styles.gradient}
              cursor-move select-none
              flex items-center justify-between
            `}
            onDoubleClick={handleDoubleClick}
          >
            {/* Portal Title and Status */}
            <div className="flex items-center space-x-3">
              <motion.div
                className={`w-3 h-3 rounded-full ${styles.accent.replace('text-', 'bg-')} opacity-80`}
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.8, 1, 0.8]
                }}
                transition={{ 
                  duration: 2, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
              <h3 className={`font-semibold text-lg ${styles.accent}`}>
                {title}
              </h3>
              <span className="px-2 py-1 text-xs bg-slate-800/50 text-slate-400 rounded-full">
                {type}
              </span>
            </div>

            {/* Portal Controls */}
            <div className="flex items-center space-x-2">
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMinimize();
                }}
                className="w-8 h-8 rounded-lg bg-slate-700/50 hover:bg-yellow-500/20 text-slate-400 hover:text-yellow-400 transition-all duration-200 flex items-center justify-center"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Minimize2 className="w-4 h-4" />
              </motion.button>
              
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMaximize();
                }}
                className="w-8 h-8 rounded-lg bg-slate-700/50 hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-all duration-200 flex items-center justify-center"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Maximize2 className="w-4 h-4" />
              </motion.button>
              
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.();
                }}
                className="w-8 h-8 rounded-lg bg-slate-700/50 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all duration-200 flex items-center justify-center"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>

          {/* Portal Content */}
          <div className="flex-1 overflow-hidden">
            <motion.div
              className="w-full h-full overflow-auto custom-scrollbar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {children}
            </motion.div>
          </div>

          {/* Resize Handle */}
          {!state.isMaximized && (
            <motion.div
              className={`
                absolute bottom-0 right-0 w-4 h-4
                cursor-se-resize
                ${styles.accent.replace('text-', 'bg-')}
                opacity-50 hover:opacity-100
                transition-opacity duration-200
              `}
              style={{
                clipPath: 'polygon(100% 0%, 0% 100%, 100% 100%)'
              }}
              whileHover={{ scale: 1.2 }}
            />
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}; 