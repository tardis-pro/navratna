import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
  Clock
} from 'lucide-react';

interface IconConfig {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  color: string;
  description: string;
  category: 'primary' | 'secondary';
}

const ICONS: IconConfig[] = [
  // Primary row - core functionality
  { id: 'dashboard', title: 'Dashboard', icon: Home, color: 'text-blue-400', description: 'System overview', category: 'primary' },
  { id: 'agents', title: 'Agents', icon: Bot, color: 'text-cyan-400', description: 'AI agent management', category: 'primary' },
  { id: 'artifacts', title: 'Artifacts', icon: Package, color: 'text-purple-400', description: 'Code repositories', category: 'primary' },
  { id: 'discussions', title: 'Chat', icon: MessageSquare, color: 'text-green-400', description: 'Conversations', category: 'primary' },
  { id: 'knowledge', title: 'Knowledge', icon: Brain, color: 'text-orange-400', description: 'Knowledge base', category: 'primary' },
  { id: 'settings', title: 'Settings', icon: Settings, color: 'text-gray-400', description: 'Configuration', category: 'primary' },
  
  // Secondary row - additional tools
  { id: 'analytics', title: 'Analytics', icon: BarChart3, color: 'text-pink-400', description: 'Performance metrics', category: 'secondary' },
  { id: 'search', title: 'Search', icon: Search, color: 'text-teal-400', description: 'Global search', category: 'secondary' },
  { id: 'tasks', title: 'Tasks', icon: Target, color: 'text-red-400', description: 'Task management', category: 'secondary' },
  { id: 'reports', title: 'Reports', icon: TrendingUp, color: 'text-lime-400', description: 'System reports', category: 'secondary' },
  { id: 'tools', title: 'Tools', icon: Wrench, color: 'text-violet-400', description: 'Development tools', category: 'secondary' },
  { id: 'create', title: 'Create', icon: Plus, color: 'text-yellow-400', description: 'Create new items', category: 'secondary' }
];

const DesktopIcon: React.FC<{ 
  config: IconConfig; 
  size: 'small' | 'large';
  onClick: () => void;
}> = ({ config, size, onClick }) => {
  const Icon = config.icon;
  
  const sizeClasses = size === 'small' 
    ? { container: 'w-16 h-20', icon: 'w-12 h-12', iconSize: 'w-6 h-6' }
    : { container: 'w-20 h-24', icon: 'w-16 h-16', iconSize: 'w-8 h-8' };
  
  return (
    <motion.div
      className={`${sizeClasses.container} flex flex-col items-center justify-center cursor-pointer group`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
    >
      <div className={`
        ${sizeClasses.icon} rounded-2xl bg-slate-800/50 backdrop-blur-sm border border-slate-700/50
        flex items-center justify-center
        group-hover:bg-slate-700/60 group-hover:border-slate-600/60
        transition-all duration-200
      `}>
        <Icon className={`${sizeClasses.iconSize} ${config.color}`} />
      </div>
      <span className={`
        mt-2 text-xs ${config.color} font-medium text-center
        max-w-full truncate px-1 leading-tight
      `}>
        {config.title}
      </span>
    </motion.div>
  );
};

export const CleanWorkspace: React.FC = () => {
  const [time, setTime] = useState('');
  const [viewport, setViewport] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: false
  });

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

  // Update viewport
  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setViewport({
        width,
        height,
        isMobile: width < 768
      });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const handleIconClick = (iconId: string) => {
    console.log(`Opening ${iconId}`);
    // TODO: Add navigation or modal logic here
  };

  const primaryIcons = ICONS.filter(icon => icon.category === 'primary');
  const secondaryIcons = ICONS.filter(icon => icon.category === 'secondary');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950/10 to-slate-950 flex flex-col">
      {/* Header */}
      <div className="h-16 bg-black/20 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">🏛️</span>
          </div>
          <h1 className="text-white font-semibold text-lg truncate">
            Council of Nycea
          </h1>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4 text-slate-300 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-400" />
            <span className="text-sm">Online</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-mono">{time}</span>
          </div>
        </div>
      </div>

      {/* Main Desktop Area */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-8 min-h-full">
          {/* Primary Icons */}
          <div className="mb-8">
            <h2 className="text-slate-400 text-sm font-medium mb-4 px-2 truncate">
              Core Systems
            </h2>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4 md:gap-6">
              {primaryIcons.map((icon) => (
                <DesktopIcon
                  key={icon.id}
                  config={icon}
                  size={viewport.isMobile ? 'small' : 'large'}
                  onClick={() => handleIconClick(icon.id)}
                />
              ))}
            </div>
          </div>

          {/* Secondary Icons */}
          {!viewport.isMobile && (
            <div>
              <h2 className="text-slate-400 text-sm font-medium mb-4 px-2 truncate">
                Tools & Analytics
              </h2>
              <div className="grid grid-cols-6 gap-6">
                {secondaryIcons.map((icon) => (
                  <DesktopIcon
                    key={icon.id}
                    config={icon}
                    size="large"
                    onClick={() => handleIconClick(icon.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="h-12 bg-black/20 backdrop-blur-xl border-t border-white/5 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2 md:gap-4 text-slate-400 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm hidden sm:inline">System Online</span>
            <span className="text-sm sm:hidden">Online</span>
          </div>
          <div className="text-sm truncate">
            {ICONS.length} Apps
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-slate-400 min-w-0 flex-shrink-0">
          <User className="w-4 h-4" />
          <span className="text-sm truncate max-w-20 md:max-w-32">Administrator</span>
        </div>
      </div>
    </div>
  );
};