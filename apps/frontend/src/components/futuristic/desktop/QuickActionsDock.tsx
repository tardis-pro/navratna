import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, type MotionValue } from 'framer-motion';
import {
  MessageSquare,
  Upload,
  Search,
  Zap,
  Bot,
  FileText,
  Database,
  Settings,
  MoreHorizontal,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string;
  shortcut?: string;
  action: () => void;
  category: 'primary' | 'secondary';
}

interface QuickActionsDockProps {
  viewport: ViewportSize;
  onActionClick: (action: unknown) => void;
}

// Helper component for individual dock items with macOS magnification
const DockItem = ({ 
  action, 
  mouseX, 
  baseSize, 
  iconSize, 
  isHovered, 
  onHoverStart, 
  onHoverEnd 
}: { 
  action: QuickAction; 
  mouseX: MotionValue<number>; 
  baseSize: number; 
  iconSize: number;
  isHovered: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  
  // Calculate distance from mouse to center of this button
  const distance = useTransform(mouseX, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  // Map distance to scale (magnification effect)
  const scaleSync = useTransform(distance, [-150, 0, 150], [1, 1.4, 1]);
  const scale = useSpring(scaleSync, { mass: 0.1, stiffness: 150, damping: 12 });

  // Map distance to width
  const widthSync = useTransform(distance, [-150, 0, 150], [baseSize, baseSize * 1.4, baseSize]);
  const width = useSpring(widthSync, { mass: 0.1, stiffness: 150, damping: 12 });

  const IconComponent = action.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          ref={ref}
          className={cn(
            "relative flex flex-col items-center justify-center rounded-2xl transition-colors duration-200 group",
            "border border-border/40 backdrop-blur-md",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-llama1)]"
          )}
          style={{
            width,
            height: width,
            background: isHovered ? `color-mix(in oklch, ${action.color} 15%, transparent)` : 'rgba(255, 255, 255, 0.03)',
            boxShadow: isHovered ? `0 0 20px ${action.color}40, inset 0 1px 0 rgba(255, 255, 255, 0.2)` : 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          }}
          onClick={action.action}
          onMouseEnter={onHoverStart}
          onMouseLeave={onHoverEnd}
          whileTap={{ scale: 0.95 }}
        >
          <motion.div style={{ scale }} className="flex flex-col items-center justify-center gap-1">
            <IconComponent
              size={iconSize}
              className="text-foreground/80 group-hover:text-foreground transition-colors duration-200"
              style={{
                filter: isHovered ? `drop-shadow(0 0 8px ${action.color})` : 'none',
                color: isHovered ? action.color : undefined
              }}
            />
            {/* Always visible label */}
            <span className="text-[10px] font-medium tracking-tight opacity-80 group-hover:opacity-100 transition-opacity" style={{ color: isHovered ? action.color : 'var(--color-foreground)' }}>
              {action.title.split(' ')[0]}
            </span>
          </motion.div>

          {/* Active Indicator */}
          <motion.div
            className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full"
            style={{ backgroundColor: action.color }}
            animate={{
              scale: isHovered ? 1.5 : 0,
              opacity: isHovered ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
          />
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-background/95 backdrop-blur-xl border-border shadow-xl mb-2">
        <div className="text-center">
          <p className="text-foreground font-medium">{action.title}</p>
          {action.shortcut && (
            <p className="text-muted-foreground text-xs mt-1">{action.shortcut}</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export const QuickActionsDock: React.FC<QuickActionsDockProps> = ({ viewport, onActionClick }) => {
  const [showAllActions, setShowAllActions] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const mouseX = useMotionValue(Infinity);

  // Define quick actions
  const quickActions: QuickAction[] = [
    {
      id: 'new-agent',
      title: 'Create Agent',
      icon: Bot,
      color: 'oklch(65% 0.25 248)', // --color-llama1
      shortcut: 'Ctrl+N',
      category: 'primary',
      action: () =>
        onActionClick({
          id: 'agents',
          title: 'Agents Hub',
          portalType: 'agent-hub',
          icon: Bot,
          color: { primary: '#06B6D4', secondary: '#0891B2' },
          category: 'primary',
          description: 'Create new agent',
        }),
    },
    {
      id: 'start-discussion',
      title: 'Start Discussion',
      icon: MessageSquare,
      color: 'oklch(75% 0.22 50)', // discussion accent
      shortcut: 'Ctrl+D',
      category: 'primary',
      action: () =>
        onActionClick({
          id: 'discussions',
          title: 'Discussions',
          portalType: 'discussion-hub',
          icon: MessageSquare,
          color: { primary: '#10B981', secondary: '#059669' },
          category: 'primary',
          description: 'Start new discussion',
        }),
    },
    {
      id: 'upload-knowledge',
      title: 'Upload Knowledge',
      icon: Upload,
      color: 'oklch(75% 0.2 75)', // task accent
      shortcut: 'Ctrl+U',
      category: 'primary',
      action: () =>
        onActionClick({
          id: 'knowledge',
          title: 'Knowledge',
          portalType: 'knowledge',
          icon: Database,
          color: { primary: '#F59E0B', secondary: '#D97706' },
          category: 'primary',
          description: 'Upload knowledge',
        }),
    },
    {
      id: 'global-search',
      title: 'Global Search',
      icon: Search,
      color: 'oklch(68% 0.22 145)', // artifact accent
      shortcut: 'Ctrl+K',
      category: 'primary',
      action: () => {
        // Implement global search modal
      },
    },
    {
      id: 'quick-actions',
      title: 'Quick Actions',
      icon: Zap,
      color: 'oklch(62.8% 0.257 29.23)', // --color-llama2
      shortcut: 'Ctrl+Space',
      category: 'primary',
      action: () => {
        // Implement command palette
      },
    },
    // Secondary actions (shown when expanded)
    {
      id: 'create-artifact',
      title: 'Create Artifact',
      icon: FileText,
      color: 'oklch(68% 0.22 145)',
      category: 'secondary',
      action: () =>
        onActionClick({
          id: 'artifacts',
          title: 'Artifacts',
          portalType: 'artifacts',
          icon: FileText,
          color: { primary: '#8B5CF6', secondary: '#7C3AED' },
          category: 'primary',
          description: 'Create artifact',
        }),
    },
    {
      id: 'system-settings',
      title: 'System Settings',
      icon: Settings,
      color: 'oklch(70% 0.05 250)',
      category: 'secondary',
      action: () =>
        onActionClick({
          id: 'settings',
          title: 'Settings',
          portalType: 'system-hub',
          icon: Settings,
          color: { primary: '#6B7280', secondary: '#4B5563' },
          category: 'primary',
          description: 'System settings',
        }),
    },
  ];

  // Filter actions based on viewport and expansion state
  const getVisibleActions = () => {
    const primaryActions = quickActions.filter((action) => action.category === 'primary');
    const secondaryActions = quickActions.filter((action) => action.category === 'secondary');

    if (viewport.isMobile) {
      const maxPrimary = viewport.width < 400 ? 2 : 3;
      return showAllActions
        ? [...primaryActions.slice(0, maxPrimary), ...secondaryActions.slice(0, 2)]
        : primaryActions.slice(0, maxPrimary);
    } else if (viewport.isTablet) {
      const maxPrimary = viewport.width < 900 ? 4 : 5;
      return showAllActions
        ? [...primaryActions.slice(0, maxPrimary), ...secondaryActions]
        : primaryActions.slice(0, maxPrimary);
    } else {
      const maxPrimary = viewport.width < 1200 ? 5 : primaryActions.length;
      return showAllActions ? quickActions : primaryActions.slice(0, maxPrimary);
    }
  };

  const visibleActions = getVisibleActions();
  const hasMoreActions = quickActions.length > visibleActions.length;

  // Calculate dock height and button size
  const dockHeight = viewport.isMobile ? (viewport.width < 400 ? 70 : 80) : 90;
  const buttonSize = viewport.isMobile ? (viewport.width < 400 ? 48 : 52) : 56;
  const iconSize = viewport.isMobile ? (viewport.width < 400 ? 20 : 22) : 24;

  return (
    <TooltipProvider>
      <motion.div
        className="relative"
        initial={{ y: dockHeight }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.2 }}
      >
        {/* Sleek Dock Background */}
        <div
          className={cn(
            "backdrop-blur-2xl bg-background/20 border-t border-border/40 shadow-2xl",
            "flex items-center justify-center px-6"
          )}
          style={{ height: dockHeight }}
          onMouseMove={(e) => mouseX.set(e.pageX)}
          onMouseLeave={() => mouseX.set(Infinity)}
        >
          <div className="flex items-end space-x-3 h-full pb-4">
            {/* Quick Action Buttons */}
            <AnimatePresence>
              {visibleActions.map((action, index) => {
                // Add separator before first secondary action
                const isFirstSecondary = action.category === 'secondary' && 
                  index > 0 && 
                  visibleActions[index - 1].category === 'primary';

                return (
                  <React.Fragment key={action.id}>
                    {isFirstSecondary && (
                      <motion.div 
                        initial={{ opacity: 0, scaleY: 0 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        className="w-px h-10 bg-border/50 mx-2 self-center rounded-full"
                      />
                    )}
                    <motion.div
                      initial={{ scale: 0, opacity: 0, y: 20 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0, opacity: 0, y: 20 }}
                      transition={{
                        delay: index * 0.05,
                        type: 'spring',
                        stiffness: 400,
                        damping: 25,
                      }}
                      className="flex items-end"
                    >
                      <DockItem
                        action={action}
                        mouseX={mouseX}
                        baseSize={buttonSize}
                        iconSize={iconSize}
                        isHovered={hoveredAction === action.id}
                        onHoverStart={() => setHoveredAction(action.id)}
                        onHoverEnd={() => setHoveredAction(null)}
                      />
                    </motion.div>
                  </React.Fragment>
                );
              })}
            </AnimatePresence>

            {/* More Actions Button */}
            {hasMoreActions && (
              <motion.div
                initial={{ scale: 0, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{
                  delay: visibleActions.length * 0.05,
                  type: 'spring',
                  stiffness: 400,
                  damping: 25,
                }}
                className="flex items-end ml-2"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.button
                      className={cn(
                        "relative flex flex-col items-center justify-center rounded-2xl transition-colors duration-200 group",
                        "bg-background/10 hover:bg-background/20 border border-border/40 backdrop-blur-md"
                      )}
                      style={{
                        width: buttonSize,
                        height: buttonSize,
                      }}
                      onClick={() => setShowAllActions(!showAllActions)}
                      whileHover={{ scale: 1.1, y: -4 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <motion.div
                        animate={{ rotate: showAllActions ? 180 : 0 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col items-center justify-center gap-1"
                      >
                        <MoreHorizontal
                          size={iconSize}
                          className="text-foreground/60 group-hover:text-foreground transition-colors duration-200"
                        />
                        <span className="text-[10px] font-medium tracking-tight opacity-80 group-hover:opacity-100 transition-opacity text-foreground">
                          {showAllActions ? 'Less' : 'More'}
                        </span>
                      </motion.div>
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-background/95 backdrop-blur-xl border-border shadow-xl mb-2">
                    <p className="text-foreground font-medium">{showAllActions ? 'Show Less' : 'More Actions'}</p>
                  </TooltipContent>
                </Tooltip>
              </motion.div>
            )}
          </div>
        </div>

        {/* Dock Indicator */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="w-16 h-1 bg-border/60 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]" />
        </div>
      </motion.div>
    </TooltipProvider>
  );
};
