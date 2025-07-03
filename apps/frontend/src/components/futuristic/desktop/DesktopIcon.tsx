import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

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

interface DesktopIconProps {
  config: DesktopIconConfig;
  size: number;
  isSelected: boolean;
  isActive: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  viewport: ViewportSize;
  className?: string;
}

export const DesktopIcon: React.FC<DesktopIconProps> = ({
  config,
  size,
  isSelected,
  isActive,
  onClick,
  onDoubleClick,
  viewport,
  className = ''
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const IconComponent = config.icon;

  // Calculate responsive sizes
  const iconSize = Math.max(size * 0.4, 18);
  const fontSize = viewport.isMobile ?
    (viewport.width < 400 ? '9px' : '10px') :
    viewport.isTablet ? '11px' : '12px';
  const borderRadius = Math.max(size * 0.2, 8);
  const labelMaxWidth = size + (viewport.isMobile ? 10 : 20);

  // Get badge color based on status
  const getBadgeColor = () => {
    if (!config.badge) return '';

    switch (config.badge.status) {
      case 'online':
        return 'bg-green-500 text-white';
      case 'warning':
        return 'bg-yellow-500 text-white';
      case 'error':
        return 'bg-red-500 text-white';
      default:
        return 'bg-blue-500 text-white';
    }
  };

  // Handle click with debouncing for double-click
  const handleClick = useCallback(() => {
    onClick();
  }, [onClick]);

  const handleDoubleClick = useCallback(() => {
    onDoubleClick();
  }, [onDoubleClick]);

  // Animation variants
  const iconVariants = {
    idle: {
      scale: 1,
      y: 0,
      rotateX: 0,
      boxShadow: `0 4px 12px rgba(0, 0, 0, 0.15)`
    },
    hover: {
      scale: 1.05,
      y: -2,
      rotateX: 5,
      boxShadow: `0 8px 24px rgba(0, 0, 0, 0.2)`
    },
    pressed: {
      scale: 0.95,
      y: 0,
      rotateX: 0,
      boxShadow: `0 2px 8px rgba(0, 0, 0, 0.1)`
    },
    active: {
      scale: 1.02,
      y: -1,
      rotateX: 2,
      boxShadow: `0 6px 20px rgba(59, 130, 246, 0.3)`
    }
  };

  const getAnimationState = () => {
    if (isPressed) return 'pressed';
    if (isActive) return 'active';
    if (isHovered) return 'hover';
    return 'idle';
  };

  return (
    <div className={`flex flex-col items-center space-y-2 ${className}`}>
      {/* Icon Container */}
      <motion.div
        className="relative cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-2xl"
        style={{ width: size, height: size }}
        variants={iconVariants}
        animate={getAnimationState()}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 20,
          duration: 0.2
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setIsPressed(false);
        }}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        whileTap={{ scale: 0.95 }}
        role="button"
        tabIndex={0}
        aria-label={`${config.title} - ${config.description}`}
        aria-pressed={isActive}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {/* Sleek Icon Background */}
        <div
          className="w-full h-full rounded-2xl flex items-center justify-center relative overflow-hidden backdrop-blur-sm"
          style={{
            background: isActive
              ? `linear-gradient(135deg, ${config.color.primary}40, ${config.color.secondary}60)`
              : 'rgba(255, 255, 255, 0.05)',
            borderRadius: borderRadius,
            border: isSelected
              ? '1px solid rgba(59, 130, 246, 0.8)'
              : isActive
                ? '1px solid rgba(59, 130, 246, 0.4)'
                : '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: isActive
              ? `0 0 20px ${config.color.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
              : 'inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          }}
        >
          {/* Subtle Glow Effect */}
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: `radial-gradient(circle at center, ${config.color.primary}20, transparent 70%)`,
              borderRadius: borderRadius
            }}
            animate={{
              opacity: isHovered ? 0.6 : isActive ? 0.3 : 0
            }}
            transition={{ duration: 0.3 }}
          />

          {/* Icon */}
          <IconComponent
            size={iconSize}
            className={`relative z-10 transition-colors duration-200 ${isActive
                ? 'text-white drop-shadow-lg'
                : 'text-white/80 hover:text-white'
              }`}
            style={{
              filter: isActive ? `drop-shadow(0 0 8px ${config.color.primary}80)` : 'none'
            }}
          />

          {/* Active Pulse */}
          {isActive && (
            <motion.div
              className="absolute inset-0 rounded-2xl"
              style={{
                border: `1px solid ${config.color.primary}60`,
                borderRadius: borderRadius
              }}
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          )}
        </div>

        {/* Badge */}
        {config.badge && (
          <motion.div
            className="absolute -top-1 -right-1 z-20"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 500 }}
          >
            <Badge
              className={`text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center ${getBadgeColor()}`}
              style={{ fontSize: '10px' }}
            >
              {config.badge.count !== undefined
                ? config.badge.count > 99 ? '99+' : config.badge.count.toString()
                : config.badge.text || '•'
              }
            </Badge>
          </motion.div>
        )}

        {/* Loading Indicator */}
        {isPressed && (
          <motion.div
            className="absolute inset-0 bg-white/10 rounded-2xl flex items-center justify-center"
            style={{ borderRadius: borderRadius }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
          </motion.div>
        )}
      </motion.div>

      {/* Icon Label */}
      <motion.div
        className="text-center max-w-full"
        animate={{
          y: isHovered ? -2 : 0,
          scale: isHovered ? 1.05 : 1
        }}
        transition={{ duration: 0.2 }}
      >
        <div
          className="text-white font-medium truncate px-1"
          style={{
            fontSize,
            maxWidth: labelMaxWidth,
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)'
          }}
          title={config.title}
        >
          {config.title}
        </div>

        {/* Subtitle/Description for larger screens */}
        {!viewport.isMobile && config.description && (
          <div
            className="text-slate-400 text-xs truncate px-1 mt-0.5"
            style={{
              maxWidth: labelMaxWidth,
              fontSize: viewport.isTablet ? '9px' : '10px'
            }}
            title={config.description}
          >
            {config.description}
          </div>
        )}

        {/* Keyboard Shortcut */}
        {!viewport.isMobile && config.shortcut && isHovered && (
          <motion.div
            className="text-slate-500 text-xs mt-1 bg-slate-800/50 px-1.5 py-0.5 rounded backdrop-blur-sm"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            style={{ fontSize: '9px' }}
          >
            {config.shortcut}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};
