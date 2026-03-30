import React from 'react';
import {
  Settings,
  Bot,
  Server,
  Database,
  ArrowRight,
  User,
} from 'lucide-react';
import { ViewportSize, useViewport } from '@/hooks/use_viewport';
import { cn } from '@/lib/utils';

interface SettingsPortalProps {
  className?: string;
  viewport?: ViewportSize;
  onLaunchPortal?: (portalType: string) => void;
}

export const SettingsPortal: React.FC<SettingsPortalProps> = ({
  className,
  viewport,
  onLaunchPortal,
}) => {
  const currentViewport = useViewport(viewport);

  const settingsCategories = [
    {
      id: 'general-settings',
      title: 'General Settings',
      description: 'User preferences, onboarding, and general application settings',
      icon: User,
      color: 'indigo',
      gradient: 'from-indigo-500 to-purple-500',
      borderColor: 'border-indigo-500/20',
      bgColor: 'from-indigo-500/10 to-purple-500/10',
      features: ['Onboarding Setup', 'User Preferences', 'Theme Settings', 'Language & Region'],
    },
    {
      id: 'agent-settings',
      title: ' Agents',
      description: 'Configure AI consciousness entities and their  models',
      icon: Bot,
      color: 'blue',
      gradient: 'from-blue-500 to-cyan-500',
      borderColor: 'border-blue-500/20',
      bgColor: 'from-blue-500/10 to-cyan-500/10',
      features: [
        'Agent Configuration',
        'Model Assignment',
        'Performance Tuning',
        'Behavior Settings',
      ],
    },
    {
      id: 'provider-settings',
      title: 'Model Providers',
      description: 'Manage  model provider connections and configurations',
      icon: Server,
      color: 'purple',
      gradient: 'from-purple-500 to-pink-500',
      borderColor: 'border-purple-500/20',
      bgColor: 'from-purple-500/10 to-pink-500/10',
      features: ['Provider Setup', 'API Configuration', 'Model Discovery', 'Connection Testing'],
    },
    {
      id: 'system-config',
      title: 'System Configuration',
      description: 'Global system preferences and advanced options',
      icon: Database,
      color: 'emerald',
      gradient: 'from-emerald-500 to-teal-500',
      borderColor: 'border-emerald-500/20',
      bgColor: 'from-emerald-500/10 to-teal-500/10',
      features: [
        'Security Options',
        'Performance Tuning',
        'Advanced Features',
        'System Monitoring',
      ],
    },
  ];

  const handleLaunchPortal = (portalType: string) => {
    if (onLaunchPortal) {
      onLaunchPortal(portalType);
    } else {
      // Fallback: trigger a custom event that the workspace can listen to
      window.dispatchEvent(
        new CustomEvent('launchPortal', {
          detail: { portalType },
        })
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, portalType: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLaunchPortal(portalType);
    }
  };

  return (
    <div className={cn("space-y-4", className, currentViewport.isMobile && "px-2")}>
      {/* Settings Launcher Header */}
      <div
        className="relative p-4 md:p-6 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50"
      >
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg"
          >
            <Settings className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <div>
            <h1
              className={cn("font-bold text-white mb-2", currentViewport.isMobile ? "text-lg" : "text-2xl")}
            >
              {currentViewport.isMobile ? 'Settings Hub' : ' Settings Hub'}
            </h1>
            <p className={cn("text-slate-300", currentViewport.isMobile ? "text-xs" : "text-sm")}>
              {currentViewport.isMobile
                ? 'Launch specialized configuration portals'
                : 'Launch specialized configuration portals for different system components'}
            </p>
          </div>
        </div>
      </div>

      {/* Settings Categories */}
      <div className="space-y-3" role="navigation" aria-label="Settings categories">
        {settingsCategories.map((category) => {
          const Icon = category.icon;

          return (
            <div
              key={category.id}
              className={cn(
                "group relative p-4 md:p-5 rounded-2xl border cursor-pointer transition-colors",
                "bg-gradient-to-br", category.bgColor,
                "border-slate-700/40 hover:border-slate-600/50"
              )}
              onClick={() => handleLaunchPortal(category.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => handleKeyDown(e, category.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div
                    className={cn("w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br rounded-xl flex items-center justify-center shadow-lg transition-all duration-300", category.gradient)}
                  >
                    <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3
                      className={cn("font-semibold text-white mb-1", currentViewport.isMobile ? "text-sm" : "text-lg")}
                    >
                      {category.title}
                    </h3>
                    <p
                      className={cn("text-slate-400", currentViewport.isMobile ? "text-xs" : "text-sm")}
                    >
                      {category.description}
                    </p>
                  </div>
                </div>

                {/* Launch Button */}
                <div
                  className={cn("flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 text-slate-300 hover:text-white transition-colors", currentViewport.isMobile ? "text-xs" : "text-sm")}
                >
                  <span className="font-medium">
                    {currentViewport.isMobile ? 'Open' : 'Launch Portal'}
                  </span>
                  <div>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
