import React from 'react';
import { motion } from 'framer-motion';
import { 
  Settings, 
  Bot,
  Server,
  Database,
  ChevronRight,
  Zap,
  ArrowRight
} from 'lucide-react';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface SettingsPortalProps {
  className?: string;
  viewport?: ViewportSize;
  onLaunchPortal?: (portalType: string) => void;
}

export const SettingsPortal: React.FC<SettingsPortalProps> = ({ 
  className, 
  viewport,
  onLaunchPortal 
}) => {
  // Default viewport if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  };

  const currentViewport = viewport || defaultViewport;

  const settingsCategories = [
    {
      id: 'agent-settings',
      title: ' Agents',
      description: 'Configure AI consciousness entities and their  models',
      icon: Bot,
      color: 'blue',
      gradient: 'from-blue-500 to-cyan-500',
      borderColor: 'border-blue-500/20',
      bgColor: 'from-blue-500/10 to-cyan-500/10',
      features: ['Agent Configuration', 'Model Assignment', 'Performance Tuning', 'Behavior Settings']
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
      features: ['Provider Setup', 'API Configuration', 'Model Discovery', 'Connection Testing']
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
      features: ['General Settings', 'Security Options', 'Performance Tuning', 'Advanced Features']
    }
  ];

  const handleLaunchPortal = (portalType: string) => {
    if (onLaunchPortal) {
      onLaunchPortal(portalType);
    } else {
      // Fallback: trigger a custom event that the workspace can listen to
      window.dispatchEvent(new CustomEvent('launchPortal', { 
        detail: { portalType } 
      }));
    }
  };

  return (
    <div className={`space-y-4 ${className} ${currentViewport.isMobile ? 'px-2' : ''}`}>
      {/* Settings Launcher Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative p-4 md:p-6 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50"
      >
        <div className="flex items-center gap-4">
          <motion.div
            className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg"
            animate={{ 
              boxShadow: [
                '0 10px 30px rgba(59, 130, 246, 0.3)',
                '0 10px 30px rgba(147, 51, 234, 0.4)',
                '0 10px 30px rgba(59, 130, 246, 0.3)'
              ]
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <Settings className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </motion.div>
          <div>
            <h1 className={`font-bold text-white mb-2 ${currentViewport.isMobile ? 'text-lg' : 'text-2xl'}`}>
              {currentViewport.isMobile ? 'Settings Hub' : ' Settings Hub'}
            </h1>
            <p className={`text-slate-300 ${currentViewport.isMobile ? 'text-xs' : 'text-sm'}`}>
              {currentViewport.isMobile 
                ? 'Launch specialized configuration portals'
                : 'Launch specialized configuration portals for different system components'
              }
            </p>
          </div>
        </div>
      </motion.div>

      {/* Settings Categories */}
      <div className="space-y-3">
        {settingsCategories.map((category, index) => {
          const Icon = category.icon;
          
          return (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`group relative p-4 md:p-6 bg-gradient-to-br ${category.bgColor} backdrop-blur-xl rounded-2xl border ${category.borderColor} cursor-pointer hover:border-${category.color}-400/40 transition-all duration-300`}
              onClick={() => handleLaunchPortal(category.id)}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <motion.div
                    className={`w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br ${category.gradient} rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300`}
                    whileHover={{ rotate: 5 }}
                  >
                    <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  </motion.div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold text-white mb-1 ${currentViewport.isMobile ? 'text-sm' : 'text-lg'}`}>
                      {category.title}
                    </h3>
                    <p className={`text-slate-400 mb-3 ${currentViewport.isMobile ? 'text-xs' : 'text-sm'}`}>
                      {category.description}
                    </p>
                    
                    {/* Feature Pills */}
                    <div className={`flex flex-wrap gap-1 md:gap-2 ${currentViewport.isMobile ? 'hidden' : ''}`}>
                      {category.features.slice(0, currentViewport.isTablet ? 2 : 4).map((feature, featureIndex) => (
                        <motion.span
                          key={feature}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: (index * 0.1) + (featureIndex * 0.05) }}
                          className={`px-2 py-1 text-xs bg-${category.color}-500/20 text-${category.color}-300 rounded-md border border-${category.color}-500/30`}
                        >
                          {feature}
                        </motion.span>
                      ))}
                      {category.features.length > (currentViewport.isTablet ? 2 : 4) && (
                        <span className={`px-2 py-1 text-xs bg-slate-500/20 text-slate-400 rounded-md border border-slate-500/30`}>
                          +{category.features.length - (currentViewport.isTablet ? 2 : 4)} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Launch Button */}
                <motion.div
                  className={`flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 bg-gradient-to-r ${category.gradient} text-white rounded-xl shadow-lg group-hover:shadow-xl transition-all duration-300 ${currentViewport.isMobile ? 'text-xs' : 'text-sm'}`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="font-medium">
                    {currentViewport.isMobile ? 'Open' : 'Launch Portal'}
                  </span>
                  <motion.div
                    animate={{ x: [0, 3, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </motion.div>
                </motion.div>
              </div>
              
              {/* Hover Effect Overlay */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                initial={false}
                animate={{
                  x: ['-100%', '100%'],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  repeatDelay: 3,
                  ease: 'linear'
                }}
              />
            </motion.div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="p-4 bg-gradient-to-br from-slate-800/30 to-slate-900/30 backdrop-blur-xl rounded-2xl border border-slate-700/30"
      >
        <div className="flex items-center justify-between">
          <div>
            <h4 className={`font-medium text-white ${currentViewport.isMobile ? 'text-sm' : 'text-base'}`}>
              Quick Actions
            </h4>
            <p className={`text-slate-400 ${currentViewport.isMobile ? 'text-xs' : 'text-sm'}`}>
              Common configuration shortcuts
            </p>
          </div>
          
          <div className={`flex items-center gap-2 ${currentViewport.isMobile ? 'flex-col' : ''}`}>
            <motion.button
              onClick={() => handleLaunchPortal('agent-settings')}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg transition-all duration-300 border border-blue-500/30"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Zap className="w-4 h-4" />
              <span className="text-xs font-medium">Quick Agent Setup</span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}; 