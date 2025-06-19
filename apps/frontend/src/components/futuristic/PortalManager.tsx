import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Portal, PortalProps } from './Portal';
import { CommandPalette } from './CommandPalette';
import { Plus, Layout, Zap, Database, MessageSquare, BarChart3 } from 'lucide-react';

export interface PortalConfig extends Omit<PortalProps, 'children'> {
  component: React.ComponentType<any>;
  props?: any;
}

interface PortalInstance extends PortalConfig {
  id: string;
  createdAt: Date;
  lastActive: Date;
}

interface WorkspaceLayout {
  name: string;
  portals: PortalInstance[];
  connections: NeuralConnection[];
}

interface NeuralConnection {
  id: string;
  from: string;
  to: string;
  type: 'data' | 'control' | 'feedback' | 'collaboration';
  strength: number;
  animated: boolean;
  color: string;
}

const PORTAL_TEMPLATES: PortalConfig[] = [
  {
    id: 'agent-template',
    type: 'agent',
    title: 'AI Agent',
    component: ({ name }: { name: string }) => (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <span className="text-white font-bold text-lg">{name?.[0] || 'A'}</span>
          </div>
          <div>
            <h4 className="text-white font-semibold">{name || 'AI Agent'}</h4>
            <p className="text-blue-300 text-sm">Ready to assist</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-2 bg-blue-500/20 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
              initial={{ width: '0%' }}
              animate={{ width: '75%' }}
              transition={{ duration: 2, delay: 0.5 }}
            />
          </div>
          <p className="text-blue-300 text-xs">Processing capabilities: 75%</p>
        </div>
        <div className="text-white/70 text-sm">
          <p>• Natural language processing</p>
          <p>• Decision making</p>
          <p>• Knowledge synthesis</p>
        </div>
      </div>
    ),
    props: { name: 'Assistant' }
  },
  {
    id: 'tool-template',
    type: 'tool',
    title: 'Analysis Tool',
    component: () => (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-purple-400" />
          <div>
            <h4 className="text-white font-semibold">Data Analyzer</h4>
            <p className="text-purple-300 text-sm">Processing data streams</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <div className="text-purple-300 text-xs">Throughput</div>
            <div className="text-white font-semibold">1.2k/sec</div>
          </div>
          <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <div className="text-purple-300 text-xs">Accuracy</div>
            <div className="text-white font-semibold">98.7%</div>
          </div>
        </div>
        <motion.div
          className="h-20 bg-purple-500/10 rounded-lg border border-purple-500/20 p-3"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="text-purple-300 text-xs mb-2">Real-time Analysis</div>
          <div className="flex items-end gap-1 h-10">
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="bg-gradient-to-t from-purple-500 to-pink-500 rounded-sm flex-1"
                animate={{ height: [10, Math.random() * 30 + 10, 10] }}
                transition={{ duration: 1, delay: i * 0.1, repeat: Infinity }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    )
  },
  {
    id: 'data-template',
    type: 'data',
    title: 'Data Stream',
    component: () => (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Database className="w-8 h-8 text-emerald-400" />
          <div>
            <h4 className="text-white font-semibold">Live Data Feed</h4>
            <p className="text-emerald-300 text-sm">Real-time updates</p>
          </div>
        </div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="flex justify-between items-center p-2 bg-emerald-500/10 rounded border border-emerald-500/20"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.2 }}
            >
              <span className="text-emerald-300 text-sm">Data Point {i + 1}</span>
              <span className="text-white font-mono text-xs">{Math.random().toFixed(3)}</span>
            </motion.div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-emerald-300 text-xs">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span>Live connection established</span>
        </div>
      </div>
    )
  }
];

export const PortalManager: React.FC = () => {
  const [portals, setPortals] = useState<PortalInstance[]>([]);
  const [connections, setConnections] = useState<NeuralConnection[]>([]);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [selectedLayout, setSelectedLayout] = useState<string>('default');
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate unique portal ID
  const generatePortalId = useCallback(() => {
    return `portal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Create a new portal
  const createPortal = useCallback((template: PortalConfig, customProps?: any) => {
    const newPortal: PortalInstance = {
      ...template,
      id: generatePortalId(),
      props: { ...template.props, ...customProps },
      createdAt: new Date(),
      lastActive: new Date(),
      initialPosition: {
        x: Math.random() * 300 + 50,
        y: Math.random() * 200 + 50
      }
    };

    setPortals(prev => [...prev, newPortal]);
    return newPortal.id;
  }, [generatePortalId]);

  // Remove a portal
  const removePortal = useCallback((portalId: string) => {
    setPortals(prev => prev.filter(p => p.id !== portalId));
    setConnections(prev => prev.filter(c => c.from !== portalId && c.to !== portalId));
  }, []);

  // Create  connection between portals
  const createConnection = useCallback((from: string, to: string, type: NeuralConnection['type'] = 'data') => {
    const connection: NeuralConnection = {
      id: `connection-${from}-${to}`,
      from,
      to,
      type,
      strength: Math.random() * 0.5 + 0.5,
      animated: true,
      color: type === 'data' ? '#00D4FF' : type === 'control' ? '#8B5CF6' : type === 'feedback' ? '#06FFA5' : '#FF006E'
    };

    setConnections(prev => [...prev.filter(c => !(c.from === from && c.to === to)), connection]);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Calculate connection paths
  const getConnectionPath = (from: string, to: string) => {
    const fromPortal = portals.find(p => p.id === from);
    const toPortal = portals.find(p => p.id === to);
    
    if (!fromPortal || !toPortal) return '';

    const fromPos = fromPortal.initialPosition || { x: 0, y: 0 };
    const toPos = toPortal.initialPosition || { x: 0, y: 0 };

    const fromX = fromPos.x + 200; // Center of portal
    const fromY = fromPos.y + 150;
    const toX = toPos.x + 200;
    const toY = toPos.y + 150;

    // Create curved path
    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2 - 50; // Curve upward

    return `M ${fromX} ${fromY} Q ${midX} ${midY} ${toX} ${toY}`;
  };

  return (
    <div ref={containerRef} className="relative w-full h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 overflow-hidden">
      {/*  Background Grid */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            radial-gradient(circle at 25% 25%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 75% 75%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 100% 100%, 50px 50px, 50px 50px'
        }} />
      </div>

      {/*  Connections SVG */}
      <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        <defs>
          <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00D4FF" stopOpacity="0" />
            <stop offset="50%" stopColor="#00D4FF" stopOpacity="1" />
            <stop offset="100%" stopColor="#06FFA5" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {connections.map(connection => (
          <motion.path
            key={connection.id}
            d={getConnectionPath(connection.from, connection.to)}
            stroke="url(#connectionGradient)"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: connection.strength }}
            transition={{ duration: 2, ease: "easeInOut" }}
          />
        ))}
      </svg>

      {/* Portals */}
      <AnimatePresence>
        {portals.map(portal => {
          const PortalComponent = portal.component;
          return (
            <Portal
              key={portal.id}
              id={portal.id}
              type={portal.type}
              title={portal.title}
              initialPosition={portal.initialPosition}
              onClose={() => removePortal(portal.id)}
            >
              <PortalComponent {...portal.props} />
            </Portal>
          );
        })}
      </AnimatePresence>

      {/* Floating Action Button */}
      <motion.div
        className="fixed bottom-8 right-8 z-50"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsCommandPaletteOpen(true)}
          className="w-14 h-14 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl shadow-2xl shadow-blue-500/25 flex items-center justify-center text-white hover:shadow-blue-500/40 transition-shadow"
        >
          <Plus className="w-6 h-6" />
        </motion.button>
      </motion.div>

      {/* Quick Portal Buttons */}
      <div className="fixed bottom-8 left-8 flex gap-3 z-50">
        {PORTAL_TEMPLATES.map((template, index) => (
          <motion.button
            key={template.id}
            initial={{ scale: 0, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ scale: 1.1, y: -5 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => createPortal(template)}
            className={`
              w-12 h-12 rounded-xl shadow-lg flex items-center justify-center text-white transition-all
              ${template.type === 'agent' ? 'bg-gradient-to-br from-blue-500 to-cyan-500 shadow-blue-500/25' :
                template.type === 'tool' ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-purple-500/25' :
                'bg-gradient-to-br from-emerald-500 to-teal-500 shadow-emerald-500/25'}
            `}
          >
            {template.type === 'agent' ? <Zap className="w-5 h-5" /> :
             template.type === 'tool' ? <BarChart3 className="w-5 h-5" /> :
             <Database className="w-5 h-5" />}
          </motion.button>
        ))}
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onCreatePortal={createPortal}
        templates={PORTAL_TEMPLATES}
      />

      {/* Status Bar */}
      <div className="fixed top-4 left-4 right-4 flex justify-between items-center pointer-events-none z-40">
        <div className="flex items-center gap-4 bg-black/20 backdrop-blur-xl rounded-2xl px-6 py-3 border border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white/70 text-sm"> Network Active</span>
          </div>
          <div className="w-px h-4 bg-white/20" />
          <span className="text-white/70 text-sm">{portals.length} Portals</span>
          <div className="w-px h-4 bg-white/20" />
          <span className="text-white/70 text-sm">{connections.length} Connections</span>
        </div>
        
        <div className="bg-black/20 backdrop-blur-xl rounded-2xl px-4 py-2 border border-white/10">
          <span className="text-white/70 text-xs">⌘K to summon</span>
        </div>
      </div>
    </div>
  );
}; 