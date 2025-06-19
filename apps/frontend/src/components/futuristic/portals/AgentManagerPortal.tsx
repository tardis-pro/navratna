import React from 'react';
import { motion } from 'framer-motion';
import { AgentManager } from '../../AgentManager';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface AgentManagerPortalProps {
  className?: string;
  viewport?: ViewportSize;
  defaultView?: 'grid' | 'list' | 'settings';
}

export const AgentManagerPortal: React.FC<AgentManagerPortalProps> = ({ 
  className, 
  viewport,
  defaultView = 'grid'
}) => {
  // Default viewport if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  };

  const currentViewport = viewport || defaultViewport;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className={`h-full w-full ${className} ${currentViewport.isMobile ? 'px-2' : ''}`}
    >
      <div className="h-full bg-gradient-to-br from-blue-500/5 to-cyan-500/5 backdrop-blur-xl rounded-2xl border border-blue-500/10 overflow-hidden">
        <AgentManager 
          className="h-full p-4 md:p-6"
          defaultView={defaultView}
          viewport={currentViewport}
        />
      </div>
    </motion.div>
  );
}; 