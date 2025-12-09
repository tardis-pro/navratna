import React, { useState } from 'react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

export interface Decision {
  id: string;
  title: string;
  description: string;
  options: string[];
  chosenOption: string;
  rationale: string;
  participants: string[];
  timestamp: Date;
  confidence: number; // 1-10
  impact: 'low' | 'medium' | 'high';
  status: 'proposed' | 'decided' | 'implemented' | 'reviewed';
}

interface DecisionLogProps {
  className?: string;
  decisions?: Decision[];
  onAddDecision?: (decision: Omit<Decision, 'id' | 'timestamp'>) => void;
}

export const DecisionLog: React.FC<DecisionLogProps> = ({
  className,
  decisions = [],
  onAddDecision,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);

  const getStatusColor = (status: Decision['status']) => {
    const colors = {
      proposed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      decided: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      implemented: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      reviewed: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    };
    return colors[status];
  };

  const getImpactColor = (impact: Decision['impact']) => {
    const colors = {
      low: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      medium: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    };
    return colors[impact];
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 8) return 'text-green-600 dark:text-green-400';
    if (confidence >= 6) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Decision Log</h2>
        {onAddDecision && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
          >
            + Add Decision
          </button>
        )}
      </div>

      {decisions.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="mb-2">📋</div>
          <p>No decisions recorded yet</p>
          <p className="text-sm mt-1">
            Decisions will be automatically detected from conversation patterns
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {decisions.map((decision) => (
            <div
              key={decision.id}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                    {decision.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {decision.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <span
                    className={cn(
                      'px-2 py-1 rounded text-xs font-medium',
                      getStatusColor(decision.status)
                    )}
                  >
                    {decision.status}
                  </span>
                  <span
                    className={cn(
                      'px-2 py-1 rounded text-xs font-medium',
                      getImpactColor(decision.impact)
                    )}
                  >
                    {decision.impact} impact
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Options Considered:
                  </div>
                  <div className="space-y-1">
                    {decision.options.map((option) => (
                      <div
                        key={option}
                        className={cn(
                          'text-sm px-2 py-1 rounded',
                          option === decision.chosenOption
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 font-medium'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        )}
                      >
                        {option === decision.chosenOption && '✓ '}
                        {option}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Rationale:</div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                    {decision.rationale}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-4">
                  <span>Participants: {decision.participants.join(', ')}</span>
                  <span className={getConfidenceColor(decision.confidence)}>
                    Confidence: {decision.confidence}/10
                  </span>
                </div>
                <span>{format(decision.timestamp, 'PPpp')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddForm && onAddDecision && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Add New Decision</h3>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Decision tracking form would go here. For now, decisions are automatically detected from
            conversation patterns.
          </div>
          <button
            onClick={() => setShowAddForm(false)}
            className="mt-3 px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
