import React, { useState, useEffect } from 'react';
import { ApprovalWorkflow, SecurityContext } from '../../types/uaip-interfaces';
import { 
  ShieldCheckIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  UserIcon,
  LockClosedIcon,
  EyeIcon
} from '@heroicons/react/24/outline';

interface SecurityGatewayProps {
  pendingApprovals: ApprovalWorkflow[];
  securityContext: SecurityContext;
}

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

interface MockApproval {
  id: string;
  operationType: string;
  operationDescription: string;
  requestedBy: string;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'rejected';
  approvers: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  priority: 'low' | 'medium' | 'high' | 'critical';
  timeoutAt: Date;
  reason?: string;
}

export const SecurityGateway: React.FC<SecurityGatewayProps> = ({ pendingApprovals, securityContext }) => {
  const [mockApprovals, setMockApprovals] = useState<MockApproval[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SecurityMetrics>({
    totalApprovals: 0,
    pendingApprovals: 0,
    approved: 0,
    rejected: 0,
    averageApprovalTime: 0,
    riskLevel: 'low'
  });

  useEffect(() => {
    // Mock approval requests
    const mockApprovalData: MockApproval[] = [
      {
        id: 'approval-1',
        operationType: 'file-system-write',
        operationDescription: 'Create new configuration file in /etc/system/',
        requestedBy: 'Technical Lead',
        requestedAt: new Date(Date.now() - 300000),
        status: 'pending',
        approvers: ['Security Admin', 'System Admin'],
        riskLevel: 'high',
        priority: 'medium',
        timeoutAt: new Date(Date.now() + 3600000)
      },
      {
        id: 'approval-2',
        operationType: 'database-modification',
        operationDescription: 'Update user permissions table schema',
        requestedBy: 'Database Specialist',
        requestedAt: new Date(Date.now() - 600000),
        status: 'pending',
        approvers: ['Database Admin', 'Security Admin'],
        riskLevel: 'critical',
        priority: 'high',
        timeoutAt: new Date(Date.now() + 1800000)
      },
      {
        id: 'approval-3',
        operationType: 'api-integration',
        operationDescription: 'Connect to external payment processing API',
        requestedBy: 'Integration Specialist',
        requestedAt: new Date(Date.now() - 120000),
        status: 'approved',
        approvers: ['Security Admin'],
        riskLevel: 'medium',
        priority: 'medium',
        timeoutAt: new Date(Date.now() + 5400000)
      }
    ];

    // Mock audit entries
    const mockAuditData: AuditEntry[] = [
      {
        id: 'audit-1',
        timestamp: new Date(Date.now() - 180000),
        userId: 'tech-lead-001',
        action: 'file_create',
        resource: '/tmp/analysis_output.json',
        result: 'success',
        details: 'Created analysis output file',
        riskLevel: 'low'
      },
      {
        id: 'audit-2',
        timestamp: new Date(Date.now() - 360000),
        userId: 'security-admin-001',
        action: 'permission_grant',
        resource: 'database_read_access',
        result: 'success',
        details: 'Granted database read access to analyst role',
        riskLevel: 'medium'
      },
      {
        id: 'audit-3',
        timestamp: new Date(Date.now() - 540000),
        userId: 'integration-spec-001',
        action: 'api_call',
        resource: 'external_service_auth',
        result: 'denied',
        details: 'API authentication failed - invalid credentials',
        riskLevel: 'high'
      }
    ];

    setMockApprovals(mockApprovalData);
    setAuditEntries(mockAuditData);

    // Calculate metrics
    const newMetrics: SecurityMetrics = {
      totalApprovals: mockApprovalData.length,
      pendingApprovals: mockApprovalData.filter(a => a.status === 'pending').length,
      approved: mockApprovalData.filter(a => a.status === 'approved').length,
      rejected: mockApprovalData.filter(a => a.status === 'rejected').length,
      averageApprovalTime: 245,
      riskLevel: 'medium'
    };
    setMetrics(newMetrics);
  }, []);

  const handleApproval = (approvalId: string, decision: 'approve' | 'reject', reason?: string) => {
    setMockApprovals(prev => prev.map(approval => 
      approval.id === approvalId 
        ? { ...approval, status: decision === 'approve' ? 'approved' : 'rejected', reason }
        : approval
    ));
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'text-red-600 bg-red-100 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-100 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      default: return 'text-green-600 bg-green-100 border-green-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'rejected': return <XCircleIcon className="w-4 h-4 text-red-500" />;
      case 'pending': return <ClockIcon className="w-4 h-4 text-yellow-500" />;
      default: return <ClockIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  const getResultIcon = (result: string) => {
    switch (result) {
      case 'success': return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'failure': return <XCircleIcon className="w-4 h-4 text-red-500" />;
      case 'denied': return <ExclamationTriangleIcon className="w-4 h-4 text-orange-500" />;
      default: return <ClockIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  const selectedApprovalData = mockApprovals.find(a => a.id === selectedApproval);

  return (
    <div className="space-y-6">
      {/* Security Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Pending Approvals</p>
              <p className="text-2xl font-bold text-red-900 dark:text-red-100">{metrics.pendingApprovals}</p>
            </div>
            <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">Approved</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{metrics.approved}</p>
            </div>
            <CheckCircleIcon className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-600 dark:text-orange-400">Risk Level</p>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100 uppercase">{metrics.riskLevel}</p>
            </div>
            <ShieldCheckIcon className="w-8 h-8 text-orange-500" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Avg Approval Time</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{metrics.averageApprovalTime}s</p>
            </div>
            <ClockIcon className="w-8 h-8 text-blue-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Approval Requests */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <ExclamationTriangleIcon className="w-5 h-5 mr-2 text-orange-500" />
            Approval Requests
          </h3>
          
          <div className="space-y-4">
            {mockApprovals.map((approval) => (
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
                    <h4 className="font-semibold text-gray-900 dark:text-white">{approval.operationDescription}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {approval.operationType} • Requested by {approval.requestedBy}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(approval.status)}
                    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getRiskColor(approval.riskLevel)}`}>
                      {approval.riskLevel.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Requested: {approval.requestedAt.toLocaleTimeString()}
                  </span>
                  {approval.status === 'pending' && (
                    <span className="text-red-600 dark:text-red-400">
                      Timeout: {approval.timeoutAt.toLocaleTimeString()}
                    </span>
                  )}
                </div>

                {approval.status === 'pending' && (
                  <div className="flex space-x-2 mt-3">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApproval(approval.id, 'approve');
                      }}
                      className="flex items-center space-x-1 px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded-md text-xs transition-colors"
                    >
                      <CheckCircleIcon className="w-3 h-3" />
                      <span>Approve</span>
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApproval(approval.id, 'reject', 'Manual rejection');
                      }}
                      className="flex items-center space-x-1 px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-md text-xs transition-colors"
                    >
                      <XCircleIcon className="w-3 h-3" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Audit Log */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <DocumentTextIcon className="w-5 h-5 mr-2 text-blue-500" />
            Recent Audit Entries
          </h3>
          
          <div className="space-y-4">
            {auditEntries.map((entry) => (
              <div key={entry.id} className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start space-x-3">
                    {getResultIcon(entry.result)}
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{entry.action.replace('_', ' ').toUpperCase()}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{entry.details}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getRiskColor(entry.riskLevel)}`}>
                    {entry.riskLevel}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm mt-3">
                  <span className="text-gray-600 dark:text-gray-400">
                    User: {entry.userId}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {entry.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Approval Details Modal */}
      {selectedApprovalData && (
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <EyeIcon className="w-5 h-5 mr-2 text-purple-500" />
            Approval Details
          </h3>

          <div className="bg-white dark:bg-slate-700 rounded-xl p-6 border border-slate-200 dark:border-slate-600">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Request Information</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Operation:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedApprovalData.operationType}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Description:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedApprovalData.operationDescription}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Requested by:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedApprovalData.requestedBy}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Requested at:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedApprovalData.requestedAt.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Risk Assessment</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Risk Level:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs font-medium border ${getRiskColor(selectedApprovalData.riskLevel)}`}>
                      {selectedApprovalData.riskLevel.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Priority:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs font-medium border ${getRiskColor(selectedApprovalData.priority)}`}>
                      {selectedApprovalData.priority.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Status:</span>
                    <span className="ml-2 text-gray-900 dark:text-white flex items-center">
                      {getStatusIcon(selectedApprovalData.status)}
                      <span className="ml-1">{selectedApprovalData.status.toUpperCase()}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Required Approvers</h4>
              <div className="flex flex-wrap gap-2">
                {selectedApprovalData.approvers.map((approver, index) => (
                  <span key={index} className="flex items-center space-x-1 px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-md text-sm">
                    <UserIcon className="w-4 h-4" />
                    <span>{approver}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 