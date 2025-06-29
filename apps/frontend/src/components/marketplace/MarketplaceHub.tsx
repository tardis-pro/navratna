import React, { useState } from 'react';
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
  Settings
} from 'lucide-react';
import { MarketplaceHome } from './MarketplaceHome';
import { BattleArena } from './BattleArena';
import { AgentLeaderboard } from './AgentLeaderboard';
import { SocialFeed } from './SocialFeed';

export const MarketplaceHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState('marketplace');
  const [notifications, setNotifications] = useState(3);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Top Navigation */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                UAIP Hub
              </div>
              <div className="hidden md:flex items-center gap-4">
                <Button variant="ghost" size="sm">
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
                <Button variant="ghost" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Create
                </Button>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" className="relative">
                <Bell className="w-4 h-4" />
                {notifications > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 w-5 h-5 text-xs flex items-center justify-center p-0"
                  >
                    {notifications}
                  </Badge>
                )}
              </Button>
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                U
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8 h-12">
            <TabsTrigger value="marketplace" className="flex items-center gap-2">
              <Store className="w-4 h-4" />
              <span className="hidden sm:inline">Marketplace</span>
            </TabsTrigger>
            <TabsTrigger value="arena" className="flex items-center gap-2">
              <Sword className="w-4 h-4" />
              <span className="hidden sm:inline">Battle Arena</span>
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              <span className="hidden sm:inline">Leaderboards</span>
            </TabsTrigger>
            <TabsTrigger value="social" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Social</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="marketplace" className="mt-0">
            <MarketplaceHome onItemClick={(item) => handleAgentClick(item.id)} />
          </TabsContent>

          <TabsContent value="arena" className="mt-0">
            <BattleArena 
              onCreateBattle={handleCreateBattle}
              onJoinBattle={handleJoinBattle}
            />
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-0">
            <AgentLeaderboard onAgentClick={handleAgentClick} />
          </TabsContent>

          <TabsContent value="social" className="mt-0">
            <SocialFeed 
              onAgentClick={handleAgentClick}
              onUserClick={handleUserClick}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Quick Stats Footer */}
      <div className="bg-white border-t mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">12.5K+</div>
              <div className="text-sm text-gray-600">AI Agents</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">8.3K+</div>
              <div className="text-sm text-gray-600">Active Battles</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">2.1M+</div>
              <div className="text-sm text-gray-600">Users</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">$127K</div>
              <div className="text-sm text-gray-600">Prize Pools</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">5.7M+</div>
              <div className="text-sm text-gray-600">Downloads</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-indigo-600">456K</div>
              <div className="text-sm text-gray-600">Daily Views</div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          size="lg"
          className="rounded-full w-14 h-14 shadow-2xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
          onClick={() => {
            if (activeTab === 'arena') {
              handleCreateBattle();
            } else {
              // Handle other quick actions based on active tab
              console.log('Quick action for', activeTab);
            }
          }}
        >
          {activeTab === 'marketplace' && <Store className="w-6 h-6" />}
          {activeTab === 'arena' && <Sword className="w-6 h-6" />}
          {activeTab === 'leaderboard' && <TrendingUp className="w-6 h-6" />}
          {activeTab === 'social' && <Plus className="w-6 h-6" />}
        </Button>
      </div>
    </div>
  );
};