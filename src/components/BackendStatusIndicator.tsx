import React, { useState, useEffect } from 'react';
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon, 
  XCircleIcon,
  ArrowPathIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { uaipAPI } from '../services/uaip-api';

interface BackendStatusIndicatorProps {
  className?: string;
  showDetails?: boolean;
}

export function BackendStatusIndicator({ 
  className = '', 
  showDetails = false 
}: BackendStatusIndicatorProps) {
  const [status, setStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [environmentInfo, setEnvironmentInfo] = useState<any>(null);

  const checkStatus = async () => {
    setStatus('checking');
    try {
      const available = await uaipAPI.refreshBackendStatus();
      setStatus(available ? 'available' : 'unavailable');
      setLastCheck(new Date());
      setEnvironmentInfo(uaipAPI.getEnvironmentInfo());
    } catch (error) {
      setStatus('unavailable');
      setLastCheck(new Date());
    }
  };

  useEffect(() => {
    checkStatus();
    
    // Check status every 30 seconds
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    switch (status) {
      case 'checking':
        return <ArrowPathIcon className="w-4 h-4 animate-spin text-blue-500" />;
      case 'available':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'unavailable':
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'checking':
        return 'Checking...';
      case 'available':
        return 'Backend Online';
      case 'unavailable':
        return 'Backend Offline';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'checking':
        return 'from-blue-50 to-blue-100 border-blue-200 text-blue-700';
      case 'available':
        return 'from-green-50 to-emerald-100 border-green-200 text-green-700';
      case 'unavailable':
        return 'from-red-50 to-red-100 border-red-200 text-red-700';
    }
  };

  if (!showDetails) {
    return (
      <div 
        className={`relative flex items-center space-x-2 px-3 py-2 bg-gradient-to-r ${getStatusColor()} rounded-full border ${className}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
        
        {showTooltip && (
          <div className="absolute top-full left-0 mt-2 w-64 p-3 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50">
            <div className="text-sm">
              <div className="font-medium mb-2">Backend Status</div>
              <div className="space-y-1 text-slate-600 dark:text-slate-400">
                <div>Status: {getStatusText()}</div>
                {lastCheck && (
                  <div>Last Check: {lastCheck.toLocaleTimeString()}</div>
                )}
                {environmentInfo && (
                  <div>Environment: {environmentInfo.isDevelopment ? 'Development' : 'Production'}</div>
                )}
                {status === 'unavailable' && (
                  <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-yellow-700 dark:text-yellow-300 text-xs">
                    Using mock data. Start backend services to connect.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Backend Status
        </h3>
        <button
          onClick={checkStatus}
          disabled={status === 'checking'}
          className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-4 h-4 ${status === 'checking' ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-3">
        {/* Status Overview */}
        <div className={`flex items-center space-x-3 p-3 bg-gradient-to-r ${getStatusColor()} rounded-lg border`}>
          {getStatusIcon()}
          <div>
            <div className="font-medium">{getStatusText()}</div>
            {lastCheck && (
              <div className="text-xs opacity-75">
                Last checked: {lastCheck.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>

        {/* Environment Info */}
        {environmentInfo && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <div className="font-medium text-slate-700 dark:text-slate-300">Environment</div>
              <div className="text-slate-600 dark:text-slate-400">
                {environmentInfo.isDevelopment ? 'Development' : 'Production'}
              </div>
            </div>
            <div className="space-y-1">
              <div className="font-medium text-slate-700 dark:text-slate-300">Base URL</div>
              <div className="text-slate-600 dark:text-slate-400 text-xs font-mono">
                {environmentInfo.baseURL}
              </div>
            </div>
          </div>
        )}

        {/* Status-specific information */}
        {status === 'unavailable' && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                  Backend Services Unavailable
                </div>
                <div className="text-yellow-700 dark:text-yellow-300 space-y-1">
                  <div>• Frontend is using mock data</div>
                  <div>• Real-time features are disabled</div>
                  <div>• All functionality remains available for testing</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {status === 'available' && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-green-800 dark:text-green-200 mb-1">
                  All Systems Operational
                </div>
                <div className="text-green-700 dark:text-green-300 space-y-1">
                  <div>• Real-time data from backend services</div>
                  <div>• WebSocket connections active</div>
                  <div>• All features fully functional</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Development Instructions */}
        {environmentInfo?.isDevelopment && status === 'unavailable' && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <InformationCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                  To Connect Backend Services:
                </div>
                <div className="text-blue-700 dark:text-blue-300 space-y-1 font-mono text-xs">
                  <div>1. Ensure Docker is installed</div>
                  <div>2. cd backend</div>
                  <div>3. docker-compose up</div>
                  <div>4. Wait for services to be healthy</div>
                  <div>5. Refresh this page</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 