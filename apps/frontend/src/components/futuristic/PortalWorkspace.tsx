import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Portal } from './Portal';
import { DiscussionControlsPortal } from './portals/DiscussionControlsPortal';
import { AgentSelectorPortal } from './portals/AgentSelectorPortal';
import { IntelligencePanelPortal } from './portals/IntelligencePanelPortal';
import { SettingsPortal } from './portals/SettingsPortal';
import { Plus, Layout, Users, Brain, Settings, MessageSquare } from 'lucide-react';

interface PortalInstance {
  id: string;
  type: 'discussion' | 'agents' | 'intelligence' | 'settings';
  title: string;
  component: React.ComponentType<any>;
  position: { x: number; y: number };
  size: { width: number; height: number };
  isVisible: boolean;
}

const PORTAL_CONFIGS = {
  discussion: {
    title: 'Discussion Controls',
    component: DiscussionControlsPortal,
    defaultSize: { width: 450, height: 600 },
    type: 'communication' as const,
    icon: MessageSquare
  },
  agents: {
    title: 'Agent Selector',
    component: AgentSelectorPortal,
    defaultSize: { width: 500, height: 700 },
    type: 'agent' as const,
    icon: Users
  },
  intelligence: {
    title: 'Intelligence Panel',
    component: IntelligencePanelPortal,
    defaultSize: { width: 450, height: 550 },
    type: 'analysis' as const,
    icon: Brain
  },
  settings: {
    title: 'Settings',
    component: SettingsPortal,
    defaultSize: { width: 600, height: 650 },
    type: 'tool' as const,
    icon: Settings
  }
};

export const PortalWorkspace: React.FC = () => {
  const [portals, setPortals] = useState<PortalInstance[]>([]);
  const [nextId, setNextId] = useState(1);

  const generatePosition = useCallback(() => {
    const offset = (portals.length * 50) % 300;
    return {
      x: 100 + offset,
      y: 100 + offset
    };
  }, [portals.length]);

  const createPortal = useCallback((type: keyof typeof PORTAL_CONFIGS) => {
    const config = PORTAL_CONFIGS[type];
    const newPortal: PortalInstance = {
      id: `portal-${nextId}`,
      type,
      title: config.title,
      component: config.component,
      position: generatePosition(),
      size: config.defaultSize,
      isVisible: true
    };

    setPortals(prev => [...prev, newPortal]);
    setNextId(prev => prev + 1);
  }, [nextId, generatePosition]);

  const closePortal = useCallback((id: string) => {
    setPortals(prev => prev.filter(portal => portal.id !== id));
  }, []);

  const togglePortal = useCallback((type: keyof typeof PORTAL_CONFIGS) => {
    const existingPortal = portals.find(p => p.type === type);
    if (existingPortal) {
      closePortal(existingPortal.id);
    } else {
      createPortal(type);
    }
  }, [portals, createPortal, closePortal]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/*  Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, #3b82f6 0%, transparent 50%),
                           radial-gradient(circle at 75% 75%, #8b5cf6 0%, transparent 50%),
                           radial-gradient(circle at 75% 25%, #06d6a0 0%, transparent 50%),
                           radial-gradient(circle at 25% 75%, #f59e0b 0%, transparent 50%)`
        }} />
      </div>

      {/* Portal Launcher */}
      <motion.div
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="fixed left-6 top-1/2 -translate-y-1/2 z-50"
      >
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 space-y-3">
          <div className="text-white text-sm font-semibold mb-4 flex items-center gap-2">
            <Layout className="w-4 h-4" />
            Portals
          </div>
          
          {Object.entries(PORTAL_CONFIGS).map(([key, config]) => {
            const isActive = portals.some(p => p.type === key);
            const Icon = config.icon;
            
            return (
              <motion.button
                key={key}
                onClick={() => togglePortal(key as keyof typeof PORTAL_CONFIGS)}
                className={`
                  w-12 h-12 rounded-xl border transition-all duration-300 flex items-center justify-center
                  ${isActive 
                    ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/50 text-blue-400' 
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600/50'
                  }
                `}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                title={config.title}
              >
                <Icon className="w-5 h-5" />
              </motion.button>
            );
          })}
          
          <div className="border-t border-slate-700/50 pt-3">
            <motion.button
              onClick={() => {
                // Close all portals
                setPortals([]);
              }}
              className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 transition-all duration-300 flex items-center justify-center"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              title="Close All"
            >
              <Plus className="w-5 h-5 rotate-45" />
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Portal Instances */}
      <AnimatePresence>
        {portals.map((portal) => {
          const config = PORTAL_CONFIGS[portal.type];
          const PortalComponent = portal.component;
          
          return (
            <Portal
              key={portal.id}
              id={portal.id}
              type={config.type}
              title={portal.title}
              initialPosition={portal.position}
              initialSize={portal.size}
              onClose={() => closePortal(portal.id)}
              onMaximize={() => {
                console.log(`Maximizing portal: ${portal.title}`);
              }}
              onMinimize={() => {
                console.log(`Minimizing portal: ${portal.title}`);
              }}
            >
              <PortalComponent />
            </Portal>
          );
        })}
      </AnimatePresence>

      {/* Status Bar */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-6 right-6 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 py-2"
      >
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-slate-300">
              {portals.length} Portal{portals.length !== 1 ? 's' : ''} Active
            </span>
          </div>
          
          {portals.length > 0 && (
            <div className="text-slate-500 text-xs">
              Drag headers to move • Resize handles on corners
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}; 