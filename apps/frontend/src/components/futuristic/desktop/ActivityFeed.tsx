import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  TrendingUp,
  Clock,
  Star,
  BarChart3,
  Filter,
  Calendar,
  Zap,
  Target,
  Award,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ActivityEvent {
  id: string;
  type:
    | 'portal_open'
    | 'portal_close'
    | 'action_execute'
    | 'search'
    | 'file_access'
    | 'user_interaction';
  itemId: string;
  timestamp: Date;
  duration?: number;
  metadata?: Record<string, any>;
}

interface RecentItem {
  id: string;
  title: string;
  type: string;
  timestamp: Date;
  icon: React.ComponentType<any>;
  description?: string;
  isPinned?: boolean;
  isFavorite?: boolean;
  accessCount?: number;
  lastAccessed?: Date;
  category?: 'portal' | 'action' | 'file' | 'search';
}

interface ActivityStats {
  totalEvents: number;
  todayEvents: number;
  weekEvents: number;
  monthEvents: number;
  mostUsedItems: RecentItem[];
  averageSessionTime: number;
}

interface TrendingItem {
  itemId: string;
  item?: RecentItem;
  recentCount: number;
  previousCount: number;
  growth: number;
}

interface ActivityFeedProps {
  activityEvents: ActivityEvent[];
  recentItems: RecentItem[];
  activityStats: ActivityStats;
  trendingItems: TrendingItem[];
  onItemClick?: (item: RecentItem) => void;
  className?: string;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activityEvents,
  recentItems,
  activityStats,
  trendingItems,
  onItemClick,
  className = '',
}) => {
  const [selectedTimeRange, setSelectedTimeRange] = useState<'today' | 'week' | 'month'>('today');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');

  // Filter events based on selected criteria
  const filteredEvents = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (selectedTimeRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0);
    }

    return activityEvents
      .filter((event) => event.timestamp >= startDate)
      .filter((event) => selectedEventType === 'all' || event.type === selectedEventType)
      .slice(0, 50); // Limit to 50 most recent events
  }, [activityEvents, selectedTimeRange, selectedEventType]);

  // Format timestamp for display
  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return timestamp.toLocaleDateString();
  };

  // Get event type color
  const getEventTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      portal_open: 'bg-blue-500/20 text-blue-400',
      portal_close: 'bg-gray-500/20 text-gray-400',
      action_execute: 'bg-green-500/20 text-green-400',
      search: 'bg-purple-500/20 text-purple-400',
      file_access: 'bg-orange-500/20 text-orange-400',
      user_interaction: 'bg-cyan-500/20 text-cyan-400',
    };
    return colors[type] || 'bg-slate-500/20 text-slate-400';
  };

  // Get event type icon
  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case 'portal_open':
      case 'portal_close':
        return Activity;
      case 'action_execute':
        return Zap;
      case 'search':
        return Target;
      case 'file_access':
        return Clock;
      case 'user_interaction':
        return Star;
      default:
        return Activity;
    }
  };

  return (
    <div
      className={`h-full flex flex-col bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-700/50 ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-blue-400" />
            <h3 className="text-white font-semibold">Activity Feed</h3>
          </div>
          <Badge className="bg-blue-500/20 text-blue-400">{filteredEvents.length} events</Badge>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-2">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value as any)}
            className="bg-slate-800/50 border border-slate-600/50 text-white text-xs rounded px-2 py-1"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>

          <select
            value={selectedEventType}
            onChange={(e) => setSelectedEventType(e.target.value)}
            className="bg-slate-800/50 border border-slate-600/50 text-white text-xs rounded px-2 py-1"
          >
            <option value="all">All Events</option>
            <option value="portal_open">Portal Opens</option>
            <option value="action_execute">Actions</option>
            <option value="search">Searches</option>
            <option value="user_interaction">Interactions</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="events" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3 bg-slate-800/50 border-b border-slate-700/50">
            <TabsTrigger value="events" className="text-xs">
              Events
            </TabsTrigger>
            <TabsTrigger value="trending" className="text-xs">
              Trending
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-xs">
              Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-2">
                <AnimatePresence>
                  {filteredEvents.map((event, index) => {
                    const EventIcon = getEventTypeIcon(event.type);
                    const relatedItem = recentItems.find((item) => item.id === event.itemId);

                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: index * 0.02 }}
                        className="flex items-center space-x-3 p-2 bg-slate-800/30 rounded-lg hover:bg-slate-700/50 transition-colors"
                      >
                        <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <EventIcon size={14} className="text-slate-400" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <Badge
                              className={`text-xs px-2 py-0.5 ${getEventTypeColor(event.type)}`}
                            >
                              {event.type.replace('_', ' ')}
                            </Badge>
                            <span className="text-slate-500 text-xs">
                              {formatTimestamp(event.timestamp)}
                            </span>
                          </div>

                          {relatedItem && (
                            <p className="text-white text-sm mt-1 truncate">{relatedItem.title}</p>
                          )}

                          {event.duration && (
                            <p className="text-slate-400 text-xs">
                              Duration: {Math.round(event.duration / 1000)}s
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="trending" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-2">
                {trendingItems.map((trend, index) => {
                  if (!trend.item) return null;

                  const IconComponent = trend.item.icon || Activity;

                  return (
                    <motion.div
                      key={trend.itemId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center space-x-3 p-3 bg-slate-800/30 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer"
                      onClick={() => onItemClick?.(trend.item!)}
                    >
                      <div className="w-10 h-10 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <IconComponent size={16} className="text-green-400" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-medium truncate">{trend.item.title}</h4>
                        <div className="flex items-center space-x-2 mt-1">
                          <TrendingUp size={12} className="text-green-400" />
                          <span className="text-green-400 text-xs">
                            +{Math.round(trend.growth * 100)}% growth
                          </span>
                          <span className="text-slate-400 text-xs">
                            {trend.recentCount} uses this week
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="stats" className="flex-1 overflow-hidden mt-0">
            <div className="p-3 space-y-4">
              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/30 rounded-lg p-3">
                  <div className="flex items-center space-x-2 mb-1">
                    <Calendar size={14} className="text-blue-400" />
                    <span className="text-slate-400 text-xs">Today</span>
                  </div>
                  <span className="text-white font-semibold">{activityStats.todayEvents}</span>
                </div>

                <div className="bg-slate-800/30 rounded-lg p-3">
                  <div className="flex items-center space-x-2 mb-1">
                    <BarChart3 size={14} className="text-purple-400" />
                    <span className="text-slate-400 text-xs">Total</span>
                  </div>
                  <span className="text-white font-semibold">{activityStats.totalEvents}</span>
                </div>
              </div>

              {/* Most Used Items */}
              <div>
                <h4 className="text-white font-medium mb-2 flex items-center space-x-2">
                  <Award size={14} className="text-yellow-400" />
                  <span>Most Used</span>
                </h4>
                <div className="space-y-2">
                  {activityStats.mostUsedItems.slice(0, 3).map((item, index) => {
                    const IconComponent = item.icon || Activity;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center space-x-2 p-2 bg-slate-800/30 rounded-lg"
                      >
                        <div className="w-6 h-6 bg-slate-700/50 rounded flex items-center justify-center">
                          <IconComponent size={12} className="text-slate-400" />
                        </div>
                        <span className="text-white text-sm flex-1 truncate">{item.title}</span>
                        <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                          {item.accessCount}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
