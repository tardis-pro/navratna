import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Bot, Package, MessageSquare, Brain, Settings, BarChart3, Search, Target, TrendingUp, 
  Wrench, Plus, User, Activity, Clock, X, Minimize2, Shield, Menu, Power, Monitor, Folder, 
  Terminal, Globe, Calculator, Command, Image, StickyNote, Cloud, Edit3, Save, Trash2,
  Sun, CloudSun, CloudRain, CloudSnow, MapPin, Thermometer, Wind, Droplets
} from 'lucide-react';

// Import portal components
import { DashboardPortal } from './futuristic/portals/DashboardPortal';
import { AgentManager } from './AgentManager';
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
import { MultiChatManager } from './futuristic/portals/MultiChatManager';
import { MiniBrowserPortal } from './futuristic/portals/MiniBrowserPortal';
import { GlobalUpload } from './GlobalUpload';
import { KnowledgeShortcut } from './KnowledgeShortcut';
import { AtomicKnowledgeViewer } from './futuristic/portals/AtomicKnowledgeViewer';

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

interface DesktopNote {
  id: string;
  content: string;
  position: { x: number; y: number };
  color: string;
  timestamp: number;
}

interface WeatherData {
  location: string;
  temperature: number;
  condition: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  forecast?: Array<{
    day: string;
    high: number;
    low: number;
    condition: string;
    icon: string;
  }>;
}

const APPLICATIONS: Application[] = [
  { id: 'dashboard', title: 'Dashboard', icon: Home, color: 'text-blue-400', component: DashboardPortal, category: 'core' },
  { id: 'agents', title: 'Agent Manager', icon: Bot, color: 'text-cyan-400', component: AgentManager, category: 'core' },
  { id: 'chat', title: 'Chat Portal', icon: MessageSquare, color: 'text-green-400', component: ChatPortal, category: 'core' },
  { id: 'knowledge', title: 'Knowledge Graph', icon: Brain, color: 'text-orange-400', component: KnowledgePortal, category: 'data' },
  { id: 'artifacts', title: 'Artifacts', icon: Package, color: 'text-purple-400', component: ArtifactsPortal, category: 'data' },
  { id: 'intelligence', title: 'Intelligence', icon: BarChart3, color: 'text-pink-400', component: IntelligencePanelPortal, category: 'data' },
  { id: 'settings', title: 'Settings', icon: Settings, color: 'text-gray-400', component: SettingsPortal, category: 'tools' },
  { id: 'system', title: 'System Config', icon: Target, color: 'text-indigo-400', component: SystemConfigPortal, category: 'tools' },
  { id: 'tools', title: 'Tool Manager', icon: Wrench, color: 'text-violet-400', component: ToolManagementPortal, category: 'tools' },
  { id: 'providers', title: 'Providers', icon: Plus, color: 'text-yellow-400', component: ProviderSettingsPortal, category: 'tools' },
  { id: 'mini-browser', title: 'Mini Browser', icon: Globe, color: 'text-blue-400', component: MiniBrowserPortal, category: 'tools' },
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
      className="w-16 h-18 flex flex-col items-center justify-start cursor-pointer group select-none mx-auto"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onDoubleClick={onDoubleClick}
    >
      <div className={`
        w-12 h-12 ${DESIGN_TOKENS.radius.lg} ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.border} border
        flex items-center justify-center group-hover:bg-slate-700/60 group-hover:border-slate-600/60 
        ${DESIGN_TOKENS.transition} shadow-lg mb-1
      `}>
        <Icon className={`w-6 h-6 ${app.color}`} />
      </div>
      <span className={`text-xs ${app.color} font-medium text-center w-full truncate px-0.5 drop-shadow-sm leading-tight`}>
        {app.title.replace('Manager', 'Man.').replace('Graph', '...')}
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
        zIndex: isActive ? 1100 : 1000,
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

const DesktopNote: React.FC<{
  note: DesktopNote;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}> = ({ note, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(note.content);

  const handleSave = () => {
    onUpdate(note.id, content);
    setIsEditing(false);
  };

  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      style={{
        position: 'fixed',
        left: note.position.x,
        top: note.position.y,
      }}
      className="w-48 h-48 bg-yellow-200 rounded-lg shadow-lg border border-yellow-300 p-3 cursor-move select-none z-notes"
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-yellow-700 font-medium">
          {new Date(note.timestamp).toLocaleDateString()}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-1 hover:bg-yellow-300 rounded text-yellow-700"
          >
            <Edit3 className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDelete(note.id)}
            className="p-1 hover:bg-red-200 rounded text-red-600"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      
      {isEditing ? (
        <div className="flex flex-col h-32">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 resize-none bg-transparent text-sm text-yellow-800 placeholder-yellow-600 border-none outline-none"
            placeholder="Write your note..."
          />
          <button
            onClick={handleSave}
            className="mt-2 px-2 py-1 bg-yellow-300 hover:bg-yellow-400 text-yellow-800 rounded text-xs font-medium"
          >
            Save
          </button>
        </div>
      ) : (
        <div className="h-32 text-sm text-yellow-800 break-words whitespace-pre-wrap">
          {note.content}
        </div>
      )}
    </motion.div>
  );
};

const WeatherWidget: React.FC<{
  weather: WeatherData;
}> = ({ weather }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const getWeatherIcon = (condition: string) => {
    switch (condition.toLowerCase()) {
      case 'sunny':
      case 'clear':
        return <Sun className="w-6 h-6 text-yellow-400" />;
      case 'partly cloudy':
      case 'cloudy':
        return <CloudSun className="w-6 h-6 text-yellow-300" />;
      case 'rainy':
      case 'rain':
        return <CloudRain className="w-6 h-6 text-blue-400" />;
      case 'snowy':
      case 'snow':
        return <CloudSnow className="w-6 h-6 text-cyan-200" />;
      default:
        return <Cloud className="w-6 h-6 text-slate-400" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-4 right-4 z-weather"
      onMouseEnter={() => {
        setIsHovered(true);
        setShowDetails(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowDetails(false);
      }}
    >
      {/* Collapsed Weather Icon */}
      <motion.div
        animate={{
          opacity: showDetails ? 0 : 1,
          scale: showDetails ? 0.8 : 1
        }}
        transition={{ duration: 0.2 }}
        className={`
          ${showDetails ? 'pointer-events-none' : 'cursor-pointer'}
          ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} 
          ${DESIGN_TOKENS.radius.lg} ${DESIGN_TOKENS.colors.border} border 
          ${DESIGN_TOKENS.shadow} p-3 w-16 h-16 flex items-center justify-center
        `}
      >
        {getWeatherIcon(weather.condition)}
      </motion.div>

      {/* Expanded Weather Details */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 20 }}
            transition={{ duration: 0.2 }}
            className={`
              absolute top-0 right-0
              ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.radius.lg} 
              ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.shadow} p-3 min-w-[200px] max-w-[220px]
            `}
          >
            <div className="flex items-center justify-between mb-2">
              {getWeatherIcon(weather.condition)}
              <div className="text-right">
                <div className={`text-xl font-bold ${DESIGN_TOKENS.colors.text}`}>
                  {weather.temperature}°C
                </div>
                <div className={`text-xs ${DESIGN_TOKENS.colors.textMuted} flex items-center gap-1 justify-end`}>
                  <MapPin className="w-3 h-3" />
                  {weather.location}
                </div>
              </div>
            </div>
            <div className={`text-sm ${DESIGN_TOKENS.colors.textSecondary} mb-2`}>
              {weather.condition}
            </div>
            <div className={`flex justify-between text-xs ${DESIGN_TOKENS.colors.textMuted}`}>
              <span className="flex items-center gap-1">
                <Droplets className="w-3 h-3" />
                {weather.humidity}%
              </span>
              <span className="flex items-center gap-1">
                <Wind className="w-3 h-3" />
                {weather.windSpeed} km/h
              </span>
            </div>
            {weather.forecast && (
              <div className="border-t border-slate-700/50 pt-2 mt-2">
                <div className="text-xs font-medium text-slate-300 mb-1">5-Day Forecast</div>
                <div className="space-y-1">
                  {weather.forecast.slice(0, 3).map((day, index) => (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 w-16 truncate">{day.day}</span>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 flex items-center justify-center">
                          {React.cloneElement(getWeatherIcon(day.condition), { className: 'w-3 h-3' })}
                        </div>
                        <span className="text-slate-300 text-xs">{day.high}°/{day.low}°</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const CustomizationPanel: React.FC<{
  wallpaper: string;
  wallpaperPresets: Array<{ name: string; url: string }>;
  onWallpaperChange: (url: string) => void;
  onCreateNote: () => void;
  onClose: () => void;
}> = ({ wallpaper, wallpaperPresets, onWallpaperChange, onCreateNote, onClose }) => {
  const [customUrl, setCustomUrl] = useState('');

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90]" onClick={onClose} />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`
          fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] max-h-[85vh] 
          ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.radius.lg} 
          ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.shadow} z-[100] overflow-hidden
        `}
      >
        <div className={`${DESIGN_TOKENS.padding.lg} ${DESIGN_TOKENS.colors.border} border-b`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-xl font-bold ${DESIGN_TOKENS.colors.text}`}>Desktop Customization</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto">
          {/* Wallpaper Section */}
          <div className={`${DESIGN_TOKENS.padding.lg} ${DESIGN_TOKENS.colors.border} border-b`}>
            <h3 className={`text-lg font-semibold ${DESIGN_TOKENS.colors.text} mb-4`}>Wallpaper</h3>
            
            <div className="grid grid-cols-3 gap-3 mb-4">
              {wallpaperPresets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => onWallpaperChange(preset.url)}
                  className={`
                    relative h-20 rounded-lg overflow-hidden border-2 transition-all
                    ${wallpaper === preset.url ? 'border-blue-400 ring-2 ring-blue-400/50' : 'border-slate-600 hover:border-slate-500'}
                  `}
                >
                  <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <span className="text-white text-xs font-medium">{preset.name}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="Enter custom wallpaper URL..."
                className={`
                  flex-1 px-3 py-2 bg-slate-800 ${DESIGN_TOKENS.colors.border} border 
                  ${DESIGN_TOKENS.radius.md} ${DESIGN_TOKENS.colors.text} text-sm
                  focus:outline-none focus:border-blue-400
                `}
              />
              <Button
                variant="primary"
                onClick={() => {
                  if (customUrl) {
                    onWallpaperChange(customUrl);
                    setCustomUrl('');
                  }
                }}
              >
                <Image className="w-4 h-4" />
                Apply
              </Button>
            </div>
          </div>

          {/* Widgets Section */}
          <div className={`${DESIGN_TOKENS.padding.lg}`}>
            <h3 className={`text-lg font-semibold ${DESIGN_TOKENS.colors.text} mb-4`}>Widgets</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={() => { onCreateNote(); onClose(); }}
                className="flex-col h-20"
              >
                <StickyNote className="w-6 h-6 mb-2 text-yellow-400" />
                <span>Add Sticky Note</span>
              </Button>
              
              <Button
                variant="secondary"
                className="flex-col h-20 opacity-50 cursor-not-allowed"
              >
                <Cloud className="w-6 h-6 mb-2 text-blue-400" />
                <span>Weather (Active)</span>
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
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
          <div className="space-y-2 mb-4">
            <h4 className={`${DESIGN_TOKENS.colors.textSecondary} text-sm font-medium`}>Global Shortcuts</h4>
            <div className="space-y-1 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Knowledge Search</span>
                <kbd className="bg-slate-700 px-1 rounded">Ctrl+K</kbd>
              </div>
              <div className="flex justify-between">
                <span>Add Knowledge</span>
                <kbd className="bg-slate-700 px-1 rounded">Ctrl+Shift+N</kbd>
              </div>
              <div className="flex justify-between">
                <span>Quick Actions</span>
                <kbd className="bg-slate-700 px-1 rounded">Alt+Space</kbd>
              </div>
              <div className="flex justify-between">
                <span>Toggle Shortcuts</span>
                <kbd className="bg-slate-700 px-1 rounded">Ctrl+Shift+T</kbd>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Button variant="secondary" size="sm" onClick={onClose}>
              <Command className="w-4 h-4" />
              Close
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
  const [isHovered, setIsHovered] = useState(false);
  const [autoHideActive, setAutoHideActive] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide after 3 seconds of no interaction
  useEffect(() => {
    if (isVisible && !isHovered) {
      timeoutRef.current = setTimeout(() => {
        setAutoHideActive(true);
      }, 3000);
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setAutoHideActive(false);
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isVisible, isHovered]);

  // Show on mouse movement near top of screen
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY < 60) {
        setAutoHideActive(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  if (!isVisible) return null;

  const favoriteApps = applications.slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ 
        opacity: autoHideActive ? 0.2 : 1, 
        y: autoHideActive ? -10 : 0 
      }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 max-w-[90vw] z-shortcuts"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`
        flex items-center ${DESIGN_TOKENS.spacing.xs} px-3 py-2
        ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.radius.lg} 
        ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.shadow}
        transition-all duration-300
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
  onCustomizationToggle: () => void;
  time: string;
}> = ({ windows, onWindowClick, onActionsMenuToggle, onCustomizationToggle, time }) => {
  return (
    <div className={`
      fixed bottom-0 left-0 right-0 h-12 ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} 
      ${DESIGN_TOKENS.colors.border} border-t flex items-center justify-between px-4 max-w-full z-50
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
        <Button variant="ghost" size="sm" onClick={onCustomizationToggle} title="Customize Desktop">
          <Settings className="w-4 h-4 text-gray-400" />
        </Button>
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
  const [isDragging, setIsDragging] = useState(false);
  const [wallpaper, setWallpaper] = useState<string>('https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2126&q=80');
  const [notes, setNotes] = useState<DesktopNote[]>([]);
  const [weather, setWeather] = useState<WeatherData>({ 
    location: 'New York', 
    temperature: 22, 
    condition: 'Partly Cloudy', 
    icon: '⛅', 
    humidity: 65, 
    windSpeed: 8,
    forecast: [
      { day: 'Tomorrow', high: 25, low: 18, condition: 'Sunny', icon: '☀️' },
      { day: 'Friday', high: 23, low: 16, condition: 'Cloudy', icon: '☁️' },
      { day: 'Saturday', high: 20, low: 14, condition: 'Rainy', icon: '🌧️' }
    ]
  });
  const [showCustomization, setShowCustomization] = useState(false);
  const [showGlobalUpload, setShowGlobalUpload] = useState(false);
  const [showKnowledgeShortcut, setShowKnowledgeShortcut] = useState(false);
  const [selectedKnowledgeItem, setSelectedKnowledgeItem] = useState<any>(null);

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

  // Load saved customizations
  useEffect(() => {
    const savedWallpaper = localStorage.getItem('desktop-wallpaper');
    const savedNotes = localStorage.getItem('desktop-notes');
    
    if (savedWallpaper) setWallpaper(savedWallpaper);
    if (savedNotes) setNotes(JSON.parse(savedNotes));
  }, []);

  // Save customizations
  useEffect(() => {
    localStorage.setItem('desktop-wallpaper', wallpaper);
    localStorage.setItem('desktop-notes', JSON.stringify(notes));
  }, [wallpaper, notes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowKnowledgeShortcut(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        setShowGlobalUpload(true);
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
        setShowGlobalUpload(false);
        setShowKnowledgeShortcut(false);
        if (selectedKnowledgeItem) {
          setSelectedKnowledgeItem(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showActionsMenu, showShortcutBar, selectedKnowledgeItem]);

  const createNote = () => {
    const newNote: DesktopNote = {
      id: Date.now().toString(),
      content: 'New note...',
      position: { x: Math.random() * 300 + 100, y: Math.random() * 300 + 100 },
      color: '#fef3c7',
      timestamp: Date.now()
    };
    setNotes(prev => [...prev, newNote]);
  };

  const updateNote = (id: string, content: string) => {
    setNotes(prev => prev.map(note => 
      note.id === id ? { ...note, content, timestamp: Date.now() } : note
    ));
  };

  const deleteNote = (id: string) => {
    setNotes(prev => prev.filter(note => note.id !== id));
  };

  // Handle knowledge creation from global upload
  const handleKnowledgeCreated = (knowledgeId: string) => {
    // Optionally open the knowledge portal and select the item
    console.log('Knowledge created:', knowledgeId);
  };

  // Handle knowledge examination
  const handleKnowledgeExamine = (knowledgeItem: any) => {
    setSelectedKnowledgeItem(knowledgeItem);
  };

  // Handle opening knowledge portal with specific item
  useEffect(() => {
    const handleOpenKnowledgePortal = (event: CustomEvent) => {
      const { itemId } = event.detail;
      // Open knowledge portal and select specific item
      const knowledgeApp = APPLICATIONS.find(app => app.id === 'knowledge');
      if (knowledgeApp) {
        openApplication(knowledgeApp);
        // TODO: Pass itemId to the portal for selection
      }
    };

    window.addEventListener('openKnowledgePortal', handleOpenKnowledgePortal as EventListener);
    return () => window.removeEventListener('openKnowledgePortal', handleOpenKnowledgePortal as EventListener);
  }, []);

  const wallpaperPresets = [
    { name: 'Space', url: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2126&q=80' },
    { name: 'Mountains', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80' },
    { name: 'Ocean', url: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80' },
    { name: 'Forest', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80' },
    { name: 'City', url: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80' },
    { name: 'Abstract', url: 'https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80' }
  ];

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

    // Calculate better window positioning
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const windowWidth = Math.min(800, screenWidth - 200);
    const windowHeight = Math.min(600, screenHeight - 200);
    
    const offsetX = (windows.length * 40) % 300;
    const offsetY = (windows.length * 40) % 200;
    
    const newWindow: OpenWindow = {
      id: `${app.id}-${Date.now()}`,
      app,
      isMinimized: false,
      position: { 
        x: Math.max(50, Math.min(100 + offsetX, screenWidth - windowWidth - 50)), 
        y: Math.max(50, Math.min(100 + offsetY, screenHeight - windowHeight - 100))
      },
      size: { width: windowWidth, height: windowHeight },
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
    <div className="min-h-screen relative overflow-hidden">
      {/* Desktop Wallpaper */}
      <div 
        className="desktop-wallpaper" 
        style={{ backgroundImage: `url(${wallpaper})` }}
      />

      {/* Shortcut Bar */}
      <AnimatePresence>
        {showShortcutBar && (
          <ShortcutBar
            isVisible={showShortcutBar}
            onAppSelect={openApplication}
            applications={APPLICATIONS}
          />
        )}
      </AnimatePresence>

      {/* Desktop Icons */}
      <div className="p-6 pb-20" onMouseDown={() => setIsDragging(false)}>
        <div className="grid grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-16 2xl:grid-cols-20 3xl:grid-cols-24 4xl:grid-cols-28 gap-4 auto-rows-min justify-items-center">
          {APPLICATIONS.map((app) => (
            <DesktopIcon
              key={app.id}
              app={app}
              onDoubleClick={() => openApplication(app)}
            />
          ))}
        </div>
      </div>

      {/* Desktop Notes */}
      <AnimatePresence>
        {notes.map((note) => (
          <DesktopNote
            key={note.id}
            note={note}
            onUpdate={updateNote}
            onDelete={deleteNote}
          />
        ))}
      </AnimatePresence>

      {/* Weather Widget */}
      <WeatherWidget weather={weather} />

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

      {/* Desktop Customization Panel */}
      <AnimatePresence>
        {showCustomization && (
          <CustomizationPanel
            wallpaper={wallpaper}
            wallpaperPresets={wallpaperPresets}
            onWallpaperChange={setWallpaper}
            onCreateNote={createNote}
            onClose={() => setShowCustomization(false)}
          />
        )}
      </AnimatePresence>

      {/* Multi-Chat Manager */}
      <MultiChatManager />

      {/* Global Upload Dialog */}
      <GlobalUpload
        isOpen={showGlobalUpload}
        onClose={() => setShowGlobalUpload(false)}
        onKnowledgeCreated={handleKnowledgeCreated}
      />

      {/* Knowledge Shortcut Dialog */}
      <KnowledgeShortcut
        isOpen={showKnowledgeShortcut}
        onClose={() => setShowKnowledgeShortcut(false)}
        onExamine={handleKnowledgeExamine}
      />

      {/* Knowledge Examination Modal */}
      {selectedKnowledgeItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700/50 w-full max-w-6xl h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
              <h2 className="text-xl font-bold text-white">Knowledge Examination</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedKnowledgeItem(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="h-full">
              <AtomicKnowledgeViewer
                item={selectedKnowledgeItem}
                className="h-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Taskbar */}
      <Taskbar
        windows={windows}
        onWindowClick={focusWindow}
        onActionsMenuToggle={() => setShowActionsMenu(!showActionsMenu)}
        onCustomizationToggle={() => setShowCustomization(!showCustomization)}
        time={time}
      />
    </div>
  );
};

export default Desktop;