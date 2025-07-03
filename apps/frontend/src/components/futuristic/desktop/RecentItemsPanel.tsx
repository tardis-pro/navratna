import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Star,
  X,
  MoreVertical,
  Pin,
  Trash2,
  ExternalLink,
  Filter,
  Search,
  Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivityFeed } from './ActivityFeed';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
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
}

interface ActivityEvent {
  id: string;
  type: 'portal_open' | 'portal_close' | 'action_execute' | 'search' | 'file_access' | 'user_interaction';
  itemId: string;
  timestamp: Date;
  duration?: number;
  metadata?: Record<string, any>;
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

interface RecentItemsPanelProps {
  viewport: ViewportSize;
  recentItems: RecentItem[];
  activityEvents?: ActivityEvent[];
  activityStats?: ActivityStats;
  trendingItems?: TrendingItem[];
  onItemClick: (item: any) => void;
  onClose: () => void;
}

export const RecentItemsPanel: React.FC<RecentItemsPanelProps> = ({
  viewport,
  recentItems,
  activityEvents = [],
  activityStats,
  trendingItems = [],
  onItemClick,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Calculate panel width based on viewport
  const panelWidth = viewport.isMobile ? '100%' : viewport.isTablet ? 250 : 300;

  // Filter and sort items
  const filteredItems = recentItems
    .filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'all' || item.type === filterType;
      const matchesFavorites = !showFavoritesOnly || item.isFavorite;

      return matchesSearch && matchesType && matchesFavorites;
    })
    .sort((a, b) => {
      // Pinned items first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      // Then by timestamp (most recent first)
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

  // Get unique types for filter
  const availableTypes = Array.from(new Set(recentItems.map(item => item.type)));

  // Format timestamp
  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return timestamp.toLocaleDateString();
  };

  // Get type color
  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'agent-hub': 'bg-cyan-500/20 text-cyan-400',
      'discussion-hub': 'bg-green-500/20 text-green-400',
      'knowledge': 'bg-orange-500/20 text-orange-400',
      'artifacts': 'bg-purple-500/20 text-purple-400',
      'intelligence-hub': 'bg-pink-500/20 text-pink-400',
      'system-hub': 'bg-gray-500/20 text-gray-400'
    };
    return colors[type] || 'bg-blue-500/20 text-blue-400';
  };

  const handleItemClick = (item: RecentItem) => {
    // Convert RecentItem to the expected format
    const iconConfig = {
      id: item.id,
      title: item.title,
      icon: item.icon,
      portalType: item.type,
      color: { primary: '#3B82F6', secondary: '#1D4ED8' },
      category: 'primary' as const,
      description: item.description || ''
    };
    onItemClick(iconConfig);
  };

  return (
    <motion.div
      className="h-full bg-slate-900/95 backdrop-blur-xl border-l border-slate-700/50 shadow-2xl flex flex-col"
      style={{ width: panelWidth }}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-lg">Recent Activity</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-slate-700/50 w-8 h-8 p-0"
          >
            <X size={16} />
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search recent items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-slate-800/50 border-slate-600/50 text-white placeholder-slate-400 text-sm h-9"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-2">
          <Button
            variant={showFavoritesOnly ? "default" : "ghost"}
            size="sm"
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className="text-xs h-7 px-2"
          >
            <Star size={12} className="mr-1" />
            Favorites
          </Button>

          {availableTypes.length > 1 && (
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-800/50 border border-slate-600/50 text-white text-xs rounded px-2 py-1 h-7"
            >
              <option value="all">All Types</option>
              {availableTypes.map(type => (
                <option key={type} value={type}>
                  {type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Content Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="recent" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-2 bg-slate-800/50 mx-4 mb-2">
            <TabsTrigger value="recent" className="text-xs">Recent Items</TabsTrigger>
            <TabsTrigger value="activity" className="text-xs">Activity Feed</TabsTrigger>
          </TabsList>

          <TabsContent value="recent" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              <div className="p-2">
                <AnimatePresence>
                  {filteredItems.length === 0 ? (
                    <motion.div
                      className="text-center py-8"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Clock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-400 text-sm">
                        {searchQuery || filterType !== 'all' || showFavoritesOnly
                          ? 'No items match your filters'
                          : 'No recent activity yet'
                        }
                      </p>
                    </motion.div>
                  ) : (
                    filteredItems.filter(item => !item.icon).map((item, index) => {
                      const IconComponent = item.icon;
                      return (
                        <motion.div
                          key={item.id}
                          className="mb-2"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ delay: index * 0.05 }}
                        >
                          <div
                            className="p-3 bg-slate-800/30 hover:bg-slate-700/50 rounded-lg cursor-pointer transition-all duration-200 group border border-transparent hover:border-slate-600/50"
                            onClick={() => handleItemClick(item)}
                          >
                            <div className="flex items-start space-x-3">
                              {/* Icon */}
                              <div className="w-8 h-8 bg-gradient-to-br from-slate-700 to-slate-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                <IconComponent size={16} className="text-slate-300" />
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2 mb-1">
                                  <h3 className="text-white text-sm font-medium truncate">
                                    {item.title}
                                  </h3>
                                  {item.isPinned && (
                                    <Pin size={12} className="text-blue-400 flex-shrink-0" />
                                  )}
                                  {item.isFavorite && (
                                    <Star size={12} className="text-yellow-400 flex-shrink-0" />
                                  )}
                                </div>

                                <div className="flex items-center justify-between">
                                  <Badge className={`text-xs px-2 py-0.5 ${getTypeColor(item.type)}`}>
                                    {item.type.replace('-', ' ')}
                                  </Badge>
                                  <span className="text-slate-500 text-xs">
                                    {formatTimestamp(item.timestamp)}
                                  </span>
                                </div>

                                {item.description && (
                                  <p className="text-slate-400 text-xs mt-1 truncate">
                                    {item.description}
                                  </p>
                                )}

                                {item.accessCount && item.accessCount > 1 && (
                                  <div className="flex items-center space-x-1 mt-1">
                                    <Activity size={10} className="text-slate-500" />
                                    <span className="text-slate-500 text-xs">
                                      {item.accessCount} uses
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-6 h-6 p-0 text-slate-400 hover:text-white"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Handle more actions
                                  }}
                                >
                                  <MoreVertical size={12} />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="activity" className="flex-1 overflow-hidden mt-0">
            {activityStats ? (
              <ActivityFeed
                activityEvents={activityEvents || []}
                recentItems={recentItems || []}
                activityStats={activityStats}
                trendingItems={trendingItems || []}
                onItemClick={onItemClick}
                className="h-full"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Activity className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">No activity data available</p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700/50">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{filteredItems.length} items</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6 px-2 text-slate-400 hover:text-white"
            onClick={() => {
              setSearchQuery('');
              setFilterType('all');
              setShowFavoritesOnly(false);
            }}
          >
            Clear Filters
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
