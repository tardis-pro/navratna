import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings, 
  Monitor, 
  Shield, 
  Zap,
  Database,
  Clock,
  Bell,
  Save,
  RefreshCw
} from 'lucide-react';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface SystemConfigPortalProps {
  className?: string;
  viewport?: ViewportSize;
}

interface SystemConfig {
  theme: 'dark' | 'light' | 'auto';
  language: string;
  timezone: string;
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
    email: boolean;
  };
  performance: {
    animations: boolean;
    autoSave: boolean;
    cacheSize: number;
    maxConcurrentRequests: number;
  };
  security: {
    sessionTimeout: number;
    requireAuth: boolean;
    twoFactor: boolean;
    auditLogging: boolean;
  };
  advanced: {
    debugMode: boolean;
    experimentalFeatures: boolean;
    telemetry: boolean;
    autoUpdates: boolean;
  };
}

export const SystemConfigPortal: React.FC<SystemConfigPortalProps> = ({ className, viewport }) => {
  const [config, setConfig] = useState<SystemConfig>({
    theme: 'dark',
    language: 'en',
    timezone: 'UTC',
    notifications: {
      enabled: true,
      sound: true,
      desktop: true,
      email: false
    },
    performance: {
      animations: true,
      autoSave: true,
      cacheSize: 100,
      maxConcurrentRequests: 5
    },
    security: {
      sessionTimeout: 3600,
      requireAuth: true,
      twoFactor: false,
      auditLogging: true
    },
    advanced: {
      debugMode: false,
      experimentalFeatures: false,
      telemetry: true,
      autoUpdates: true
    }
  });

  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Default viewport if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  };

  const currentViewport = viewport || defaultViewport;

  // Load config from localStorage on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('system-config');
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig));
      } catch (error) {
        console.error('Failed to load system configuration:', error);
      }
    }
  }, []);

  const handleSaveConfig = useCallback(async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      localStorage.setItem('system-config', JSON.stringify(config));
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save system configuration:', error);
    } finally {
      setSaving(false);
    }
  }, [config]);

  const updateConfig = (path: string, value: any) => {
    setConfig(prev => {
      const newConfig = { ...prev };
      const keys = path.split('.');
      let current: any = newConfig;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newConfig;
    });
  };

  const ToggleSwitch = ({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => void }) => (
    <motion.button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-gradient-to-r from-blue-500 to-cyan-500' : 'bg-slate-600'
      }`}
      whileTap={{ scale: 0.95 }}
    >
      <motion.span
        className="inline-block h-4 w-4 transform rounded-full bg-white shadow-lg"
        animate={{ x: enabled ? 24 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </motion.button>
  );

  return (
    <div className={`space-y-4 ${className} ${currentViewport.isMobile ? 'px-2' : ''}`}>
      {/* System Config Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative p-4 md:p-6 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 backdrop-blur-xl rounded-2xl border border-emerald-500/20"
      >
        <div className={`flex items-center ${currentViewport.isMobile ? 'flex-col gap-4' : 'justify-between'}`}>
          <div className="flex items-center gap-4">
            <motion.div
              className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg"
              animate={{ 
                boxShadow: [
                  '0 10px 30px rgba(16, 185, 129, 0.3)',
                  '0 10px 30px rgba(20, 184, 166, 0.4)',
                  '0 10px 30px rgba(16, 185, 129, 0.3)'
                ]
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Settings className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </motion.div>
            <div className={currentViewport.isMobile ? 'text-center' : ''}>
              <h1 className={`font-bold text-white mb-2 ${currentViewport.isMobile ? 'text-lg' : 'text-2xl'}`}>
                {currentViewport.isMobile ? 'System Config' : 'System Configuration'}
              </h1>
              <p className={`text-emerald-100 ${currentViewport.isMobile ? 'text-xs' : 'text-sm'}`}>
                {currentViewport.isMobile 
                  ? 'Configure system preferences'
                  : 'Configure system preferences and advanced options'
                }
              </p>
            </div>
          </div>
          
          {/* Save Button */}
          <motion.button
            onClick={handleSaveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 bg-gradient-to-r from-emerald-600/80 to-teal-600/80 hover:from-emerald-500/80 hover:to-teal-500/80 text-white rounded-xl transition-all duration-300 border border-emerald-500/50 hover:border-emerald-400/50 disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <motion.div
              animate={{ rotate: saving ? 360 : 0 }}
              transition={{ duration: 1, repeat: saving ? Infinity : 0 }}
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 md:w-5 md:h-5" />
              ) : (
                <Save className="w-4 h-4 md:w-5 md:h-5" />
              )}
            </motion.div>
            <span className={`font-medium ${currentViewport.isMobile ? 'text-sm' : 'text-base'}`}>
              {saving ? 'Saving...' : 'Save Config'}
            </span>
          </motion.button>
        </div>
      </motion.div>

      {/* Configuration Content */}
      <motion.div
        className="bg-gradient-to-br from-emerald-500/5 to-teal-500/5 backdrop-blur-xl rounded-2xl border border-emerald-500/10 p-4 md:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="space-y-6">
          {/* General Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              General Settings
            </h3>
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">Theme</div>
                  <div className="text-sm text-slate-400">Interface appearance</div>
                </div>
                <select
                  value={config.theme}
                  onChange={(e) => updateConfig('theme', e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="auto">Auto</option>
                </select>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">Animations</div>
                  <div className="text-sm text-slate-400">UI animations</div>
                </div>
                <ToggleSwitch 
                  enabled={config.performance.animations}
                  onChange={(value) => updateConfig('performance.animations', value)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">Auto-Save</div>
                  <div className="text-sm text-slate-400">Automatic saving</div>
                </div>
                <ToggleSwitch 
                  enabled={config.performance.autoSave}
                  onChange={(value) => updateConfig('performance.autoSave', value)}
                />
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
            </h3>
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">Enable Notifications</div>
                  <div className="text-sm text-slate-400">System notifications</div>
                </div>
                <ToggleSwitch 
                  enabled={config.notifications.enabled}
                  onChange={(value) => updateConfig('notifications.enabled', value)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">Sound Alerts</div>
                  <div className="text-sm text-slate-400">Audio notifications</div>
                </div>
                <ToggleSwitch 
                  enabled={config.notifications.sound}
                  onChange={(value) => updateConfig('notifications.sound', value)}
                />
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Security
            </h3>
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">Require Authentication</div>
                  <div className="text-sm text-slate-400">Login required</div>
                </div>
                <ToggleSwitch 
                  enabled={config.security.requireAuth}
                  onChange={(value) => updateConfig('security.requireAuth', value)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">Audit Logging</div>
                  <div className="text-sm text-slate-400">Security audit logs</div>
                </div>
                <ToggleSwitch 
                  enabled={config.security.auditLogging}
                  onChange={(value) => updateConfig('security.auditLogging', value)}
                />
              </div>
            </div>
          </div>

          {/* Advanced */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Database className="w-5 h-5" />
              Advanced
            </h3>
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">Debug Mode</div>
                  <div className="text-sm text-slate-400">Enable debugging</div>
                </div>
                <ToggleSwitch 
                  enabled={config.advanced.debugMode}
                  onChange={(value) => updateConfig('advanced.debugMode', value)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">Experimental Features</div>
                  <div className="text-sm text-slate-400">Beta features</div>
                </div>
                <ToggleSwitch 
                  enabled={config.advanced.experimentalFeatures}
                  onChange={(value) => updateConfig('advanced.experimentalFeatures', value)}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}; 