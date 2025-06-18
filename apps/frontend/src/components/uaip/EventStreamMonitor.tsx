import React, { useState, useEffect } from 'react';
import { BoltIcon, InformationCircleIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

interface Event {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  source: string;
  message: string;
  timestamp: Date;
  correlationId?: string;
}

export const EventStreamMonitor: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    const mockEvents: Event[] = [
      {
        id: 'event-1',
        type: 'success',
        source: 'OperationOrchestrator',
        message: 'Code analysis operation completed successfully',
        timestamp: new Date(Date.now() - 30000),
        correlationId: 'op-123'
      },
      {
        id: 'event-2',
        type: 'info',
        source: 'SecurityGateway',
        message: 'New approval request submitted for file system access',
        timestamp: new Date(Date.now() - 120000),
        correlationId: 'approval-456'
      },
      {
        id: 'event-3',
        type: 'warning',
        source: 'CapabilityRegistry',
        message: 'High resource usage detected for database migration tool',
        timestamp: new Date(Date.now() - 300000)
      }
    ];
    
    setEvents(mockEvents);

    // Simulate real-time events
    const interval = setInterval(() => {
      const newEvent: Event = {
        id: `event-${Date.now()}`,
        type: ['info', 'success', 'warning'][Math.floor(Math.random() * 3)] as Event['type'],
        source: ['Intelligence', 'Operations', 'Security', 'Registry'][Math.floor(Math.random() * 4)],
        message: 'System event occurred',
        timestamp: new Date()
      };
      
      setEvents(prev => [newEvent, ...prev.slice(0, 19)]);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'warning': return <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />;
      case 'error': return <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />;
      default: return <InformationCircleIcon className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
          <BoltIcon className="w-5 h-5 mr-2 text-green-500" />
          Live Event Stream
        </h3>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm text-gray-500">Live</span>
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {events.map((event) => (
          <div key={event.id} className="bg-white dark:bg-slate-700 rounded-lg p-3 border border-slate-200 dark:border-slate-600">
            <div className="flex items-start space-x-3">
              {getEventIcon(event.type)}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{event.source}</span>
                  <span className="text-xs text-gray-500">{event.timestamp.toLocaleTimeString()}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{event.message}</p>
                {event.correlationId && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">ID: {event.correlationId}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}; 