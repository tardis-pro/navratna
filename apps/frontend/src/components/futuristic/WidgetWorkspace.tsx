import React, { useState, useCallback, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Portal } from './Portal';
import { 
  BaseWidget, 
  WidgetInstance, 
  WidgetCategory, 
  WidgetPermission,
  WidgetUsage,
  WidgetError,
  WidgetRegistryQuery
} from '@uaip/types';
import { 
  WidgetRegistry
} from '@uaip/utils';
import type { UserContext } from '@uaip/utils';
import { 
  WidgetContext,
  BaseWidgetProps
} from '@/components/ui/base-widget';
import { AuthContext } from '@/contexts/AuthContext';
import { uaipAPI } from '@/utils/uaip-api';
import { Plus, Layout, Activity, Terminal, Menu, X, Sparkles, Settings, Shield, AlertTriangle } from 'lucide-react';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface WidgetWorkspaceProps {
  enableRBAC?: boolean;
  maxWidgetsPerUser?: number;
  allowDynamicRegistration?: boolean;
}

// Widget component registry - dynamically loaded widgets
const WIDGET_COMPONENTS: Record<string, React.ComponentType<BaseWidgetProps>> = {};

// Register a widget component
export const registerWidgetComponent = (widgetId: string, component: React.ComponentType<BaseWidgetProps>) => {
  WIDGET_COMPONENTS[widgetId] = component;
};

export const WidgetWorkspace: React.FC<WidgetWorkspaceProps> = ({ 
  enableRBAC = true,
  maxWidgetsPerUser = 10,
  allowDynamicRegistration = true
}) => {
  const { user } = useContext(AuthContext);
  const [widgetRegistry] = useState(() => new WidgetRegistry({
    enableRBAC,
    allowDynamicRegistration,
    defaultPermissions: [WidgetPermission.VIEW],
    auditEnabled: true
  }));

  const [availableWidgets, setAvailableWidgets] = useState<BaseWidget[]>([]);
  const [activeInstances, setActiveInstances] = useState<WidgetInstance[]>([]);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<'online' | 'degraded' | 'offline'>('online');
  const [viewport, setViewport] = useState<ViewportSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: false,
    isTablet: false,
    isDesktop: true
  });
  const [showMobileMenu, setShowMobileMenu] = useState(false);

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

  // Load available widgets and user instances
  useEffect(() => {
    if (user) {
      loadUserWidgets();
      loadUserInstances();
    }
  }, [user]);

  const loadUserWidgets = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      setError(null);

      // Create user context for RBAC
      const userContext: UserContext = {
        id: user.id,
        role: user.role,
        permissions: user.permissions || [],
        department: user.department,
        securityLevel: (user as any).securityLevel || 'medium' as any,
        ipAddress: await getClientIP(),
        userAgent: navigator.userAgent
      };

      // Get widgets from backend API
      const response = await uaipAPI.get('/api/v1/widgets', {
        params: {
          userId: user.id,
          category: undefined, // Load all categories
          status: 'active'
        }
      });

      if (response.data?.widgets) {
        // Register widgets in local registry
        response.data.widgets.forEach((widget: BaseWidget) => {
          widgetRegistry.registerWidget(widget);
        });

        // Get accessible widgets
        const accessibleWidgets = widgetRegistry.getAccessibleWidgets(userContext);
        setAvailableWidgets(accessibleWidgets);
      }
    } catch (err) {
      console.error('Failed to load user widgets:', err);
      setError('Failed to load available widgets');
      setSystemStatus('degraded');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserInstances = async () => {
    if (!user) return;

    try {
      const response = await uaipAPI.get(`/api/v1/widgets/instances/${user.id}`);
      if (response.data?.instances) {
        setActiveInstances(response.data.instances);
      }
    } catch (err) {
      console.error('Failed to load widget instances:', err);
    }
  };

  const createWidgetInstance = useCallback(async (widgetId: string) => {
    if (!user) return;

    try {
      // Check access first
      const userContext: UserContext = {
        id: user.id,
        role: user.role,
        permissions: user.permissions || [],
        department: user.department,
        securityLevel: (user as any).securityLevel || 'medium' as any
      };

      const access = widgetRegistry.checkWidgetAccess(widgetId, userContext);
      if (!access.hasAccess) {
        setError(`Access denied: ${access.reason}`);
        return;
      }

      // Generate position for new instance
      const position = generatePosition();
      const widget = widgetRegistry.getWidget(widgetId);
      if (!widget) {
        setError('Widget not found');
        return;
      }

      // Get responsive size
      const size = getResponsiveSize(widget);

      // Create instance via API
      const response = await uaipAPI.post('/api/v1/widgets/instances', {
        widgetId,
        userId: user.id,
        position,
        size,
        config: {}
      });

      if (response.data?.instance) {
        const newInstance = response.data.instance;
        setActiveInstances(prev => [...prev, newInstance]);
        setActiveInstanceId(newInstance.instanceId);
        
        if (viewport.isMobile) {
          setShowMobileMenu(false);
        }
      }
    } catch (err) {
      console.error('Failed to create widget instance:', err);
      setError('Failed to create widget instance');
    }
  }, [user, widgetRegistry, viewport]);

  const updateWidgetInstance = useCallback(async (
    instanceId: string, 
    updates: Partial<Pick<WidgetInstance, 'position' | 'size' | 'isVisible' | 'isMinimized' | 'isMaximized'>>
  ) => {
    if (!user) return;

    try {
      const response = await uaipAPI.patch(`/api/v1/widgets/instances/${instanceId}`, {
        userId: user.id,
        updates
      });

      if (response.data?.instance) {
        setActiveInstances(prev => 
          prev.map(inst => 
            inst.instanceId === instanceId ? response.data.instance : inst
          )
        );
      }
    } catch (err) {
      console.error('Failed to update widget instance:', err);
    }
  }, [user]);

  const deleteWidgetInstance = useCallback(async (instanceId: string) => {
    if (!user) return;

    try {
      await uaipAPI.delete(`/api/v1/widgets/instances/${instanceId}`, {
        data: { userId: user.id }
      });

      setActiveInstances(prev => prev.filter(inst => inst.instanceId !== instanceId));
    } catch (err) {
      console.error('Failed to delete widget instance:', err);
    }
  }, [user]);

  const handleWidgetError = useCallback(async (error: WidgetError) => {
    console.error('Widget error:', error);
    
    try {
      await uaipAPI.post('/api/v1/widgets/errors', error);
    } catch (err) {
      console.error('Failed to log widget error:', err);
    }
  }, []);

  const handleWidgetUsage = useCallback(async (usage: WidgetUsage) => {
    try {
      await uaipAPI.post('/api/v1/widgets/usage', usage);
    } catch (err) {
      console.error('Failed to log widget usage:', err);
    }
  }, []);

  const generatePosition = useCallback(() => {
    const padding = viewport.isMobile ? 10 : viewport.isTablet ? 20 : 50;
    const offset = (activeInstances.length * (viewport.isMobile ? 20 : 50)) % (viewport.isMobile ? 100 : 300);
    
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
  }, [activeInstances.length, viewport]);

  const getResponsiveSize = useCallback((widget: BaseWidget) => {
    if (viewport.isMobile) {
      return widget.defaultSize.mobile;
    } else if (viewport.isTablet) {
      return widget.defaultSize.tablet;
    }
    return widget.defaultSize.desktop;
  }, [viewport]);

  const getClientIP = async (): Promise<string> => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return 'unknown';
    }
  };

  // Group widgets by category
  const widgetsByCategory = availableWidgets.reduce((acc, widget) => {
    if (!acc[widget.category]) {
      acc[widget.category] = [];
    }
    acc[widget.category].push(widget);
    return acc;
  }, {} as Record<WidgetCategory, BaseWidget[]>);

  const getCategoryIcon = (category: WidgetCategory) => {
    switch (category) {
      case WidgetCategory.CORE: return '🔧';
      case WidgetCategory.INTELLIGENCE: return '🧠';
      case WidgetCategory.COMMUNICATION: return '💬';
      case WidgetCategory.MONITORING: return '📊';
      case WidgetCategory.ANALYTICS: return '📈';
      case WidgetCategory.TOOLS: return '🛠️';
      case WidgetCategory.SECURITY: return '🔒';
      case WidgetCategory.SYSTEM: return '⚙️';
      case WidgetCategory.CUSTOM: return '🎨';
      default: return '📦';
    }
  };

  const getCategoryColor = (category: WidgetCategory) => {
    switch (category) {
      case WidgetCategory.CORE: return 'from-blue-500/20 to-blue-600/20 border-blue-500/50';
      case WidgetCategory.INTELLIGENCE: return 'from-purple-500/20 to-purple-600/20 border-purple-500/50';
      case WidgetCategory.COMMUNICATION: return 'from-green-500/20 to-green-600/20 border-green-500/50';
      case WidgetCategory.MONITORING: return 'from-orange-500/20 to-orange-600/20 border-orange-500/50';
      case WidgetCategory.ANALYTICS: return 'from-pink-500/20 to-pink-600/20 border-pink-500/50';
      case WidgetCategory.TOOLS: return 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/50';
      case WidgetCategory.SECURITY: return 'from-red-500/20 to-red-600/20 border-red-500/50';
      case WidgetCategory.SYSTEM: return 'from-gray-500/20 to-gray-600/20 border-gray-500/50';
      case WidgetCategory.CUSTOM: return 'from-indigo-500/20 to-indigo-600/20 border-indigo-500/50';
      default: return 'from-slate-500/20 to-slate-600/20 border-slate-500/50';
    }
  };

  if (!user) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Authentication Required</h2>
          <p className="text-slate-400">Please log in to access the widget workspace</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, #3b82f6 0%, transparent 50%),
                           radial-gradient(circle at 75% 75%, #8b5cf6 0%, transparent 50%),
                           radial-gradient(circle at 75% 25%, #06d6a0 0%, transparent 50%),
                           radial-gradient(circle at 25% 75%, #f59e0b 0%, transparent 50%)`
        }} />
      </div>

      {/* Error Display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/80 backdrop-blur-xl border border-red-700/50 rounded-xl px-4 py-2 text-red-200 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

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

      {/* Desktop Widget Browser */}
      {!viewport.isMobile && (
        <motion.div
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="fixed left-6 top-1/2 -translate-y-1/2 z-50"
        >
          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="text-white text-sm font-semibold mb-4 flex items-center gap-2">
              <Layout className="w-4 h-4" />
              Widget Hub
              <div className={`w-2 h-2 rounded-full ${systemStatus === 'online' ? 'bg-green-400 animate-pulse' : systemStatus === 'degraded' ? 'bg-yellow-400' : 'bg-red-400'}`} />
            </div>

            {isLoading ? (
              <div className="text-center py-8">
                <Sparkles className="w-6 h-6 text-blue-400 mx-auto mb-2 animate-spin" />
                <p className="text-slate-400 text-sm">Loading widgets...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(widgetsByCategory).map(([category, widgets]) => (
                  <div key={category} className="space-y-2">
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wider px-2 flex items-center gap-1">
                      <span>{getCategoryIcon(category as WidgetCategory)}</span>
                      {category.replace('_', ' ')}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {widgets.map(widget => {
                        const isActive = activeInstances.some(inst => inst.id === widget.id);
                        return (
                          <motion.button
                            key={widget.id}
                            onClick={() => createWidgetInstance(widget.id)}
                            className={`
                              w-full p-3 rounded-xl border transition-all duration-300 text-left relative
                              ${isActive 
                                ? `bg-gradient-to-br ${getCategoryColor(widget.category)} text-white` 
                                : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600/50'
                              }
                            `}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            title={widget.metadata.description || widget.title}
                          >
                            <div className="text-sm font-medium truncate">{widget.title}</div>
                            <div className="text-xs opacity-70 truncate">{widget.metadata.description}</div>
                            {isActive && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute top-1 right-1 w-2 h-2 bg-green-400 rounded-full"
                              />
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {availableWidgets.length === 0 && !isLoading && (
                  <div className="text-center py-8">
                    <Layout className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">No widgets available</p>
                    <p className="text-slate-500 text-xs mt-1">Check your permissions</p>
                  </div>
                )}
              </div>
            )}

            {activeInstances.length > 0 && (
              <div className="border-t border-slate-700/50 pt-3">
                <motion.button
                  onClick={() => {
                    activeInstances.forEach(instance => deleteWidgetInstance(instance.instanceId));
                  }}
                  className="w-full h-10 rounded-xl bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 transition-all duration-300 flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Plus className="w-4 h-4 rotate-45" />
                  <span className="text-xs font-medium">Close All</span>
                </motion.button>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Mobile Widget Menu */}
      <AnimatePresence>
        {viewport.isMobile && showMobileMenu && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-4 right-4 z-40 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 max-h-[70vh] overflow-y-auto"
          >
            <div className="text-white text-sm font-semibold mb-4 flex items-center gap-2">
              <Layout className="w-4 h-4" />
              Widget Hub
              <div className={`w-2 h-2 rounded-full ${systemStatus === 'online' ? 'bg-green-400 animate-pulse' : systemStatus === 'degraded' ? 'bg-yellow-400' : 'bg-red-400'}`} />
            </div>

            {isLoading ? (
              <div className="text-center py-8">
                <Sparkles className="w-6 h-6 text-blue-400 mx-auto mb-2 animate-spin" />
                <p className="text-slate-400 text-sm">Loading widgets...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(widgetsByCategory).map(([category, widgets]) => (
                  <div key={category} className="space-y-2">
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wider px-2 flex items-center gap-1">
                      <span>{getCategoryIcon(category as WidgetCategory)}</span>
                      {category.replace('_', ' ')}
                    </div>
                    <div className="space-y-2">
                      {widgets.map(widget => {
                        const isActive = activeInstances.some(inst => inst.id === widget.id);
                        return (
                          <motion.button
                            key={widget.id}
                            onClick={() => createWidgetInstance(widget.id)}
                            className={`
                              flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 relative w-full text-left
                              ${isActive 
                                ? `bg-gradient-to-br ${getCategoryColor(widget.category)} text-white` 
                                : 'bg-slate-800/50 border-slate-700/50 text-slate-400'
                              }
                            `}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="text-2xl">{getCategoryIcon(widget.category)}</div>
                            <div className="text-left min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{widget.title}</div>
                              <div className="text-xs opacity-70 truncate">{widget.metadata.description}</div>
                            </div>
                            {isActive && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"
                              />
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeInstances.length > 0 && (
              <div className="border-t border-slate-700/50 pt-3 mt-3">
                <motion.button
                  onClick={() => {
                    activeInstances.forEach(instance => deleteWidgetInstance(instance.instanceId));
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-red-500/20 border border-red-500/50 text-red-400 rounded-xl"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Plus className="w-4 h-4 rotate-45" />
                  <span className="text-sm font-medium">Close All Widgets</span>
                </motion.button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Widget Instances */}
      <AnimatePresence>
        {activeInstances.filter(inst => !inst.isMinimized).map((instance, index) => {
          const WidgetComponent = WIDGET_COMPONENTS[instance.id];
          
          if (!WidgetComponent) {
            return (
              <Portal
                key={instance.instanceId}
                id={instance.instanceId}
                type="custom"
                title={instance.title}
                initialPosition={instance.position}
                initialSize={instance.size}
                zIndex={100 + index + (activeInstanceId === instance.instanceId ? 1000 : 0)}
                onClose={() => deleteWidgetInstance(instance.instanceId)}
                onMaximize={() => updateWidgetInstance(instance.instanceId, { isMaximized: !instance.isMaximized })}
                onMinimize={() => updateWidgetInstance(instance.instanceId, { isMinimized: true })}
                onFocus={() => setActiveInstanceId(instance.instanceId)}
                viewport={viewport}
              >
                <div className="flex items-center justify-center h-full text-slate-400">
                  <div className="text-center">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                    <p>Widget component not found</p>
                    <p className="text-sm">ID: {instance.id}</p>
                  </div>
                </div>
              </Portal>
            );
          }

          const widgetContext: WidgetContext = {
            widgetId: instance.id,
            instanceId: instance.instanceId,
            userId: user.id,
            permissions: (user.permissions?.filter(p => p.startsWith('widget:')).map(p => p.replace('widget:', '')) as WidgetPermission[]) || [WidgetPermission.VIEW],
            config: instance.config,
            onError: handleWidgetError,
            onUsage: handleWidgetUsage,
            onConfigChange: (config) => updateWidgetInstance(instance.instanceId, { instanceConfig: config }),
            onRefresh: () => loadUserWidgets()
          };

          return (
            <Portal
              key={instance.instanceId}
              id={instance.instanceId}
              type="custom"
              title={instance.title}
              initialPosition={instance.position}
              initialSize={instance.size}
              zIndex={100 + index + (activeInstanceId === instance.instanceId ? 1000 : 0)}
              onClose={() => deleteWidgetInstance(instance.instanceId)}
              onMaximize={() => updateWidgetInstance(instance.instanceId, { isMaximized: !instance.isMaximized })}
              onMinimize={() => updateWidgetInstance(instance.instanceId, { isMinimized: true })}
              onFocus={() => setActiveInstanceId(instance.instanceId)}
              viewport={viewport}
            >
              <WidgetComponent
                context={widgetContext}
                viewport={viewport}
                theme="dark"
              />
            </Portal>
          );
        })}
      </AnimatePresence>

      {/* Minimized Widgets Bar */}
      {activeInstances.some(inst => inst.isMinimized) && (
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
              {activeInstances.filter(inst => inst.isMinimized).map(instance => (
                <motion.button
                  key={instance.instanceId}
                  onClick={() => updateWidgetInstance(instance.instanceId, { isMinimized: false })}
                  className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors min-w-0"
                  whileHover={{ scale: 1.05 }}
                >
                  <span className="text-sm">{getCategoryIcon(instance.category)}</span>
                  <span className="text-xs text-slate-300 truncate">{instance.title}</span>
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Status Bar */}
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
            <span className="text-slate-300">
              System {systemStatus.toUpperCase()}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-slate-300">
              {activeInstances.length} Active
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-purple-400" />
            <span className="text-slate-300">
              {availableWidgets.length} Available
            </span>
          </div>
          
          {user && !viewport.isMobile && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs">
                {user.role} • {user.department || 'No Dept'}
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}; 