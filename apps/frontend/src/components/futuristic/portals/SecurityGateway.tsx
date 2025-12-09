import React, { useState, useEffect } from 'react';
import { useUAIP } from '@/contexts/UAIPContext';
import { motion } from 'framer-motion';
import {
  ShieldCheckIcon,
  LightBulbIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  UserIcon,
  LockClosedIcon,
  EyeIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface SecurityMetrics {
  totalApprovals: number;
  pendingApprovals: number;
  approved: number;
  rejected: number;
  averageApprovalTime: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface AuditEntry {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  result: 'success' | 'failure' | 'denied';
  details: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

// Portal sizing interface shared across futuristic portals
interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface SecurityGatewayPortalProps {
  className?: string;
  viewport?: ViewportSize;
}

export const SecurityGateway: React.FC<SecurityGatewayPortalProps> = ({ className, viewport }) => {
  const {
    approvals,
    systemMetrics,
    refreshData,
    isWebSocketConnected,
    approveExecution,
    rejectExecution,
  } = useUAIP();
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [actionsInProgress, setActionsInProgress] = useState<Set<string>>(new Set());

  // Determine viewport characteristics if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet:
      typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  };

  const currentViewport = viewport || defaultViewport;

  // Calculate metrics from real approval data
  const metrics: SecurityMetrics = React.useMemo(() => {
    const approvalsData = approvals.data;
    const totalApprovals = approvalsData.length;
    const pending = approvalsData.filter((a) => a.status === 'pending').length;
    const approved = approvalsData.filter((a) => a.status === 'approved').length;
    const rejected = approvalsData.filter((a) => a.status === 'rejected').length;

    // Determine overall risk level based on pending approvals and system metrics
    const highRiskApprovals = approvalsData.filter(
      (a) => a.riskLevel === 'high' || a.riskLevel === 'critical'
    ).length;

    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = systemMetrics.data.security.threatLevel;
    if (highRiskApprovals > 2) riskLevel = 'critical';
    else if (highRiskApprovals > 1) riskLevel = 'high';
    else if (pending > 0) riskLevel = 'medium';

    return {
      totalApprovals,
      pendingApprovals: pending,
      approved,
      rejected,
      averageApprovalTime: 245, // This would come from actual approval timing data
      riskLevel,
    };
  }, [approvals.data, systemMetrics.data.security.threatLevel]);

  // Generate sample audit entries (in real implementation, this would come from API)
  useEffect(() => {
    const sampleAuditEntries: AuditEntry[] = [
      {
        id: 'audit-1',
        timestamp: new Date(Date.now() - 300000),
        userId: 'user-123',
        action: 'Tool Execution',
        resource: 'file-system-access',
        result: 'success',
        details: 'Successfully executed file read operation',
        riskLevel: 'low',
      },
      {
        id: 'audit-2',
        timestamp: new Date(Date.now() - 600000),
        userId: 'user-456',
        action: 'API Call',
        resource: 'external-service',
        result: 'denied',
        details: 'Access denied due to insufficient permissions',
        riskLevel: 'medium',
      },
      {
        id: 'audit-3',
        timestamp: new Date(Date.now() - 900000),
        userId: 'user-789',
        action: 'Data Access',
        resource: 'sensitive-database',
        result: 'success',
        details: 'Approved database query executed successfully',
        riskLevel: 'high',
      },
    ];
    setAuditEntries(sampleAuditEntries);
  }, []);

  const handleApproval = async (
    approvalId: string,
    decision: 'approve' | 'reject',
    reason?: string
  ) => {
    // Prevent rapid clicks by checking if action is already in progress
    const actionKey = `${approvalId}-${decision}`;

    if (actionsInProgress.has(actionKey)) {
      console.warn('Action already in progress, ignoring duplicate request');
      return;
    }

    try {
      setActionsInProgress((prev) => new Set(prev).add(actionKey));

      if (decision === 'approve') {
        await approveExecution(approvalId);
      } else {
        await rejectExecution(approvalId, reason || 'Rejected by security gateway');
      }

      // Refresh data after approval action
      await refreshData();
    } catch (error) {
      console.error(`Failed to ${decision} approval ${approvalId}:`, error);
      // Show user-friendly error message
      alert(
        `Failed to ${decision} approval: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setActionsInProgress((prev) => {
        const newSet = new Set(prev);
        newSet.delete(actionKey);
        return newSet;
      });
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical':
        return 'text-red-600 bg-red-100 border-red-200';
      case 'high':
        return 'text-orange-600 bg-orange-100 border-orange-200';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      default:
        return 'text-green-600 bg-green-100 border-green-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'rejected':
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
      case 'pending':
        return <ClockIcon className="w-4 h-4 text-yellow-500" />;
      default:
        return <ClockIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  const getResultIcon = (result: string) => {
    switch (result) {
      case 'success':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'failure':
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
      case 'denied':
        return <LightBulbIcon className="w-4 h-4 text-orange-500" />;
      default:
        return <ClockIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  const selectedApprovalData = approvals.data.find((a) => a.id === selectedApproval);

  // Show error state
  if (approvals.error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-500 dark:text-red-400">Failed to load security data</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
              {approvals.error.message}
            </p>
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
  if (approvals.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ArrowPathIcon className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading security data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show empty state
  if (approvals.data.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header with Connection Status */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
            <ShieldCheckIcon className="w-6 h-6 mr-2 text-green-500" />
            Security Gateway
          </h2>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
              />
              <span className="text-sm text-gray-500">
                {isWebSocketConnected ? 'Live' : 'Offline'}
              </span>
            </div>
            <button
              onClick={refreshData}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Refresh security data"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
            {approvals.lastUpdated && (
              <span className="text-xs text-gray-400">
                Updated: {approvals.lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ShieldCheckIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500 dark:text-gray-400">No security approvals pending</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              All operations are within approved security parameters
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`space-y-6 ${className ?? ''} ${currentViewport.isMobile ? 'px-2' : ''}`}
    >
      {/* Header with Connection Status */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
          <ShieldCheckIcon className="w-6 h-6 mr-2 text-red-500" />
          Security Gateway
        </h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
            />
            <span className="text-sm text-gray-500">
              {isWebSocketConnected ? 'Live' : 'Offline'}
            </span>
          </div>
          <button
            onClick={refreshData}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Refresh security data"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          {approvals.lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated: {approvals.lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Security Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Risk Level</p>
              <p className="text-2xl font-bold text-red-900 dark:text-red-100 capitalize">
                {metrics.riskLevel}
              </p>
            </div>
            <ShieldCheckIcon className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Pending</p>
              <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
                {metrics.pendingApprovals}
              </p>
            </div>
            <ClockIcon className="w-8 h-8 text-yellow-500" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">Approved</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                {metrics.approved}
              </p>
            </div>
            <CheckCircleIcon className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {metrics.totalApprovals}
              </p>
            </div>
            <DocumentTextIcon className="w-8 h-8 text-blue-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Approvals */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <LockClosedIcon className="w-5 h-5 mr-2 text-orange-500" />
            Pending Approvals ({metrics.pendingApprovals})
          </h3>

          <div className="space-y-3">
            {approvals.data
              .filter((a) => a.status === 'pending')
              .map((approval) => (
                <div
                  key={approval.id}
                  className={`bg-white dark:bg-slate-700 rounded-xl p-4 border cursor-pointer transition-all ${
                    selectedApproval === approval.id
                      ? 'border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-blue-300'
                  }`}
                  onClick={() => setSelectedApproval(approval.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {approval.operationType || 'Security Approval Required'}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {approval.description || 'Approval required for operation execution'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(approval.status)}
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-medium border ${getRiskColor(approval.riskLevel || 'medium')}`}
                      >
                        {(approval.riskLevel || 'medium').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      <p>Requested: {new Date(approval.createdAt).toLocaleTimeString()}</p>
                      <p>Requester: {approval.requestedBy || 'System'}</p>
                    </div>

                    <div className="flex space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApproval(approval.id, 'approve');
                        }}
                        className="px-3 py-1 bg-green-500 text-white text-xs rounded-md hover:bg-green-600 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApproval(approval.id, 'reject', 'Rejected via security gateway');
                        }}
                        className="px-3 py-1 bg-red-500 text-white text-xs rounded-md hover:bg-red-600 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}

            {metrics.pendingApprovals === 0 && (
              <div className="text-center py-8">
                <CheckCircleIcon className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-green-500 dark:text-green-400">All approvals processed</p>
              </div>
            )}
          </div>
        </div>

        {/* Audit Log */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <DocumentTextIcon className="w-5 h-5 mr-2 text-blue-500" />
            Recent Audit Log
          </h3>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {auditEntries.map((entry) => (
              <div
                key={entry.id}
                className="bg-white dark:bg-slate-700 rounded-lg p-3 border border-slate-200 dark:border-slate-600"
              >
                <div className="flex items-start space-x-3">
                  {getResultIcon(entry.result)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {entry.action}
                      </span>
                      <span className="text-xs text-gray-500">
                        {entry.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{entry.details}</p>
                    <div className="flex items-center space-x-4 mt-2 text-xs">
                      <span className="text-gray-500">User: {entry.userId}</span>
                      <span className="text-gray-500">Resource: {entry.resource}</span>
                      <span
                        className={`px-2 py-1 rounded-md font-medium border ${getRiskColor(entry.riskLevel)}`}
                      >
                        {entry.riskLevel.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Approval Details */}
      {selectedApprovalData && (
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <EyeIcon className="w-5 h-5 mr-2 text-purple-500" />
            Approval Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                Request Information
              </h4>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium">Operation:</span>{' '}
                  {selectedApprovalData.operationType || 'N/A'}
                </p>
                <p>
                  <span className="font-medium">Requested By:</span>{' '}
                  {selectedApprovalData.requestedBy || 'System'}
                </p>
                <p>
                  <span className="font-medium">Created:</span>{' '}
                  {new Date(selectedApprovalData.createdAt).toLocaleString()}
                </p>
                <p>
                  <span className="font-medium">Risk Level:</span>
                  <span
                    className={`ml-2 px-2 py-1 rounded-md text-xs font-medium border ${getRiskColor(selectedApprovalData.riskLevel || 'medium')}`}
                  >
                    {(selectedApprovalData.riskLevel || 'medium').toUpperCase()}
                  </span>
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Description</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {selectedApprovalData.description || 'No description provided'}
              </p>

              {selectedApprovalData.metadata && (
                <>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2 mt-4">
                    Additional Details
                  </h4>
                  <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
                    {JSON.stringify(selectedApprovalData.metadata, null, 2)}
                  </pre>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-4 mt-6">
            <button
              onClick={() =>
                handleApproval(selectedApprovalData.id, 'reject', 'Rejected after review')
              }
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Reject
            </button>
            <button
              onClick={() => handleApproval(selectedApprovalData.id, 'approve')}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              Approve
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};
