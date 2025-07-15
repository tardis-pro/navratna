import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  User,
  Activity,
  Clock
} from 'lucide-react';
import { RoleBasedDesktopConfig, DesktopIconConfig } from './desktop/RoleBasedDesktopConfig';
import { useAuth } from '@/contexts/AuthContext';
import { PortalWorkspace } from './PortalWorkspace';

const DesktopIcon: React.FC<{ 
  config: DesktopIconConfig; 
  size: 'small' | 'large';
  onClick: () => void;
}> = ({ config, size, onClick }) => {
  const Icon = config.icon;
  
  const sizeClasses = size === 'small' 
    ? { container: 'w-16 h-20', icon: 'w-12 h-12', iconSize: 'w-6 h-6' }
    : { container: 'w-20 h-24', icon: 'w-16 h-16', iconSize: 'w-8 h-8' };
  
  return (
    <motion.div
      className={`${sizeClasses.container} flex flex-col items-center justify-center cursor-pointer group relative`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
    >
      <div 
        className={`
          ${sizeClasses.icon} rounded-2xl backdrop-blur-sm border
          flex items-center justify-center
          group-hover:scale-110 group-hover:shadow-lg
          transition-all duration-200
        `}
        style={{
          backgroundColor: `${config.color.primary}15`,
          borderColor: `${config.color.primary}30`,
          boxShadow: `0 0 20px ${config.color.primary}10`
        }}
      >
        <Icon 
          className={`${sizeClasses.iconSize}`} 
          style={{ color: config.color.primary }}
        />
      </div>
      
      {/* Badge */}
      {config.badge && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-white">
            {config.badge.count || config.badge.text}
          </span>
        </div>
      )}
      
      <span className={`
        mt-2 text-xs font-medium text-center
        max-w-full truncate px-1 leading-tight
      `}
      style={{ color: config.color.primary }}
      >
        {config.title}
      </span>
      
      {/* Shortcut hint */}
      {config.shortcut && size === 'large' && (
        <span className="text-xs opacity-60 mt-1" style={{ color: config.color.secondary }}>
          {config.shortcut}
        </span>
      )}
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
  const [showPortals, setShowPortals] = useState(false);
  
  const { user } = useAuth();
  const userRole = user?.role || 'guest';

  // Get role-based desktop layout
  const desktopLayout = RoleBasedDesktopConfig.getDesktopLayout(userRole);

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

  const handleIconClick = (config: DesktopIconConfig) => {
    console.log(`Opening ${config.portalType} portal`);
    setShowPortals(true);
    
    // Trigger portal opening via custom event
    window.dispatchEvent(new CustomEvent('openPortal', { 
      detail: { 
        type: config.portalType,
        title: config.title,
        config: config
      } 
    }));
  };

  if (showPortals) {
    return <PortalWorkspace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950/10 to-slate-950 flex flex-col relative">
      {/* Header */}
      <div className="h-16 bg-black/20 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 md:px-6 relative z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">🏛️</span>
          </div>
          <h1 className="text-white font-semibold text-lg truncate">
            Navratna
          </h1>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4 text-slate-300 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full">
            <Activity className="w-4 h-4 text-green-400" />
            <span className="text-sm capitalize">{userRole}</span>
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
          {desktopLayout.primaryIcons.length > 0 && (
            <div className="mb-8">
              <h2 className="text-slate-400 text-sm font-medium mb-4 px-2 truncate">
                Core Systems
              </h2>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-4 md:gap-6">
                {desktopLayout.primaryIcons.map((icon) => (
                  <DesktopIcon
                    key={icon.id}
                    config={icon}
                    size={viewport.isMobile ? 'small' : 'large'}
                    onClick={() => handleIconClick(icon)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Secondary Icons */}
          {desktopLayout.secondaryIcons.length > 0 && !viewport.isMobile && (
            <div className="mb-8">
              <h2 className="text-slate-400 text-sm font-medium mb-4 px-2 truncate">
                Tools & Utilities
              </h2>
              <div className="grid grid-cols-6 gap-6">
                {desktopLayout.secondaryIcons.map((icon) => (
                  <DesktopIcon
                    key={icon.id}
                    config={icon}
                    size="large"
                    onClick={() => handleIconClick(icon)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Admin Icons */}
          {desktopLayout.adminIcons.length > 0 && !viewport.isMobile && (
            <div className="mb-8">
              <h2 className="text-slate-400 text-sm font-medium mb-4 px-2 truncate">
                Administration
              </h2>
              <div className="grid grid-cols-6 gap-6">
                {desktopLayout.adminIcons.map((icon) => (
                  <DesktopIcon
                    key={icon.id}
                    config={icon}
                    size="large"
                    onClick={() => handleIconClick(icon)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Restricted Icons */}
          {desktopLayout.restrictedIcons.length > 0 && !viewport.isMobile && (
            <div className="mb-8">
              <h2 className="text-red-400 text-sm font-medium mb-4 px-2 truncate">
                System Level
              </h2>
              <div className="grid grid-cols-6 gap-6">
                {desktopLayout.restrictedIcons.map((icon) => (
                  <DesktopIcon
                    key={icon.id}
                    config={icon}
                    size="large"
                    onClick={() => handleIconClick(icon)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="h-12 bg-black/20 backdrop-blur-xl border-t border-white/5 flex items-center justify-between px-4 md:px-6 relative z-10">
        <div className="flex items-center gap-2 md:gap-4 text-slate-400 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm hidden sm:inline">System Online</span>
            <span className="text-sm sm:hidden">Online</span>
          </div>
          <div className="text-sm truncate">
            {Object.values(desktopLayout).flat().length} Apps Available
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-slate-400 min-w-0 flex-shrink-0">
          <User className="w-4 h-4" />
          <span className="text-sm truncate max-w-20 md:max-w-32 capitalize">
            {user?.username || userRole}
          </span>
        </div>
      </div>

      {/* Quick access hint */}
      <div className="absolute bottom-20 right-6 bg-black/40 backdrop-blur-xl rounded-xl px-4 py-2 border border-white/10 text-slate-300 text-sm">
        Click any icon to open portals
      </div>
    </div>
  );
};