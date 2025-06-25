import React, { useState, useEffect } from 'react';
import { useUAIP } from '@/contexts/UAIPContext';
import { motion } from 'framer-motion';
import { 
  BoltIcon, 
  InformationCircleIcon, 
  LightBulbIcon, 
  CheckCircleIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface EventStreamMonitorPortalProps {
  className?: string;
  viewport?: ViewportSize;
}

interface Event {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  source: string;
  message: string;
  timestamp: Date;
  correlationId?: string;
}

export const EventStreamMonitor: React.FC<EventStreamMonitorPortalProps> = ({ className, viewport }) => {
  const { events, operations, agents, refreshData, isWebSocketConnected } = useUAIP();
  const [displayEvents, setDisplayEvents] = useState<Event[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [maxEvents, setMaxEvents] = useState<number>(50);

  // Default viewport setup
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  };

  const currentViewport = viewport || defaultViewport;

  useEffect(() => {
    // Transform events from UAIPContext to display format
    const transformedEvents: Event[] = events.data.map(event => ({
      id: event.id,
      type: event.type,
      source: event.source,
      message: event.message,
      timestamp: event.timestamp,
      correlationId: event.correlationId
    }));

    // Add events from operations
    operations.data.forEach(operation => {
      if (operation.status === 'running' || operation.status === 'completed' || operation.status === 'failed') {
        transformedEvents.push({
          id: `op-${operation.id}`,
          type: operation.status === 'failed' ? 'error' : 
                operation.status === 'completed' ? 'success' : 'info',
          source: `Operation ${operation.id}`,
          message: `Operation ${operation.name || operation.id} ${operation.status}`,
          timestamp: operation.updatedAt ? new Date(operation.updatedAt) : new Date(),
          correlationId: operation.id
        });
      }
    });

    // Add events from agent status changes
    agents.data.forEach(agent => {
      if (agent.lastActivity) {
        transformedEvents.push({
          id: `agent-${agent.id}`,
          type: agent.status === 'error' ? 'error' : 
                agent.status === 'active' ? 'success' : 'info',
          source: `Agent ${agent.name}`,
          message: `Agent ${agent.name} is ${agent.status}`,
          timestamp: agent.lastActivity,
          correlationId: agent.id
        });
      }
    });

    // Sort by timestamp (newest first) and limit
    const sortedEvents = transformedEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, maxEvents);

    // Filter by type if specified
    const filteredEvents = filterType === 'all' 
      ? sortedEvents 
      : sortedEvents.filter(event => event.type === filterType);

    setDisplayEvents(filteredEvents);
  }, [events.data, operations.data, agents.data, filterType, maxEvents]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'warning': return <LightBulbIcon className="w-4 h-4 text-yellow-500" />;
      case 'error': return <XCircleIcon className="w-4 h-4 text-red-500" />;
      default: return <InformationCircleIcon className="w-4 h-4 text-blue-500" />;
    }
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'success': return 'border-l-green-500';
      case 'warning': return 'border-l-yellow-500';
      case 'error': return 'border-l-red-500';
      default: return 'border-l-blue-500';
    }
  };

  const getEventTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'success': return 'bg-green-100 text-green-800 border-green-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const eventTypes = ['all', 'info', 'success', 'warning', 'error'];
  const eventCounts = {
    all: displayEvents.length,
    info: displayEvents.filter(e => e.type === 'info').length,
    success: displayEvents.filter(e => e.type === 'success').length,
    warning: displayEvents.filter(e => e.type === 'warning').length,
    error: displayEvents.filter(e => e.type === 'error').length,
  };

  // Show error state
  if (events.error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`space-y-6 ${className ?? ''} ${currentViewport.isMobile ? 'px-2' : ''}`}
      >
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-500 dark:text-red-400">Failed to load events</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{events.error.message}</p>
            <button
              onClick={refreshData}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Show loading state
  if (events.isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`space-y-6 ${className ?? ''} ${currentViewport.isMobile ? 'px-2' : ''}`}
      >
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <ArrowPathIcon className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading events...</p>
          </div>
        </div>
      </motion.div>
    );
  }

  // Show empty state
  if (displayEvents.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`space-y-6 ${className ?? ''} ${currentViewport.isMobile ? 'px-2' : ''}`}
      >
        {/* Header with Connection Status */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
            <BoltIcon className="w-6 h-6 mr-2 text-gray-400" />
            Event Stream Monitor
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
              title="Refresh events"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <BoltIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500 dark:text-gray-400">No events to display</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">Events will appear here as they occur</p>
          </div>
        </div>
      </motion.div>
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
          <BoltIcon className="w-6 h-6 mr-2 text-green-500" />
          Event Stream Monitor
        </h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-sm text-gray-500">
              {isWebSocketConnected ? 'Live' : 'Offline'} ({eventCounts.all})
            </span>
          </div>
          <button
            onClick={refreshData}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Refresh events"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          {events.lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated: {events.lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Event Type Filters */}
      <div className="flex flex-wrap gap-2">
        {eventTypes.map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filterType === type
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)} ({eventCounts[type as keyof typeof eventCounts]})
          </button>
        ))}
      </div>

      {/* Event Count Selector */}
      <div className="flex items-center space-x-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Show last:
        </label>
        <select
          value={maxEvents}
          onChange={(e) => setMaxEvents(Number(e.target.value))}
          className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value={25}>25 events</option>
          <option value={50}>50 events</option>
          <option value={100}>100 events</option>
          <option value={200}>200 events</option>
        </select>
      </div>

      {/* Events List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {displayEvents.map((event) => (
          <div 
            key={event.id} 
            className={`bg-white dark:bg-slate-700 rounded-lg p-3 border-l-4 border border-slate-200 dark:border-slate-600 ${getEventTypeColor(event.type)} hover:shadow-md transition-shadow`}
          >
            <div className="flex items-start space-x-3">
              {getEventIcon(event.type)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{event.source}</span>
                    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getEventTypeBadgeColor(event.type)}`}>
                      {event.type.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">{event.timestamp.toLocaleTimeString()}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{event.message}</p>
                {event.correlationId && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-blue-600 dark:text-blue-400">ID: {event.correlationId}</span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500">{event.timestamp.toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Event Statistics */}
      <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Event Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{eventCounts.info}</div>
            <div className="text-sm text-gray-500">Info</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{eventCounts.success}</div>
            <div className="text-sm text-gray-500">Success</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{eventCounts.warning}</div>
            <div className="text-sm text-gray-500">Warning</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{eventCounts.error}</div>
            <div className="text-sm text-gray-500">Error</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}; 