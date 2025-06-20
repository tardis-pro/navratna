import React, { useState, useEffect } from 'react';
import { useUAIP } from '@/contexts/UAIPContext';
import { motion } from 'framer-motion';
import { OperationStatus, OperationPriority } from '@uaip/types';
import { 
  CogIcon, 
  PlayIcon,
  PauseIcon,
  StopIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  LightBulbIcon,
  ChartBarIcon,
  BoltIcon,
  ArrowPathIcon,
  EyeIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface OperationMetrics {
  total: number;
  active: number;
  completed: number;
  failed: number;
  avgDuration: number;
  successRate: number;
}

export const OperationsMonitor: React.FC = () => {
  const { operations, systemMetrics, refreshData, isWebSocketConnected, executeOperation } = useUAIP();
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);

  // Calculate metrics from real operations data
  const metrics: OperationMetrics = React.useMemo(() => {
    const operationsData = operations.data;
    const activeOps = operationsData.filter(op => op.status === OperationStatus.RUNNING || op.status === OperationStatus.PENDING);
    const completedOps = operationsData.filter(op => op.status === OperationStatus.COMPLETED);
    const failedOps = operationsData.filter(op => op.status === OperationStatus.FAILED);
    
    const totalDuration = operationsData
      .filter(op => op.estimatedDuration)
      .reduce((sum, op) => sum + (op.estimatedDuration || 0), 0);
    
    const avgDuration = operationsData.length > 0 ? totalDuration / operationsData.length : 0;
    const successRate = operationsData.length > 0 ? completedOps.length / operationsData.length : 0;

    return {
      total: operationsData.length,
      active: activeOps.length,
      completed: completedOps.length,
      failed: failedOps.length,
      avgDuration: avgDuration / 1000, // Convert to seconds
      successRate: successRate
    };
  }, [operations.data]);

  const getStatusIcon = (status: OperationStatus | string) => {
    switch (status) {
      case OperationStatus.RUNNING:
      case 'running': 
        return <PlayIcon className="w-4 h-4 text-blue-500" />;
      case OperationStatus.PAUSED:
      case 'paused': 
        return <PauseIcon className="w-4 h-4 text-yellow-500" />;
      case OperationStatus.COMPLETED:
      case 'completed': 
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case OperationStatus.FAILED:
      case 'failed': 
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
      case OperationStatus.CANCELLED:
      case 'cancelled': 
        return <StopIcon className="w-4 h-4 text-gray-500" />;
      default: 
        return <ClockIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: OperationStatus | string) => {
    switch (status) {
      case OperationStatus.RUNNING:
      case 'running': 
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case OperationStatus.PAUSED:
      case 'paused': 
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case OperationStatus.COMPLETED:
      case 'completed': 
        return 'bg-green-100 text-green-800 border-green-200';
      case OperationStatus.FAILED:
      case 'failed': 
        return 'bg-red-100 text-red-800 border-red-200';
      case OperationStatus.CANCELLED:
      case 'cancelled': 
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default: 
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getPriorityColor = (priority: OperationPriority | string) => {
    switch (priority) {
      case OperationPriority.CRITICAL:
      case 'critical': 
        return 'bg-red-500';
      case OperationPriority.HIGH:
      case 'high': 
        return 'bg-orange-500';
      case OperationPriority.MEDIUM:
      case 'medium': 
        return 'bg-yellow-500';
      default: 
        return 'bg-gray-400';
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const selectedOp = operations.data.find(op => op.id === selectedOperation);

  // Show error state
  if (operations.error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-500 dark:text-red-400">Failed to load operations</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{operations.error.message}</p>
            <button
              onClick={refreshData}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state
  if (operations.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ArrowPathIcon className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading operations...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show empty state
  if (operations.data.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
            <CogIcon className="w-6 h-6 mr-2 text-blue-500" />
            Operations Monitor
          </h2>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-sm text-gray-500">
                {isWebSocketConnected ? 'Live' : 'Offline'}
              </span>
            </div>
            <button
              onClick={refreshData}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Refresh operations"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Empty State */}
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <CogIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500 dark:text-gray-400">No operations to monitor</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">Operations will appear here when agents start working</p>
            <button
              onClick={refreshData}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Connection Status */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
          <CogIcon className="w-6 h-6 mr-2 text-blue-500" />
          Operations Monitor
        </h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-sm text-gray-500">
              {isWebSocketConnected ? 'Live' : 'Offline'}
            </span>
          </div>
          <button
            onClick={refreshData}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Refresh operations"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          {operations.lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated: {operations.lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Operations Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Operations</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{metrics.total}</p>
            </div>
            <CogIcon className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">Active</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{metrics.active}</p>
            </div>
            <BoltIcon className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Completed</p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{metrics.completed}</p>
            </div>
            <CheckCircleIcon className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-600 dark:text-orange-400">Success Rate</p>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{(metrics.successRate * 100).toFixed(1)}%</p>
            </div>
            <ChartBarIcon className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Operations List */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <BoltIcon className="w-5 h-5 mr-2 text-green-500" />
            Recent Operations ({operations.data.length})
          </h3>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {operations.data.slice(0, 10).map((operation) => (
              <div 
                key={operation.id}
                className={`bg-white dark:bg-slate-700 rounded-xl p-4 border cursor-pointer transition-all ${
                  selectedOperation === operation.id 
                    ? 'border-blue-500 ring-2 ring-blue-500/20' 
                    : 'border-slate-200 dark:border-slate-600 hover:border-blue-300'
                }`}
                onClick={() => setSelectedOperation(operation.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-3">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(operation.status)}
                      <div className={`w-2 h-2 rounded-full ${getPriorityColor(operation.priority)}`} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {operation.name || `Operation ${operation.id.slice(0, 8)}`}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {operation.description || 'No description available'}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(operation.status)}`}>
                    {operation.status.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-4">
                    <span className="text-gray-500 dark:text-gray-400">
                      Type: {operation.type || 'Unknown'}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      Priority: {operation.priority || 'Normal'}
                    </span>
                  </div>
                  <span className="text-gray-500 dark:text-gray-400">
                    {operation.createdAt ? new Date(operation.createdAt).toLocaleTimeString() : 'Unknown time'}
                  </span>
                </div>

                {operation.progress !== undefined && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">Progress</span>
                      <span className="text-gray-900 dark:text-white font-medium">{operation.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${operation.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Operation Details */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <EyeIcon className="w-5 h-5 mr-2 text-blue-500" />
            Operation Details
          </h3>

          {selectedOp ? (
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      {selectedOp.name || `Operation ${selectedOp.id.slice(0, 8)}`}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ID: {selectedOp.id}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(selectedOp.status)}
                    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(selectedOp.status)}`}>
                      {selectedOp.status.toUpperCase()}
                    </span>
                  </div>
                </div>
                
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {selectedOp.description || 'No description available'}
                </p>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Type</span>
                    <p className="font-medium text-gray-900 dark:text-white capitalize">
                      {selectedOp.type || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Priority</span>
                    <p className="font-medium text-gray-900 dark:text-white capitalize">
                      {selectedOp.priority || 'Normal'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Created</span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {selectedOp.createdAt ? new Date(selectedOp.createdAt).toLocaleString() : 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Duration</span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {selectedOp.actualDuration ? formatDuration(selectedOp.actualDuration) : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress */}
              {selectedOp.progress !== undefined && (
                <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                  <h5 className="font-medium text-gray-900 dark:text-white mb-3">Progress</h5>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-500">Completion</span>
                    <span className="text-gray-900 dark:text-white font-medium">{selectedOp.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
                    <div 
                      className="bg-blue-500 h-3 rounded-full transition-all duration-300" 
                      style={{ width: `${selectedOp.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Additional metadata if available */}
              {selectedOp.metadata && (
                <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                  <h5 className="font-medium text-gray-900 dark:text-white mb-3">Metadata</h5>
                  <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto">
                    {JSON.stringify(selectedOp.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <div className="text-center">
                <EyeIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">Select an operation to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 