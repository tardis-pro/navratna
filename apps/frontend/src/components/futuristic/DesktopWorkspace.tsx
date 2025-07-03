import React, { useState, useEffect, useCallback } from 'react';
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
  Bell,
  User,
  Menu,
  X,
  Globe
} from 'lucide-react';
import { DesktopIcon } from './desktop/DesktopIcon';
import { RecentItemsPanel } from './desktop/RecentItemsPanel';
import { QuickActionsDock } from './desktop/QuickActionsDock';
import { DesktopHeader } from './desktop/DesktopHeader';
import { DesktopSettings } from './desktop/DesktopSettings';
import { useDesktop } from './hooks/useDesktop';
import { usePortalManager } from './hooks/usePortalManager';
import { useIconDragDrop } from './hooks/useDragAndDrop';
import { useAgents } from './hooks/useAgents';
import { getTheme, resolveTheme } from './desktop/DesktopThemes';
import { Button } from '@/components/ui/button';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface DesktopIconConfig {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  color: {
    primary: string;
    secondary: string;
  };
  portalType: string;
  category: 'primary' | 'secondary';
  badge?: {
    count?: number;
    status?: 'online' | 'warning' | 'error';
    text?: string;
  };
  description: string;
  shortcut?: string;
}

const DESKTOP_ICONS: DesktopIconConfig[] = [
  // Primary Row
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: Home,
    color: { primary: '#3B82F6', secondary: '#1D4ED8' },
    portalType: 'dashboard',
    category: 'primary',
    description: 'System overview and metrics',
    shortcut: 'Ctrl+1'
  },
  {
    id: 'agents',
    title: 'Agents Hub',
    icon: Bot,
    color: { primary: '#06B6D4', secondary: '#0891B2' },
    portalType: 'agent-hub',
    category: 'primary',
    badge: { count: 12, status: 'online' },
    description: 'Manage AI agents and spawning',
    shortcut: 'Ctrl+2'
  },
  {
    id: 'artifacts',
    title: 'Artifacts',
    icon: Package,
    color: { primary: '#8B5CF6', secondary: '#7C3AED' },
    portalType: 'artifacts',
    category: 'primary',
    badge: { count: 3 },
    description: 'Code artifacts and repositories',
    shortcut: 'Ctrl+3'
  },
  {
    id: 'discussions',
    title: 'Discussions',
    icon: MessageSquare,
    color: { primary: '#10B981', secondary: '#059669' },
    portalType: 'discussion-hub',
    category: 'primary',
    badge: { count: 5, status: 'warning' },
    description: 'Agent conversations and chats',
    shortcut: 'Ctrl+4'
  },
  {
    id: 'knowledge',
    title: 'Knowledge',
    icon: Brain,
    color: { primary: '#F59E0B', secondary: '#D97706' },
    portalType: 'knowledge',
    category: 'primary',
    badge: { text: 'New' },
    description: 'Knowledge base and learning',
    shortcut: 'Ctrl+5'
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: Settings,
    color: { primary: '#6B7280', secondary: '#4B5563' },
    portalType: 'system-hub',
    category: 'primary',
    description: 'System configuration',
    shortcut: 'Ctrl+6'
  },
  // Secondary Row
  {
    id: 'analytics',
    title: 'Analytics',
    icon: BarChart3,
    color: { primary: '#EC4899', secondary: '#DB2777' },
    portalType: 'intelligence-hub',
    category: 'secondary',
    description: 'Performance analytics and insights'
  },
  {
    id: 'search',
    title: 'Global Search',
    icon: Search,
    color: { primary: '#14B8A6', secondary: '#0D9488' },
    portalType: 'search',
    category: 'secondary',
    description: 'Search across all systems'
  },
  {
    id: 'tasks',
    title: 'Task Manager',
    icon: Target,
    color: { primary: '#F97316', secondary: '#EA580C' },
    portalType: 'tasks',
    category: 'secondary',
    description: 'Task and workflow management'
  },
  {
    id: 'reports',
    title: 'Reports',
    icon: TrendingUp,
    color: { primary: '#84CC16', secondary: '#65A30D' },
    portalType: 'monitoring-hub',
    category: 'secondary',
    description: 'System reports and metrics'
  },
  {
    id: 'tools',
    title: 'Tools',
    icon: Wrench,
    color: { primary: '#A855F7', secondary: '#9333EA' },
    portalType: 'tool-management',
    category: 'secondary',
    description: 'Development tools and utilities'
  },
  {
    id: 'create',
    title: 'Create New',
    icon: Plus,
    color: { primary: '#EF4444', secondary: '#DC2626' },
    portalType: 'create',
    category: 'secondary',
    description: 'Create new resources'
  },
  {
    id: 'mini-browser',
    title: 'Mini Browser',
    icon: Globe,
    color: { primary: '#0EA5E9', secondary: '#0284C7' },
    portalType: 'mini-browser',
    category: 'secondary',
    description: 'Web browser with screenshot capture',
    shortcut: 'Ctrl+B'
  }
];

interface DesktopWorkspaceProps {
  onOpenPortal?: (type: string) => void;
  isPortalOpen?: (type: string) => boolean;
  portals?: any[];
  viewport?: ViewportSize;
}

export const DesktopWorkspace: React.FC<DesktopWorkspaceProps> = ({
  onOpenPortal,
  isPortalOpen,
  portals = [],
  viewport: externalViewport
}) => {
  const [viewport, setViewport] = useState<ViewportSize>(
    externalViewport || {
      width: typeof window !== 'undefined' ? window.innerWidth : 1024,
      height: typeof window !== 'undefined' ? window.innerHeight : 768,
      isMobile: false,
      isTablet: false,
      isDesktop: true
    }
  );

  const [isLoading, setIsLoading] = useState(true);

  const [showRecentPanel, setShowRecentPanel] = useState(true);
  const [selectedIconId, setSelectedIconId] = useState<string | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const {
    iconPositions,
    recentItems,
    preferences,
    activityEvents,
    updateIconPosition,
    addRecentItem,
    updatePreferences,
    getActivityStats,
    getTrendingItems
  } = useDesktop();

  // Use external portal functions if provided, otherwise use internal ones
  const portalManager = usePortalManager();
  const openPortalFn = onOpenPortal || portalManager.openPortal;
  const isPortalOpenFn = isPortalOpen || portalManager.isPortalOpen;

  // Initialize drag and drop
  const dragAndDrop = useIconDragDrop(iconPositions, updateIconPosition);

  // Fetch agents
  const { agents, loading: agentsLoading } = useAgents();

  // Calculate activity stats
  const activityStats = getActivityStats();
  const trendingItems = getTrendingItems();

  // Get current theme
  const currentTheme = resolveTheme(preferences.theme);

  // Update viewport on resize
  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setViewport({
        width,
        height,
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024
      });
    };

    window.addEventListener('resize', updateViewport);
    updateViewport();

    return () => window.removeEventListener('resize', updateViewport);
  }, []);
  const primaryIcons = DESKTOP_ICONS.filter(icon => icon.category === 'primary');

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Global shortcuts
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
            event.preventDefault();
            const iconIndex = parseInt(event.key) - 1;
            const icon = primaryIcons[iconIndex];
            if (icon) {
              handleIconClick(icon);
            }
            break;
          case 'k':
            event.preventDefault();
            // Open global search
            break;
          case ',':
            event.preventDefault();
            setShowSettings(true);
            break;
        }
      }

      // Escape key
      if (event.key === 'Escape') {
        if (showSettings) {
          setShowSettings(false);
        } else if (selectedIconId) {
          setSelectedIconId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettings, selectedIconId, primaryIcons]);

  // Loading effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Handle icon click
  const handleIconClick = useCallback((iconConfig: DesktopIconConfig) => {
    setSelectedIconId(iconConfig.id);

    // Add to recent items
    addRecentItem({
      id: iconConfig.id,
      title: iconConfig.title,
      type: iconConfig.portalType,
      timestamp: new Date(),
      icon: iconConfig.icon
    });

    // Open corresponding portal
    openPortalFn(iconConfig.portalType as any);
  }, [addRecentItem, openPortalFn]);

  // Handle icon double-click (same as single click for now)
  const handleIconDoubleClick = useCallback((iconConfig: DesktopIconConfig) => {
    handleIconClick(iconConfig);
  }, [handleIconClick]);

  // Get grid configuration based on viewport
  const getGridConfig = () => {
    if (viewport.isMobile) {
      return {
        columns: viewport.width < 400 ? 2 : 3,
        iconSize: viewport.width < 400 ? 56 : 64,
        gap: 16,
        padding: 16,
        maxIconsPerRow: 3,
        showSecondaryRow: false
      };
    } else if (viewport.isTablet) {
      return {
        columns: viewport.width < 900 ? 4 : 5,
        iconSize: viewport.width < 900 ? 64 : 72,
        gap: 20,
        padding: 20,
        maxIconsPerRow: 5,
        showSecondaryRow: true
      };
    } else {
      return {
        columns: viewport.width < 1200 ? 5 : 6,
        iconSize: viewport.width < 1200 ? 72 : 80,
        gap: 24,
        padding: 24,
        maxIconsPerRow: 6,
        showSecondaryRow: true
      };
    }
  };

  const gridConfig = getGridConfig();

  // Filter icons by category
  const secondaryIcons = DESKTOP_ICONS.filter(icon => icon.category === 'secondary');

  // Create agent icons
  const agentIcons = agents.map(agent => ({
    id: agent.id,
    title: agent.name,
    icon: Bot,
    color: {
      primary: agent.status === 'active' ? '#10B981' :
        agent.status === 'idle' ? '#F59E0B' :
          agent.status === 'error' ? '#EF4444' : '#6B7280',
      secondary: agent.status === 'active' ? '#059669' :
        agent.status === 'idle' ? '#D97706' :
          agent.status === 'error' ? '#DC2626' : '#4B5563'
    },
    portalType: 'agent-hub',
    category: 'agent' as const,
    badge: {
      status: agent.status === 'active' ? 'online' as const :
        agent.status === 'error' ? 'error' as const :
          agent.status === 'idle' ? 'warning' as const : undefined,
      text: agent.status === 'offline' ? 'OFF' : undefined
    },
    description: agent.description || `${agent.type} agent`,
    agentData: agent
  }));

  // Loading screen
  if (isLoading) {
    return (
      <div className={`h-screen w-full bg-gradient-to-br ${currentTheme.colors.background.primary} flex items-center justify-center`}>
        <motion.div
          className="text-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full mx-auto mb-4"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <h2 className={`text-xl font-bold ${currentTheme.colors.text.primary} mb-2`}>
            Council of Nycea
          </h2>
          <p className={`${currentTheme.colors.text.secondary}`}>
            Initializing Desktop Workspace...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      className="h-screen w-full bg-gradient-to-br from-slate-950 via-blue-950/20 to-slate-950 flex flex-col overflow-hidden relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* AI Grid Background */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }} />
      </div>

      {/* Subtle AI Glow Effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
      {/* Minimal Desktop Header */}
      <motion.div
        className="relative z-10 h-16 bg-black/10 backdrop-blur-xl border-b border-white/5"
        initial={{ y: -64, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <div className="flex items-center justify-between h-full px-6">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">🏛️</span>
            </div>
            <div className="text-white font-medium">Council of Nycea</div>
          </div>

          {/* Minimal Controls */}
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(true)}
              className="text-white/60 hover:text-white hover:bg-white/10 w-8 h-8 p-0 rounded-lg"
            >
              <Settings size={16} />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Main Desktop Area */}
      <motion.div
        className="flex-1 flex overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        {/* Desktop Grid */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <div
            className="p-6 min-h-full"
            style={{
              paddingLeft: gridConfig.padding,
              paddingRight: showRecentPanel && viewport.isDesktop ? gridConfig.padding : gridConfig.padding,
            }}
          >
            {/* Primary Icons Row */}
            <motion.div
              className="grid mb-8"
              style={{
                gridTemplateColumns: `repeat(${Math.min(gridConfig.maxIconsPerRow, primaryIcons.length)}, 1fr)`,
                gap: gridConfig.gap
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              {primaryIcons.map((iconConfig, index) => (
                <motion.div
                  key={iconConfig.id}
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: 0.7 + index * 0.1,
                    duration: 0.4,
                    type: "spring",
                    stiffness: 300,
                    damping: 25
                  }}
                >
                  <DesktopIcon
                    config={iconConfig}
                    size={gridConfig.iconSize}
                    isSelected={selectedIconId === iconConfig.id}
                    isActive={isPortalOpenFn(iconConfig.portalType as any)}
                    onClick={() => handleIconClick(iconConfig)}
                    onDoubleClick={() => handleIconDoubleClick(iconConfig)}
                    viewport={viewport}
                  />
                </motion.div>
              ))}
            </motion.div>

            {/* Secondary Icons Row - Only show on larger screens */}
            {gridConfig.showSecondaryRow && (
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(gridConfig.maxIconsPerRow, secondaryIcons.length)}, 1fr)`,
                  gap: gridConfig.gap
                }}
              >
                {secondaryIcons.map((iconConfig) => (
                  <DesktopIcon
                    key={iconConfig.id}
                    config={iconConfig}
                    size={gridConfig.iconSize}
                    isSelected={selectedIconId === iconConfig.id}
                    isActive={isPortalOpenFn(iconConfig.portalType as any)}
                    onClick={() => handleIconClick(iconConfig)}
                    onDoubleClick={() => handleIconDoubleClick(iconConfig)}
                    viewport={viewport}
                  />
                ))}
              </div>
            )}

            {/* Mobile Secondary Icons - Show as expandable section */}
            {!gridConfig.showSecondaryRow && secondaryIcons.length > 0 && (
              <motion.div
                className="mt-6"
                initial={{ opacity: 0, height: 0 }}
                animate={{
                  opacity: showAllActions ? 1 : 0.7,
                  height: showAllActions ? 'auto' : 60
                }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-medium text-sm">More Tools</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllActions(!showAllActions)}
                    className="text-slate-400 hover:text-white text-xs"
                  >
                    {showAllActions ? 'Show Less' : 'Show More'}
                  </Button>
                </div>

                {showAllActions && (
                  <div
                    className="grid"
                    style={{
                      gridTemplateColumns: `repeat(${gridConfig.maxIconsPerRow}, 1fr)`,
                      gap: gridConfig.gap
                    }}
                  >
                    {secondaryIcons.map((iconConfig) => (
                      <DesktopIcon
                        key={iconConfig.id}
                        config={iconConfig}
                        size={gridConfig.iconSize}
                        isSelected={selectedIconId === iconConfig.id}
                        isActive={isPortalOpenFn(iconConfig.portalType as any)}
                        onClick={() => handleIconClick(iconConfig)}
                        onDoubleClick={() => handleIconDoubleClick(iconConfig)}
                        viewport={viewport}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Agents Section */}
            {agentIcons.length > 0 && (
              <motion.div
                className="mt-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 0.5 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white/80 font-medium text-sm flex items-center space-x-2">
                    <Bot className="w-4 h-4" />
                    <span>Active Agents</span>
                    <span className="text-xs text-white/50">({agents.filter(a => a.status === 'active').length} online)</span>
                  </h3>
                </div>

                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(gridConfig.maxIconsPerRow, agentIcons.length)}, 1fr)`,
                    gap: gridConfig.gap
                  }}
                >
                  {agentIcons.map((agentIcon, index) => (
                    <motion.div
                      key={agentIcon.id}
                      initial={{ opacity: 0, y: 20, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        delay: 1.3 + index * 0.1,
                        duration: 0.4,
                        type: "spring",
                        stiffness: 300,
                        damping: 25
                      }}
                    >
                      <DesktopIcon
                        config={agentIcon}
                        size={gridConfig.iconSize * 0.9} // Slightly smaller for agents
                        isSelected={selectedIconId === agentIcon.id}
                        isActive={agentIcon.agentData.status === 'active'}
                        onClick={() => handleIconClick(agentIcon)}
                        onDoubleClick={() => handleIconDoubleClick(agentIcon)}
                        viewport={viewport}
                      />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Recent Items Panel */}
        <AnimatePresence>
          {showRecentPanel && (viewport.isDesktop || viewport.isTablet) && (
            <RecentItemsPanel
              viewport={viewport}
              recentItems={recentItems}
              activityEvents={activityEvents}
              activityStats={activityStats}
              trendingItems={trendingItems}
              onItemClick={handleIconClick}
              onClose={() => setShowRecentPanel(false)}
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Quick Actions Dock */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5, type: "spring", stiffness: 300, damping: 30 }}
      >
        <QuickActionsDock
          viewport={viewport}
          onActionClick={handleIconClick}
          theme={currentTheme}
        />
      </motion.div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <DesktopSettings
            preferences={preferences}
            onPreferencesChange={updatePreferences}
            onClose={() => setShowSettings(false)}
            viewport={viewport}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};
