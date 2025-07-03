import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Bot, Package, MessageSquare, Brain, Settings, BarChart3, Search, Target, TrendingUp, 
  Wrench, Plus, User, Activity, Clock, X, Minimize2, Shield, Menu, Power, Monitor, Folder, 
  Terminal, Globe, Calculator, Command
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

// Design System Tokens
const DESIGN_TOKENS = {
  colors: {
    primary: 'from-blue-400 to-cyan-400',
    surface: 'bg-slate-900/90',
    surfaceHover: 'hover:bg-slate-700/50',
    border: 'border-slate-700/50',
    text: 'text-white',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-400',
  },
  spacing: {
    xs: 'gap-2',
    sm: 'gap-3', 
    md: 'gap-4',
    lg: 'gap-6',
  },
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl', 
    lg: 'rounded-2xl',
  },
  padding: {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  },
  backdrop: 'backdrop-blur-xl',
  transition: 'transition-all duration-200',
  shadow: 'shadow-xl',
};

interface Application {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  color: string;
  component: React.ComponentType<any>;
  category: 'core' | 'tools' | 'data' | 'security';
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
  { id: 'dashboard', title: 'Dashboard', icon: Home, color: 'text-blue-400', component: DashboardPortal, category: 'core' },
  { id: 'agents', title: 'Agent Manager', icon: Bot, color: 'text-cyan-400', component: AgentManagerPortal, category: 'core' },
  { id: 'chat', title: 'Chat Portal', icon: MessageSquare, color: 'text-green-400', component: ChatPortal, category: 'core' },
  { id: 'knowledge', title: 'Knowledge Graph', icon: Brain, color: 'text-orange-400', component: KnowledgePortal, category: 'data' },
  { id: 'artifacts', title: 'Artifacts', icon: Package, color: 'text-purple-400', component: ArtifactsPortal, category: 'data' },
  { id: 'intelligence', title: 'Intelligence', icon: BarChart3, color: 'text-pink-400', component: IntelligencePanelPortal, category: 'data' },
  { id: 'settings', title: 'Settings', icon: Settings, color: 'text-gray-400', component: SettingsPortal, category: 'tools' },
  { id: 'system', title: 'System Config', icon: Target, color: 'text-indigo-400', component: SystemConfigPortal, category: 'tools' },
  { id: 'tools', title: 'Tool Manager', icon: Wrench, color: 'text-violet-400', component: ToolManagementPortal, category: 'tools' },
  { id: 'providers', title: 'Providers', icon: Plus, color: 'text-yellow-400', component: ProviderSettingsPortal, category: 'tools' },
  { id: 'security', title: 'Security', icon: Shield, color: 'text-red-400', component: SecurityPortal, category: 'security' },
  { id: 'discussion', title: 'Discussion Hub', icon: TrendingUp, color: 'text-emerald-400', component: DiscussionControlsPortal, category: 'security' },
];

const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ children, onClick, variant = 'ghost', size = 'md', className = '' }) => {
  const variants = {
    primary: `bg-gradient-to-r ${DESIGN_TOKENS.colors.primary} text-white hover:scale-105`,
    secondary: `${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.surfaceHover} ${DESIGN_TOKENS.colors.text}`,
    ghost: `${DESIGN_TOKENS.colors.surfaceHover} ${DESIGN_TOKENS.colors.textSecondary}`,
    danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
  };
  
  const sizes = {
    sm: `${DESIGN_TOKENS.padding.sm} text-xs`,
    md: `${DESIGN_TOKENS.padding.md} text-sm`, 
    lg: `${DESIGN_TOKENS.padding.lg} text-base`,
  };

  return (
    <button
      onClick={onClick}
      className={`
        ${variants[variant]} ${sizes[size]} ${DESIGN_TOKENS.radius.md} 
        ${DESIGN_TOKENS.transition} flex items-center ${DESIGN_TOKENS.spacing.sm}
        ${className}
      `}
    >
      {children}
    </button>
  );
};

const DesktopIcon: React.FC<{ app: Application; onDoubleClick: () => void }> = ({ app, onDoubleClick }) => {
  const Icon = app.icon;
  
  return (
    <motion.div
      className="w-20 h-24 flex flex-col items-center justify-center cursor-pointer group select-none"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onDoubleClick={onDoubleClick}
    >
      <div className={`
        w-16 h-16 ${DESIGN_TOKENS.radius.lg} ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.border} border
        flex items-center justify-center group-hover:bg-slate-700/60 group-hover:border-slate-600/60 
        ${DESIGN_TOKENS.transition}
      `}>
        <Icon className={`w-8 h-8 ${app.color}`} />
      </div>
      <span className={`mt-2 text-xs ${app.color} font-medium text-center max-w-full truncate px-1`}>
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
      className={`
        ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.radius.md} 
        ${isActive ? 'border-blue-500/50 shadow-2xl shadow-blue-500/20' : DESIGN_TOKENS.colors.border} border
        overflow-hidden flex flex-col
      `}
      onClick={onFocus}
    >
      {/* Window Header */}
      <div className={`
        h-12 bg-slate-800/50 ${DESIGN_TOKENS.colors.border} border-b 
        flex items-center justify-between px-4 cursor-move select-none
        ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
      `}>
        <div className={`flex items-center ${DESIGN_TOKENS.spacing.sm}`}>
          <Icon className={`w-4 h-4 ${window.app.color}`} />
          <span className={`${DESIGN_TOKENS.colors.text} text-sm font-medium truncate`}>{window.app.title}</span>
        </div>
        
        <div className={`flex items-center ${DESIGN_TOKENS.spacing.xs}`}>
          <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); onMinimize(); }}>
            <Minimize2 className="w-3 h-3" />
          </Button>
          <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <X className="w-3 h-3" />
          </Button>
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
    core: applications.filter(app => app.category === 'core'),
    tools: applications.filter(app => app.category === 'tools'),
    data: applications.filter(app => app.category === 'data'),
    security: applications.filter(app => app.category === 'security'),
  };

  const quickActions = [
    { icon: Terminal, label: 'Terminal', action: () => console.log('Opening terminal...') },
    { icon: Folder, label: 'Files', action: () => console.log('Opening file manager...') },
    { icon: Calculator, label: 'Calculator', action: () => console.log('Opening calculator...') },
    { icon: Globe, label: 'Browser', action: () => window.open('https://google.com', '_blank') },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={onClose} />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`
          fixed bottom-16 left-4 w-80 ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} 
          ${DESIGN_TOKENS.radius.lg} ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.shadow} z-50 overflow-hidden
        `}
      >
        {/* Quick Actions */}
        <div className={`${DESIGN_TOKENS.padding.md} ${DESIGN_TOKENS.colors.border} border-b`}>
          <h4 className={`${DESIGN_TOKENS.colors.textSecondary} text-sm font-medium mb-3`}>Quick Actions</h4>
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                variant="secondary"
                size="sm"
                onClick={() => { action.action(); onClose(); }}
                className="flex-col h-16"
              >
                <action.icon className="w-5 h-5 mb-1" />
                <span className="text-xs truncate">{action.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Applications by Category */}
        <div className="max-h-80 overflow-y-auto">
          {Object.entries(categories).map(([categoryKey, apps]) => (
            <div key={categoryKey} className={`${DESIGN_TOKENS.padding.md} border-b border-slate-700/30 last:border-b-0`}>
              <h4 className={`${DESIGN_TOKENS.colors.textSecondary} text-sm font-medium mb-3 capitalize`}>
                {categoryKey}
              </h4>
              <div className="space-y-1">
                {apps.map((app) => {
                  const Icon = app.icon;
                  return (
                    <Button
                      key={app.id}
                      variant="ghost"
                      onClick={() => { onAppSelect(app); onClose(); }}
                      className="w-full justify-start"
                    >
                      <Icon className={`w-4 h-4 ${app.color}`} />
                      <span className="truncate">{app.title}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* System Actions */}
        <div className={`${DESIGN_TOKENS.padding.md} ${DESIGN_TOKENS.colors.border} border-t`}>
          <div className="flex items-center justify-between">
            <Button variant="secondary" size="sm" onClick={onClose}>
              <Command className="w-4 h-4" />
              Shortcuts
            </Button>
            <Button variant="danger" size="sm" onClick={() => { 
              if (confirm('Sign out?')) console.log('Signing out...'); 
              onClose(); 
            }}>
              <Power className="w-4 h-4" />
              Sign Out
            </Button>
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

  const favoriteApps = applications.slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-30"
    >
      <div className={`
        flex items-center ${DESIGN_TOKENS.spacing.xs} ${DESIGN_TOKENS.padding.sm} 
        ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.radius.lg} 
        ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.shadow}
      `}>
        {favoriteApps.map((app) => {
          const Icon = app.icon;
          return (
            <Button
              key={app.id}
              variant="ghost"
              size="sm"
              onClick={() => onAppSelect(app)}
              className="p-2"
              title={app.title}
            >
              <Icon className={`w-5 h-5 ${app.color}`} />
            </Button>
          );
        })}
        
        <div className="w-px h-6 bg-slate-700/50 mx-1" />
        <Button variant="ghost" size="sm" className="p-2" title="Global Search (Ctrl+K)">
          <Search className="w-5 h-5" />
        </Button>
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
    <div className={`
      fixed bottom-0 left-0 right-0 h-12 ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} 
      ${DESIGN_TOKENS.colors.border} border-t flex items-center justify-between px-4
    `}>
      {/* Start Button */}
      <Button variant="ghost" onClick={onActionsMenuToggle}>
        <div className={`w-8 h-8 bg-gradient-to-br ${DESIGN_TOKENS.colors.primary} ${DESIGN_TOKENS.radius.md} flex items-center justify-center`}>
          <span className="text-white font-bold text-sm">🏛️</span>
        </div>
        <span className="hidden md:inline">Council of Nycea</span>
      </Button>

      {/* Window Buttons */}
      <div className="flex-1 flex items-center gap-2 mx-4 overflow-hidden">
        {windows.map((window) => {
          const Icon = window.app.icon;
          return (
            <Button
              key={window.id}
              variant={window.isMinimized ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onWindowClick(window.id)}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs truncate max-w-20">{window.app.title}</span>
            </Button>
          );
        })}
      </div>

      {/* System Tray */}
      <div className={`flex items-center ${DESIGN_TOKENS.spacing.sm} ${DESIGN_TOKENS.colors.textSecondary}`}>
        <div className={`hidden sm:flex items-center ${DESIGN_TOKENS.spacing.xs}`}>
          <Activity className="w-4 h-4 text-green-400" />
          <span className="text-xs">Online</span>
        </div>
        <div className={`flex items-center ${DESIGN_TOKENS.spacing.xs}`}>
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        console.log('Global search triggered');
      }
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        setShowActionsMenu(!showActionsMenu);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setShowShortcutBar(!showShortcutBar);
      }
      if (e.key === 'Escape') {
        setShowActionsMenu(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showActionsMenu, showShortcutBar]);

  const openApplication = (app: Application) => {
    const existingWindow = windows.find(w => w.app.id === app.id);
    if (existingWindow) {
      setWindows(prev => prev.map(w => 
        w.id === existingWindow.id 
          ? { ...w, isMinimized: false, zIndex: nextZIndex }
          : w
      ));
      setNextZIndex(prev => prev + 1);
      setActiveWindowId(existingWindow.id);
      return;
    }

    const newWindow: OpenWindow = {
      id: `${app.id}-${Date.now()}`,
      app,
      isMinimized: false,
      position: { x: 100 + (windows.length * 30), y: 100 + (windows.length * 30) },
      size: { width: 800, height: 600 },
      zIndex: nextZIndex
    };

    setWindows(prev => [...prev, newWindow]);
    setNextZIndex(prev => prev + 1);
    setActiveWindowId(newWindow.id);
  };

  const closeWindow = (windowId: string) => {
    setWindows(prev => prev.filter(w => w.id !== windowId));
    if (activeWindowId === windowId) setActiveWindowId(null);
  };

  const minimizeWindow = (windowId: string) => {
    setWindows(prev => prev.map(w => 
      w.id === windowId ? { ...w, isMinimized: true } : w
    ));
    if (activeWindowId === windowId) setActiveWindowId(null);
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