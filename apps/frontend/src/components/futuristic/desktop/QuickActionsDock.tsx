import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  MessageSquare,
  Upload,
  Search,
  Zap,
  Bot,
  FileText,
  Database,
  Settings,
  MoreHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface QuickAction {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  color: string;
  shortcut?: string;
  action: () => void;
  category: 'primary' | 'secondary';
}

interface QuickActionsDockProps {
  viewport: ViewportSize;
  onActionClick: (action: any) => void;
}

export const QuickActionsDock: React.FC<QuickActionsDockProps> = ({
  viewport,
  onActionClick
}) => {
  const [showAllActions, setShowAllActions] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);

  // Define quick actions
  const quickActions: QuickAction[] = [
    {
      id: 'new-agent',
      title: 'Create Agent',
      icon: Bot,
      color: '#06B6D4',
      shortcut: 'Ctrl+N',
      category: 'primary',
      action: () => onActionClick({
        id: 'agents',
        title: 'Agents Hub',
        portalType: 'agent-hub',
        icon: Bot,
        color: { primary: '#06B6D4', secondary: '#0891B2' },
        category: 'primary',
        description: 'Create new agent'
      })
    },
    {
      id: 'start-discussion',
      title: 'Start Discussion',
      icon: MessageSquare,
      color: '#10B981',
      shortcut: 'Ctrl+D',
      category: 'primary',
      action: () => onActionClick({
        id: 'discussions',
        title: 'Discussions',
        portalType: 'discussion-hub',
        icon: MessageSquare,
        color: { primary: '#10B981', secondary: '#059669' },
        category: 'primary',
        description: 'Start new discussion'
      })
    },
    {
      id: 'upload-knowledge',
      title: 'Upload Knowledge',
      icon: Upload,
      color: '#F59E0B',
      shortcut: 'Ctrl+U',
      category: 'primary',
      action: () => onActionClick({
        id: 'knowledge',
        title: 'Knowledge',
        portalType: 'knowledge',
        icon: Database,
        color: { primary: '#F59E0B', secondary: '#D97706' },
        category: 'primary',
        description: 'Upload knowledge'
      })
    },
    {
      id: 'global-search',
      title: 'Global Search',
      icon: Search,
      color: '#8B5CF6',
      shortcut: 'Ctrl+K',
      category: 'primary',
      action: () => {
        // Implement global search modal
        console.log('Opening global search');
      }
    },
    {
      id: 'quick-actions',
      title: 'Quick Actions',
      icon: Zap,
      color: '#EF4444',
      shortcut: 'Ctrl+Space',
      category: 'primary',
      action: () => {
        // Implement command palette
        console.log('Opening command palette');
      }
    },
    // Secondary actions (shown when expanded)
    {
      id: 'create-artifact',
      title: 'Create Artifact',
      icon: FileText,
      color: '#8B5CF6',
      category: 'secondary',
      action: () => onActionClick({
        id: 'artifacts',
        title: 'Artifacts',
        portalType: 'artifacts',
        icon: FileText,
        color: { primary: '#8B5CF6', secondary: '#7C3AED' },
        category: 'primary',
        description: 'Create artifact'
      })
    },
    {
      id: 'system-settings',
      title: 'System Settings',
      icon: Settings,
      color: '#6B7280',
      category: 'secondary',
      action: () => onActionClick({
        id: 'settings',
        title: 'Settings',
        portalType: 'system-hub',
        icon: Settings,
        color: { primary: '#6B7280', secondary: '#4B5563' },
        category: 'primary',
        description: 'System settings'
      })
    }
  ];

  // Filter actions based on viewport and expansion state
  const getVisibleActions = () => {
    const primaryActions = quickActions.filter(action => action.category === 'primary');
    const secondaryActions = quickActions.filter(action => action.category === 'secondary');

    if (viewport.isMobile) {
      const maxPrimary = viewport.width < 400 ? 2 : 3;
      return showAllActions ?
        [...primaryActions.slice(0, maxPrimary), ...secondaryActions.slice(0, 2)] :
        primaryActions.slice(0, maxPrimary);
    } else if (viewport.isTablet) {
      const maxPrimary = viewport.width < 900 ? 4 : 5;
      return showAllActions ?
        [...primaryActions.slice(0, maxPrimary), ...secondaryActions] :
        primaryActions.slice(0, maxPrimary);
    } else {
      const maxPrimary = viewport.width < 1200 ? 5 : primaryActions.length;
      return showAllActions ? quickActions : primaryActions.slice(0, maxPrimary);
    }
  };

  const visibleActions = getVisibleActions();
  const hasMoreActions = quickActions.length > visibleActions.length;

  // Calculate dock height and button size
  const dockHeight = viewport.isMobile ? (viewport.width < 400 ? 60 : 70) : 80;
  const buttonSize = viewport.isMobile ? (viewport.width < 400 ? 40 : 48) : 48;
  const iconSize = viewport.isMobile ? (viewport.width < 400 ? 16 : 20) : 24;

  return (
    <TooltipProvider>
      <motion.div
        className="relative"
        initial={{ y: dockHeight }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.2 }}
      >
        {/* Sleek Dock Background */}
        <div
          className="bg-black/20 backdrop-blur-xl border-t border-white/10 shadow-2xl"
          style={{ height: dockHeight }}
        >
          <div className="h-full flex items-center justify-center px-6">
            <div className="flex items-center space-x-4">
              {/* Quick Action Buttons */}
              <AnimatePresence>
                {visibleActions.map((action, index) => {
                  const IconComponent = action.icon;
                  return (
                    <motion.div
                      key={action.id}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{
                        delay: index * 0.1,
                        type: "spring",
                        stiffness: 400,
                        damping: 25
                      }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.button
                            className="relative rounded-2xl flex items-center justify-center backdrop-blur-sm transition-all duration-200 group border border-white/10"
                            style={{
                              width: buttonSize,
                              height: buttonSize,
                              background: `rgba(255, 255, 255, 0.05)`,
                              boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                            }}
                            onClick={action.action}
                            onMouseEnter={() => setHoveredAction(action.id)}
                            onMouseLeave={() => setHoveredAction(null)}
                            whileHover={{
                              scale: 1.05,
                              y: -2,
                              backgroundColor: 'rgba(255, 255, 255, 0.1)'
                            }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {/* Icon */}
                            <IconComponent
                              size={iconSize}
                              className="text-white/80 group-hover:text-white transition-colors duration-200"
                              style={{
                                filter: `drop-shadow(0 0 8px ${action.color}60)`
                              }}
                            />

                            {/* Subtle Glow Effect */}
                            <motion.div
                              className="absolute inset-0 rounded-2xl"
                              style={{
                                background: `radial-gradient(circle at center, ${action.color}30, transparent 70%)`
                              }}
                              animate={{
                                opacity: hoveredAction === action.id ? 0.6 : 0
                              }}
                              transition={{ duration: 0.3 }}
                            />

                            {/* Active Indicator */}
                            <motion.div
                              className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full"
                              animate={{
                                scale: hoveredAction === action.id ? 1.5 : 0,
                                opacity: hoveredAction === action.id ? 1 : 0
                              }}
                              transition={{ duration: 0.2 }}
                            />
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-slate-800 border-slate-700">
                          <div className="text-center">
                            <p className="text-white font-medium">{action.title}</p>
                            {action.shortcut && (
                              <p className="text-slate-400 text-xs mt-1">{action.shortcut}</p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* More Actions Button */}
              {hasMoreActions && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    delay: visibleActions.length * 0.1,
                    type: "spring",
                    stiffness: 400,
                    damping: 25
                  }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        className="bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm transition-all duration-200 border border-white/10"
                        style={{
                          width: buttonSize,
                          height: buttonSize
                        }}
                        onClick={() => setShowAllActions(!showAllActions)}
                        whileHover={{ scale: 1.1, y: -4 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <motion.div
                          animate={{ rotate: showAllActions ? 180 : 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <MoreHorizontal
                            size={iconSize}
                            className="text-white/60 group-hover:text-white/80 transition-colors duration-200"
                          />
                        </motion.div>
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-slate-800 border-slate-700">
                      <p className="text-white">
                        {showAllActions ? 'Show Less' : 'More Actions'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Dock Indicator */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="w-12 h-1 bg-slate-600 rounded-full" />
        </div>
      </motion.div>
    </TooltipProvider>
  );
};
