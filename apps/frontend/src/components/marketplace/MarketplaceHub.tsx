import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Store,
  Sword,
  Trophy,
  Users,
  TrendingUp,
  Plus,
  Search,
  Bell,
  Settings,
  RefreshCw,
  Activity,
  Zap
} from 'lucide-react';
import { MarketplaceHome } from './MarketplaceHome';
import { BattleArena } from './BattleArena';
import { AgentLeaderboard } from './AgentLeaderboard';
import { SocialFeed } from './SocialFeed';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface MarketplaceHubProps {
  className?: string;
  viewport?: ViewportSize;
  mode?: 'hub' | 'standalone';
}

export const MarketplaceHub: React.FC<MarketplaceHubProps> = ({
  className,
  viewport,
  mode = 'hub'
}) => {
  const [activeTab, setActiveTab] = useState('marketplace');
  const [notifications, setNotifications] = useState(3);
  const [loading, setLoading] = useState(false);

  // Default viewport if not provided
  const defaultViewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  };

  const currentViewport = viewport || defaultViewport;

  const handleAgentClick = (agentId: string) => {
    console.log('Navigate to agent:', agentId);
    // In real implementation, navigate to agent detail page
  };

  const handleUserClick = (userId: string) => {
    console.log('Navigate to user profile:', userId);
    // In real implementation, navigate to user profile
  };

  const handleCreateBattle = () => {
    console.log('Open battle creation modal');
    // In real implementation, open battle creation form
  };

  const handleJoinBattle = (battleId: string) => {
    console.log('Join battle:', battleId);
    // In real implementation, join battle logic
  };

  const handleRefresh = () => {
    setLoading(true);
    // Simulate refresh
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <div className={`h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden ${className || ''}`}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, #3b82f6 0%, transparent 50%),
                           radial-gradient(circle at 75% 75%, #8b5cf6 0%, transparent 50%),
                           radial-gradient(circle at 75% 25%, #06d6a0 0%, transparent 50%),
                           radial-gradient(circle at 25% 75%, #f59e0b 0%, transparent 50%)`
        }} />
      </div>

      {/* Top Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 bg-slate-900/70 backdrop-blur-xl border-b border-slate-700/50"
      >
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
              >
                <Store className="w-6 h-6 inline-block mr-2 text-blue-400" />
                Marketplace Hub
              </motion.div>
              {!currentViewport.isMobile && (
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-300 hover:text-white hover:bg-slate-800/50"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-300 hover:text-white hover:bg-slate-800/50"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="relative text-slate-300 hover:text-white hover:bg-slate-800/50"
                disabled={loading}
                onClick={handleRefresh}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="relative text-slate-300 hover:text-white hover:bg-slate-800/50"
              >
                <Bell className="w-4 h-4" />
                {notifications > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 w-5 h-5 text-xs flex items-center justify-center p-0 bg-red-500"
                  >
                    {notifications}
                  </Badge>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:text-white hover:bg-slate-800/50"
              >
                <Settings className="w-4 h-4" />
              </Button>
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg">
                U
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="relative z-10 px-6 py-6 h-full overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <TabsList className="grid w-full grid-cols-4 mb-6 h-12 bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm">
              <TabsTrigger
                value="marketplace"
                className="flex items-center gap-2 data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300 text-slate-400 hover:text-slate-200"
              >
                <Store className="w-4 h-4" />
                <span className={currentViewport.isMobile ? "hidden" : "inline"}>Marketplace</span>
              </TabsTrigger>
              <TabsTrigger
                value="arena"
                className="flex items-center gap-2 data-[state=active]:bg-purple-600/20 data-[state=active]:text-purple-300 text-slate-400 hover:text-slate-200"
              >
                <Sword className="w-4 h-4" />
                <span className={currentViewport.isMobile ? "hidden" : "inline"}>Battle Arena</span>
              </TabsTrigger>
              <TabsTrigger
                value="leaderboard"
                className="flex items-center gap-2 data-[state=active]:bg-yellow-600/20 data-[state=active]:text-yellow-300 text-slate-400 hover:text-slate-200"
              >
                <Trophy className="w-4 h-4" />
                <span className={currentViewport.isMobile ? "hidden" : "inline"}>Leaderboards</span>
              </TabsTrigger>
              <TabsTrigger
                value="social"
                className="flex items-center gap-2 data-[state=active]:bg-green-600/20 data-[state=active]:text-green-300 text-slate-400 hover:text-slate-200"
              >
                <Users className="w-4 h-4" />
                <span className={currentViewport.isMobile ? "hidden" : "inline"}>Social</span>
              </TabsTrigger>
            </TabsList>
          </motion.div>

          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <TabsContent value="marketplace" className="mt-0 h-full">
                  <MarketplaceHome onItemClick={(item) => handleAgentClick(item.id)} />
                </TabsContent>

                <TabsContent value="arena" className="mt-0 h-full">
                  <BattleArena
                    onCreateBattle={handleCreateBattle}
                    onJoinBattle={handleJoinBattle}
                  />
                </TabsContent>

                <TabsContent value="leaderboard" className="mt-0 h-full">
                  <AgentLeaderboard onAgentClick={handleAgentClick} />
                </TabsContent>

                <TabsContent value="social" className="mt-0 h-full">
                  <SocialFeed
                    onAgentClick={handleAgentClick}
                    onUserClick={handleUserClick}
                  />
                </TabsContent>
              </motion.div>
            </AnimatePresence>
          </div>
        </Tabs>
      </div>

      {/* Quick Stats Footer */}
      {mode === 'standalone' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative z-10 bg-slate-900/70 backdrop-blur-xl border-t border-slate-700/50 mt-6"
        >
          <div className="px-6 py-6">
            <div className={`grid ${currentViewport.isMobile ? 'grid-cols-2' : 'grid-cols-6'} gap-4 text-center`}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
              >
                <div className="text-2xl font-bold text-blue-400">12.5K+</div>
                <div className="text-sm text-slate-400">AI Agents</div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.45 }}
              >
                <div className="text-2xl font-bold text-purple-400">8.3K+</div>
                <div className="text-sm text-slate-400">Active Battles</div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
              >
                <div className="text-2xl font-bold text-green-400">2.1M+</div>
                <div className="text-sm text-slate-400">Users</div>
              </motion.div>
              {!currentViewport.isMobile && (
                <>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.55 }}
                  >
                    <div className="text-2xl font-bold text-orange-400">$127K</div>
                    <div className="text-sm text-slate-400">Prize Pools</div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 }}
                  >
                    <div className="text-2xl font-bold text-red-400">5.7M+</div>
                    <div className="text-sm text-slate-400">Downloads</div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.65 }}
                  >
                    <div className="text-2xl font-bold text-indigo-400">456K</div>
                    <div className="text-sm text-slate-400">Daily Views</div>
                  </motion.div>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Floating Action Button */}
      {mode === 'standalone' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7 }}
          className="fixed bottom-6 right-6 z-50"
        >
          <Button
            size="lg"
            className="rounded-full w-14 h-14 shadow-2xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 border border-slate-600/50 backdrop-blur-sm"
            onClick={() => {
              if (activeTab === 'arena') {
                handleCreateBattle();
              } else {
                // Handle other quick actions based on active tab
                console.log('Quick action for', activeTab);
              }
            }}
          >
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              {activeTab === 'marketplace' && <Store className="w-6 h-6" />}
              {activeTab === 'arena' && <Sword className="w-6 h-6" />}
              {activeTab === 'leaderboard' && <TrendingUp className="w-6 h-6" />}
              {activeTab === 'social' && <Plus className="w-6 h-6" />}
            </motion.div>
          </Button>
        </motion.div>
      )}
    </div>
  );
};