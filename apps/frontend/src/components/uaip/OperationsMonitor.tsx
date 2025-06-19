import React, { useState, useEffect } from 'react';
import type { Operation, OperationStatus, OperationPriority } from '@uaip/types';
import { 
  CogIcon, 
  PlayIcon,
  PauseIcon,
  StopIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  BoltIcon,
  ArrowPathIcon,
  EyeIcon
} from '@heroicons/react/24/outline';

interface OperationsMonitorProps {
  operations: Operation[];
}

interface OperationMetrics {
  total: number;
  active: number;
  completed: number;
  failed: number;
  avgDuration: number;
  successRate: number;
}

interface ExecutionStep {
  id: string;
  name: string;
  status: OperationStatus;
  duration?: number;
  error?: string;
  output?: any;
}

interface MockOperation {
  id: string;
  type: string;
  agentId: string;
  agentName: string;
  description: string;
  status: OperationStatus;
  progress: number;
  startTime: Date;
  estimatedDuration: number;
  actualDuration?: number;
  steps: ExecutionStep[];
  priority: OperationPriority;
  resourceUsage: {
    cpu: number;
    memory: number;
    network: number;
  };
}

export const OperationsMonitor: React.FC<OperationsMonitorProps> = ({ operations }) => {
  const [mockOperations, setMockOperations] = useState<MockOperation[]>([]);
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<OperationMetrics>({
    total: 0,
    active: 0,
    completed: 0,
    failed: 0,
    avgDuration: 0,
    successRate: 0
  });

  useEffect(() => {
    // Mock real-time operations data
    const mockOps: MockOperation[] = [
      {
        id: 'op-1',
        type: 'code-analysis',
        agentId: 'agent-1',
        agentName: 'Technical Lead',
        description: 'Analyzing React component structure for performance optimization',
        status: OperationStatus.RUNNING,
        progress: 67,
        startTime: new Date(Date.now() - 180000),
        estimatedDuration: 300000,
        steps: [
          { id: 'step-1', name: 'Parse AST', status: OperationStatus.COMPLETED },
          { id: 'step-2', name: 'Analyze Dependencies', status: OperationStatus.COMPLETED },
          { id: 'step-3', name: 'Performance Check', status: OperationStatus.RUNNING },
          { id: 'step-4', name: 'Generate Report', status: OperationStatus.PENDING }
        ],
        priority: OperationPriority.HIGH,
        resourceUsage: { cpu: 45, memory: 128, network: 12 }
      },
      {
        id: 'op-2',
        type: 'documentation',
        agentId: 'agent-2',
        agentName: 'Documentation Specialist',
        description: 'Generating API documentation from OpenAPI spec',
        status: 'completed',
        progress: 100,
        startTime: new Date(Date.now() - 600000),
        estimatedDuration: 240000,
        actualDuration: 235000,
        steps: [
          { id: 'step-1', name: 'Parse OpenAPI', status: 'completed' },
          { id: 'step-2', name: 'Generate Docs', status: 'completed' },
          { id: 'step-3', name: 'Format Output', status: 'completed' }
        ],
        priority: 'medium',
        resourceUsage: { cpu: 0, memory: 0, network: 0 }
      },
      {
        id: 'op-3',
        type: 'security-scan',
        agentId: 'agent-3',
        agentName: 'Security Engineer',
        description: 'Running security vulnerability scan on dependencies',
        status: 'pending',
        progress: 0,
        startTime: new Date(),
        estimatedDuration: 480000,
        steps: [
          { id: 'step-1', name: 'Initialize Scanner', status: 'pending' },
          { id: 'step-2', name: 'Scan Dependencies', status: 'pending' },
          { id: 'step-3', name: 'Generate Report', status: 'pending' }
        ],
        priority: 'critical',
        resourceUsage: { cpu: 0, memory: 0, network: 0 }
      }
    ];

    setMockOperations(mockOps);
    
    // Calculate metrics
    const newMetrics: OperationMetrics = {
      total: mockOps.length,
      active: mockOps.filter(op => op.status === 'running').length,
      completed: mockOps.filter(op => op.status === 'completed').length,
      failed: mockOps.filter(op => op.status === 'failed').length,
      avgDuration: 250,
      successRate: 0.94
    };
    setMetrics(newMetrics);

    // Simulate real-time updates
    const interval = setInterval(() => {
      setMockOperations(prev => prev.map(op => {
        if (op.status === 'running') {
          const newProgress = Math.min(op.progress + Math.random() * 5, 100);
          return {
            ...op,
            progress: newProgress,
            status: newProgress >= 100 ? 'completed' : 'running'
          };
        }
        return op;
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <PlayIcon className="w-4 h-4 text-blue-500" />;
      case 'paused': return <PauseIcon className="w-4 h-4 text-yellow-500" />;
      case 'completed': return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircleIcon className="w-4 h-4 text-red-500" />;
      case 'cancelled': return <StopIcon className="w-4 h-4 text-gray-500" />;
      default: return <ClockIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'paused': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      default: return 'bg-gray-400';
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

  const selectedOp = mockOperations.find(op => op.id === selectedOperation);

  return (
    <div className="space-y-6">
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
        {/* Active Operations List */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <CogIcon className="w-5 h-5 mr-2 text-blue-500" />
            Active Operations
          </h3>
          
          <div className="space-y-4">
            {mockOperations.map((operation) => (
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
                    <div className={`w-3 h-3 rounded-full ${getPriorityColor(operation.priority)} mt-2`} />
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{operation.description}</h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {operation.agentName} • {operation.type}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(operation.status)}
                    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(operation.status)}`}>
                      {operation.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Progress</span>
                    <span className="text-gray-900 dark:text-white font-medium">{operation.progress.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${operation.progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Started: {operation.startTime.toLocaleTimeString()}
                  </span>
                  {operation.status === 'running' && (
                    <span className="text-blue-600 dark:text-blue-400">
                      ETA: {formatDuration(operation.estimatedDuration - (Date.now() - operation.startTime.getTime()))}
                    </span>
                  )}
                  {operation.actualDuration && (
                    <span className="text-green-600 dark:text-green-400">
                      Completed in {formatDuration(operation.actualDuration)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Operation Details */}
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <EyeIcon className="w-5 h-5 mr-2 text-purple-500" />
            Operation Details
          </h3>

          {selectedOp ? (
            <div className="space-y-6">
              {/* Operation Header */}
              <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">{selectedOp.description}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ID: {selectedOp.id} • Agent: {selectedOp.agentName}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(selectedOp.status)}
                    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(selectedOp.status)}`}>
                      {selectedOp.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Priority:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs font-medium text-white ${getPriorityColor(selectedOp.priority)}`}>
                      {selectedOp.priority.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Type:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedOp.type}</span>
                  </div>
                </div>
              </div>

              {/* Execution Steps */}
              <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <h5 className="font-semibold text-gray-900 dark:text-white mb-3">Execution Steps</h5>
                <div className="space-y-3">
                  {selectedOp.steps.map((step, index) => (
                    <div key={step.id} className="flex items-center space-x-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-600">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{index + 1}</span>
                      </div>
                      <div className="flex-1">
                        <span className="text-sm text-gray-900 dark:text-white">{step.name}</span>
                      </div>
                      {getStatusIcon(step.status)}
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(step.status)}`}>
                        {step.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resource Usage */}
              <div className="bg-white dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
                <h5 className="font-semibold text-gray-900 dark:text-white mb-3">Resource Usage</h5>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">CPU</span>
                      <span className="text-gray-900 dark:text-white">{selectedOp.resourceUsage.cpu}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${selectedOp.resourceUsage.cpu}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Memory</span>
                      <span className="text-gray-900 dark:text-white">{selectedOp.resourceUsage.memory} MB</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${Math.min((selectedOp.resourceUsage.memory / 512) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Network</span>
                      <span className="text-gray-900 dark:text-white">{selectedOp.resourceUsage.network} KB/s</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div 
                        className="bg-purple-500 h-2 rounded-full"
                        style={{ width: `${Math.min((selectedOp.resourceUsage.network / 100) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-2">
                {selectedOp.status === 'running' && (
                  <>
                    <button className="flex items-center space-x-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors">
                      <PauseIcon className="w-4 h-4" />
                      <span>Pause</span>
                    </button>
                    <button className="flex items-center space-x-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">
                      <StopIcon className="w-4 h-4" />
                      <span>Cancel</span>
                    </button>
                  </>
                )}
                {selectedOp.status === 'paused' && (
                  <button className="flex items-center space-x-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors">
                    <PlayIcon className="w-4 h-4" />
                    <span>Resume</span>
                  </button>
                )}
                {selectedOp.status === 'failed' && (
                  <button className="flex items-center space-x-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
                    <ArrowPathIcon className="w-4 h-4" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <CogIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Select an operation to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 