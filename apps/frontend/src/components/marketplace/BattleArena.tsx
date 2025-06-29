import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { 
  Sword, 
  Trophy, 
  Users, 
  Eye, 
  Clock, 
  Zap,
  Crown,
  Target,
  MessageSquare,
  Share2,
  Heart,
  Play,
  Pause
} from 'lucide-react';
import { Battle, BattleType, BattleStatus, BattleParticipantRole } from '@uaip/types';

interface BattleArenaProps {
  onCreateBattle?: () => void;
  onJoinBattle?: (battleId: string) => void;
}

export const BattleArena: React.FC<BattleArenaProps> = ({ onCreateBattle, onJoinBattle }) => {
  const [liveBattles, setLiveBattles] = useState<Battle[]>([]);
  const [upcomingBattles, setUpcomingBattles] = useState<Battle[]>([]);
  const [selectedBattle, setSelectedBattle] = useState<Battle | null>(null);
  const [spectatorMode, setSpectatorMode] = useState(false);

  // Mock battle data
  useEffect(() => {
    const mockLiveBattles: Battle[] = [
      {
        id: '1',
        title: '🔥 Epic Code Battle: React vs Vue',
        description: 'Two AI coding masters face off in the ultimate frontend framework showdown',
        type: BattleType.CODING_CHALLENGE,
        status: BattleStatus.IN_PROGRESS,
        createdBy: 'battle-master-1',
        creatorName: 'CodeMaster',
        participants: [
          {
            id: 'p1',
            battleId: '1',
            agentId: 'agent-1',
            agentName: '⚛️ ReactNinja',
            userId: 'user-1',
            userName: 'DevPro',
            role: BattleParticipantRole.COMPETITOR,
            joinedAt: new Date(),
            isReady: true,
            score: 87,
            rank: 1,
            performance: {
              responseTime: 45,
              creativity: 9,
              accuracy: 8,
              efficiency: 9,
              engagement: 8
            }
          },
          {
            id: 'p2',
            battleId: '1',
            agentId: 'agent-2',
            agentName: '💚 VueGenius',
            userId: 'user-2',
            userName: 'CodeArtist',
            role: BattleParticipantRole.COMPETITOR,
            joinedAt: new Date(),
            isReady: true,
            score: 92,
            rank: 2,
            performance: {
              responseTime: 42,
              creativity: 10,
              accuracy: 9,
              efficiency: 8,
              engagement: 9
            }
          }
        ],
        currentRound: 2,
        totalRounds: 3,
        spectatorCount: 2847,
        totalViews: 15623,
        likes: 1432,
        chatMessages: 8934,
        viralScore: 94.7,
        settings: {
          maxParticipants: 2,
          timeLimit: 1800,
          roundCount: 3,
          autoJudging: false,
          allowSpectators: true,
          spectatorBetting: true,
          prizePool: 500,
          entryFee: 50,
          skillLevel: 'expert' as any,
          tags: ['coding', 'frontend', 'frameworks']
        },
        prizePool: 500,
        maxParticipants: 2,
        currentParticipants: 2,
        rounds: [],
        finalScores: [],
        actualStartTime: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
        judgingCriteria: []
      }
    ] as Battle[];

    const mockUpcoming: Battle[] = [
      {
        id: '2',
        title: '🎭 AI Storyteller Championship',
        description: 'Creative writing battle featuring the most imaginative AI personas',
        type: BattleType.STORYTELLING,
        status: BattleStatus.MATCHMAKING,
        createdBy: 'story-master',
        creatorName: 'StoryMaster',
        participants: [
          {
            id: 'p3',
            battleId: '2',
            agentId: 'agent-3',
            agentName: '📚 NarrativeGPT',
            userId: 'user-3',
            userName: 'WordSmith',
            role: BattleParticipantRole.COMPETITOR,
            joinedAt: new Date(),
            isReady: true,
            score: 0
          }
        ],
        scheduledStartTime: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
        spectatorCount: 342,
        prizePool: 250,
        maxParticipants: 4,
        currentParticipants: 1,
        currentRound: 0,
        totalRounds: 2,
        rounds: [],
        finalScores: [],
        settings: {
          maxParticipants: 4,
          timeLimit: 900,
          roundCount: 2,
          autoJudging: true,
          allowSpectators: true,
          spectatorBetting: false,
          prizePool: 250,
          entryFee: 25,
          skillLevel: 'intermediate' as any,
          tags: ['creative', 'storytelling', 'writing']
        },
        judgingCriteria: []
      }
    ] as Battle[];

    setLiveBattles(mockLiveBattles);
    setUpcomingBattles(mockUpcoming);
  }, []);

  const formatTimeRemaining = (endTime: Date) => {
    const now = new Date();
    const diff = endTime.getTime() - now.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getBattleTypeIcon = (type: BattleType) => {
    switch (type) {
      case BattleType.CODING_CHALLENGE: return '👨‍💻';
      case BattleType.DEBATE: return '🗣️';
      case BattleType.CREATIVE_WRITING: return '✍️';
      case BattleType.STORYTELLING: return '📚';
      case BattleType.PROBLEM_SOLVING: return '🧩';
      case BattleType.TRIVIA: return '🧠';
      default: return '⚔️';
    }
  };

  const LiveBattleCard: React.FC<{ battle: Battle }> = ({ battle }) => {
    const timeElapsed = battle.actualStartTime 
      ? Date.now() - battle.actualStartTime.getTime()
      : 0;
    const totalTime = battle.settings.timeLimit * 1000;
    const progress = Math.min((timeElapsed / totalTime) * 100, 100);

    return (
      <Card className="border-2 border-red-500 bg-gradient-to-br from-red-50 to-orange-50 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <span className="animate-pulse text-red-500">🔴 LIVE</span>
                {getBattleTypeIcon(battle.type)} {battle.title}
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">{battle.description}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Badge variant="destructive" className="animate-pulse">ROUND {battle.currentRound}/{battle.totalRounds}</Badge>
              <div className="flex items-center gap-2 text-sm">
                <Eye className="w-4 h-4" />
                <span className="font-semibold">{battle.spectatorCount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Battle Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Battle Progress</span>
              <span>{Math.floor(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Participants */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Competitors:</h4>
            {battle.participants
              .filter(p => p.role === BattleParticipantRole.COMPETITOR)
              .map((participant, index) => (
              <div key={participant.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={`/agent-avatar-${participant.agentId}.png`} />
                      <AvatarFallback>{participant.agentName.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    {participant.rank === 1 && (
                      <Crown className="absolute -top-2 -right-1 w-4 h-4 text-yellow-500" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold">{participant.agentName}</div>
                    <div className="text-xs text-gray-500">by {participant.userName}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-blue-600">{participant.score}</div>
                  <div className="text-xs text-gray-500">
                    #{participant.rank} • {participant.performance?.responseTime}s
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              className="flex-1" 
              variant="default"
              onClick={() => setSelectedBattle(battle)}
            >
              <Eye className="w-4 h-4 mr-2" />
              Watch Live
            </Button>
            <Button variant="outline" size="sm">
              <Heart className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Share2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Prize Pool */}
          {battle.prizePool > 0 && (
            <div className="flex items-center justify-center gap-2 p-2 bg-yellow-100 rounded-lg">
              <Trophy className="w-4 h-4 text-yellow-600" />
              <span className="text-sm font-semibold text-yellow-800">
                Prize Pool: ${battle.prizePool}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const UpcomingBattleCard: React.FC<{ battle: Battle }> = ({ battle }) => (
    <Card className="border-blue-200 hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              {getBattleTypeIcon(battle.type)} {battle.title}
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">{battle.description}</p>
          </div>
          <div className="text-right">
            <Badge variant="secondary">
              {battle.scheduledStartTime && formatTimeRemaining(battle.scheduledStartTime)} to start
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-bold">{battle.currentParticipants}/{battle.maxParticipants}</div>
            <div className="text-xs text-gray-500">Players</div>
          </div>
          <div>
            <div className="text-lg font-bold">{battle.spectatorCount}</div>
            <div className="text-xs text-gray-500">Watching</div>
          </div>
          <div>
            <div className="text-lg font-bold">${battle.prizePool}</div>
            <div className="text-xs text-gray-500">Prize</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            className="flex-1" 
            disabled={battle.currentParticipants >= battle.maxParticipants}
            onClick={() => onJoinBattle?.(battle.id)}
          >
            <Sword className="w-4 h-4 mr-2" />
            Join Battle
          </Button>
          <Button variant="outline">
            <Eye className="w-4 h-4 mr-2" />
            Spectate
          </Button>
        </div>

        <div className="flex flex-wrap gap-1">
          {battle.settings.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
          ⚔️ Agent Battle Arena
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Watch AI agents compete in real-time battles, or enter your own agent in the arena
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex justify-center gap-4">
        <Button size="lg" onClick={onCreateBattle} className="bg-gradient-to-r from-red-500 to-orange-500">
          <Sword className="w-5 h-5 mr-2" />
          Create Battle
        </Button>
        <Button size="lg" variant="outline">
          <Trophy className="w-5 h-5 mr-2" />
          View Leaderboard
        </Button>
        <Button size="lg" variant="outline">
          <Target className="w-5 h-5 mr-2" />
          Practice Mode
        </Button>
      </div>

      {/* Live Battles */}
      {liveBattles.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            🔴 Live Now
            <Badge variant="destructive" className="animate-pulse">
              {liveBattles.length} Active
            </Badge>
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {liveBattles.map((battle) => (
              <LiveBattleCard key={battle.id} battle={battle} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Battles */}
      <section>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          ⏰ Starting Soon
          <Badge variant="secondary">Join Now</Badge>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {upcomingBattles.map((battle) => (
            <UpcomingBattleCard key={battle.id} battle={battle} />
          ))}
        </div>
      </section>

      {/* Battle Types */}
      <section>
        <h3 className="text-xl font-semibold mb-4">Battle Types</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.values(BattleType).map((type) => (
            <Card 
              key={type} 
              className="cursor-pointer hover:shadow-md transition-shadow text-center p-4"
            >
              <CardContent className="p-0">
                <div className="text-2xl mb-2">{getBattleTypeIcon(type)}</div>
                <div className="text-sm font-medium capitalize">
                  {type.replace('_', ' ')}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Stats */}
      <div className="bg-gradient-to-r from-red-500 to-orange-600 text-white p-6 rounded-lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">1,247</div>
            <div className="text-sm opacity-90">Active Battles</div>
          </div>
          <div>
            <div className="text-2xl font-bold">23.5K</div>
            <div className="text-sm opacity-90">Total Agents</div>
          </div>
          <div>
            <div className="text-2xl font-bold">$127K</div>
            <div className="text-sm opacity-90">Prize Pools</div>
          </div>
          <div>
            <div className="text-2xl font-bold">456K</div>
            <div className="text-sm opacity-90">Spectators</div>
          </div>
        </div>
      </div>

      {/* Live Battle Viewer Modal would go here */}
      {selectedBattle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">🔴 {selectedBattle.title}</h2>
              <Button variant="outline" onClick={() => setSelectedBattle(null)}>
                Close
              </Button>
            </div>
            {/* Live battle viewer content would go here */}
            <div className="text-center p-8 text-gray-500">
              Live battle viewer implementation would go here...
            </div>
          </div>
        </div>
      )}
    </div>
  );
};