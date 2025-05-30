import React, { useState, useEffect } from 'react';
import { EnhancedAgentState } from '../../types/uaip-interfaces';
import { LightBulbIcon, TrendingUpIcon, ExclamationTriangleIcon, ChartBarIcon } from '@heroicons/react/24/outline';

interface InsightsPanelProps {
  agents: EnhancedAgentState[];
}

interface Insight {
  id: string;
  type: 'pattern' | 'optimization' | 'risk' | 'opportunity';
  title: string;
  description: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
  timestamp: Date;
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({ agents }) => {
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    const mockInsights: Insight[] = [
      {
        id: 'insight-1',
        type: 'optimization',
        title: 'Agent Collaboration Efficiency',
        description: 'Technical and Creative agents show 23% better outcomes when working together on complex tasks',
        confidence: 0.87,
        impact: 'high',
        actionable: true,
        timestamp: new Date()
      },
      {
        id: 'insight-2',
        type: 'pattern',
        title: 'Peak Performance Hours',
        description: 'System performance is optimal between 2-4 PM UTC, with 15% faster operation completion',
        confidence: 0.93,
        impact: 'medium',
        actionable: true,
        timestamp: new Date()
      }
    ];
    setInsights(mockInsights);
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {insights.map((insight) => (
          <div key={insight.id} className="bg-white dark:bg-slate-700 rounded-xl p-6 border border-slate-200 dark:border-slate-600">
            <div className="flex items-start space-x-3">
              <LightBulbIcon className="w-6 h-6 text-yellow-500" />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white">{insight.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 mt-2">{insight.description}</p>
                <div className="flex items-center space-x-4 mt-3 text-sm">
                  <span className="text-green-600">Confidence: {(insight.confidence * 100).toFixed(0)}%</span>
                  <span className="text-purple-600">Impact: {insight.impact}</span>
                  {insight.actionable && (
                    <span className="text-blue-600">Actionable</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}; 