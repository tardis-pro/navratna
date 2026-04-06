import React, { useState, useEffect } from 'react';
import { useUAIP } from '@/contexts/UAIPContext';
import {
  Zap,
  Info,
  Lightbulb,
  CheckCircle,
  XCircle,
  Clock as _Clock,
} from 'lucide-react';
import { ViewportSize, useViewport } from '@/hooks/use_viewport';
import {
  PortalContainer,
  PortalLoadingState,
  PortalEmptyState,
  PortalErrorState,
  PortalHeader,
} from './portal-shared-components';

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

export const EventStreamMonitor: React.FC<EventStreamMonitorPortalProps> = ({
  className,
  viewport,
}) => {
  const { events, operations, agents, refreshData, isWebSocketConnected } = useUAIP();
  const [displayEvents, setDisplayEvents] = useState<Event[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [maxEvents, setMaxEvents] = useState<number>(50);

  const currentViewport = useViewport(viewport);

  useEffect(() => {
    // Transform events from UAIPContext to display format
    const transformedEvents: Event[] = events.data.map((event) => ({
      id: event.id,
      type: event.type,
      source: event.source,
      message: event.message,
      timestamp: event.timestamp,
      correlationId: event.correlationId,
    }));

    // Add events from operations
    operations.data.forEach((operation) => {
      if (
        operation.status === 'running' ||
        operation.status === 'completed' ||
        operation.status === 'failed'
      ) {
        transformedEvents.push({
          id: `op-${operation.id}`,
          type:
            operation.status === 'failed'
              ? 'error'
              : operation.status === 'completed'
                ? 'success'
                : 'info',
          source: `Operation ${operation.id}`,
          message: `Operation ${operation.name || operation.id} ${operation.status}`,
          timestamp: operation.updatedAt ? new Date(operation.updatedAt) : new Date(),
          correlationId: operation.id,
        });
      }
    });

    // Add events from agent status changes
    agents.data.forEach((agent) => {
      if (agent.lastActivity) {
        transformedEvents.push({
          id: `agent-${agent.id}`,
          type: agent.status === 'error' ? 'error' : agent.status === 'active' ? 'success' : 'info',
          source: `Agent ${agent.name}`,
          message: `Agent ${agent.name} is ${agent.status}`,
          timestamp: agent.lastActivity,
          correlationId: agent.id,
        });
      }
    });

    // Sort by timestamp (newest first) and limit
    const sortedEvents = transformedEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, maxEvents);

    // Filter by type if specified
    const filteredEvents =
      filterType === 'all'
        ? sortedEvents
        : sortedEvents.filter((event) => event.type === filterType);

    setDisplayEvents(filteredEvents);
  }, [events.data, operations.data, agents.data, filterType, maxEvents]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <Lightbulb className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'border-l-green-500';
      case 'warning':
        return 'border-l-yellow-500';
      case 'error':
        return 'border-l-red-500';
      default:
        return 'border-l-blue-500';
    }
  };

  const getEventTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const eventTypes = ['all', 'info', 'success', 'warning', 'error'];
  const eventCounts: Record<string, number> = {
    all: displayEvents.length,
    info: displayEvents.filter((e) => e.type === 'info').length,
    success: displayEvents.filter((e) => e.type === 'success').length,
    warning: displayEvents.filter((e) => e.type === 'warning').length,
    error: displayEvents.filter((e) => e.type === 'error').length,
  };

  if (events.error) {
    return (
      <PortalContainer className={className}>
        <PortalErrorState
          message="Failed to load events"
          detail={events.error.message}
          onRetry={refreshData}
        />
      </PortalContainer>
    );
  }

  if (events.isLoading) {
    return (
      <PortalContainer className={className}>
        <PortalLoadingState message="Loading events..." />
      </PortalContainer>
    );
  }

  if (displayEvents.length === 0) {
    return (
      <PortalContainer className={className}>
        <PortalHeader
          icon={<Zap className="w-6 h-6 mr-2 text-slate-400" />}
          title="Event Stream Monitor"
          isConnected={isWebSocketConnected}
          onRefresh={refreshData}
        />

        <PortalEmptyState
          icon={<Zap className="w-8 h-8 text-slate-400 mx-auto mb-2" />}
          title="No events to display"
          description="Events will appear here as they occur"
        />
      </PortalContainer>
    );
  }

  return (
    <PortalContainer className={className}>
      <PortalHeader
        icon={<Zap className="w-6 h-6 mr-2 text-green-500" />}
        title="Event Stream Monitor"
        isConnected={isWebSocketConnected}
        onRefresh={refreshData}
      />

      {/* Event Type Filters */}
      <div className="flex flex-wrap gap-2">
        {eventTypes.map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filterType === type
                ? 'bg-blue-500 text-white'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700/50'
            }`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)} (
            {eventCounts[type] ?? 0})
          </button>
        ))}
      </div>

      {/* Event Count Selector */}
      <div className="flex items-center space-x-4">
        <label className="text-sm font-medium text-slate-300">Show last:</label>
        <select
          value={maxEvents}
          onChange={(e) => setMaxEvents(Number(e.target.value))}
          className="px-3 py-1 border border-slate-700/60 rounded-lg bg-slate-900/50 text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-xl"
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
            className={`bg-slate-900/40 rounded-lg p-3 border-l-4 border border-slate-700/50 backdrop-blur-xl ${getEventTypeColor(event.type)} hover:shadow-md transition-shadow`}
          >
            <div className="flex items-start space-x-3">
              {getEventIcon(event.type)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-slate-100">
                      {event.source}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-medium border ${getEventTypeBadgeColor(event.type)}`}
                    >
                      {event.type.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {event.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-slate-300 mb-1">{event.message}</p>
                {event.correlationId && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-blue-400">
                      ID: {event.correlationId}
                    </span>
                    <span className="text-xs text-slate-600">•</span>
                    <span className="text-xs text-slate-500">
                      {event.timestamp.toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Event Statistics */}
      <div className="bg-slate-900/40 rounded-2xl p-6 border border-slate-700/50 backdrop-blur-xl mt-4">
        <h3 className="text-lg font-bold text-slate-100 mb-4">Event Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-500">{eventCounts.info}</div>
            <div className="text-sm text-slate-400">Info</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">{eventCounts.success}</div>
            <div className="text-sm text-slate-400">Success</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-500">{eventCounts.warning}</div>
            <div className="text-sm text-slate-400">Warning</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">{eventCounts.error}</div>
            <div className="text-sm text-slate-400">Error</div>
          </div>
        </div>
      </div>
    </PortalContainer>
  );
};
