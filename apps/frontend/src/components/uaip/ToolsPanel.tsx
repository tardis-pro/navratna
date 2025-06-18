import React, { useState, useEffect } from 'react';
import { EnhancedAgentState } from '../../types/uaip-interfaces';
import { WrenchScrewdriverIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/outline';

interface ToolsPanelProps {
  agents: EnhancedAgentState[];
}

interface Tool {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  description: string;
  lastUsed: Date;
  usageCount: number;
}

export const ToolsPanel: React.FC<ToolsPanelProps> = ({ agents }) => {
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    const mockTools: Tool[] = [
      {
        id: 'tool-1',
        name: 'Code Analysis Engine',
        status: 'active',
        description: 'Analyzes code quality and suggests improvements',
        lastUsed: new Date(Date.now() - 300000),
        usageCount: 45
      },
      {
        id: 'tool-2',
        name: 'Documentation Generator',
        status: 'active',
        description: 'Auto-generates documentation from code',
        lastUsed: new Date(Date.now() - 600000),
        usageCount: 23
      },
      {
        id: 'tool-3',
        name: 'Security Scanner',
        status: 'inactive',
        description: 'Scans for security vulnerabilities',
        lastUsed: new Date(Date.now() - 1800000),
        usageCount: 12
      }
    ];
    setTools(mockTools);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'inactive': return <ClockIcon className="w-5 h-5 text-gray-500" />;
      case 'error': return <XCircleIcon className="w-5 h-5 text-red-500" />;
      default: return <ClockIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => (
          <div key={tool.id} className="bg-white dark:bg-slate-700 rounded-xl p-6 border border-slate-200 dark:border-slate-600">
            <div className="flex items-start space-x-3">
              <WrenchScrewdriverIcon className="w-6 h-6 text-blue-500" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{tool.name}</h3>
                  {getStatusIcon(tool.status)}
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">{tool.description}</p>
                <div className="text-sm text-gray-500">
                  <p>Used {tool.usageCount} times</p>
                  <p>Last used: {tool.lastUsed.toLocaleTimeString()}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}; 