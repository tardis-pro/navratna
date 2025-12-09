import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import {
  Heart,
  Share2,
  MessageCircle,
  Bookmark,
  MoreHorizontal,
  TrendingUp,
  Zap,
  Trophy,
  Star,
  Users,
  Play,
  Clone,
  Eye,
  ThumbsUp,
  Repeat2,
} from 'lucide-react';
import {
  SocialPost,
  SocialActivity,
  SocialActivityType,
  AgentShowcase,
  ContentVisibility,
} from '@uaip/types';

interface SocialFeedProps {
  onAgentClick?: (agentId: string) => void;
  onUserClick?: (userId: string) => void;
}

export const SocialFeed: React.FC<SocialFeedProps> = ({ onAgentClick, onUserClick }) => {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [activities, setActivities] = useState<SocialActivity[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedTab, setSelectedTab] = useState<'following' | 'trending' | 'discover'>(
    'following'
  );

  // Mock social data
  useEffect(() => {
    const mockPosts: SocialPost[] = [
      {
        id: '1',
        authorId: 'user-1',
        authorName: 'CodeMaster Pro',
        authorAvatar: '/avatar1.png',
        content:
          '🚀 Just shared my latest AI agent "DataWizard" - it can analyze any dataset and generate insights in seconds! The battle arena results have been incredible. #AIAgent #DataScience #Viral',
        type: 'agent_share',
        agentId: 'agent-datawizard',
        visibility: ContentVisibility.PUBLIC,
        likesCount: 1247,
        sharesCount: 342,
        commentsCount: 89,
        viewsCount: 15623,
        viralScore: 87.4,
        hashtags: ['AIAgent', 'DataScience', 'Viral'],
        mentions: [],
        images: ['/agent-showcase-1.jpg'],
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        updatedAt: new Date(),
      },
      {
        id: '2',
        authorId: 'user-2',
        authorName: 'CreativeAI',
        authorAvatar: '/avatar2.png',
        content:
          '🎨 My StorytellerBot just won the Creative Writing Championship! 🏆 Amazing what happens when you combine emotional intelligence with narrative structure. Thanks to everyone who voted!',
        type: 'achievement',
        battleId: 'battle-storytelling-1',
        visibility: ContentVisibility.PUBLIC,
        likesCount: 892,
        sharesCount: 178,
        commentsCount: 156,
        viewsCount: 8934,
        viralScore: 72.1,
        hashtags: ['CreativeWriting', 'Championship', 'AI'],
        mentions: [],
        videos: ['/victory-celebration.mp4'],
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
        updatedAt: new Date(),
      },
      {
        id: '3',
        authorId: 'user-3',
        authorName: 'DevGenius',
        authorAvatar: '/avatar3.png',
        content:
          "Mind = blown 🤯 Just cloned @CodeMaster Pro's agent and customized it for my specific use case. The remix culture in this platform is incredible! Here's what I changed...",
        type: 'agent_share',
        agentId: 'agent-datawizard-remix',
        visibility: ContentVisibility.PUBLIC,
        likesCount: 445,
        sharesCount: 67,
        commentsCount: 23,
        viewsCount: 3456,
        viralScore: 58.9,
        hashtags: ['Remix', 'Clone', 'Customization'],
        mentions: ['user-1'],
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
        updatedAt: new Date(),
      },
    ];

    const mockActivities: SocialActivity[] = [
      {
        id: 'a1',
        userId: 'user-current',
        actorId: 'user-4',
        actorName: 'TechEnthusiast',
        actorAvatar: '/avatar4.png',
        type: SocialActivityType.AGENT_LIKED,
        title: 'liked your agent',
        targetId: 'agent-my-agent',
        targetType: 'agent',
        targetName: 'MyAwesomeAgent',
        data: { agentName: 'MyAwesomeAgent' },
        visibility: ContentVisibility.PUBLIC,
        isRead: false,
        createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        updatedAt: new Date(),
      },
      {
        id: 'a2',
        userId: 'user-current',
        actorId: 'user-5',
        actorName: 'AIBuilder',
        actorAvatar: '/avatar5.png',
        type: SocialActivityType.AGENT_FORKED,
        title: 'forked your agent',
        targetId: 'agent-my-agent',
        targetType: 'agent',
        targetName: 'MyAwesomeAgent',
        data: { forkName: 'EnhancedAwesomeAgent' },
        visibility: ContentVisibility.PUBLIC,
        isRead: false,
        createdAt: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
        updatedAt: new Date(),
      },
    ];

    setPosts(mockPosts);
    setActivities(mockActivities);
  }, []);

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const handleLike = (postId: string) => {
    setPosts(
      posts.map((post) =>
        post.id === postId ? { ...post, likesCount: post.likesCount + 1 } : post
      )
    );
  };

  const handleShare = (postId: string) => {
    setPosts(
      posts.map((post) =>
        post.id === postId ? { ...post, sharesCount: post.sharesCount + 1 } : post
      )
    );
  };

  const PostCard: React.FC<{ post: SocialPost }> = ({ post }) => (
    <Card className="w-full transition-all duration-200 hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar
              className="w-10 h-10 cursor-pointer"
              onClick={() => onUserClick?.(post.authorId)}
            >
              <AvatarImage src={post.authorAvatar} />
              <AvatarFallback>{post.authorName.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div>
              <div
                className="font-semibold text-sm cursor-pointer hover:underline"
                onClick={() => onUserClick?.(post.authorId)}
              >
                {post.authorName}
              </div>
              <div className="text-xs text-gray-500">
                {formatTimeAgo(post.createdAt)} • {post.visibility}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {post.viralScore > 80 && (
              <Badge variant="destructive" className="text-xs animate-pulse">
                🔥 VIRAL
              </Badge>
            )}
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Post Content */}
        <div className="text-sm leading-relaxed">
          {post.content.split(' ').map((word, index) => {
            if (word.startsWith('#')) {
              return (
                <span key={index} className="text-blue-600 hover:underline cursor-pointer">
                  {word}{' '}
                </span>
              );
            }
            if (word.startsWith('@')) {
              return (
                <span key={index} className="text-purple-600 hover:underline cursor-pointer">
                  {word}{' '}
                </span>
              );
            }
            return word + ' ';
          })}
        </div>

        {/* Media */}
        {post.images.length > 0 && (
          <div className="grid grid-cols-1 gap-2">
            {post.images.map((image, index) => (
              <img
                key={index}
                src={image}
                alt="Post media"
                className="rounded-lg w-full max-h-64 object-cover cursor-pointer"
              />
            ))}
          </div>
        )}

        {post.videos.length > 0 && (
          <div className="grid grid-cols-1 gap-2">
            {post.videos.map((video, index) => (
              <div key={index} className="relative rounded-lg overflow-hidden">
                <video src={video} className="w-full max-h-64 object-cover" controls />
              </div>
            ))}
          </div>
        )}

        {/* Agent/Battle Reference */}
        {post.agentId && (
          <Card
            className="border-2 border-blue-200 cursor-pointer hover:shadow-sm transition-shadow"
            onClick={() => onAgentClick?.(post.agentId!)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold">
                  🤖
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">Featured Agent</div>
                  <div className="text-xs text-gray-600">Click to view and install</div>
                </div>
                <div className="flex gap-1">
                  <Badge variant="secondary" className="text-xs">
                    <Star className="w-3 h-3 mr-1" />
                    4.8
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    <Download className="w-3 h-3 mr-1" />
                    12K
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Engagement Metrics */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-red-500"
              onClick={() => handleLike(post.id)}
            >
              <Heart className="w-4 h-4 mr-1" />
              {formatNumber(post.likesCount)}
            </Button>
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-blue-500">
              <MessageCircle className="w-4 h-4 mr-1" />
              {formatNumber(post.commentsCount)}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-green-500"
              onClick={() => handleShare(post.id)}
            >
              <Share2 className="w-4 h-4 mr-1" />
              {formatNumber(post.sharesCount)}
            </Button>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {formatNumber(post.viewsCount)} views
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-gray-600">
            <Bookmark className="w-4 h-4" />
          </Button>
        </div>

        {/* Viral Score */}
        {post.viralScore > 50 && (
          <div className="bg-gradient-to-r from-orange-100 to-red-100 p-3 rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-600" />
                <span className="font-medium">Viral Score: {post.viralScore.toFixed(1)}</span>
              </div>
              <Badge variant="destructive" className="text-xs">
                🔥 Trending
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const ActivityCard: React.FC<{ activity: SocialActivity }> = ({ activity }) => (
    <Card className="w-full border-l-4 border-l-blue-500">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8" onClick={() => onUserClick?.(activity.actorId)}>
            <AvatarImage src={activity.actorAvatar} />
            <AvatarFallback>{activity.actorName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="text-sm">
              <span
                className="font-semibold cursor-pointer hover:underline"
                onClick={() => onUserClick?.(activity.actorId)}
              >
                {activity.actorName}
              </span>
              <span> {activity.title} </span>
              {activity.targetName && (
                <span
                  className="font-semibold cursor-pointer hover:underline text-blue-600"
                  onClick={() =>
                    activity.targetType === 'agent' && onAgentClick?.(activity.targetId!)
                  }
                >
                  {activity.targetName}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">{formatTimeAgo(activity.createdAt)}</div>
          </div>
          <div className="text-2xl">
            {activity.type === SocialActivityType.AGENT_LIKED && '❤️'}
            {activity.type === SocialActivityType.AGENT_FORKED && '🍴'}
            {activity.type === SocialActivityType.BATTLE_WON && '🏆'}
            {activity.type === SocialActivityType.ACHIEVEMENT_EARNED && '🏅'}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
          📱 Social Feed
        </h1>
        <p className="text-lg text-gray-600">
          Share your AI agents, celebrate victories, and discover trending content
        </p>
      </div>

      {/* Feed Tabs */}
      <div className="flex justify-center gap-2">
        {['following', 'trending', 'discover'].map((tab) => (
          <Button
            key={tab}
            variant={selectedTab === tab ? 'default' : 'outline'}
            onClick={() => setSelectedTab(tab as any)}
            className="capitalize"
          >
            {tab === 'following' && <Users className="w-4 h-4 mr-2" />}
            {tab === 'trending' && <TrendingUp className="w-4 h-4 mr-2" />}
            {tab === 'discover' && <Zap className="w-4 h-4 mr-2" />}
            {tab}
          </Button>
        ))}
      </div>

      {/* New Post */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            <Textarea
              placeholder="Share your latest AI agent, battle victory, or discovery..."
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              className="min-h-[100px] resize-none"
            />
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  📷 Media
                </Button>
                <Button variant="outline" size="sm">
                  🤖 Agent
                </Button>
                <Button variant="outline" size="sm">
                  ⚔️ Battle
                </Button>
              </div>
              <Button
                disabled={!newPostContent.trim()}
                onClick={() => {
                  // Handle post creation
                  setNewPostContent('');
                }}
              >
                Share
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Notifications */}
      {activities.length > 0 && selectedTab === 'following' && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm text-gray-600">Recent Activity</h3>
          {activities.slice(0, 3).map((activity) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      )}

      {/* Posts Feed */}
      <div className="space-y-6">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {/* Load More */}
      <div className="text-center">
        <Button variant="outline" className="w-full">
          Load More Posts
        </Button>
      </div>

      {/* Trending Hashtags Sidebar */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Trending Hashtags</h3>
        </CardHeader>
        <CardContent className="space-y-2">
          {['#AIAgent', '#BattleArena', '#CodeChallenge', '#ViralAI', '#MachineLearning'].map(
            (hashtag) => (
              <div key={hashtag} className="flex justify-between items-center">
                <span className="text-blue-600 hover:underline cursor-pointer text-sm">
                  {hashtag}
                </span>
                <span className="text-xs text-gray-500">
                  {Math.floor(Math.random() * 1000)}K posts
                </span>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
};
