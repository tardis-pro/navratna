import React, { useState, useEffect } from 'react';
import { ChevronDown, MessageSquare, Clock, Users, Eye, Download, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useDiscussion } from '@/contexts/DiscussionContext';
import { discussionsAPI } from '@/api/discussions.api';
import { cn } from '@/lib/utils';
import type { Discussion } from '@uaip/types';

interface DiscussionHistoryProps {
  onSelectDiscussion?: (discussionId: string) => void;
  className?: string;
}

export const DiscussionHistory: React.FC<DiscussionHistoryProps> = ({ 
  onSelectDiscussion, 
  className 
}) => {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { discussionId: currentDiscussionId, loadHistory } = useDiscussion();

  // Load discussions when dropdown is opened
  useEffect(() => {
    if (isOpen && discussions.length === 0) {
      loadDiscussions();
    }
  }, [isOpen]);

  const loadDiscussions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const discussionList = await discussionsAPI.list({ 
        limit: 20, 
        sortBy: 'updatedAt', 
        sortOrder: 'desc' 
      });
      setDiscussions(discussionList);
    } catch (err) {
      console.error('Failed to load discussions:', err);
      setError('Failed to load discussions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDiscussion = async (discussion: Discussion) => {
    try {
      console.log('🔍 Loading discussion:', discussion.id);
      
      // Force reload by clearing current discussion first
      if (loadHistory) {
        await loadHistory(discussion.id);
      }
      
      // Notify parent component
      if (onSelectDiscussion) {
        onSelectDiscussion(discussion.id);
      }
      
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to load discussion history:', err);
      setError('Failed to load discussion history');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'completed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'ended':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-900/20 dark:text-slate-400';
    }
  };

  const formatParticipantCount = (discussion: Discussion) => {
    const count = discussion.participants?.length || 0;
    return count === 1 ? '1 participant' : `${count} participants`;
  };

  return (
    <div className={cn("relative", className)}>
      {/* Dropdown Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <MessageSquare className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <div className="text-left">
            <div className="font-medium text-slate-900 dark:text-white">
              Discussion History
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {discussions.length > 0 ? `${discussions.length} discussions` : 'View past discussions'}
            </div>
          </div>
        </div>
        <ChevronDown className={cn(
          "w-4 h-4 text-slate-400 transition-transform duration-200",
          isOpen && "rotate-180"
        )} />
      </button>

      {/* Dropdown Content */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {isLoading && (
            <div className="p-4 text-center text-slate-500 dark:text-slate-400">
              Loading discussions...
            </div>
          )}

          {error && (
            <div className="p-4 text-center text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {!isLoading && !error && discussions.length === 0 && (
            <div className="p-4 text-center text-slate-500 dark:text-slate-400">
              No discussions found
            </div>
          )}

          {!isLoading && !error && discussions.length > 0 && (
            <div className="py-2">
              {discussions.map((discussion) => (
                <button
                  key={discussion.id}
                  onClick={() => handleSelectDiscussion(discussion)}
                  className={cn(
                    "w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-b-0",
                    currentDiscussionId === discussion.id && "bg-blue-50 dark:bg-blue-900/20"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-medium text-slate-900 dark:text-white truncate">
                          {discussion.title || 'Untitled Discussion'}
                        </h4>
                        <span className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          getStatusColor(discussion.status)
                        )}>
                          {discussion.status}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-4 text-sm text-slate-500 dark:text-slate-400">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{format(new Date(discussion.createdAt), 'MMM d, HH:mm')}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Users className="w-3 h-3" />
                          <span>{formatParticipantCount(discussion)}</span>
                        </div>
                      </div>
                      
                      {discussion.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                          {discussion.description}
                        </p>
                      )}
                    </div>
                    
                    {currentDiscussionId === discussion.id && (
                      <div className="ml-2 flex items-center text-blue-600 dark:text-blue-400">
                        <Eye className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-slate-200 dark:border-slate-700 p-3">
            <button
              onClick={loadDiscussions}
              disabled={isLoading}
              className="w-full px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};