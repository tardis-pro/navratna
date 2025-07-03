import React, { useReducer, useCallback, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { AgentSecurityDashboard } from '@/components/security/AgentSecurityDashboard';
import { 
  Shield, 
  ShieldAlert, 
  Activity, 
  RefreshCw,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface SecurityPortalProps {
  className?: string;
  viewport?: ViewportSize;
  mode?: 'dashboard' | 'monitor' | 'settings';
  showAdvanced?: boolean;
}

export const SecurityPortal: React.FC<SecurityPortalProps> = ({ 
  className, 
  viewport,
  mode = 'dashboard',
  showAdvanced = false
}) => {
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Default viewport if not provided - memoized to prevent infinite re-renders
  const currentViewport = useMemo(() => {
    if (viewport) return viewport;
    
    const defaultViewport: ViewportSize = {
      width: typeof window !== 'undefined' ? window.innerWidth : 1024,
      height: typeof window !== 'undefined' ? window.innerHeight : 768,
      isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
      isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
      isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
    };
    
    return defaultViewport;
  }, [viewport]);

  const handleRefresh = () => {
    setLoading(true);
    // Simulate refresh
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <div className={`h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden ${className || ''}`}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, #ef4444 0%, transparent 50%),
                           radial-gradient(circle at 75% 75%, #f59e0b 0%, transparent 50%),
                           radial-gradient(circle at 75% 25%, #10b981 0%, transparent 50%),
                           radial-gradient(circle at 25% 75%, #3b82f6 0%, transparent 50%)`
        }} />
      </div>

      {/* Controls Bar - no redundant header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 bg-slate-900/70 backdrop-blur-xl border-b border-slate-700/50"
      >
        <div className="px-6 py-4">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 text-slate-300 hover:text-white transition-colors"
              title={showDetails ? "Hide details" : "Show details"}
            >
              {showDetails ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 text-slate-300 hover:text-white transition-colors"
              title="Security settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="relative z-10 h-full overflow-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="h-full"
        >
          <AgentSecurityDashboard />
        </motion.div>
      </div>

      {/* Status Indicator */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className="absolute bottom-4 right-4 z-20"
      >
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-lg">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-xs text-slate-300">Security Active</span>
          </div>
          <div className="w-px h-4 bg-slate-600"></div>
          <div className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-slate-300">Monitoring</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
