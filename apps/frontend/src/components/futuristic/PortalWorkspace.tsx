import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Portal } from './Portal';
import { DiscussionControlsPortal } from './portals/DiscussionControlsPortal';
import { DiscussionLogPortal } from './portals/DiscussionLogPortal';
import { SettingsPortal } from './portals/SettingsPortal';
import { ChatPortal } from './portals/ChatPortal';
import { ProviderSettingsPortal } from './portals/ProviderSettingsPortal';
import { SystemConfigPortal } from './portals/SystemConfigPortal';
import { AgentManagerPortal } from './portals/AgentManagerPortal';
import { ToolsPanel } from './portals/ToolsPanel';
import { SecurityGateway } from './portals/SecurityGateway';
import { SecurityPortal } from './portals/SecurityPortal';
import { CapabilityRegistry } from './portals/CapabilityRegistry';
import { EventStreamMonitor } from './portals/EventStreamMonitor';
import { OperationsMonitor } from './portals/OperationsMonitor';
import { IntelligencePanelPortal } from './portals/IntelligencePanelPortal';
import { InsightsPanel } from './portals/InsightsPanel';
import { KnowledgePortal } from './portals/KnowledgePortal';
import { DashboardPortal } from './portals/DashboardPortal';
import { ArtifactsPortal } from './portals/ArtifactsPortal';
import { DesktopWorkspace } from './DesktopWorkspace';
import { Plus, Layout, Users, Brain, Settings, MessageSquare, MessageCircle, Activity, Zap, Terminal, Monitor, Menu, X, Bot, Server, Database, Wrench, Shield, Radio, BarChart3, Lightbulb, Eye, BookOpen, MapPin, Sun, Cloud, CloudRain, CloudSnow, CloudSun, Thermometer, Search, Store, Grid3X3, Layers, Home, Package, FileText, Globe } from 'lucide-react';
import { uaipAPI } from '@/utils/uaip-api';
import { PuzzlePieceIcon } from '@heroicons/react/24/outline';
import MarketplaceHubWidget from '@/widgets/MarketplaceHubWidget';
import { ToolManagementPortal } from './portals/ToolManagementPortal';

interface PortalInstance {
  id: string;
  type: keyof typeof PORTAL_CONFIGS;
  title: string;
  component: React.ComponentType<any>;
  position: { x: number; y: number };
  size: { width: number; height: number };
  isVisible: boolean;
  isMinimized?: boolean;
  zIndex?: number;
}

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const PORTAL_CONFIGS = {
  'agent-hub': {
    title: 'Agent Hub',
    component: (props: any) => <AgentManagerPortal {...props} mode="hub" defaultView="grid" />,
    defaultSize: {
      desktop: { width: 900, height: 750 },
      tablet: { width: 750, height: 700 },
      mobile: { width: 500, height: 650 }
    },
    type: 'agent' as const,
    icon: Bot,
    description: 'Unified agent management, spawning, monitoring, and settings'
  },
  'discussion-hub': {
    title: 'Discussion Hub',
    component: (props: any) => <DiscussionControlsPortal {...props} showLog={true} />,
    defaultSize: {
      desktop: { width: 800, height: 700 },
      tablet: { width: 700, height: 650 },
      mobile: { width: 400, height: 600 }
    },
    type: 'communication' as const,
    icon: MessageSquare,
    description: 'Discussion controls and conversation log in one interface'
  },
  'intelligence-hub': {
    title: 'Intelligence Hub',
    component: (props: any) => <IntelligencePanelPortal {...props} mode="insights" />,
    defaultSize: {
      desktop: { width: 650, height: 650 },
      tablet: { width: 580, height: 600 },
      mobile: { width: 400, height: 550 }
    },
    type: 'analysis' as const,
    icon: Brain,
    description: 'AI intelligence analysis and insights dashboard'
  },
  'system-hub': {
    title: 'System Hub',
    component: (props: any) => <SystemConfigPortal {...props} showProviders={true} showSecurity={true} />,
    defaultSize: {
      desktop: { width: 850, height: 750 },
      tablet: { width: 750, height: 700 },
      mobile: { width: 500, height: 650 }
    },
    type: 'tool' as const,
    icon: Settings,
    description: 'System configuration, providers, and security settings'
  },
  'monitoring-hub': {
    title: 'Monitoring Hub',
    component: (props: any) => <OperationsMonitor {...props} showEvents={true} showCapabilities={true} />,
    defaultSize: {
      desktop: { width: 800, height: 700 },
      tablet: { width: 700, height: 650 },
      mobile: { width: 450, height: 600 }
    },
    type: 'analysis' as const,
    icon: Monitor,
    description: 'Operations monitoring, events, and capability registry'
  },
  chat: {
    title: 'Agent Chat',
    component: ChatPortal,
    defaultSize: {
      desktop: { width: 500, height: 700 },
      tablet: { width: 450, height: 650 },
      mobile: { width: 380, height: 600 }
    },
    type: 'communication' as const,
    icon: MessageCircle,
    description: 'Direct chat interface with agents'
  },
  provider: {
    title: 'Providers',
    component: ProviderSettingsPortal,
    defaultSize: {
      desktop: { width: 900, height: 750 },
      tablet: { width: 750, height: 700 },
      mobile: { width: 500, height: 650 }
    },
    type: 'provider' as const,
    icon: BookOpen,
    description: 'Knowledge graph visualization and management'
  },
  knowledge: {
    title: 'Knowledge Graph',
    component: KnowledgePortal,
    defaultSize: {
      desktop: { width: 900, height: 750 },
      tablet: { width: 750, height: 700 },
      mobile: { width: 500, height: 650 }
    },
    type: 'analysis' as const,
    icon: BookOpen,
    description: 'Provider management'
  },
  tools: {
    title: 'Tools Panel',
    component: ToolsPanel,
    defaultSize: {
      desktop: { width: 700, height: 650 },
      tablet: { width: 600, height: 600 },
      mobile: { width: 450, height: 550 }
    },
    type: 'tool' as const,
    icon: Wrench,
    description: 'Available tools and utilities'
  },
  'marketplace-hub': {
    title: 'Marketplace Hub',
    component: (props: any) => <MarketplaceHubWidget {...props} />,
    defaultSize: {
      desktop: { width: 900, height: 750 },
      tablet: { width: 750, height: 700 },
      mobile: { width: 500, height: 650 }
    },
    type: 'core' as const,
    icon: Store,
    description: 'Explore agents, battles, leaderboards, and social feed.'
  },
  'security-hub': {
    title: 'Security Hub',
    component: (props: any) => <SecurityPortal {...props} mode="dashboard" />,
    defaultSize: {
      desktop: { width: 900, height: 750 },
      tablet: { width: 750, height: 700 },
      mobile: { width: 500, height: 650 }
    },
    type: 'system' as const,
    icon: Shield,
    description: 'Monitor agent security, policies, and compliance status.'
  },
  'tool-management': {
    title: 'Tool Management',
    component: (props: any) => <ToolManagementPortal {...props} />,
    defaultSize: {
      desktop: { width: 900, height: 750 },
      tablet: { width: 750, height: 700 },
      mobile: { width: 500, height: 650 }
    },
    type: 'tool' as const,
    icon: Wrench,
    description: 'Manage and configure system tools and capabilities'
  },
  'dashboard': {
    title: 'System Dashboard',
    component: (props: any) => <DashboardPortal {...props} />,
    defaultSize: {
      desktop: { width: 1000, height: 800 },
      tablet: { width: 800, height: 700 },
      mobile: { width: 500, height: 650 }
    },
    type: 'data' as const,
    icon: Home,
    description: 'System overview and metrics dashboard'
  },
  'artifacts': {
    title: 'Artifacts Repository',
    component: (props: any) => <ArtifactsPortal {...props} />,
    defaultSize: {
      desktop: { width: 900, height: 750 },
      tablet: { width: 750, height: 700 },
      mobile: { width: 500, height: 650 }
    },
    type: 'data' as const,
    icon: Package,
    description: 'Manage and organize digital artifacts'
  },
  // Additional portal types for RoleBasedDesktopConfig compatibility
  'user-chat': {
    title: 'User Chat',
    component: (props: any) => <ChatPortal {...props} />,
    defaultSize: {
      desktop: { width: 600, height: 500 },
      tablet: { width: 500, height: 450 },
      mobile: { width: 400, height: 400 }
    },
    type: 'communication' as const,
    icon: MessageCircle,
    description: 'Direct messaging and communication'
  },
  'search': {
    title: 'Global Search',
    component: (props: any) => <div className="p-4 text-white"><p>Global Search Portal - Coming Soon</p></div>,
    defaultSize: {
      desktop: { width: 700, height: 500 },
      tablet: { width: 600, height: 450 },
      mobile: { width: 400, height: 400 }
    },
    type: 'tool' as const,
    icon: Search,
    description: 'Global search across all systems'
  },
  'tasks': {
    title: 'Task Management',
    component: (props: any) => <div className="p-4 text-white"><p>Task Management Portal - Coming Soon</p></div>,
    defaultSize: {
      desktop: { width: 800, height: 600 },
      tablet: { width: 700, height: 550 },
      mobile: { width: 400, height: 450 }
    },
    type: 'tool' as const,
    icon: Activity,
    description: 'Personal task and workflow management'
  },
  'documents': {
    title: 'Document Management',
    component: (props: any) => <div className="p-4 text-white"><p>Document Management Portal - Coming Soon</p></div>,
    defaultSize: {
      desktop: { width: 900, height: 700 },
      tablet: { width: 750, height: 650 },
      mobile: { width: 500, height: 550 }
    },
    type: 'data' as const,
    icon: FileText,
    description: 'Document management and collaboration'
  },
  'user-management': {
    title: 'User Management',
    component: (props: any) => <div className="p-4 text-white"><p>User Management Portal - Coming Soon</p></div>,
    defaultSize: {
      desktop: { width: 800, height: 650 },
      tablet: { width: 700, height: 600 },
      mobile: { width: 500, height: 500 }
    },
    type: 'system' as const,
    icon: Users,
    description: 'Basic user management'
  },
  'system-admin': {
    title: 'System Administration',
    component: (props: any) => <SystemConfigPortal {...props} mode="admin" />,
    defaultSize: {
      desktop: { width: 1000, height: 800 },
      tablet: { width: 800, height: 700 },
      mobile: { width: 500, height: 600 }
    },
    type: 'system' as const,
    icon: Shield,
    description: 'System administration and security'
  },
  'database-admin': {
    title: 'Database Administration',
    component: (props: any) => <div className="p-4 text-white"><p>Database Admin Portal - Coming Soon</p></div>,
    defaultSize: {
      desktop: { width: 900, height: 700 },
      tablet: { width: 750, height: 650 },
      mobile: { width: 500, height: 550 }
    },
    type: 'system' as const,
    icon: Database,
    description: 'Database administration'
  },
  'system-console': {
    title: 'System Console',
    component: (props: any) => <div className="p-4 text-white"><p>System Console Portal - Coming Soon</p></div>,
    defaultSize: {
      desktop: { width: 1000, height: 700 },
      tablet: { width: 800, height: 650 },
      mobile: { width: 500, height: 550 }
    },
    type: 'system' as const,
    icon: Terminal,
    description: 'System console and direct access'
  },
  'system-monitoring': {
    title: 'System Monitoring',
    component: (props: any) => <OperationsMonitor {...props} />,
    defaultSize: {
      desktop: { width: 900, height: 700 },
      tablet: { width: 750, height: 650 },
      mobile: { width: 500, height: 550 }
    },
    type: 'system' as const,
    icon: Monitor,
    description: 'System monitoring and health'
  },
  'api-management': {
    title: 'API Management',
    component: (props: any) => <div className="p-4 text-white"><p>API Management Portal - Coming Soon</p></div>,
    defaultSize: {
      desktop: { width: 900, height: 700 },
      tablet: { width: 750, height: 650 },
      mobile: { width: 500, height: 550 }
    },
    type: 'system' as const,
    icon: Radio,
    description: 'API management and testing'
  },
  'create-anything': {
    title: 'Create Anything',
    component: (props: any) => <div className="p-4 text-white"><p>Create Anything Portal - Coming Soon</p></div>,
    defaultSize: {
      desktop: { width: 800, height: 600 },
      tablet: { width: 700, height: 550 },
      mobile: { width: 500, height: 500 }
    },
    type: 'tool' as const,
    icon: Plus,
    description: 'Create any type of resource'
  },
  'mini-browser': {
    title: 'Mini Browser',
    component: (props: any) => <div className="p-4 text-white"><p>Mini Browser Portal - Coming Soon</p></div>,
    defaultSize: {
      desktop: { width: 1000, height: 700 },
      tablet: { width: 800, height: 650 },
      mobile: { width: 500, height: 550 }
    },
    type: 'tool' as const,
    icon: Globe,
    description: 'Web browser with screenshot capture'
  },
};

// Portal type groups for better organization
const PORTAL_GROUPS = {
  core: {
    title: 'Core Systems',
    portals: ['dashboard', 'agent-hub', 'discussion-hub', 'chat'],
    colorClasses: {
      text: 'text-blue-400',
      bg: 'from-blue-500/20 to-blue-600/20',
      border: 'border-blue-500/50',
      accent: 'bg-blue-500'
    }
  },
  intelligence: {
    title: 'Intelligence & Analysis',
    portals: ['intelligence-hub', 'knowledge', 'monitoring-hub', 'artifacts'],
    colorClasses: {
      text: 'text-purple-400',
      bg: 'from-purple-500/20 to-purple-600/20',
      border: 'border-purple-500/50',
      accent: 'bg-purple-500'
    }
  },
  system: {
    title: 'System & Tools',
    portals: ['system-hub', 'security-hub', 'tools', 'tool-management', 'provider', 'marketplace-hub'],
    colorClasses: {
      text: 'text-green-400',
      bg: 'from-green-500/20 to-green-600/20',
      border: 'border-green-500/50',
      accent: 'bg-green-500'
    }
  }
};

// --- Hotkey Map ---
const HOTKEYS = {
  core: ['Alt+1', 'Alt+2', 'Alt+3'],
  intelligence: ['Alt+4', 'Alt+5', 'Alt+6'],
  system: ['Alt+7', 'Alt+8', 'Alt+9', 'Alt+0'],
};

// --- Global Action Search Bar ---
const GLOBAL_ACTIONS = [
  { label: 'Manage Agents', action: () => window.dispatchEvent(new CustomEvent('launchPortal', { detail: { portalType: 'agent-hub' } })) },
  { label: 'Start a Discussion', action: () => window.dispatchEvent(new CustomEvent('launchPortal', { detail: { portalType: 'discussion-hub' } })) },
  { label: 'Analyze Intelligence', action: () => window.dispatchEvent(new CustomEvent('launchPortal', { detail: { portalType: 'intelligence-hub' } })) },
  { label: 'Configure System', action: () => window.dispatchEvent(new CustomEvent('launchPortal', { detail: { portalType: 'system-hub' } })) },
  { label: 'Monitor Operations', action: () => window.dispatchEvent(new CustomEvent('launchPortal', { detail: { portalType: 'monitoring-hub' } })) },
  { label: 'Chat with Agents', action: () => window.dispatchEvent(new CustomEvent('launchPortal', { detail: { portalType: 'chat' } })) },
  { label: 'Explore Knowledge', action: () => window.dispatchEvent(new CustomEvent('launchPortal', { detail: { portalType: 'knowledge' } })) },
  { label: 'Use Tools', action: () => window.dispatchEvent(new CustomEvent('launchPortal', { detail: { portalType: 'tools' } })) },
  { label: 'Manage Tools', action: () => window.dispatchEvent(new CustomEvent('launchPortal', { detail: { portalType: 'tool-management' } })) },
  { label: 'Configure Providers', action: () => window.dispatchEvent(new CustomEvent('launchPortal', { detail: { portalType: 'provider' } })) },
  { label: 'Browse Marketplace', action: () => window.dispatchEvent(new CustomEvent('launchPortal', { detail: { portalType: 'marketplace-hub' } })) },
  { label: 'Monitor Security', action: () => window.dispatchEvent(new CustomEvent('launchPortal', { detail: { portalType: 'security-hub' } })) },
  { label: 'Close Everything', action: () => window.dispatchEvent(new CustomEvent('closeAllPortals')) },
  { label: 'Get Help & Shortcuts', action: () => window.dispatchEvent(new CustomEvent('showHelp')) },
];

const GlobalActionSearchBar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = GLOBAL_ACTIONS.filter(a => a.label.toLowerCase().includes(query.toLowerCase()));

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (open) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlight(h => Math.min(h + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlight(h => Math.max(h - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (filtered[highlight]) {
            filtered[highlight].action();
            setOpen(false);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setOpen(false);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, filtered, highlight]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setHighlight(0);
    }
  }, [open]);

  return (
    <>
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100001] w-full max-w-lg flex justify-center pointer-events-none">
        <button
          className="w-full flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-900/70 border border-slate-700/60 shadow-xl backdrop-blur-xl text-slate-300 hover:bg-slate-800/80 transition-all duration-200 pointer-events-auto"
          style={{ boxShadow: '0 4px 32px 0 rgba(80,80,180,0.10)' }}
          onClick={() => setOpen(true)}
          tabIndex={0}
        >
          <Search className="w-5 h-5 text-blue-400" />
          <span className="flex-1 text-left text-sm opacity-80">Search actions...</span>
          <span className="ml-2 text-xs bg-slate-800/80 px-2 py-1 rounded font-mono text-slate-400 border border-slate-700/60">⌘K</span>
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-0 left-0 w-full h-full z-[100002] flex items-start justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="mt-32 w-full max-w-lg bg-slate-900/95 border border-slate-700/70 rounded-2xl shadow-2xl p-6 pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-4">
                <Search className="w-5 h-5 text-blue-400" />
                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent outline-none text-slate-200 text-lg placeholder:text-slate-500"
                  placeholder="Type an action..."
                  value={query}
                  onChange={e => { setQuery(e.target.value); setHighlight(0); }}
                />
              </div>
              <div className="divide-y divide-slate-700/60">
                {filtered.length === 0 && (
                  <div className="py-4 text-slate-500 text-center">No actions found</div>
                )}
                {filtered.map((a, i) => (
                  <button
                    key={a.label}
                    className={`w-full text-left px-3 py-3 rounded-lg flex items-center gap-2 transition-all duration-150 ${i === highlight ? 'bg-blue-600/20 text-blue-200' : 'hover:bg-slate-800/80 text-slate-300'}`}
                    onClick={() => { a.action(); setOpen(false); }}
                    onMouseEnter={() => setHighlight(i)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// --- HotkeyManOverlay ---
const HotkeyManOverlay: React.FC<{ open: boolean, onClose: () => void }> = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-8 min-w-[340px] max-w-[90vw] max-h-[80vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
        <button className="absolute top-3 right-3 text-slate-400 hover:text-white" onClick={onClose} aria-label="Close hotkey overlay">✕</button>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Zap className="w-5 h-5 text-yellow-400" /> Hotkey Reference</h2>
        <div className="space-y-4">
          <div>
            <div className="font-semibold text-blue-400 mb-1">Core Systems</div>
            <ul className="text-slate-300 text-sm space-y-1">
              {PORTAL_GROUPS.core.portals.map((key, i) => (
                <li key={key}><span className="font-mono bg-slate-800 px-2 py-0.5 rounded mr-2">{HOTKEYS.core[i]}</span> {PORTAL_CONFIGS[key].title}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-purple-400 mb-1">Intelligence & Analysis</div>
            <ul className="text-slate-300 text-sm space-y-1">
              {PORTAL_GROUPS.intelligence.portals.map((key, i) => (
                <li key={key}><span className="font-mono bg-slate-800 px-2 py-0.5 rounded mr-2">{HOTKEYS.intelligence[i]}</span> {PORTAL_CONFIGS[key].title}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-green-400 mb-1">System & Tools</div>
            <ul className="text-slate-300 text-sm space-y-1">
              {PORTAL_GROUPS.system.portals.map((key, i) => (
                <li key={key}><span className="font-mono bg-slate-800 px-2 py-0.5 rounded mr-2">{HOTKEYS.system[i]}</span> {PORTAL_CONFIGS[key].title}</li>
              ))}
            </ul>
          </div>
          <div className="mt-4 text-xs text-slate-400">Press <span className="font-mono bg-slate-800 px-2 py-0.5 rounded">Esc</span> or click outside to close.</div>
        </div>
      </div>
    </div>
  );
};

// --- HotCornerMenu Component ---
const HotCornerMenu: React.FC<{
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  groupKey?: keyof typeof PORTAL_GROUPS,
  portals: PortalInstance[],
  togglePortal: (type: keyof typeof PORTAL_CONFIGS) => void,
  closeAll?: () => void,
  systemStatus?: string,
  systemMetrics?: any,
  show?: boolean,
  setShow: (show: boolean) => void
}> = ({ corner, groupKey, portals, togglePortal, closeAll, systemStatus, systemMetrics, show, setShow }) => {
  // Positioning logic
  const positions = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };
  const group = groupKey ? PORTAL_GROUPS[groupKey] : undefined;
  // Direction logic
  const isTop = corner.startsWith('top');
  const menuPosition = isTop ? 'mt-14' : 'mb-14';
  const menuArrow = (
    <div className={`absolute ${isTop ? '-top-2' : '-bottom-2'} ${corner.includes('left') ? 'left-6' : 'right-6'} w-0 h-0`} style={{ zIndex: 1001 }}>
      <div className={`mx-auto ${isTop ? '' : ''}`} style={{
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderBottom: isTop ? '8px solid #1e293b' : undefined,
        borderTop: !isTop ? '8px solid #1e293b' : undefined,
        width: 0,
        height: 0
      }} />
    </div>
  );

  // --- Hover/Focus intent logic ---
  const [hovered, setHovered] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setHovered(true);
    setShow(true);
  }, [setShow]);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    timeoutRef.current = setTimeout(() => {
      if (!hovered) {
        setShow(false);
      }
    }, 200);
  }, [setShow, hovered]);

  // --- Hotkey display logic ---
  const hotkeys = groupKey ? HOTKEYS[groupKey] : [];

  // --- Dynamic popover positioning ---
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (show && popoverRef.current) {
      const pop = popoverRef.current;
      const rect = pop.getBoundingClientRect();
      const newStyle: React.CSSProperties = {};

      // Clamp vertically
      if (rect.bottom > window.innerHeight) {
        newStyle.bottom = 16; // 4 * 4px
        newStyle.top = 'auto';
      } else if (rect.top < 0) {
        newStyle.top = 16;
        newStyle.bottom = 'auto';
      }

      // Clamp horizontally
      if (rect.right > window.innerWidth) {
        newStyle.right = 16;
        newStyle.left = 'auto';
      } else if (rect.left < 0) {
        newStyle.left = 16;
        newStyle.right = 'auto';
      }

      // Only update if style actually changed
      setPopoverStyle(prevStyle => {
        const hasChanged = Object.keys(newStyle).some(key =>
          prevStyle[key as keyof React.CSSProperties] !== newStyle[key as keyof React.CSSProperties]
        );
        return hasChanged ? newStyle : prevStyle;
      });
    }
  }, [show]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={`fixed z-50 ${positions[corner]}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      tabIndex={0}
    >
      <button
        className={`w-12 h-12 rounded-full bg-slate-900/70 border border-slate-700/50 flex items-center justify-center text-white shadow-lg hover:bg-slate-800/90 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${show ? 'scale-110' : 'scale-100'}`}
        aria-label={group ? group.title : 'Quick Actions'}
        onMouseEnter={handleMouseEnter}
        onFocus={handleMouseEnter}
        onClick={() => setShow(!show)}
      >
        {corner === 'top-left' && <Layout className="w-6 h-6" />}
        {corner === 'top-right' && <Brain className="w-6 h-6" />}
        {corner === 'bottom-left' && <Settings className="w-6 h-6" />}
        {corner === 'bottom-right' && <Zap className="w-6 h-6" />}
      </button>
      <AnimatePresence>
        {show && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, scale: 0.8, y: isTop ? 20 : -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: isTop ? 20 : -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className={`absolute ${menuPosition} ${corner.includes('left') ? 'left-0' : 'right-0'} min-w-[220px] bg-slate-900/95 border border-slate-700/70 rounded-2xl shadow-2xl p-4 space-y-2 backdrop-blur-xl`}
            style={{ zIndex: 100000, ...popoverStyle }}
            onMouseEnter={() => {
              setHovered(true);
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
            }}
            onMouseLeave={handleMouseLeave}
          >
            {menuArrow}
            {group && (
              <div className={`text-xs font-semibold mb-2 ${group.colorClasses.text}`}>{group.title}</div>
            )}
            {group && group.portals.map((portalKey, idx) => {
              const config = PORTAL_CONFIGS[portalKey as keyof typeof PORTAL_CONFIGS];
              const isActive = portals.some(p => p.type === portalKey);
              const Icon = config.icon;
              const hotkey = hotkeys[idx];
              return (
                <button
                  key={portalKey}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePortal(portalKey as keyof typeof PORTAL_CONFIGS);
                    setShow(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all duration-200 ${isActive ? `${group.colorClasses.bg} ${group.colorClasses.text}` : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/70 hover:text-white'}`}
                  onMouseEnter={(e) => e.stopPropagation()}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate text-sm">{config.title}</span>
                  {hotkey && <span className="ml-auto text-xs text-slate-400 font-mono">{hotkey}</span>}
                  {isActive && <span className={`ml-1 w-2 h-2 rounded-full ${group.colorClasses.accent}`} />}
                </button>
              );
            })}
            {/* Quick Actions for bottom-right */}
            {corner === 'bottom-right' && (
              <>
                <div className="text-xs font-semibold mb-2 text-yellow-400">Quick Actions</div>
                <button
                  onClick={() => { 
                    if (closeAll) {
                      closeAll(); 
                    }
                    setShow(false); 
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/40 hover:text-white text-sm"
                >
                  <Plus className="w-4 h-4 rotate-45" /> Close All Portals
                </button>
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                  <span className={`w-2 h-2 rounded-full ${systemStatus === 'online' ? 'bg-green-400 animate-pulse' : systemStatus === 'degraded' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                  <span>System {systemStatus?.toUpperCase()}</span>
                  {systemMetrics?.apiResponseTime && (
                    <span className="ml-2 text-slate-500">({systemMetrics.apiResponseTime}ms)</span>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const PortalWorkspace: React.FC = () => {
  const [portals, setPortals] = useState<PortalInstance[]>([]);
  const [nextId, setNextId] = useState(1);
  const [activePortalId, setActivePortalId] = useState<string | null>(null);
  const [maxZIndex, setMaxZIndex] = useState(1000);
  const [systemStatus, setSystemStatus] = useState<'online' | 'degraded' | 'offline'>('online');
  const [activeConnections, setActiveConnections] = useState(0);
  const [systemMetrics, setSystemMetrics] = useState<{
    apiResponseTime?: number;
    lastHealthCheck?: Date;
    environment?: string;
  }>({});
  const [viewport, setViewport] = useState<ViewportSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: false,
    isTablet: false,
    isDesktop: true
  });
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showThinkTokens, setShowThinkTokens] = useState(false);
  const [showTopLeft, setShowTopLeft] = useState(false);
  const [showTopRight, setShowTopRight] = useState(false);
  const [showBottomLeft, setShowBottomLeft] = useState(false);
  const [showBottomRight, setShowBottomRight] = useState(false);
  const [clock, setClock] = useState<string>("");
  const [location, setLocation] = useState<{ city?: string; country?: string; lat?: number; lon?: number }>({});
  const [weather, setWeather] = useState<{ temp?: number; icon?: string; desc?: string } | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<'desktop' | 'portal'>('desktop');

  // Update viewport size on resize
  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isMobile = width < 768;
      const isTablet = width >= 768 && width < 1024;
      const isDesktop = width >= 1024;

      setViewport({
        width,
        height,
        isMobile,
        isTablet,
        isDesktop
      });

      // Close mobile menu when switching to desktop
      if (isDesktop && showMobileMenu) {
        setShowMobileMenu(false);
      }
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, [showMobileMenu]);

  const getResponsiveSize = useCallback((type: keyof typeof PORTAL_CONFIGS) => {
    const config = PORTAL_CONFIGS[type];
    if (viewport.isMobile) {
      return config.defaultSize.mobile;
    } else if (viewport.isTablet) {
      return config.defaultSize.tablet;
    }
    return config.defaultSize.desktop;
  }, [viewport]);

  const generatePosition = useCallback(() => {
    const padding = viewport.isMobile ? 10 : viewport.isTablet ? 20 : 50;
    const offset = (portals.length * (viewport.isMobile ? 20 : 50)) % (viewport.isMobile ? 100 : 300);

    // On mobile, stack portals more carefully
    if (viewport.isMobile) {
      return {
        x: padding,
        y: padding + offset
      };
    }

    return {
      x: padding + offset,
      y: padding + offset
    };
  }, [portals.length, viewport]);

  const createPortal = useCallback((type: keyof typeof PORTAL_CONFIGS) => {
    const config = PORTAL_CONFIGS[type];
    const size = getResponsiveSize(type);

    // On mobile, ensure portal fits within viewport
    const maxWidth = viewport.width - (viewport.isMobile ? 20 : 100);
    const maxHeight = viewport.height - (viewport.isMobile ? 100 : 150);

    const newPortal: PortalInstance = {
      id: `portal-${nextId}`,
      type,
      title: config.title,
      component: config.component,
      position: generatePosition(),
      size: {
        width: Math.min(size.width, maxWidth),
        height: Math.min(size.height, maxHeight)
      },
      isVisible: true,
      zIndex: maxZIndex + 1
    };
    
    setMaxZIndex(prev => prev + 1);

    setPortals(prev => [...prev, newPortal]);
    setNextId(prev => prev + 1);
    setActivePortalId(newPortal.id); // Make new portal active by default

    // Close mobile menu after creating portal
    if (viewport.isMobile) {
      setShowMobileMenu(false);
    }
  }, [nextId, generatePosition, getResponsiveSize, viewport, maxZIndex]);

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

  // Handle portal launching from custom events
  useEffect(() => {
    const handleLaunchPortal = (event: CustomEvent) => {
      const { portalType } = event.detail;
      if (portalType && PORTAL_CONFIGS[portalType as keyof typeof PORTAL_CONFIGS]) {
        createPortal(portalType as keyof typeof PORTAL_CONFIGS);
      }
    };

    const handleCloseAllPortals = () => {
      setPortals([]);
    };

    const handleShowHelp = () => {
      // TODO: Implement help overlay
      alert('Help overlay coming soon! Use hot corners or Ctrl+K to access portals.');
    };

    window.addEventListener('launchPortal', handleLaunchPortal as EventListener);
    window.addEventListener('closeAllPortals', handleCloseAllPortals as EventListener);
    window.addEventListener('showHelp', handleShowHelp as EventListener);

    return () => {
      window.removeEventListener('launchPortal', handleLaunchPortal as EventListener);
      window.removeEventListener('closeAllPortals', handleCloseAllPortals as EventListener);
      window.removeEventListener('showHelp', handleShowHelp as EventListener);
    };
  }, [createPortal]);

  const bringToFront = useCallback((id: string) => {
    setActivePortalId(id);
    setMaxZIndex(prev => prev + 1);
    
    // Update the portal's z-index to be the highest
    setPortals(prev => prev.map(portal => {
      if (portal.id === id) {
        return { ...portal, zIndex: maxZIndex + 1 };
      }
      return portal;
    }));
  }, [maxZIndex]);

  const minimizePortal = useCallback((id: string) => {
    setPortals(prev => prev.map(portal =>
      portal.id === id
        ? { ...portal, isMinimized: !portal.isMinimized }
        : portal
    ));
  }, []);

  const maximizePortal = useCallback((id: string) => {
    const padding = viewport.isMobile ? 10 : 50;
    setPortals(prev => prev.map(portal =>
      portal.id === id
        ? {
          ...portal,
          position: { x: padding, y: padding },
          size: {
            width: viewport.width - (padding * 2),
            height: viewport.height - (viewport.isMobile ? 120 : 150)
          }
        }
        : portal
    ));
  }, [viewport]);

  const handleThinkTokensToggle = useCallback((visible: boolean) => {
    setShowThinkTokens(visible);
  }, []);

  // Real system status updates from UAIP API
  useEffect(() => {
    const updateSystemStatus = async () => {
      const startTime = Date.now();

      try {
        // Get environment and connection info from UAIP API
        const envInfo = uaipAPI.getEnvironmentInfo();

        // Check WebSocket connection status
        const isWebSocketConnected = envInfo.websocketConnected;

        // Try to get system health from the API client
        let systemHealth: 'online' | 'degraded' | 'offline' = 'offline';
        let connectionCount = 0;
        let responseTime = 0;

        try {
          // Try to use agents endpoint but handle auth errors gracefully
          const agentsResponse = await uaipAPI.agents.list();
          responseTime = Date.now() - startTime;

          if (agentsResponse && Array.isArray(agentsResponse)) {
            systemHealth = 'online';
            // Estimate connections based on WebSocket status and successful API response
            connectionCount = isWebSocketConnected ? 2 : 1; // API + WebSocket or just API
          } else {
            systemHealth = 'degraded';
            connectionCount = isWebSocketConnected ? 1 : 0;
          }
        } catch (apiError) {
          responseTime = Date.now() - startTime;

          // If it's an authentication error, consider the system online but require auth
          if (apiError instanceof Error &&
            (apiError.message.includes('401') ||
              apiError.message.includes('unauthorized') ||
              apiError.message.includes('Authorization token required'))) {
            // Auth error means the API is working but user needs to authenticate
            systemHealth = 'online';
            connectionCount = isWebSocketConnected ? 2 : 1;
          } else if (apiError instanceof Error &&
            (apiError.message.includes('fetch') ||
              apiError.message.includes('network') ||
              apiError.message.includes('Failed to fetch'))) {
            // Network error means the API is not reachable
            systemHealth = 'offline';
            connectionCount = 0;
          } else {
            // Other errors suggest system issues
            systemHealth = 'degraded';
            connectionCount = isWebSocketConnected ? 1 : 0;
          }
        }

        // Update state with real data
        setSystemStatus(systemHealth);
        setActiveConnections(connectionCount);
        setSystemMetrics({
          apiResponseTime: responseTime,
          lastHealthCheck: new Date(),
          environment: envInfo.isDevelopment ? 'development' : 'production'
        });

      } catch (error) {
        console.error('[PortalWorkspace] Failed to update system status:', error);
        // Fallback to offline status on error
        setSystemStatus('offline');
        setActiveConnections(0);
        setSystemMetrics({
          apiResponseTime: Date.now() - startTime,
          lastHealthCheck: new Date(),
          environment: 'unknown'
        });
      }
    };

    // Initial status check
    updateSystemStatus();

    // Set up periodic status updates every 10 seconds
    const interval = setInterval(updateSystemStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: typeof systemStatus) => {
    switch (status) {
      case 'online': return 'text-green-400';
      case 'degraded': return 'text-yellow-400';
      case 'offline': return 'text-red-400';
    }
  };

  // --- Hotkey handler ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Helper to match hotkey string
      const matchHotkey = (hotkey: string) => {
        const [mod, key] = hotkey.split('+');
        return e.altKey === (mod === 'Alt') && e.key === key.replace(/\d/, d => d);
      };
      // Core
      HOTKEYS.core.forEach((hotkey, idx) => {
        if (matchHotkey(hotkey)) {
          const portalKey = PORTAL_GROUPS.core.portals[idx];
          if (portalKey) togglePortal(portalKey as keyof typeof PORTAL_CONFIGS);
        }
      });
      // Intelligence
      HOTKEYS.intelligence.forEach((hotkey, idx) => {
        if (matchHotkey(hotkey)) {
          const portalKey = PORTAL_GROUPS.intelligence.portals[idx];
          if (portalKey) togglePortal(portalKey as keyof typeof PORTAL_CONFIGS);
        }
      });
      // System
      HOTKEYS.system.forEach((hotkey, idx) => {
        if (matchHotkey(hotkey)) {
          const portalKey = PORTAL_GROUPS.system.portals[idx];
          if (portalKey) togglePortal(portalKey as keyof typeof PORTAL_CONFIGS);
        }
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePortal]);

  // --- Live Clock ---
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock(now.toLocaleString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // --- Geolocation and Weather ---
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setLocation(loc => ({ ...loc, lat, lon }));
      // Reverse geocode to get city/country
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const geoData = await geoRes.json();
        setLocation(loc => ({ ...loc, city: geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.hamlet, country: geoData.address.country }));
      } catch (error) {
        console.warn('Failed to get location data:', error);
      }
      // Weather (OpenWeatherMap, metric, icon)
      try {
        const apiKey = 'demo'; // Replace with your OpenWeatherMap API key
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const weatherData = await weatherRes.json();
        if (weatherData.current_weather) {
          setWeather({
            temp: weatherData.current_weather.temperature,
            icon: weatherData.current_weather.weathercode,
            desc: weatherData.current_weather.weathercode // OpenMeteo uses codes, you can map to icons
          });
        }
      } catch (error) {
        console.warn('Failed to get weather data:', error);
      }
    }, (err) => {
      console.warn('Geolocation not available:', err);
    });
  }, []);

  // Weather icon mapping (OpenMeteo codes)
  const getWeatherIcon = (code?: string | number) => {
    if (!code) return <Cloud className="w-4 h-4 text-slate-400" />;
    // Simple mapping for demo
    if ([0].includes(Number(code))) return <Sun className="w-4 h-4 text-yellow-400" />;
    if ([1, 2, 3].includes(Number(code))) return <CloudSun className="w-4 h-4 text-yellow-300" />;
    if ([45, 48].includes(Number(code))) return <Cloud className="w-4 h-4 text-slate-400" />;
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(Number(code))) return <CloudRain className="w-4 h-4 text-blue-400" />;
    if ([71, 73, 75, 77, 85, 86].includes(Number(code))) return <CloudSnow className="w-4 h-4 text-cyan-200" />;
    return <Cloud className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {/*  Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, #3b82f6 0%, transparent 50%),
                           radial-gradient(circle at 75% 75%, #8b5cf6 0%, transparent 50%),
                           radial-gradient(circle at 75% 25%, #06d6a0 0%, transparent 50%),
                           radial-gradient(circle at 25% 75%, #f59e0b 0%, transparent 50%)`
        }} />
      </div>

      {/* Global Action Search Bar */}
      <GlobalActionSearchBar />

      {/* Hot Corners */}
      <HotCornerMenu
        corner="top-left"
        groupKey="core"
        portals={portals}
        togglePortal={togglePortal}
        show={showTopLeft}
        setShow={setShowTopLeft}
      />
      <HotCornerMenu
        corner="top-right"
        groupKey="intelligence"
        portals={portals}
        togglePortal={togglePortal}
        show={showTopRight}
        setShow={setShowTopRight}
      />
      <HotCornerMenu
        corner="bottom-left"
        groupKey="system"
        portals={portals}
        togglePortal={togglePortal}
        show={showBottomLeft}
        setShow={setShowBottomLeft}
      />
      <HotCornerMenu
        corner="bottom-right"
        portals={portals}
        togglePortal={togglePortal}
        closeAll={() => setPortals([])}
        systemStatus={systemStatus}
        systemMetrics={systemMetrics}
        show={showBottomRight}
        setShow={setShowBottomRight}
      />

      {/* Mobile Menu Button */}
      {viewport.isMobile && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="fixed top-4 left-4 z-50 w-12 h-12 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl flex items-center justify-center text-white"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </motion.button>
      )}

      {/* Mobile Portal Menu */}
      <AnimatePresence>
        {viewport.isMobile && showMobileMenu && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-4 right-4 z-40 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4"
          >
            <div className="text-white text-sm font-semibold mb-4 flex items-center gap-2">
              <Layout className="w-4 h-4" />
              Portal Hub
              <div className={`w-2 h-2 rounded-full ${systemStatus === 'online' ? 'bg-green-400 animate-pulse' : systemStatus === 'degraded' ? 'bg-yellow-400' : 'bg-red-400'}`} />
            </div>

            <div className="space-y-4">
              {Object.entries(PORTAL_GROUPS).map(([groupKey, group]) => (
                <div key={groupKey} className="space-y-2">
                  <div className={`text-xs font-medium ${group.colorClasses.text} uppercase tracking-wider px-2`}>
                    {group.title}
                  </div>
                  <div className="space-y-2">
                    {group.portals.map(portalKey => {
                      const config = PORTAL_CONFIGS[portalKey as keyof typeof PORTAL_CONFIGS];
                      const isActive = portals.some(p => p.type === portalKey);
                      const Icon = config.icon;

                      return (
                        <motion.button
                          key={portalKey}
                          onClick={() => togglePortal(portalKey as keyof typeof PORTAL_CONFIGS)}
                          className={`
                            flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 relative w-full
                            ${isActive
                              ? `bg-gradient-to-br ${group.colorClasses.bg} ${group.colorClasses.border} ${group.colorClasses.text}`
                              : 'bg-slate-800/50 border-slate-700/50 text-slate-400'
                            }
                          `}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Icon className="w-5 h-5 flex-shrink-0" />
                          <div className="text-left min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{config.title}</div>
                            <div className="text-xs opacity-70 truncate">{config.description}</div>
                          </div>
                          {isActive && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className={`w-2 h-2 ${group.colorClasses.accent} rounded-full flex-shrink-0`}
                            />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {portals.length > 0 && (
              <div className="border-t border-slate-700/50 pt-3 mt-3">
                <motion.button
                  onClick={() => {
                    setPortals([]);
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-red-500/20 border border-red-500/50 text-red-400 rounded-xl"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Plus className="w-4 h-4 rotate-45" />
                  <span className="text-sm font-medium">Close All Portals</span>
                </motion.button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimized Portals Bar */}
      {portals.some(p => p.isMinimized) && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`fixed z-40 ${viewport.isMobile
            ? 'bottom-4 left-4 right-4'
            : 'bottom-20 left-1/2 -translate-x-1/2'
            }`}
        >
          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 py-2">
            <div className={`flex items-center gap-2 ${viewport.isMobile ? 'flex-wrap' : ''}`}>
              {portals.filter(p => p.isMinimized).map(portal => {
                const config = PORTAL_CONFIGS[portal.type];
                const Icon = config.icon;
                return (
                  <motion.button
                    key={portal.id}
                    onClick={() => minimizePortal(portal.id)}
                    className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors min-w-0"
                    whileHover={{ scale: 1.05 }}
                  >
                    <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-xs text-slate-300 truncate">{portal.title}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Desktop Workspace - Always visible as base layer */}
      <DesktopWorkspace
        onOpenPortal={createPortal}
        isPortalOpen={(type) => portals.some(p => p.type === type && p.isVisible)}
        portals={portals}
        viewport={viewport}
      />

      {/* Portal Instances - Float above desktop */}
      <AnimatePresence>
        {portals.filter(p => !p.isMinimized).map((portal, index) => {
          const config = PORTAL_CONFIGS[portal.type];
          const PortalComponent = portal.component;

          // Use the portal's stored z-index, with active portal getting a boost
          const finalZIndex = activePortalId === portal.id ? 
            (portal.zIndex || 1000) + 10000 : 
            (portal.zIndex || 1000 + index);

          return (
            <Portal
              key={portal.id}
              id={portal.id}
              type={config.type}
              title={portal.title}
              initialPosition={portal.position}
              initialSize={portal.size}
              zIndex={finalZIndex}
              onClose={() => closePortal(portal.id)}
              onMaximize={() => maximizePortal(portal.id)}
              onMinimize={() => minimizePortal(portal.id)}
              onFocus={() => bringToFront(portal.id)}
              viewport={viewport}
            >
              <PortalComponent
                mode={portal.type === 'intelligence-hub' ? 'insights' : portal.type === 'monitoring-hub' ? 'monitor' : undefined}
                viewport={viewport}
                showThinkTokens={portal.type === 'discussion-hub' ? showThinkTokens : undefined}
                onThinkTokensToggle={portal.type === 'discussion-hub' ? handleThinkTokensToggle : undefined}
              />
            </Portal>
          );
        })}
      </AnimatePresence>

      {/* Enhanced Status Bar */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`fixed z-30 ${viewport.isMobile
          ? 'bottom-4 left-4 right-4'
          : 'bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl'
          }`}
      >
        <div className="flex items-center justify-between gap-6 px-6 py-3 rounded-2xl shadow-xl bg-slate-900/70 backdrop-blur-xl border border-slate-800/60">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className={`relative flex h-3 w-3`}>
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${systemStatus === 'online' ? 'bg-green-400' : systemStatus === 'degraded' ? 'bg-yellow-400' : 'bg-red-400'
                } opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${systemStatus === 'online' ? 'bg-green-400' : systemStatus === 'degraded' ? 'bg-yellow-400' : 'bg-red-400'
                }`}></span>
            </span>
            <span className="font-medium text-slate-200">System</span>
            <span className={`font-semibold ${systemStatus === 'online' ? 'text-green-400' : systemStatus === 'degraded' ? 'text-yellow-400' : 'text-red-400'
              }`}>{systemStatus.toUpperCase()}</span>
            {systemMetrics.apiResponseTime && (
              <span className="ml-2 text-xs text-slate-400">({systemMetrics.apiResponseTime}ms)</span>
            )}
          </div>

          {/* Portals & Activity */}
          <div className="flex items-center gap-4">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-slate-200">{activeConnections} Active</span>
            <Terminal className="w-4 h-4 text-purple-400" />
            <span className="text-slate-200">{portals.length} Portal{portals.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Time & Weather */}
          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-mono text-xs">{clock.split(',')[1]?.trim()}</span>
            {weather && (
              <span className="flex items-center gap-1">
                {getWeatherIcon(weather.icon)}
                <span className="text-slate-200">{weather.temp}°C</span>
              </span>
            )}
            {location.city && (
              <span className="flex items-center gap-1 text-slate-400 text-xs">
                <MapPin className="w-4 h-4" />
                {location.city}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}; 