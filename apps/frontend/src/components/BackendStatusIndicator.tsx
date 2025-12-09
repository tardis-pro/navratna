import React, { useState, useEffect } from 'react';
import { CheckCircleIcon, XCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { uaipAPI } from '../utils/uaip-api';

interface BackendStatusIndicatorProps {
  className?: string;
  showDetails?: boolean;
}

export function BackendStatusIndicator({
  className = '',
  showDetails = false,
}: BackendStatusIndicatorProps) {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [environmentInfo, setEnvironmentInfo] = useState<any>(null);

  const checkStatus = async () => {
    setStatus('checking');
    try {
      // Test backend connectivity by making a simple API call
      const response = await fetch(`${uaipAPI.getEnvironmentInfo().baseURL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      setStatus(response.ok ? 'online' : 'offline');
      setLastCheck(new Date());
      setEnvironmentInfo(uaipAPI.getEnvironmentInfo());
    } catch (error) {
      setStatus('offline');
      setLastCheck(new Date());
      console.error('Backend health check failed:', error);
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
      case 'online':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'offline':
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'checking':
        return 'Checking...';
      case 'online':
        return 'Backend Online';
      case 'offline':
        return 'Backend Offline';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'checking':
        return 'from-blue-50 to-blue-100 border-blue-200 text-blue-700';
      case 'online':
        return 'from-green-50 to-emerald-100 border-green-200 text-green-700';
      case 'offline':
        return 'from-red-50 to-red-100 border-red-200 text-red-700';
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'checking':
        return 'Verifying backend connection...';
      case 'online':
        return 'All backend services are operational';
      case 'offline':
        return 'Backend services are currently unavailable';
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div
        className={`inline-flex items-center space-x-2 px-3 py-2 rounded-lg border bg-gradient-to-r ${getStatusColor()} cursor-pointer transition-all duration-200 hover:shadow-md`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={checkStatus}
      >
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
        {lastCheck && <span className="text-xs opacity-75">{lastCheck.toLocaleTimeString()}</span>}
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-2 w-80 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              {getStatusIcon()}
              <span className="font-semibold text-gray-900 dark:text-white">Backend Status</span>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300">{getStatusMessage()}</p>

            {environmentInfo && (
              <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>Base URL:</span>
                  <span className="font-mono">{environmentInfo.baseURL}</span>
                </div>
                <div className="flex justify-between">
                  <span>Environment:</span>
                  <span>{environmentInfo.isDevelopment ? 'Development' : 'Production'}</span>
                </div>
                <div className="flex justify-between">
                  <span>WebSocket:</span>
                  <span
                    className={
                      environmentInfo.websocketConnected ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    {environmentInfo.websocketConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>
            )}

            {status === 'offline' && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300 font-medium mb-2">
                  Connection Issues Detected
                </p>
                <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                  <li>• Check network connectivity</li>
                  <li>• Verify backend services are running</li>
                  <li>• Contact system administrator if issues persist</li>
                </ul>
              </div>
            )}

            {showDetails && environmentInfo && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Debug Information:</p>
                <pre className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-2 rounded font-mono overflow-x-auto">
                  {JSON.stringify(environmentInfo, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
