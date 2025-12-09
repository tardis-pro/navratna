import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useFocusManager } from '../hooks/useFocusManager';

interface FocusableWrapperProps {
  id: string;
  type: 'chat-window' | 'portal' | 'button' | 'input' | 'dropdown';
  preview?: {
    title: string;
    content: string;
    metadata?: Record<string, any>;
  };
  data?: any;
  children: React.ReactNode;
  className?: string;
  focusClassName?: string;
  hoverClassName?: string;
}

export const FocusableWrapper: React.FC<FocusableWrapperProps> = ({
  id,
  type,
  preview,
  data,
  children,
  className = '',
  focusClassName = 'ring-2 ring-cyan-500/50 ring-offset-2 ring-offset-slate-900',
  hoverClassName = 'ring-1 ring-blue-400/30',
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const { registerElement, unregisterElement, isFocused, isHovered } = useFocusManager();

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const cleanup = registerElement({
      id,
      type,
      element,
      data,
      preview,
    });

    return () => {
      cleanup();
      unregisterElement(id);
    };
  }, [id, type, data, preview, registerElement, unregisterElement]);

  const focused = isFocused(id);
  const hovered = isHovered(id);

  return (
    <motion.div
      ref={elementRef}
      className={`
        relative transition-all duration-300 rounded-lg
        ${className}
        ${focused ? focusClassName : ''}
        ${hovered && !focused ? hoverClassName : ''}
      `}
      animate={{
        scale: focused ? 1.02 : 1,
        z: focused ? 10 : 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
    >
      {/* Focus indicator */}
      {focused && (
        <motion.div
          className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-purple-500/20 rounded-lg blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Hover glow */}
      {hovered && (
        <motion.div
          className="absolute -inset-0.5 bg-gradient-to-r from-blue-400/10 to-cyan-400/10 rounded-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      )}

      {/* Content */}
      <div className="relative z-10">{children}</div>

      {/* Focus pulse animation */}
      {focused && (
        <motion.div
          className="absolute inset-0 border-2 border-cyan-400/30 rounded-lg"
          animate={{
            opacity: [0.3, 0.6, 0.3],
            scale: [1, 1.02, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
    </motion.div>
  );
};
