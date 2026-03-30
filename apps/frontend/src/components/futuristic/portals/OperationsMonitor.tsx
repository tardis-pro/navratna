import React, { useState, useEffect as _useEffect } from 'react';
import { useUAIP } from '@/contexts/UAIPContext';
import { motion as _motion } from 'framer-motion';
import { OperationStatus, OperationPriority } from '@uaip/types';
import {
  Settings,
  Play,
  Pause,
  Square,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart2,
  Zap,
  RefreshCw,
  Eye,
} from 'lucide-react';
import {
  PortalConnectionBadge,
  PortalLoadingState,
  PortalEmptyState,
  PortalErrorState,
} from './portal-shared-components';

interface OperationMetrics {
  total: number;
  active: number;
  completed: number;
  failed: number;
  avgDuration: number;
  successRate: number;
}

export const OperationsMonitor: React.FC = () => {
  const {
    operations,
    systemMetrics: _systemMetrics,
    refreshData,
    isWebSocketConnected,
    executeOperation: _executeOperation,
  } = useUAIP();
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);

  // Calculate metrics from real operations data
  const metrics: OperationMetrics = React.useMemo(() => {
    const operationsData = operations.data;
    const activeOps = operationsData.filter(
      (op) => op.status === OperationStatus.RUNNING || op.status === OperationStatus.PENDING
    );
    const completedOps = operationsData.filter((op) => op.status === OperationStatus.COMPLETED);
    const failedOps = operationsData.filter((op) => op.status === OperationStatus.FAILED);

    const totalDuration = operationsData
      .filter((op) => op.estimatedDuration)
      .reduce((sum, op) => sum + (op.estimatedDuration || 0), 0);

    const avgDuration = operationsData.length > 0 ? totalDuration / operationsData.length : 0;
    const successRate = operationsData.length > 0 ? completedOps.length / operationsData.length : 0;

    return {
      total: operationsData.length,
      active: activeOps.length,
      completed: completedOps.length,
      failed: failedOps.length,
      avgDuration: avgDuration / 1000, // Convert to seconds
      successRate: successRate,
    };
  }, [operations.data]);

  const getStatusIcon = (status: OperationStatus | string) => {
    switch (status) {
      case OperationStatus.RUNNING:
      case 'running':
        return <Play className="w-4 h-4 text-blue-500" />;
      case OperationStatus.PAUSED:
      case 'paused':
        return <Pause className="w-4 h-4 text-yellow-500" />;
      case OperationStatus.COMPLETED:
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case OperationStatus.FAILED:
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case OperationStatus.CANCELLED:
      case 'cancelled':
        return <Square className="w-4 h-4 text-gray-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
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
      case OperationPriority.URGENT:
      case 'urgent':
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

  const selectedOp = operations.data.find((op) => op.id === selectedOperation);

  const refreshIcon = <RefreshCw className="w-4 h-4" />;

  if (operations.error) {
    return (
      <div className="space-y-6">
        <PortalErrorState
          message="Failed to load operations"
          detail={operations.error.message}
          onRetry={refreshData}
        />
      </div>
    );
  }

  if (operations.isLoading) {
    return (
      <div className="space-y-6">
        <PortalLoadingState
          message="Loading operations..."
        />
      </div>
    );
  }

  if (operations.data.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-100 flex items-center">
            <Settings className="w-6 h-6 mr-2 text-blue-500" />
            Operations Monitor
          </h2>
          <div className="flex items-center space-x-4">
            <PortalConnectionBadge
              isConnected={isWebSocketConnected}
            />
            <button
              onClick={refreshData}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors"
              title="Refresh operations"
            >
              {refreshIcon}
            </button>
          </div>
        </div>

        {/* Empty State */}
        <PortalEmptyState
          icon={<Settings className="w-8 h-8 text-slate-500 mx-auto mb-2" />}
          title="No operations to monitor"
          description="Operations will appear here when agents start working"
          action={{ label: 'Refresh', onClick: refreshData }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Connection Status */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100 flex items-center">
          <Settings className="w-6 h-6 mr-2 text-blue-500" />
          Operations Monitor
        </h2>
        <div className="flex items-center space-x-4">
          <PortalConnectionBadge
            isConnected={isWebSocketConnected}
          />
          <button
            onClick={refreshData}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors"
            title="Refresh operations"
          >
            {refreshIcon}
          </button>
          {operations.lastUpdated && (
            <span className="text-xs text-slate-500">
              Updated: {operations.lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Operations Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-400">
                Total Operations
              </p>
              <p className="text-2xl font-bold text-blue-100">{metrics.total}</p>
            </div>
            <Settings className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-400">Active</p>
              <p className="text-2xl font-bold text-green-100">
                {metrics.active}
              </p>
            </div>
            <Zap className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-400">Completed</p>
              <p className="text-2xl font-bold text-purple-100">
                {metrics.completed}
              </p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-400">
                Success Rate
              </p>
              <p className="text-2xl font-bold text-orange-100">
                {(metrics.successRate * 100).toFixed(1)}%
              </p>
            </div>
            <BarChart2 className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Operations List */}
        <div className="bg-slate-900/40 rounded-2xl p-6 border border-slate-700/50 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center">
            <Zap className="w-5 h-5 mr-2 text-green-500" />
            Recent Operations ({operations.data.length})
          </h3>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {operations.data.slice(0, 10).map((operation) => (
              <div
                key={operation.id}
                className={`bg-slate-800/40 rounded-xl p-4 border cursor-pointer transition-all backdrop-blur-xl ${
                  selectedOperation === operation.id
                    ? 'border-blue-500 ring-2 ring-blue-500/20'
                    : 'border-slate-700/50 hover:border-blue-400/50'
                }`}
                onClick={() => setSelectedOperation(operation.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-3">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(operation.status)}
                      <div
                        className={`w-2 h-2 rounded-full ${getPriorityColor(operation.priority)}`}
                      />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-100">
                        {operation.name || `Operation ${operation.id.slice(0, 8)}`}
                      </h4>
                      <p className="text-sm text-slate-400 mt-1">
                        {operation.description || 'No description available'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(operation.status)}`}
                  >
                    {operation.status.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-4">
                    <span className="text-slate-500">
                      Type: {operation.type || 'Unknown'}
                    </span>
                    <span className="text-slate-500">
                      Priority: {operation.priority || 'Normal'}
                    </span>
                  </div>
                  <span className="text-slate-500">
                    {operation.createdAt
                      ? new Date(operation.createdAt).toLocaleTimeString()
                      : 'Unknown time'}
                  </span>
                </div>

                {operation.progress !== undefined && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-500">Progress</span>
                      <span className="text-slate-100 font-medium">
                        {operation.progress.percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${operation.progress.percentage}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Operation Details */}
        <div className="bg-slate-900/40 rounded-2xl p-6 border border-slate-700/50 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center">
            <Eye className="w-5 h-5 mr-2 text-blue-500" />
            Operation Details
          </h3>

          {selectedOp ? (
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-slate-100">
                      {selectedOp.name || `Operation ${selectedOp.id.slice(0, 8)}`}
                    </h4>
                    <p className="text-sm text-slate-400">ID: {selectedOp.id}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(selectedOp.status)}
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(selectedOp.status)}`}
                    >
                      {selectedOp.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <p className="text-slate-300 mb-4">
                  {selectedOp.description || 'No description available'}
                </p>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Type</span>
                    <p className="font-medium text-slate-100 capitalize">
                      {selectedOp.type || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Priority</span>
                    <p className="font-medium text-slate-100 capitalize">
                      {selectedOp.priority || 'Normal'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Created</span>
                    <p className="font-medium text-slate-100">
                      {selectedOp.createdAt
                        ? new Date(selectedOp.createdAt).toLocaleString()
                        : 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Duration</span>
                    <p className="font-medium text-slate-100">
                      {selectedOp.actualDuration
                        ? formatDuration(selectedOp.actualDuration)
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress */}
                {selectedOp.progress !== undefined && (
                  <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
                    <h5 className="font-medium text-slate-100 mb-3">Progress</h5>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-slate-500">Completion</span>
                      <span className="text-slate-100 font-medium">
                        {selectedOp.progress.percentage}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                      <span>{selectedOp.progress.completedSteps} / {selectedOp.progress.totalSteps} steps</span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-3">
                      <div
                        className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${selectedOp.progress.percentage}%` }}
                      />
                  </div>
                </div>
              )}

              {/* Additional metadata if available */}
              {selectedOp.metadata && (
                <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
                  <h5 className="font-medium text-slate-100 mb-3">Metadata</h5>
                  <pre className="text-xs text-slate-400 bg-slate-900/50 p-3 rounded overflow-auto">
                    {JSON.stringify(selectedOp.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <div className="text-center">
                <Eye className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-400">
                  Select an operation to view details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
