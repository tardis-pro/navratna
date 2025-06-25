import React, { useState, useCallback, useEffect } from 'react';
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
import { CapabilityRegistry } from './portals/CapabilityRegistry';
import { EventStreamMonitor } from './portals/EventStreamMonitor';
import { OperationsMonitor } from './portals/OperationsMonitor';
import { IntelligencePanelPortal } from './portals/IntelligencePanelPortal';
import { InsightsPanel } from './portals/InsightsPanel';
import { KnowledgePortal } from './portals/KnowledgePortal';
import { Plus, Layout, Users, Brain, Settings, MessageSquare, MessageCircle, Activity, Zap, Terminal, Monitor, Menu, X, Bot, Server, Database, Wrench, Shield, Radio, BarChart3, Lightbulb, Eye, BookOpen } from 'lucide-react';
import { uaipAPI } from '@/utils/uaip-api';
import { PuzzlePieceIcon } from '@heroicons/react/24/outline';

interface PortalInstance {
  id: string;
  type: 'agent-hub' | 'discussion-hub' | 'intelligence-hub' | 'system-hub' | 'chat' | 'knowledge' | 'monitoring-hub' | 'tools' | 'provider';
  title: string;
  component: React.ComponentType<any>;
  position: { x: number; y: number };
  size: { width: number; height: number };
  isVisible: boolean;
  isMinimized?: boolean;
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
  }
};

// Portal type groups for better organization
const PORTAL_GROUPS = {
  core: {
    title: 'Core Systems',
    portals: ['agent-hub', 'discussion-hub', 'chat'],
    colorClasses: {
      text: 'text-blue-400',
      bg: 'from-blue-500/20 to-blue-600/20',
      border: 'border-blue-500/50',
      accent: 'bg-blue-500'
    }
  },
  intelligence: {
    title: 'Intelligence & Analysis',
    portals: ['intelligence-hub', 'knowledge', 'monitoring-hub'],
    colorClasses: {
      text: 'text-purple-400',
      bg: 'from-purple-500/20 to-purple-600/20',
      border: 'border-purple-500/50',
      accent: 'bg-purple-500'
    }
  },
  system: {
    title: 'System & Tools',
    portals: ['system-hub', 'tools', 'provider'],
    colorClasses: {
      text: 'text-green-400',
      bg: 'from-green-500/20 to-green-600/20',
      border: 'border-green-500/50',
      accent: 'bg-green-500'
    }
  }
};

export const PortalWorkspace: React.FC = () => {
  const [portals, setPortals] = useState<PortalInstance[]>([]);
  const [nextId, setNextId] = useState(1);
  const [activePortalId, setActivePortalId] = useState<string | null>(null);
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
      isVisible: true
    };

    setPortals(prev => [...prev, newPortal]);
    setNextId(prev => prev + 1);
    setActivePortalId(newPortal.id); // Make new portal active by default
    
    // Close mobile menu after creating portal
    if (viewport.isMobile) {
      setShowMobileMenu(false);
    }
  }, [nextId, generatePosition, getResponsiveSize, viewport]);

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

    window.addEventListener('launchPortal', handleLaunchPortal as EventListener);
    
    return () => {
      window.removeEventListener('launchPortal', handleLaunchPortal as EventListener);
    };
  }, [createPortal]);

  const bringToFront = useCallback((id: string) => {
    setActivePortalId(id);
  }, []);

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
          // Use agents endpoint as a health check since it's a lightweight operation
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
          
          // If API fails, check if it's a network issue or server issue
          if (apiError instanceof Error) {
            if (apiError.message.includes('fetch') || apiError.message.includes('network')) {
              systemHealth = 'offline';
              connectionCount = 0;
            } else {
              // Server responded but with an error - degraded service
              systemHealth = 'degraded';
              connectionCount = isWebSocketConnected ? 1 : 0;
            }
          } else {
            systemHealth = 'offline';
            connectionCount = 0;
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

      {/* Desktop Portal Launcher */}
      {!viewport.isMobile && (
        <motion.div
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="fixed left-6 top-1/2 -translate-y-1/2 z-50"
        >
          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 space-y-4">
            <div className="text-white text-sm font-semibold mb-4 flex items-center gap-2">
              <Layout className="w-4 h-4" />
              Portal Hub
              <div className={`w-2 h-2 rounded-full ${systemStatus === 'online' ? 'bg-green-400 animate-pulse' : systemStatus === 'degraded' ? 'bg-yellow-400' : 'bg-red-400'}`} />
            </div>
            
            {Object.entries(PORTAL_GROUPS).map(([groupKey, group]) => (
              <div key={groupKey} className="space-y-2">
                <div className={`text-xs font-medium ${group.colorClasses.text} uppercase tracking-wider px-2`}>
                  {group.title}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {group.portals.map(portalKey => {
                    const config = PORTAL_CONFIGS[portalKey as keyof typeof PORTAL_CONFIGS];
                    const isActive = portals.some(p => p.type === portalKey);
                    const Icon = config.icon;
                    
                    return (
                      <motion.button
                        key={portalKey}
                        onClick={() => togglePortal(portalKey as keyof typeof PORTAL_CONFIGS)}
                        className={`
                          w-12 h-12 rounded-xl border transition-all duration-300 flex items-center justify-center relative
                          ${isActive 
                            ? `bg-gradient-to-br ${group.colorClasses.bg} ${group.colorClasses.border} ${group.colorClasses.text}` 
                            : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600/50'
                          }
                        `}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        title={`${config.title}\n${config.description}`}
                      >
                        <Icon className="w-4 h-4" />
                        {isActive && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className={`absolute -top-1 -right-1 w-3 h-3 ${group.colorClasses.accent} rounded-full`}
                          />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ))}
            
            <div className="border-t border-slate-700/50 pt-3">
              <motion.button
                onClick={() => {
                  setPortals([]);
                }}
                className="w-full h-10 rounded-xl bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 transition-all duration-300 flex items-center justify-center gap-2"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                title="Close All Portals"
              >
                <Plus className="w-4 h-4 rotate-45" />
                <span className="text-xs font-medium">Close All</span>
              </motion.button>
            </div>
          </div>
        </motion.div>
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
          className={`fixed z-40 ${
            viewport.isMobile 
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

      {/* Portal Instances */}
      <AnimatePresence>
        {portals.filter(p => !p.isMinimized).map((portal, index) => {
          const config = PORTAL_CONFIGS[portal.type];
          const PortalComponent = portal.component;
          
          // Simple, predictable z-index: base 100 + index, active portal gets +1000
          const baseZIndex = 100 + index;
          const finalZIndex = activePortalId === portal.id ? baseZIndex + 1000 : baseZIndex;
          
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
        className={`fixed z-30 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 py-2 ${
          viewport.isMobile 
            ? 'bottom-4 left-4 right-4' 
            : 'bottom-6 right-6'
        }`}
      >
        <div className={`flex items-center gap-4 text-sm ${viewport.isMobile ? 'flex-wrap justify-center' : ''}`}>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${systemStatus === 'online' ? 'bg-green-400 animate-pulse' : systemStatus === 'degraded' ? 'bg-yellow-400' : 'bg-red-400'}`} />
            <span className={`text-slate-300 ${getStatusColor(systemStatus)}`}>
              System {systemStatus.toUpperCase()}
            </span>
            {systemMetrics.apiResponseTime && (
              <span className="text-slate-500 text-xs">
                ({systemMetrics.apiResponseTime}ms)
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-slate-300">
              {activeConnections} Active
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-purple-400" />
            <span className="text-slate-300">
              {portals.length} Portal{portals.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          {systemMetrics.environment && !viewport.isMobile && (
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-400 text-xs">
                {systemMetrics.environment}
              </span>
            </div>
          )}
          
          {portals.length > 0 && !viewport.isMobile && (
            <div className="text-slate-500 text-xs">
              Drag headers • Resize corners • Double-click to maximize
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}; 