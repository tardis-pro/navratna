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
  onClose?: () => void;
  onMaximize?: () => void;
  onMinimize?: () => void;
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
  onClose,
  onMaximize,
  onMinimize,
  className = ''
}) => {
  const [state, setState] = useState<PortalState>({
    position: initialPosition,
    size: initialSize,
    isMaximized: false,
    isMinimized: false,
    isDragging: false,
    isActive: false,
    zIndex: 1
  });

  const constraintsRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(initialPosition.x);
  const y = useMotionValue(initialPosition.y);
  
  // Transform values for glow effects
  const glowOpacity = useTransform(x, [0, 100], [0.3, 0.8]);
  const scaleOnHover = useTransform(x, [0, 100], [1, 1.02]);

  const styles = portalTypeStyles[type] || portalTypeStyles.agent; // Fallback to agent style

  const handleDragStart = () => {
    setState(prev => ({ ...prev, isDragging: true, isActive: true, zIndex: 1000 }));
  };

  const handleDragEnd = () => {
    setState(prev => ({ ...prev, isDragging: false }));
  };

  const handleMaximize = () => {
    setState(prev => ({
      ...prev,
      isMaximized: !prev.isMaximized,
      position: prev.isMaximized ? initialPosition : { x: 0, y: 0 },
      size: prev.isMaximized ? initialSize : { width: window.innerWidth, height: window.innerHeight }
    }));
    onMaximize?.();
  };

  const handleMinimize = () => {
    setState(prev => ({ ...prev, isMinimized: !prev.isMinimized }));
    onMinimize?.();
  };

  const handleFocus = () => {
    setState(prev => ({ ...prev, isActive: true, zIndex: 1000 }));
  };

  const handleBlur = () => {
    setState(prev => ({ ...prev, isActive: false, zIndex: 1 }));
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
        onFocus={handleFocus}
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
              ? `0 0 40px rgba(59, 130, 246, 0.3), 0 0 80px rgba(59, 130, 246, 0.1)`
              : `0 8px 32px rgba(0, 0, 0, 0.3)`
          }}
        >
          {/* Holographic Top Border */}
          <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${
            type === 'agent' ? 'via-blue-400' : 
            type === 'tool' ? 'via-purple-400' : 
            type === 'data' ? 'via-emerald-400' : 
            type === 'analysis' ? 'via-orange-400' : 
            'via-indigo-400'
          } to-transparent`} />
          
          {/* Portal Header */}
          <motion.div
            className={`
              relative flex items-center justify-between
              px-6 py-4
              bg-gradient-to-r ${styles.gradient}
              border-b ${styles.border}
              backdrop-blur-sm
            `}
            drag
            dragConstraints={constraintsRef}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* Title and Type Indicator */}
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${styles.gradient} ${styles.glow} animate-pulse`} />
              <div>
                <h3 className="text-white font-semibold text-sm">{title}</h3>
                <p className={`text-xs ${styles.accent} uppercase tracking-wider`}>{type}</p>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleMinimize}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              >
                <Minimize2 className="w-3 h-3" />
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleMaximize}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              >
                <Maximize2 className="w-3 h-3" />
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              >
                <Settings className="w-3 h-3" />
              </motion.button>
              
              {onClose && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 transition-colors"
                >
                  <X className="w-3 h-3" />
                </motion.button>
              )}
            </div>
          </motion.div>

          {/* Portal Content */}
          <AnimatePresence>
            {!state.isMinimized && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="relative flex-1 p-6 overflow-auto"
                style={{ height: state.size.height - 80 }}
              >
                {children}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Resize Handles */}
          {!state.isMaximized && !state.isMinimized && (
            <>
              {/* Corner Resize Handles */}
              <div className="absolute -bottom-1 -right-1 w-4 h-4 cursor-se-resize group">
                <div className={`w-full h-full rounded-tl-lg bg-gradient-to-br ${styles.gradient} opacity-0 group-hover:opacity-70 transition-opacity`} />
                <div className="absolute bottom-1 right-1 w-2 h-2 border-r border-b border-white/30" />
              </div>
              
              <div className="absolute -top-1 -right-1 w-4 h-4 cursor-ne-resize group">
                <div className={`w-full h-full rounded-bl-lg bg-gradient-to-br ${styles.gradient} opacity-0 group-hover:opacity-70 transition-opacity`} />
                <div className="absolute top-1 right-1 w-2 h-2 border-r border-t border-white/30" />
              </div>
              
              <div className="absolute -bottom-1 -left-1 w-4 h-4 cursor-sw-resize group">
                <div className={`w-full h-full rounded-tr-lg bg-gradient-to-br ${styles.gradient} opacity-0 group-hover:opacity-70 transition-opacity`} />
                <div className="absolute bottom-1 left-1 w-2 h-2 border-l border-b border-white/30" />
              </div>
              
              <div className="absolute -top-1 -left-1 w-4 h-4 cursor-nw-resize group">
                <div className={`w-full h-full rounded-br-lg bg-gradient-to-br ${styles.gradient} opacity-0 group-hover:opacity-70 transition-opacity`} />
                <div className="absolute top-1 left-1 w-2 h-2 border-l border-t border-white/30" />
              </div>
              
              {/* Edge Resize Handles */}
              <div className="absolute -right-1 top-4 bottom-4 w-2 cursor-e-resize group">
                <div className={`w-full h-full bg-gradient-to-r ${styles.gradient} opacity-0 group-hover:opacity-50 transition-opacity`} />
              </div>
              
              <div className="absolute -left-1 top-4 bottom-4 w-2 cursor-w-resize group">
                <div className={`w-full h-full bg-gradient-to-l ${styles.gradient} opacity-0 group-hover:opacity-50 transition-opacity`} />
              </div>
              
              <div className="absolute -bottom-1 left-4 right-4 h-2 cursor-s-resize group">
                <div className={`w-full h-full bg-gradient-to-b ${styles.gradient} opacity-0 group-hover:opacity-50 transition-opacity`} />
              </div>
              
              <div className="absolute -top-1 left-4 right-4 h-2 cursor-n-resize group">
                <div className={`w-full h-full bg-gradient-to-t ${styles.gradient} opacity-0 group-hover:opacity-50 transition-opacity`} />
              </div>
            </>
          )}

          {/*  Activity Indicator */}
          <div className="absolute bottom-2 right-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              type === 'agent' ? 'bg-blue-400' : 
              type === 'tool' ? 'bg-purple-400' : 
              type === 'data' ? 'bg-emerald-400' : 
              type === 'analysis' ? 'bg-orange-400' : 
              'bg-indigo-400'
            }`} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}; 