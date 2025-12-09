// Tool Usage Indicator Component for Navratna
// Displays tool usage, execution status, and results in the UI

import React, { useState } from 'react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  ToolCall,
  ToolResult,
  ToolExecution,
  ToolDefinition,
  ToolExecutionStatus,
} from '../types/tool';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Wrench,
  Zap,
} from 'lucide-react';

interface ToolUsageIndicatorProps {
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  currentExecution?: ToolExecution;
  isUsingTool?: boolean;
  onApproveExecution?: (executionId: string) => void;
  onRetryExecution?: (executionId: string) => void;
  className?: string;
}

export const ToolUsageIndicator: React.FC<ToolUsageIndicatorProps> = ({
  toolCalls = [],
  toolResults = [],
  currentExecution,
  isUsingTool = false,
  onApproveExecution,
  onRetryExecution,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (toolCalls.length === 0 && !isUsingTool && !currentExecution) {
    return null;
  }

  const getStatusIcon = (status: ToolExecutionStatus) => {
    switch (status) {
      case 'running':
        return <Clock className="w-4 h-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'approval-required':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: ToolExecutionStatus) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'approval-required':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatResult = (result: any) => {
    if (typeof result === 'object') {
      return JSON.stringify(result, null, 2);
    }
    return String(result);
  };

  return (
    <Card className={`border-l-4 border-l-blue-500 bg-blue-50/50 ${className}`}>
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">
              {isUsingTool ? 'Using Tools' : 'Tool Usage'}
            </span>
            {isUsingTool && <Zap className="w-4 h-4 text-yellow-500 animate-pulse" />}
          </div>

          {toolCalls.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 px-2"
            >
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span className="ml-1 text-xs">{toolCalls.length}</span>
            </Button>
          )}
        </div>

        {/* Current Execution Status */}
        {currentExecution && (
          <div className="flex items-center gap-2 mb-2 p-2 bg-white rounded border">
            {getStatusIcon(currentExecution.status)}
            <span className="text-sm font-medium">{currentExecution.toolId}</span>
            <Badge className={getStatusColor(currentExecution.status)}>
              {currentExecution.status}
            </Badge>

            {currentExecution.status === 'approval-required' && onApproveExecution && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onApproveExecution(currentExecution.id)}
                className="ml-auto h-6 text-xs"
              >
                Approve
              </Button>
            )}

            {currentExecution.status === 'failed' &&
              onRetryExecution &&
              currentExecution.retryCount < currentExecution.maxRetries && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRetryExecution(currentExecution.id)}
                  className="ml-auto h-6 text-xs"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Retry
                </Button>
              )}
          </div>
        )}

        {/* Tool Calls Summary (collapsed) */}
        {!isExpanded && toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {toolCalls.map((call, index) => {
              const result = toolResults[index];
              const success = result?.success ?? null;

              return (
                <Badge
                  key={call.id}
                  variant="outline"
                  className={`text-xs ${
                    success === true
                      ? 'border-green-400 text-green-700'
                      : success === false
                        ? 'border-red-400 text-red-700'
                        : 'border-gray-400 text-gray-700'
                  }`}
                >
                  {call.toolId}
                  {success === true && <CheckCircle className="w-3 h-3 ml-1" />}
                  {success === false && <XCircle className="w-3 h-3 ml-1" />}
                </Badge>
              );
            })}
          </div>
        )}

        {/* Detailed Tool Calls (expanded) */}
        {isExpanded && toolCalls.length > 0 && (
          <div className="space-y-2 mt-2">
            {toolCalls.map((call, index) => {
              const result = toolResults[index];

              return (
                <div key={call.id} className="bg-white rounded border p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {call.toolId}
                      </Badge>
                      {result && (
                        <Badge
                          className={`text-xs ${getStatusColor(result.success ? 'completed' : 'failed')}`}
                        >
                          {result.success ? 'Success' : 'Failed'}
                        </Badge>
                      )}
                    </div>

                    {result?.executionTime && (
                      <span className="text-xs text-gray-500">
                        {formatDuration(result.executionTime)}
                      </span>
                    )}
                  </div>

                  {call.reasoning && (
                    <p className="text-xs text-gray-600 mb-1 italic">"{call.reasoning}"</p>
                  )}

                  {/* Parameters */}
                  {Object.keys(call.parameters).length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                        Parameters
                      </summary>
                      <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                        {JSON.stringify(call.parameters, null, 2)}
                      </pre>
                    </details>
                  )}

                  {/* Result */}
                  {result && (
                    <details className="text-xs mt-1">
                      <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                        {result.success ? 'Result' : 'Error'}
                      </summary>
                      <pre
                        className={`mt-1 p-2 rounded text-xs overflow-x-auto ${
                          result.success ? 'bg-green-50' : 'bg-red-50'
                        }`}
                      >
                        {result.success
                          ? formatResult(result.result)
                          : result.error?.message || 'Unknown error'}
                      </pre>
                    </details>
                  )}

                  {/* Cost and metadata */}
                  {result?.cost && (
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>Cost: {result.cost} units</span>
                      {call.confidence && (
                        <span>Confidence: {Math.round(call.confidence * 100)}%</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};

export default ToolUsageIndicator;
