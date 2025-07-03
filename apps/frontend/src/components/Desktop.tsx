import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Bot,
  Package,
  MessageSquare,
  Brain,
  Settings,
  BarChart3,
  Search,
  Target,
  TrendingUp,
  Wrench,
  Plus,
  User,
  Activity,
  Clock,
  X,
  Maximize2,
  Minimize2,
  Shield,
  Menu,
  Power,
  Monitor,
  Folder,
  Terminal,
  Globe,
  Calculator,
  Camera,
  Music,
  Image,
  FileText,
  Command
} from 'lucide-react';

// Import portal components
import { DashboardPortal } from './futuristic/portals/DashboardPortal';
import { AgentManagerPortal } from './futuristic/portals/AgentManagerPortal';
import { ChatPortal } from './futuristic/portals/ChatPortal';
import { KnowledgePortal } from './futuristic/portals/KnowledgePortal';
import { SettingsPortal } from './futuristic/portals/SettingsPortal';
import { ArtifactsPortal } from './futuristic/portals/ArtifactsPortal';
import { IntelligencePanelPortal } from './futuristic/portals/IntelligencePanelPortal';
import { SecurityPortal } from './futuristic/portals/SecurityPortal';
import { SystemConfigPortal } from './futuristic/portals/SystemConfigPortal';
import { ToolManagementPortal } from './futuristic/portals/ToolManagementPortal';
import { DiscussionControlsPortal } from './futuristic/portals/DiscussionControlsPortal';
import { ProviderSettingsPortal } from './futuristic/portals/ProviderSettingsPortal';

interface Application {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  color: string;
  component: React.ComponentType<any>;
}

interface OpenWindow {
  id: string;
  app: Application;
  isMinimized: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

const APPLICATIONS: Application[] = [
  { id: 'dashboard', title: 'Dashboard', icon: Home, color: 'text-blue-400', component: DashboardPortal },
  { id: 'agents', title: 'Agent Manager', icon: Bot, color: 'text-cyan-400', component: AgentManagerPortal },
  { id: 'chat', title: 'Chat Portal', icon: MessageSquare, color: 'text-green-400', component: ChatPortal },
  { id: 'knowledge', title: 'Knowledge Graph', icon: Brain, color: 'text-orange-400', component: KnowledgePortal },
  { id: 'artifacts', title: 'Artifacts', icon: Package, color: 'text-purple-400', component: ArtifactsPortal },
  { id: 'settings', title: 'Settings', icon: Settings, color: 'text-gray-400', component: SettingsPortal },
  { id: 'intelligence', title: 'Intelligence', icon: BarChart3, color: 'text-pink-400', component: IntelligencePanelPortal },
  { id: 'security', title: 'Security', icon: Shield, color: 'text-red-400', component: SecurityPortal },
  { id: 'system', title: 'System Config', icon: Target, color: 'text-indigo-400', component: SystemConfigPortal },
  { id: 'tools', title: 'Tool Manager', icon: Wrench, color: 'text-violet-400', component: ToolManagementPortal },
  { id: 'discussion', title: 'Discussion Hub', icon: TrendingUp, color: 'text-emerald-400', component: DiscussionControlsPortal },
  { id: 'providers', title: 'Providers', icon: Plus, color: 'text-yellow-400', component: ProviderSettingsPortal },
];

const DesktopIcon: React.FC<{
  app: Application;
  onDoubleClick: () => void;
}> = ({ app, onDoubleClick }) => {
  const Icon = app.icon;
  
  return (
    <motion.div
      className="w-20 h-24 flex flex-col items-center justify-center cursor-pointer group select-none"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onDoubleClick={onDoubleClick}
    >
      <div className="w-16 h-16 rounded-2xl bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 flex items-center justify-center group-hover:bg-slate-700/60 group-hover:border-slate-600/60 transition-all duration-200">
        <Icon className={`w-8 h-8 ${app.color}`} />
      </div>
      <span className={`mt-2 text-xs ${app.color} font-medium text-center max-w-full truncate px-1 leading-tight`}>
        {app.title}
      </span>
    </motion.div>
  );
};

const Window: React.FC<{
  window: OpenWindow;
  onClose: () => void;
  onMinimize: () => void;
  onFocus: () => void;
  isActive: boolean;
}> = ({ window, onClose, onMinimize, onFocus, isActive }) => {
  const [isDragging, setIsDragging] = useState(false);
  const Component = window.app.component;
  const Icon = window.app.icon;

  if (window.isMinimized) return null;

  return (
    <motion.div
      drag
      dragMomentum={false}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      style={{
        position: 'fixed',
        left: window.position.x,
        top: window.position.y,
        width: window.size.width,
        height: window.size.height,
        zIndex: window.zIndex,
      }}
      className={`bg-slate-900/95 backdrop-blur-xl rounded-xl border ${
        isActive ? 'border-blue-500/50 shadow-2xl shadow-blue-500/20' : 'border-slate-700/50'
      } overflow-hidden flex flex-col`}
      onClick={onFocus}
    >
      {/* Window Header */}
      <div 
        className={`h-12 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between px-4 cursor-move select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseDown={onFocus}
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-4 h-4 ${window.app.color}`} />
          <span className="text-white text-sm font-medium truncate">{window.app.title}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMinimize();
            }}
            className="w-6 h-6 rounded bg-yellow-500/20 hover:bg-yellow-500/40 flex items-center justify-center transition-colors"
          >
            <Minimize2 className="w-3 h-3 text-yellow-400" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-6 h-6 rounded bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center transition-colors"
          >
            <X className="w-3 h-3 text-red-400" />
          </button>
        </div>
      </div>

      {/* Window Content */}
      <div className="flex-1 overflow-auto bg-white/5">
        <Component viewport={{ width: window.size.width, height: window.size.height, isMobile: false, isTablet: false, isDesktop: true }} />
      </div>
    </motion.div>
  );
};

const ActionsMenu: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onAppSelect: (app: Application) => void;
  applications: Application[];
}> = ({ isOpen, onClose, onAppSelect, applications }) => {
  if (!isOpen) return null;

  const categories = {
    core: applications.filter(app => ['dashboard', 'agents', 'chat'].includes(app.id)),
    tools: applications.filter(app => ['tools', 'system', 'settings', 'providers'].includes(app.id)),
    data: applications.filter(app => ['knowledge', 'artifacts', 'intelligence'].includes(app.id)),
    security: applications.filter(app => ['security', 'discussion'].includes(app.id))
  };

  const quickActions = [
    { icon: Terminal, label: 'Terminal', action: () => console.log('Opening terminal...') },
    { icon: Folder, label: 'Files', action: () => console.log('Opening file manager...') },
    { icon: Calculator, label: 'Calculator', action: () => console.log('Opening calculator...') },
    { icon: Globe, label: 'Browser', action: () => window.open('https://google.com', '_blank') },
  ];

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      
      {/* Menu */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed bottom-16 left-4 w-80 bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl z-50 overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">🏛️</span>
            </div>
            <div>
              <h3 className="text-white font-semibold">Council of Nycea</h3>
              <p className="text-slate-400 text-xs">Actions Menu</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="p-4 border-b border-slate-700/50">
          <h4 className="text-slate-300 text-sm font-medium mb-3">Quick Actions</h4>
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={() => {
                  action.action();
                  onClose();
                }}
                className="p-3 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 transition-colors group"
              >
                <action.icon className="w-6 h-6 text-slate-400 group-hover:text-white mx-auto mb-1" />
                <span className="text-xs text-slate-400 group-hover:text-white block truncate">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Applications by Category */}
        <div className="max-h-96 overflow-y-auto">
          {Object.entries(categories).map(([category, apps]) => (
            <div key={category} className="p-4 border-b border-slate-700/30 last:border-b-0">
              <h4 className="text-slate-300 text-sm font-medium mb-3 capitalize">{category} Applications</h4>
              <div className="space-y-1">
                {apps.map((app) => {
                  const Icon = app.icon;
                  return (
                    <button
                      key={app.id}
                      onClick={() => {
                        onAppSelect(app);
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors group"
                    >
                      <Icon className={`w-5 h-5 ${app.color} group-hover:scale-110 transition-transform`} />
                      <span className="text-slate-300 group-hover:text-white text-sm truncate">{app.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* System Actions */}
        <div className="p-4 border-t border-slate-700/50">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                console.log('Toggle shortcuts');
                onClose();
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
            >
              <Command className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400">Toggle Shortcuts</span>
            </button>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to sign out?')) {
                  console.log('Signing out...');
                }
                onClose();
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors"
            >
              <Power className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400">Sign Out</span>
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

const ShortcutBar: React.FC<{
  isVisible: boolean;
  onAppSelect: (app: Application) => void;
  applications: Application[];
}> = ({ isVisible, onAppSelect, applications }) => {
  if (!isVisible) return null;

  const favoriteApps = applications.slice(0, 6); // First 6 apps as favorites

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-30"
    >
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-xl">
        {favoriteApps.map((app) => {
          const Icon = app.icon;
          return (
            <button
              key={app.id}
              onClick={() => onAppSelect(app)}
              className="p-2 rounded-xl hover:bg-slate-700/50 transition-colors group"
              title={app.title}
            >
              <Icon className={`w-5 h-5 ${app.color} group-hover:scale-110 transition-transform`} />
            </button>
          );
        })}
        
        {/* Search shortcut */}
        <div className="w-px h-6 bg-slate-700/50 mx-1" />
        <button
          className="p-2 rounded-xl hover:bg-slate-700/50 transition-colors group"
          title="Global Search (Ctrl+K)"
        >
          <Search className="w-5 h-5 text-slate-400 group-hover:text-white group-hover:scale-110 transition-all" />
        </button>
      </div>
    </motion.div>
  );
};

const Taskbar: React.FC<{
  windows: OpenWindow[];
  onWindowClick: (id: string) => void;
  onActionsMenuToggle: () => void;
  time: string;
}> = ({ windows, onWindowClick, onActionsMenuToggle, time }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 h-12 bg-slate-900/90 backdrop-blur-xl border-t border-slate-700/50 flex items-center justify-between px-4">
      {/* Start Button */}
      <button 
        onClick={onActionsMenuToggle}
        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/50 transition-colors group"
      >
        <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
          <span className="text-white font-bold text-sm">🏛️</span>
        </div>
        <span className="text-white font-medium text-sm hidden md:inline group-hover:text-blue-200">Council of Nycea</span>
      </button>

      {/* Window Buttons */}
      <div className="flex-1 flex items-center gap-2 mx-4 overflow-hidden">
        {windows.map((window) => {
          const Icon = window.app.icon;
          return (
            <button
              key={window.id}
              onClick={() => onWindowClick(window.id)}
              className={`h-8 px-3 rounded flex items-center gap-2 transition-colors ${
                window.isMinimized 
                  ? 'bg-slate-700/50 text-slate-400' 
                  : 'bg-slate-600/50 text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs truncate max-w-20">{window.app.title}</span>
            </button>
          );
        })}
      </div>

      {/* System Tray */}
      <div className="flex items-center gap-3 text-slate-300">
        <div className="hidden sm:flex items-center gap-2">
          <Activity className="w-4 h-4 text-green-400" />
          <span className="text-xs">Online</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-mono">{time}</span>
        </div>
      </div>
    </div>
  );
};

export const Desktop: React.FC = () => {
  const [time, setTime] = useState('');
  const [windows, setWindows] = useState<OpenWindow[]>([]);
  const [nextZIndex, setNextZIndex] = useState(100);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showShortcutBar, setShowShortcutBar] = useState(true);

  // Update time
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const openApplication = (app: Application) => {
    // Check if app is already open
    const existingWindow = windows.find(w => w.app.id === app.id);
    if (existingWindow) {
      // Bring to front and unminimize
      setWindows(prev => prev.map(w => 
        w.id === existingWindow.id 
          ? { ...w, isMinimized: false, zIndex: nextZIndex }
          : w
      ));
      setNextZIndex(prev => prev + 1);
      setActiveWindowId(existingWindow.id);
      return;
    }

    // Create new window
    const newWindow: OpenWindow = {
      id: `${app.id}-${Date.now()}`,
      app,
      isMinimized: false,
      position: { 
        x: 100 + (windows.length * 30), 
        y: 100 + (windows.length * 30) 
      },
      size: { width: 800, height: 600 },
      zIndex: nextZIndex
    };

    setWindows(prev => [...prev, newWindow]);
    setNextZIndex(prev => prev + 1);
    setActiveWindowId(newWindow.id);
  };

  const closeWindow = (windowId: string) => {
    setWindows(prev => prev.filter(w => w.id !== windowId));
    if (activeWindowId === windowId) {
      setActiveWindowId(null);
    }
  };

  const minimizeWindow = (windowId: string) => {
    setWindows(prev => prev.map(w => 
      w.id === windowId ? { ...w, isMinimized: true } : w
    ));
    if (activeWindowId === windowId) {
      setActiveWindowId(null);
    }
  };

  const focusWindow = (windowId: string) => {
    setWindows(prev => prev.map(w => 
      w.id === windowId 
        ? { ...w, zIndex: nextZIndex, isMinimized: false }
        : w
    ));
    setNextZIndex(prev => prev + 1);
    setActiveWindowId(windowId);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K for global search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        console.log('Global search triggered');
      }
      
      // Alt+Space for actions menu
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        setShowActionsMenu(!showActionsMenu);
      }
      
      // Ctrl+Shift+T for shortcut bar toggle
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setShowShortcutBar(!showShortcutBar);
      }
      
      // Escape to close menu
      if (e.key === 'Escape') {
        setShowActionsMenu(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showActionsMenu, showShortcutBar]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950/10 to-slate-950 relative">
      {/* Shortcut Bar */}
      <AnimatePresence>
        <ShortcutBar
          isVisible={showShortcutBar}
          onAppSelect={openApplication}
          applications={APPLICATIONS}
        />
      </AnimatePresence>

      {/* Desktop Icons */}
      <div className="p-8 pb-20">
        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-6">
          {APPLICATIONS.map((app) => (
            <DesktopIcon
              key={app.id}
              app={app}
              onDoubleClick={() => openApplication(app)}
            />
          ))}
        </div>
      </div>

      {/* Windows */}
      <AnimatePresence>
        {windows.map((window) => (
          <Window
            key={window.id}
            window={window}
            onClose={() => closeWindow(window.id)}
            onMinimize={() => minimizeWindow(window.id)}
            onFocus={() => focusWindow(window.id)}
            isActive={activeWindowId === window.id}
          />
        ))}
      </AnimatePresence>

      {/* Actions Menu */}
      <AnimatePresence>
        <ActionsMenu
          isOpen={showActionsMenu}
          onClose={() => setShowActionsMenu(false)}
          onAppSelect={openApplication}
          applications={APPLICATIONS}
        />
      </AnimatePresence>

      {/* Taskbar */}
      <Taskbar
        windows={windows}
        onWindowClick={focusWindow}
        onActionsMenuToggle={() => setShowActionsMenu(!showActionsMenu)}
        time={time}
      />
    </div>
  );
};