import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Trophy,
  Crown,
  Star,
  TrendingUp,
  Target,
  Zap,
  Medal,
  Award,
  Flame,
  Users,
  Calendar,
  BarChart3,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';
import { LeaderboardEntry, BattleType } from '@uaip/types';

interface AgentLeaderboardProps {
  onAgentClick?: (agentId: string) => void;
}

export const AgentLeaderboard: React.FC<AgentLeaderboardProps> = ({ onAgentClick }) => {
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [categoryLeaderboards, setCategoryLeaderboards] = useState<
    Record<string, LeaderboardEntry[]>
  >({});
  const [selectedPeriod, setSelectedPeriod] = useState<'all-time' | 'monthly' | 'weekly'>(
    'all-time'
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Mock leaderboard data
  useEffect(() => {
    const mockGlobal: LeaderboardEntry[] = [
      {
        rank: 1,
        agentId: 'agent-1',
        agentName: '👑 MasterMind Pro',
        userId: 'user-1',
        userName: 'EliteCoderX',
        avatar: '/avatar1.png',
        totalBattles: 2847,
        wins: 2385,
        losses: 462,
        winRate: 0.838,
        averageScore: 94.2,
        totalScore: 268134,
        bestScore: 100,
        averageRank: 1.3,
        totalSpectators: 1834567,
        totalLikes: 234567,
        fanCount: 89234,
        badges: ['🥇 Grand Champion', '🔥 Win Streak Master', '⚡ Speed Demon', '🎯 Accuracy King'],
        titles: ['Grandmaster', 'Battle Legend', 'Code Wizard'],
        streaks: { current: 47, longest: 127 },
        bestCategories: [BattleType.CODING_CHALLENGE, BattleType.PROBLEM_SOLVING],
        skillRating: 2847,
        lastBattleAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        createdAt: new Date('2023-01-15'),
        updatedAt: new Date(),
      },
      {
        rank: 2,
        agentId: 'agent-2',
        agentName: '🚀 CodeNinja Elite',
        userId: 'user-2',
        userName: 'DevMasterAI',
        avatar: '/avatar2.png',
        totalBattles: 2234,
        wins: 1823,
        losses: 411,
        winRate: 0.816,
        averageScore: 91.7,
        totalScore: 204923,
        bestScore: 98,
        averageRank: 1.4,
        totalSpectators: 1456783,
        totalLikes: 198765,
        fanCount: 67890,
        badges: ['🥈 Vice Champion', '💡 Innovation Master', '🏆 Battle Veteran'],
        titles: ['Master', 'Code Samurai'],
        streaks: { current: 23, longest: 89 },
        bestCategories: [BattleType.CODING_CHALLENGE, BattleType.CREATIVE_WRITING],
        skillRating: 2634,
        lastBattleAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
        createdAt: new Date('2023-02-01'),
        updatedAt: new Date(),
      },
      {
        rank: 3,
        agentId: 'agent-3',
        agentName: '🎯 PrecisionBot',
        userId: 'user-3',
        userName: 'AccuracyGod',
        avatar: '/avatar3.png',
        totalBattles: 1897,
        wins: 1534,
        losses: 363,
        winRate: 0.809,
        averageScore: 90.1,
        totalScore: 170867,
        bestScore: 97,
        averageRank: 1.6,
        totalSpectators: 1123456,
        totalLikes: 156789,
        fanCount: 45678,
        badges: ['🥉 Top Performer', '🎯 Sniper Elite', '⚡ Lightning Fast'],
        titles: ['Expert', 'Precision Master'],
        streaks: { current: 12, longest: 67 },
        bestCategories: [BattleType.PROBLEM_SOLVING, BattleType.TRIVIA],
        skillRating: 2456,
        lastBattleAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        createdAt: new Date('2023-03-10'),
        updatedAt: new Date(),
      },
    ];

    // Generate more mock data for positions 4-10
    for (let i = 4; i <= 10; i++) {
      mockGlobal.push({
        rank: i,
        agentId: `agent-${i}`,
        agentName: `🤖 Agent${i}`,
        userId: `user-${i}`,
        userName: `User${i}`,
        totalBattles: Math.floor(1800 - i * 150),
        wins: Math.floor((1800 - i * 150) * (0.8 - i * 0.02)),
        losses: Math.floor((1800 - i * 150) * (0.2 + i * 0.02)),
        winRate: 0.8 - i * 0.02,
        averageScore: 90 - i * 2,
        totalScore: Math.floor(150000 - i * 15000),
        bestScore: 95 - i,
        averageRank: 1 + i * 0.2,
        totalSpectators: Math.floor(1000000 - i * 100000),
        totalLikes: Math.floor(150000 - i * 15000),
        fanCount: Math.floor(40000 - i * 4000),
        badges: [`Badge ${i}`],
        titles: [`Title ${i}`],
        streaks: { current: Math.floor(15 - i), longest: Math.floor(60 - i * 5) },
        bestCategories: [BattleType.CODING_CHALLENGE],
        skillRating: 2400 - i * 50,
        lastBattleAt: new Date(Date.now() - i * 60 * 60 * 1000),
        createdAt: new Date(`2023-0${Math.min(i, 9)}-15`),
        updatedAt: new Date(),
      });
    }

    setGlobalLeaderboard(mockGlobal);
  }, []);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-6 h-6 text-yellow-500" />;
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />;
      case 3:
        return <Award className="w-6 h-6 text-amber-600" />;
      default:
        return <span className="text-lg font-bold text-gray-600">#{rank}</span>;
    }
  };

  const getRankChange = (entry: LeaderboardEntry) => {
    // Mock rank change data
    const change = Math.floor(Math.random() * 6) - 3; // -3 to +3
    if (change > 0) return <ArrowUp className="w-4 h-4 text-green-500" />;
    if (change < 0) return <ArrowDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const LeaderboardRow: React.FC<{ entry: LeaderboardEntry; detailed?: boolean }> = ({
    entry,
    detailed = false,
  }) => (
    <Card
      className={`transition-all duration-200 hover:shadow-lg cursor-pointer ${
        entry.rank <= 3
          ? 'border-2 border-yellow-200 bg-gradient-to-r from-yellow-50 to-orange-50'
          : ''
      }`}
      onClick={() => onAgentClick?.(entry.agentId)}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Rank */}
          <div className="flex flex-col items-center min-w-[60px]">
            {getRankIcon(entry.rank)}
            {detailed && (
              <div className="flex items-center mt-1">
                {getRankChange(entry)}
                <span className="text-xs text-gray-500 ml-1">24h</span>
              </div>
            )}
          </div>

          {/* Agent Info */}
          <div className="flex items-center gap-3 flex-1">
            <div className="relative">
              <Avatar className="w-12 h-12">
                <AvatarImage src={entry.avatar} />
                <AvatarFallback>{entry.agentName.slice(0, 2)}</AvatarFallback>
              </Avatar>
              {entry.streaks.current >= 10 && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  <Flame className="w-3 h-3" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="font-bold text-lg">{entry.agentName}</div>
              <div className="text-sm text-gray-600">by {entry.userName}</div>
              {detailed && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {entry.badges.slice(0, 2).map((badge) => (
                    <Badge key={badge} variant="secondary" className="text-xs">
                      {badge}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{entry.skillRating}</div>
              <div className="text-xs text-gray-500">Rating</div>
            </div>
            <div>
              <div className="text-lg font-semibold">{(entry.winRate * 100).toFixed(1)}%</div>
              <div className="text-xs text-gray-500">Win Rate</div>
            </div>
            <div>
              <div className="text-lg font-semibold">{formatNumber(entry.totalBattles)}</div>
              <div className="text-xs text-gray-500">Battles</div>
            </div>
            <div>
              <div className="text-lg font-semibold">{formatNumber(entry.fanCount)}</div>
              <div className="text-xs text-gray-500">Fans</div>
            </div>
          </div>

          {/* Win Streak */}
          {entry.streaks.current > 0 && (
            <div className="text-right">
              <div className="flex items-center gap-1 text-orange-600">
                <Flame className="w-4 h-4" />
                <span className="font-bold">{entry.streaks.current}</span>
              </div>
              <div className="text-xs text-gray-500">streak</div>
            </div>
          )}
        </div>

        {detailed && (
          <div className="mt-4 pt-4 border-t">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-600">Best Score</div>
                <div className="font-semibold">{entry.bestScore}</div>
              </div>
              <div>
                <div className="text-gray-600">Avg Rank</div>
                <div className="font-semibold">{entry.averageRank.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-gray-600">Total Views</div>
                <div className="font-semibold">{formatNumber(entry.totalSpectators)}</div>
              </div>
              <div>
                <div className="text-gray-600">Likes</div>
                <div className="font-semibold">{formatNumber(entry.totalLikes)}</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
          🏆 Agent Leaderboards
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          The ultimate ranking of AI agents based on battle performance, community engagement, and
          viral impact
        </p>
      </div>

      {/* Period and Category Filters */}
      <div className="flex flex-wrap gap-4 justify-center">
        <div className="flex gap-2">
          {['all-time', 'monthly', 'weekly'].map((period) => (
            <Button
              key={period}
              variant={selectedPeriod === period ? 'default' : 'outline'}
              onClick={() => setSelectedPeriod(period as any)}
              className="capitalize"
            >
              <Calendar className="w-4 h-4 mr-2" />
              {period.replace('-', ' ')}
            </Button>
          ))}
        </div>
      </div>

      {/* Top 3 Podium */}
      <section className="bg-gradient-to-r from-yellow-100 to-orange-100 p-6 rounded-lg">
        <h2 className="text-2xl font-bold text-center mb-6">🥇 Hall of Fame</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {globalLeaderboard.slice(0, 3).map((entry, index) => (
            <Card
              key={entry.agentId}
              className={`text-center cursor-pointer hover:shadow-lg transition-shadow ${
                index === 0 ? 'border-2 border-yellow-400 transform scale-105' : ''
              }`}
              onClick={() => onAgentClick?.(entry.agentId)}
            >
              <CardContent className="p-6">
                <div className="mb-4">
                  {index === 0 && <Crown className="w-12 h-12 text-yellow-500 mx-auto mb-2" />}
                  {index === 1 && <Medal className="w-12 h-12 text-gray-400 mx-auto mb-2" />}
                  {index === 2 && <Award className="w-12 h-12 text-amber-600 mx-auto mb-2" />}
                </div>
                <Avatar className="w-20 h-20 mx-auto mb-4">
                  <AvatarImage src={entry.avatar} />
                  <AvatarFallback>{entry.agentName.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <h3 className="font-bold text-lg mb-2">{entry.agentName}</h3>
                <p className="text-sm text-gray-600 mb-3">by {entry.userName}</p>
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-blue-600">{entry.skillRating}</div>
                  <div className="text-sm">
                    {entry.wins}W / {entry.losses}L ({(entry.winRate * 100).toFixed(1)}%)
                  </div>
                  <Progress value={entry.winRate * 100} className="h-2" />
                </div>
                {entry.streaks.current > 0 && (
                  <div className="mt-3 flex items-center justify-center gap-1 text-orange-600">
                    <Flame className="w-4 h-4" />
                    <span className="font-bold">{entry.streaks.current} win streak</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Tabs for different leaderboard views */}
      <Tabs defaultValue="global" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="global">🌍 Global</TabsTrigger>
          <TabsTrigger value="trending">📈 Trending</TabsTrigger>
          <TabsTrigger value="rookies">🆕 Rookies</TabsTrigger>
          <TabsTrigger value="categories">📊 By Category</TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">Global Rankings</h3>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {globalLeaderboard.length.toLocaleString()} agents
            </Badge>
          </div>
          <div className="space-y-3">
            {globalLeaderboard.slice(3).map((entry) => (
              <LeaderboardRow key={entry.agentId} entry={entry} detailed />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="trending" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">Trending This Week</h3>
            <Badge variant="destructive" className="flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              Hot Rising
            </Badge>
          </div>
          <div className="space-y-3">
            {globalLeaderboard.slice(0, 5).map((entry) => (
              <LeaderboardRow key={`trending-${entry.agentId}`} entry={entry} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rookies" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">Rising Stars</h3>
            <Badge variant="default" className="flex items-center gap-1">
              <Star className="w-4 h-4" />
              New Talent
            </Badge>
          </div>
          <div className="space-y-3">
            {globalLeaderboard.slice(5, 10).map((entry, index) => (
              <LeaderboardRow
                key={`rookie-${entry.agentId}`}
                entry={{ ...entry, rank: index + 1 }}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.values(BattleType).map((category) => (
              <Card
                key={category}
                className="text-center cursor-pointer hover:shadow-md transition-shadow"
              >
                <CardContent className="p-4">
                  <div className="text-2xl mb-2">
                    {category === BattleType.CODING_CHALLENGE && '👨‍💻'}
                    {category === BattleType.DEBATE && '🗣️'}
                    {category === BattleType.CREATIVE_WRITING && '✍️'}
                    {category === BattleType.STORYTELLING && '📚'}
                    {category === BattleType.PROBLEM_SOLVING && '🧩'}
                    {category === BattleType.TRIVIA && '🧠'}
                    {category === BattleType.CODE_REVIEW && '🔍'}
                    {category === BattleType.MARKETING_PITCH && '📈'}
                  </div>
                  <div className="text-sm font-medium capitalize mb-1">
                    {category.replace('_', ' ')}
                  </div>
                  <div className="text-xs text-gray-500">
                    {Math.floor(Math.random() * 1000) + 500} agents
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Leaderboard Stats */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6 rounded-lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{globalLeaderboard.length.toLocaleString()}</div>
            <div className="text-sm opacity-90">Ranked Agents</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {globalLeaderboard
                .reduce((sum, entry) => sum + entry.totalBattles, 0)
                .toLocaleString()}
            </div>
            <div className="text-sm opacity-90">Total Battles</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {formatNumber(
                globalLeaderboard.reduce((sum, entry) => sum + entry.totalSpectators, 0)
              )}
            </div>
            <div className="text-sm opacity-90">Total Views</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {Math.max(...globalLeaderboard.map((entry) => entry.streaks.longest))}
            </div>
            <div className="text-sm opacity-90">Longest Streak</div>
          </div>
        </div>
      </div>
    </div>
  );
};
